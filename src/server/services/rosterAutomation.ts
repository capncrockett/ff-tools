import type { AxiosInstance } from 'axios'
import axios from 'axios'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import {
  contextSchema,
  sourceLabels,
  sourceSchema,
  trackerAlertThresholds,
  type RosterAutomationView,
  type RosterReviewItem,
  type SourceName,
} from '../../shared/tracker.js'
import { rosterRefreshMs, sleeperLeagueId, sleeperLeagueName, sleeperOwnerId } from '../config.js'
import { loadSleeperPlayers, type CanonicalPlayer } from './players.js'
import { DataError } from './valuations.js'

const stateId = () => `sleeper:${sleeperLeagueId}:${sleeperOwnerId}`
const sleeperBase = 'https://api.sleeper.app/v1'

const leagueSchema = z
  .object({
    name: z.string().min(1),
    season: z.coerce.string().min(4),
  })
  .passthrough()
const stateSchema = z
  .object({
    week: z.number().int().min(0).max(25),
  })
  .passthrough()
const rosterSchema = z
  .object({
    roster_id: z.number().int().positive(),
    owner_id: z.string(),
    players: z.array(z.string()).nullable().optional(),
    taxi: z.array(z.string()).nullable().optional(),
    reserve: z.array(z.string()).nullable().optional(),
  })
  .passthrough()
const transactionSchema = z
  .object({
    transaction_id: z.string().min(1),
    type: z.string().min(1),
    status: z.string().min(1),
    status_updated: z.number().int().nonnegative(),
    adds: z.record(z.number().int().positive()).nullable().optional(),
    drops: z.record(z.number().int().positive()).nullable().optional(),
  })
  .passthrough()

type SleeperTransaction = z.infer<typeof transactionSchema>
type MovementInput = {
  id: string
  sleeperTransactionId: string | null
  sleeperPlayerId: string
  direction: 'add' | 'remove'
  kind: string
  occurredAt: Date
}
type ActiveContext = {
  sourceName: SourceName
  contextKey: string
  contextLabel: string
}
export type RosterReconcileResult = {
  cached: boolean
  playerIds: string[]
  status: string
  message: string
  pending: number
  needsReview: number
}

function uniqueRosterPlayers(roster: z.infer<typeof rosterSchema>) {
  return [
    ...new Set([...(roster.players ?? []), ...(roster.taxi ?? []), ...(roster.reserve ?? [])]),
  ]
    .filter((id) => /^\d+$/.test(id))
    .sort()
}

function savedPlayerIds(value: string) {
  try {
    return z.array(z.string().regex(/^\d+$/)).parse(JSON.parse(value))
  } catch {
    return []
  }
}

function transactionMovements(
  transactions: SleeperTransaction[],
  rosterId: number,
  trackingStartedAt: Date,
  now: Date,
) {
  const movements = new Map<string, MovementInput>()
  for (const transaction of transactions) {
    if (transaction.status !== 'complete') continue
    const occurredAt = new Date(transaction.status_updated)
    if (+occurredAt < +trackingStartedAt || +occurredAt > +now) continue
    for (const [direction, assets] of [
      ['add', transaction.adds],
      ['remove', transaction.drops],
    ] as const) {
      for (const [playerId, targetRosterId] of Object.entries(assets ?? {})) {
        if (targetRosterId !== rosterId || !/^\d+$/.test(playerId)) continue
        const id = `sleeper:${transaction.transaction_id}:${direction}:${playerId}`
        movements.set(id, {
          id,
          sleeperTransactionId: transaction.transaction_id,
          sleeperPlayerId: playerId,
          direction,
          kind: transaction.type,
          occurredAt,
        })
      }
    }
  }
  return [...movements.values()].sort(
    (a, b) => +a.occurredAt - +b.occurredAt || a.id.localeCompare(b.id),
  )
}

async function trackingStart(db: PrismaClient, now: Date) {
  const snapshots = await db.snapshot.findMany({
    where: { method: 'browser' },
    orderBy: { capturedAt: 'asc' },
    select: { capturedAt: true, contextJson: true },
  })
  for (const snapshot of snapshots) {
    const parsed = contextSchema.safeParse(JSON.parse(snapshot.contextJson))
    if (
      parsed.success &&
      parsed.data.settings.scope === 'owned-roster' &&
      String(parsed.data.settings.leagueId) === sleeperLeagueId
    )
      return snapshot.capturedAt
  }
  return now
}

async function reserveRosterRefresh(db: PrismaClient, now: Date, allowCached: boolean) {
  const fallbackStart = await trackingStart(db, now)
  return db.$transaction(async (tx) => {
    const existing = await tx.rosterSyncState.findUnique({ where: { id: stateId() } })
    const nextAllowedAt = existing?.lastCheckedAt ? +existing.lastCheckedAt + rosterRefreshMs : 0
    if (existing && nextAllowedAt > +now) {
      if (!allowCached)
        throw new DataError(
          `Sleeper roster can refresh after ${new Date(nextAllowedAt).toISOString()}.`,
          429,
        )
      return {
        state: existing,
        previousLastCheckedAt: existing.lastCheckedAt,
        cached: true,
      }
    }
    const startedAt = existing?.trackingStartedAt ?? fallbackStart
    const state = existing
      ? await tx.rosterSyncState.update({
          where: { id: existing.id },
          data: {
            lastCheckedAt: now,
            status: 'running',
            message: 'Checking the owned Sleeper roster.',
          },
        })
      : await tx.rosterSyncState.create({
          data: {
            id: stateId(),
            leagueId: sleeperLeagueId,
            ownerId: sleeperOwnerId,
            leagueName: sleeperLeagueName,
            trackingStartedAt: startedAt,
            lastCheckedAt: now,
            status: 'running',
            message: 'Checking the owned Sleeper roster.',
          },
        })
    return {
      state,
      previousLastCheckedAt: existing?.lastCheckedAt ?? null,
      cached: false,
    }
  })
}

async function getSleeperData(http: AxiosInstance, startWeek: number) {
  let leagueRaw: unknown
  let stateRaw: unknown
  let rostersRaw: unknown
  try {
    ;[leagueRaw, stateRaw, rostersRaw] = await Promise.all([
      http.get(`${sleeperBase}/league/${sleeperLeagueId}`, { timeout: 20_000 }).then((r) => r.data),
      http.get(`${sleeperBase}/state/nfl`, { timeout: 20_000 }).then((r) => r.data),
      http
        .get(`${sleeperBase}/league/${sleeperLeagueId}/rosters`, { timeout: 20_000 })
        .then((r) => r.data),
    ])
  } catch {
    throw new DataError(
      'Sleeper roster check was unavailable. Saved tracker data is unchanged.',
      502,
    )
  }
  const league = leagueSchema.safeParse(leagueRaw)
  const nflState = stateSchema.safeParse(stateRaw)
  const rosters = z.array(rosterSchema).safeParse(rostersRaw)
  if (!league.success || !nflState.success || !rosters.success)
    throw new DataError('Sleeper roster response changed. Saved tracker data is unchanged.', 502)
  const roster = rosters.data.find((candidate) => candidate.owner_id === sleeperOwnerId)
  if (!roster) throw new DataError('Sleeper did not return the configured owned roster.', 502)

  const firstWeek = Math.min(startWeek, nflState.data.week)
  const weeks = Array.from(
    { length: nflState.data.week - firstWeek + 1 },
    (_, index) => firstWeek + index,
  )
  let transactionBodies: unknown[]
  try {
    transactionBodies = await Promise.all(
      weeks.map((week) =>
        http
          .get(`${sleeperBase}/league/${sleeperLeagueId}/transactions/${week}`, {
            timeout: 20_000,
          })
          .then((response) => response.data),
      ),
    )
  } catch {
    throw new DataError(
      'Sleeper transactions were unavailable. Saved tracker data is unchanged.',
      502,
    )
  }
  const transactions: SleeperTransaction[] = []
  for (const body of transactionBodies) {
    const parsed = z.array(transactionSchema).safeParse(body)
    if (!parsed.success)
      throw new DataError(
        'Sleeper transaction response changed. Saved tracker data is unchanged.',
        502,
      )
    transactions.push(...parsed.data)
  }
  return {
    league: league.data,
    week: nflState.data.week,
    roster,
    transactions: [...new Map(transactions.map((item) => [item.transaction_id, item])).values()],
  }
}

async function saveRosterResult(
  db: PrismaClient,
  reserved: Awaited<ReturnType<typeof reserveRosterRefresh>>['state'],
  previousLastCheckedAt: Date | null,
  data: Awaited<ReturnType<typeof getSleeperData>>,
  now: Date,
) {
  const currentIds = uniqueRosterPlayers(data.roster)
  const previousIds = new Set(savedPlayerIds(reserved.playerIdsJson))
  const movements = transactionMovements(
    data.transactions,
    data.roster.roster_id,
    reserved.trackingStartedAt,
    now,
  )
  await db.$transaction(async (tx) => {
    const players = await tx.player.findMany({
      where: {
        sleeperId: { in: [...new Set(movements.map((m) => m.sleeperPlayerId).concat(currentIds))] },
      },
      select: { id: true, sleeperId: true },
    })
    const playerBySleeper = new Map(players.map((player) => [player.sleeperId!, player.id]))
    const existingMovements = new Set(
      (
        await tx.rosterMovement.findMany({
          where: { id: { in: movements.map((movement) => movement.id) } },
          select: { id: true },
        })
      ).map((movement) => movement.id),
    )

    if (!reserved.initializedAt) {
      const baseline = new Set(currentIds)
      for (const movement of [...movements].reverse()) {
        if (movement.direction === 'add') baseline.delete(movement.sleeperPlayerId)
        else baseline.add(movement.sleeperPlayerId)
      }
      for (const sleeperPlayerId of baseline) {
        const id = `sleeper:baseline:${reserved.id}:${sleeperPlayerId}`
        await tx.rosterMovement.upsert({
          where: { id },
          update: { playerId: playerBySleeper.get(sleeperPlayerId) },
          create: {
            id,
            rosterSyncStateId: reserved.id,
            sleeperPlayerId,
            playerId: playerBySleeper.get(sleeperPlayerId),
            direction: 'add',
            kind: 'baseline',
            occurredAt: reserved.trackingStartedAt,
          },
        })
      }
    }

    for (const movement of movements) {
      await tx.rosterMovement.upsert({
        where: { id: movement.id },
        update: { playerId: playerBySleeper.get(movement.sleeperPlayerId) },
        create: {
          ...movement,
          rosterSyncStateId: reserved.id,
          playerId: playerBySleeper.get(movement.sleeperPlayerId),
        },
      })
    }

    if (reserved.initializedAt) {
      const current = new Set(currentIds)
      const unexplained = [
        ...currentIds
          .filter((id) => !previousIds.has(id))
          .map((id) => ({ sleeperPlayerId: id, direction: 'add' as const })),
        ...[...previousIds]
          .filter((id) => !current.has(id))
          .map((id) => ({ sleeperPlayerId: id, direction: 'remove' as const })),
      ].filter(
        (change) =>
          !movements.some(
            (movement) =>
              !existingMovements.has(movement.id) &&
              movement.sleeperPlayerId === change.sleeperPlayerId &&
              movement.direction === change.direction &&
              (!previousLastCheckedAt || +movement.occurredAt >= +previousLastCheckedAt),
          ),
      )
      for (const change of unexplained) {
        const id = `sleeper:roster-diff:${reserved.id}:${now.getTime()}:${change.direction}:${change.sleeperPlayerId}`
        await tx.rosterMovement.create({
          data: {
            id,
            rosterSyncStateId: reserved.id,
            sleeperPlayerId: change.sleeperPlayerId,
            playerId: playerBySleeper.get(change.sleeperPlayerId),
            direction: change.direction,
            kind: 'roster_diff',
            occurredAt: now,
            status: 'needs_review',
            message: 'Sleeper roster changed without a matching completed transaction.',
          },
        })
      }
    }

    await tx.rosterSyncState.update({
      where: { id: reserved.id },
      data: {
        leagueName: data.league.name,
        rosterId: data.roster.roster_id,
        playerIdsJson: JSON.stringify(currentIds),
        initializedAt: reserved.initializedAt ?? now,
        lastWeek: data.week,
        status: 'success',
        message: `Checked ${currentIds.length} roster players.`,
      },
    })
  })
  return currentIds
}

async function activeContexts(db: PrismaClient): Promise<ActiveContext[]> {
  const snapshots = await db.snapshot.findMany({
    where: { method: 'browser' },
    include: { source: true },
    orderBy: { capturedAt: 'desc' },
  })
  const found = new Map<SourceName, ActiveContext>()
  for (const snapshot of snapshots) {
    const source = sourceSchema.safeParse(snapshot.source.name)
    const context = contextSchema.safeParse(JSON.parse(snapshot.contextJson))
    if (
      !source.success ||
      !context.success ||
      found.has(source.data) ||
      context.data.settings.scope !== 'owned-roster' ||
      String(context.data.settings.leagueId) !== sleeperLeagueId
    )
      continue
    found.set(source.data, {
      sourceName: source.data,
      contextKey: snapshot.contextKey,
      contextLabel: context.data.label,
    })
  }
  return [...found.values()]
}

async function setResolution(
  db: PrismaClient,
  movementId: string,
  targetKey: string,
  context: Pick<ActiveContext, 'sourceName' | 'contextKey'>,
  data: {
    status: string
    message: string
    holdingId?: string | null
    suggestedValue?: number | null
    suggestedCapturedAt?: Date | null
    resolvedAt?: Date | null
  },
) {
  return db.movementResolution.upsert({
    where: { movementId_targetKey: { movementId, targetKey } },
    update: data,
    create: {
      movementId,
      targetKey,
      sourceName: context.sourceName,
      contextKey: context.contextKey,
      ...data,
    },
  })
}

async function applyAddition(
  db: PrismaClient,
  movement: {
    id: string
    playerId: number
    occurredAt: Date
    kind: string
  },
  context: ActiveContext,
  now: Date,
) {
  const targetKey = `context:${context.sourceName}:${context.contextKey}`
  const valuation = await db.valuation.findFirst({
    where: {
      playerId: movement.playerId,
      contextKey: context.contextKey,
      source: { name: context.sourceName },
      snapshot: { is: { method: 'browser' } },
      ...(movement.kind === 'baseline' ? {} : { capturedAt: { gte: movement.occurredAt } }),
    },
    orderBy: [{ capturedAt: 'asc' }, { id: 'asc' }],
  })
  const tooLate =
    valuation &&
    movement.kind !== 'baseline' &&
    +valuation.capturedAt - +movement.occurredAt > trackerAlertThresholds.staleMs
  if (!valuation || tooLate) {
    const expired = +now - +movement.occurredAt > trackerAlertThresholds.staleMs
    const message = tooLate
      ? `The first ${sourceLabels[context.sourceName]} value arrived more than 36 hours after the add.`
      : movement.kind === 'baseline'
        ? `No ${sourceLabels[context.sourceName]} value was captured for this baseline player.`
        : `No ${sourceLabels[context.sourceName]} value was captured for this player after the add.`
    await setResolution(db, movement.id, targetKey, context, {
      status: expired || tooLate ? 'needs_review' : 'pending',
      message,
    })
    return
  }
  const holding = await db.holding.upsert({
    where: {
      originMovementId_sourceName_contextKey: {
        originMovementId: movement.id,
        sourceName: context.sourceName,
        contextKey: context.contextKey,
      },
    },
    update: {},
    create: {
      playerId: movement.playerId,
      sourceName: context.sourceName,
      contextKey: context.contextKey,
      portfolio: sleeperLeagueName,
      acquiredAt: movement.kind === 'baseline' ? valuation.capturedAt : movement.occurredAt,
      costBasis: valuation.value,
      targetRoi: 20,
      notes:
        movement.kind === 'baseline'
          ? 'Started automatically from the first saved roster value.'
          : `Started automatically from Sleeper ${movement.kind}.`,
      originMovementId: movement.id,
    },
  })
  await setResolution(db, movement.id, targetKey, context, {
    status: 'applied',
    message: `Entry basis saved from ${sourceLabels[context.sourceName]}.`,
    holdingId: holding.id,
    resolvedAt: now,
  })
}

async function applyRemoval(
  db: PrismaClient,
  movement: {
    id: string
    playerId: number
    occurredAt: Date
  },
  now: Date,
) {
  const holdings = await db.holding.findMany({
    where: { playerId: movement.playerId, closedAt: null },
  })
  for (const holding of holdings) {
    const source = sourceSchema.safeParse(holding.sourceName)
    if (!source.success) continue
    const context = { sourceName: source.data, contextKey: holding.contextKey }
    const targetKey = `holding:${holding.id}`
    const valuation = await db.valuation.findFirst({
      where: {
        playerId: movement.playerId,
        contextKey: holding.contextKey,
        source: { name: holding.sourceName },
        snapshot: { is: { method: 'browser' } },
        capturedAt: { lte: movement.occurredAt },
      },
      orderBy: [{ capturedAt: 'desc' }, { id: 'desc' }],
    })
    const isFresh =
      valuation && +movement.occurredAt - +valuation.capturedAt <= trackerAlertThresholds.staleMs
    if (isFresh && +movement.occurredAt >= +holding.acquiredAt) {
      await db.holding.update({
        where: { id: holding.id },
        data: {
          closedAt: movement.occurredAt,
          proceeds: valuation.value,
          exitMovementId: movement.id,
          reviewReason: null,
        },
      })
      await setResolution(db, movement.id, targetKey, context, {
        status: 'applied',
        message: `Exit value saved from ${sourceLabels[source.data]}.`,
        holdingId: holding.id,
        resolvedAt: now,
      })
      continue
    }
    const message = valuation
      ? `The last ${sourceLabels[source.data]} value before removal is more than 36 hours old.`
      : `No ${sourceLabels[source.data]} value exists at or before removal.`
    await db.holding.update({ where: { id: holding.id }, data: { reviewReason: message } })
    await setResolution(db, movement.id, targetKey, context, {
      status: 'needs_review',
      message,
      holdingId: holding.id,
      suggestedValue: valuation?.value,
      suggestedCapturedAt: valuation?.capturedAt,
    })
  }
  return holdings.length
}

async function summarizeMovement(db: PrismaClient, movementId: string, now: Date) {
  const movement = await db.rosterMovement.findUnique({
    where: { id: movementId },
    include: { resolutions: true },
  })
  if (!movement || movement.kind === 'roster_diff') return
  let status = 'applied'
  let message = 'Applied automatically.'
  if (!movement.playerId) {
    status = 'needs_review'
    message = 'This Sleeper player has not been matched to a canonical player.'
  } else if (!movement.resolutions.length && movement.direction === 'add') {
    status =
      +now - +movement.occurredAt > trackerAlertThresholds.staleMs ? 'needs_review' : 'pending'
    message = 'Waiting for a provider context and fresh player value.'
  } else if (movement.resolutions.some((resolution) => resolution.status === 'needs_review')) {
    status = 'needs_review'
    message = 'At least one provider value needs review.'
  } else if (movement.resolutions.some((resolution) => resolution.status === 'pending')) {
    status = 'pending'
    message = 'Waiting for a fresh provider value.'
  }
  await db.rosterMovement.update({
    where: { id: movement.id },
    data: {
      status,
      message,
      resolvedAt: status === 'applied' ? now : null,
    },
  })
}

export async function applyRosterMovements(db: PrismaClient, now = new Date()) {
  const contexts = await activeContexts(db)
  const movements = await db.rosterMovement.findMany({
    where: { kind: { not: 'roster_diff' }, status: { in: ['pending', 'needs_review'] } },
    orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
  })
  for (const movement of movements) {
    let playerId = movement.playerId
    if (!playerId) {
      const player = await db.player.findUnique({ where: { sleeperId: movement.sleeperPlayerId } })
      if (player) {
        playerId = player.id
        await db.rosterMovement.update({ where: { id: movement.id }, data: { playerId } })
      }
    }
    if (playerId) {
      if (movement.direction === 'add')
        for (const context of contexts)
          await applyAddition(db, { ...movement, playerId }, context, now)
      else await applyRemoval(db, { ...movement, playerId }, now)
    }
    await summarizeMovement(db, movement.id, now)
  }
  const [pending, needsReview, providerReviews] = await Promise.all([
    db.rosterMovement.count({ where: { status: 'pending' } }),
    db.rosterMovement.count({ where: { status: 'needs_review' } }),
    db.movementResolution.count({ where: { status: 'needs_review' } }),
  ])
  const state = await db.rosterSyncState.findUnique({ where: { id: stateId() } })
  if (state)
    await db.rosterSyncState.update({
      where: { id: state.id },
      data: {
        status: needsReview ? 'needs_review' : pending ? 'pending' : 'success',
        message: needsReview
          ? `${needsReview} roster movement${needsReview === 1 ? ' needs' : 's need'} review${providerReviews ? ` across ${providerReviews} provider value${providerReviews === 1 ? '' : 's'}` : ''}.`
          : pending
            ? `${pending} roster movement${pending === 1 ? ' awaits' : 's await'} a fresh value.`
            : `Watching ${savedPlayerIds(state.playerIdsJson).length} roster players.`,
      },
    })
  return { pending, needsReview }
}

export async function reconcileSleeperRoster(
  db: PrismaClient,
  options: { http?: AxiosInstance; now?: Date; allowCached?: boolean } = {},
): Promise<RosterReconcileResult> {
  const now = options.now ?? new Date()
  const reservation = await reserveRosterRefresh(db, now, options.allowCached ?? false)
  if (reservation.cached) {
    const applied = await applyRosterMovements(db, now)
    const state = await db.rosterSyncState.findUniqueOrThrow({ where: { id: stateId() } })
    return {
      cached: true,
      playerIds: savedPlayerIds(state.playerIdsJson),
      status: state.status,
      message: state.message,
      ...applied,
    }
  }
  try {
    const startWeek = reservation.state.initializedAt ? Math.max(0, reservation.state.lastWeek) : 0
    const data = await getSleeperData(options.http ?? axios, startWeek)
    const playerIds = await saveRosterResult(
      db,
      reservation.state,
      reservation.previousLastCheckedAt,
      data,
      now,
    )
    const applied = await applyRosterMovements(db, now)
    const state = await db.rosterSyncState.findUniqueOrThrow({ where: { id: stateId() } })
    return {
      cached: false,
      playerIds,
      status: state.status,
      message: state.message,
      ...applied,
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'test' && !(error instanceof DataError)) throw error
    const message =
      error instanceof DataError
        ? error.message
        : 'Sleeper roster check failed validation. Saved tracker data is unchanged.'
    await db.rosterSyncState.update({
      where: { id: reservation.state.id },
      data: { status: 'failed', message },
    })
    throw new DataError(message, 502)
  }
}

export async function loadReconciledRosterPlayers(
  db: PrismaClient,
  playerIds: string[],
): Promise<CanonicalPlayer[]> {
  const existing = await db.player.findMany({ where: { sleeperId: { in: playerIds } } })
  if (existing.length === playerIds.length) {
    const byId = new Map(existing.map((player) => [player.sleeperId!, player]))
    return playerIds.map((id) => {
      const player = byId.get(id)!
      return {
        sleeperId: id,
        name: player.name,
        position: player.position ?? undefined,
        team: player.team ?? undefined,
      }
    })
  }
  const catalog = await loadSleeperPlayers()
  const byId = new Map(catalog.map((player) => [player.sleeperId, player]))
  const roster = playerIds.map((id) => byId.get(id)).filter(Boolean) as CanonicalPlayer[]
  if (!roster.length || roster.length !== playerIds.length)
    throw new DataError(
      'Sleeper player metadata is incomplete. No provider snapshot was saved.',
      502,
    )
  await db.$transaction(
    roster.map((player) =>
      db.player.upsert({
        where: { sleeperId: player.sleeperId },
        update: { name: player.name, position: player.position, team: player.team },
        create: player,
      }),
    ),
  )
  return roster
}

async function reviewItems(db: PrismaClient): Promise<RosterReviewItem[]> {
  const resolutionRows = await db.movementResolution.findMany({
    where: { status: 'needs_review' },
    include: { movement: { include: { player: true } } },
    orderBy: { createdAt: 'asc' },
  })
  const items: RosterReviewItem[] = resolutionRows.map((resolution) => ({
    id: resolution.id,
    movementId: resolution.movementId,
    playerName:
      resolution.movement.player?.name ?? `Sleeper player ${resolution.movement.sleeperPlayerId}`,
    sleeperPlayerId: resolution.movement.sleeperPlayerId,
    direction: resolution.movement.direction === 'remove' ? 'remove' : 'add',
    kind: resolution.movement.kind,
    occurredAt: resolution.movement.occurredAt.toISOString(),
    sourceName: sourceSchema.parse(resolution.sourceName),
    contextKey: resolution.contextKey,
    message: resolution.message,
    suggestedValue: resolution.suggestedValue,
    suggestedCapturedAt: resolution.suggestedCapturedAt?.toISOString() ?? null,
    canAcceptLastValue:
      resolution.movement.direction === 'remove' &&
      resolution.suggestedValue !== null &&
      resolution.holdingId !== null,
  }))
  const unresolved = await db.rosterMovement.findMany({
    where: { status: 'needs_review', resolutions: { none: {} } },
    include: { player: true },
    orderBy: { occurredAt: 'asc' },
  })
  items.push(
    ...unresolved.map((movement) => ({
      id: movement.id,
      movementId: movement.id,
      playerName: movement.player?.name ?? `Sleeper player ${movement.sleeperPlayerId}`,
      sleeperPlayerId: movement.sleeperPlayerId,
      direction: movement.direction === 'remove' ? ('remove' as const) : ('add' as const),
      kind: movement.kind,
      occurredAt: movement.occurredAt.toISOString(),
      sourceName: null,
      contextKey: null,
      message: movement.message,
      suggestedValue: null,
      suggestedCapturedAt: null,
      canAcceptLastValue: false,
    })),
  )
  return items
}

export async function getRosterAutomation(db: PrismaClient): Promise<RosterAutomationView> {
  const state = await db.rosterSyncState.findUnique({ where: { id: stateId() } })
  if (!state)
    return {
      leagueName: sleeperLeagueName,
      status: 'idle',
      message:
        'Sleeper roster automation starts with the next value capture or manual roster check.',
      lastCheckedAt: null,
      nextAllowedAt: null,
      rosterPlayers: 0,
      pending: 0,
      reviews: [],
    }
  const [pending, reviews] = await Promise.all([
    db.rosterMovement.count({ where: { rosterSyncStateId: state.id, status: 'pending' } }),
    reviewItems(db),
  ])
  const next = state.lastCheckedAt ? +state.lastCheckedAt + rosterRefreshMs : 0
  return {
    leagueName: state.leagueName,
    status: state.status,
    message: state.message,
    lastCheckedAt: state.lastCheckedAt?.toISOString() ?? null,
    nextAllowedAt: next > Date.now() ? new Date(next).toISOString() : null,
    rosterPlayers: savedPlayerIds(state.playerIdsJson).length,
    pending,
    reviews,
  }
}

export async function acceptLastRemovalValue(
  db: PrismaClient,
  resolutionId: string,
  now = new Date(),
) {
  const resolution = await db.movementResolution.findUnique({
    where: { id: resolutionId },
    include: { movement: true },
  })
  if (
    !resolution ||
    resolution.status !== 'needs_review' ||
    resolution.movement.direction !== 'remove' ||
    !resolution.holdingId ||
    resolution.suggestedValue === null
  )
    throw new DataError('This roster review has no last value to accept.', 409)
  const holding = await db.holding.findUnique({ where: { id: resolution.holdingId } })
  if (!holding || holding.closedAt)
    throw new DataError('This acquisition is no longer open for roster review.', 409)
  if (+resolution.movement.occurredAt < +holding.acquiredAt)
    throw new DataError('Removal predates this acquisition and requires a manual correction.', 409)
  await db.$transaction([
    db.holding.update({
      where: { id: holding.id },
      data: {
        closedAt: resolution.movement.occurredAt,
        proceeds: resolution.suggestedValue,
        exitMovementId: resolution.movement.id,
        reviewReason: null,
      },
    }),
    db.movementResolution.update({
      where: { id: resolution.id },
      data: {
        status: 'applied',
        message: 'Last known value accepted explicitly.',
        resolvedAt: now,
      },
    }),
  ])
  await summarizeMovement(db, resolution.movement.id, now)
  await applyRosterMovements(db, now)
  return { accepted: true }
}
