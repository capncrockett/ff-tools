import type { Prisma, PrismaClient } from '@prisma/client'
import { playerIdentityKey } from '../../shared/playerIdentity.js'
import {
  indexCanonicalPlayers,
  matchByAge,
  matchByBirthDate,
  matchedPositions,
  validBirthDate,
  type MatchDecision,
} from '../../shared/playerMatching.js'
import type { DtcCatalogRow, DynastyGmCatalogEntry, ProviderCatalog } from '../providers/types.js'

type Tx = Prisma.TransactionClient
const chunks = <T>(items: T[], size = 400) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  )
const catalogTransaction = { timeout: 120_000 }
// Dynasty GM rows the league can use. Rows saved at other positions before this scope are ignored.
const dynastyGmPositions: readonly string[] = [...matchedPositions, 'pick']

export async function saveProviderCatalog(
  db: PrismaClient,
  catalog: ProviderCatalog,
  seenAt = new Date(),
) {
  return catalog.source === 'dynasty-nerds'
    ? saveDynastyGmCatalog(db, catalog.players, seenAt)
    : saveDtcCatalog(db, catalog.rows, seenAt)
}

function dynastyGmRow(entry: DynastyGmCatalogEntry) {
  const draftYear = Number(entry.draftYear)
  return {
    id: entry.id,
    firstName: entry.firstName.trim(),
    lastName: entry.lastName.trim(),
    position: entry.pos,
    team: entry.team || null,
    birthDate: validBirthDate(entry.dob),
    draftYear: Number.isInteger(draftYear) && draftYear > 1900 ? draftYear : null,
    status: typeof entry.status === 'string' && entry.status ? entry.status : null,
  }
}

// Clears an automatic decision when identity details change, so matching evaluates the row again.
const resetAutomatic = {
  playerId: null,
  matchStatus: 'unmatched',
  matchMethod: null,
  matchNote: '',
}

export async function saveDynastyGmCatalog(
  db: PrismaClient,
  entries: DynastyGmCatalogEntry[],
  seenAt: Date,
) {
  // The league rosters only QB, RB, WR, and TE and trades picks; kickers and defenses are not kept.
  const incoming = [
    ...new Map(
      entries
        .filter((entry) => dynastyGmPositions.includes(entry.pos))
        .map((entry) => [entry.id, dynastyGmRow(entry)]),
    ).values(),
  ]
  return db.$transaction(async (tx) => {
    const existing = new Map((await tx.dynastyGmPlayer.findMany()).map((row) => [row.id, row]))
    const created = incoming.filter((row) => !existing.has(row.id))
    for (const batch of chunks(created))
      await tx.dynastyGmPlayer.createMany({
        data: batch.map((row) => ({ ...row, firstSeenAt: seenAt, lastSeenAt: seenAt })),
      })
    let updated = 0
    const unchanged: number[] = []
    for (const row of incoming) {
      const saved = existing.get(row.id)
      if (!saved) continue
      const identityChanged =
        saved.firstName !== row.firstName ||
        saved.lastName !== row.lastName ||
        saved.position !== row.position ||
        saved.birthDate !== row.birthDate
      const detailsChanged =
        identityChanged ||
        saved.team !== row.team ||
        saved.draftYear !== row.draftYear ||
        saved.status !== row.status
      if (!detailsChanged) {
        unchanged.push(row.id)
        continue
      }
      updated++
      await tx.dynastyGmPlayer.update({
        where: { id: row.id },
        data: {
          ...row,
          lastSeenAt: seenAt,
          ...(identityChanged && saved.matchMethod !== 'manual' ? resetAutomatic : {}),
        },
      })
    }
    for (const batch of chunks(unchanged))
      await tx.dynastyGmPlayer.updateMany({
        where: { id: { in: batch } },
        data: { lastSeenAt: seenAt },
      })
    return {
      source: 'dynasty-nerds' as const,
      seen: incoming.length,
      created: created.length,
      updated,
    }
  }, catalogTransaction)
}

function dtcRow(row: DtcCatalogRow, seenAt: Date) {
  const age = Number.parseFloat(row.age)
  return {
    key: playerIdentityKey(row.playerName, row.position),
    name: row.playerName.trim(),
    position: row.position,
    team: row.team || null,
    age: Number.isFinite(age) ? age : null,
    ageObservedAt: seenAt,
    rank: row.rank,
  }
}

export async function saveDtcCatalog(db: PrismaClient, rows: DtcCatalogRow[], seenAt: Date) {
  // DTC has no player IDs. Two spellings that normalize to one name and position keep the better rank.
  const incoming = [
    ...new Map(
      [...rows]
        .sort((a, b) => b.rank - a.rank)
        .map((row) => dtcRow(row, seenAt))
        .map((row) => [row.key, row]),
    ).values(),
  ]
  return db.$transaction(async (tx) => {
    const existing = new Map((await tx.dtcPlayer.findMany()).map((row) => [row.key, row]))
    const created = incoming.filter((row) => !existing.has(row.key))
    for (const batch of chunks(created))
      await tx.dtcPlayer.createMany({
        data: batch.map((row) => ({ ...row, firstSeenAt: seenAt, lastSeenAt: seenAt })),
      })
    let updated = 0
    for (const row of incoming) {
      const saved = existing.get(row.key)
      if (!saved) continue
      updated++
      // Age and rank move with every capture, so every seen row is updated.
      await tx.dtcPlayer.update({ where: { key: row.key }, data: { ...row, lastSeenAt: seenAt } })
    }
    return {
      source: 'dynasty-calculator' as const,
      seen: incoming.length,
      created: created.length,
      updated,
    }
  }, catalogTransaction)
}

type CatalogState = {
  key: string
  playerId: number | null
  matchStatus: string
  matchMethod: string | null
  matchNote: string
}
export type MatchSummary = Record<'linked' | 'ambiguous' | 'unmatched' | 'skipped', number>

// Existing links and manual decisions stand. New automatic links may not reuse a Sleeper player that
// another row of the same provider already holds or that two rows both claim.
function planDecisions(
  rows: CatalogState[],
  decide: (key: string) => MatchDecision,
  label: string,
  reservedPlayerIds: Iterable<number> = [],
) {
  const standing = (row: CatalogState) =>
    row.matchMethod === 'manual' || row.matchStatus === 'linked'
  const held = new Set([
    ...reservedPlayerIds,
    ...rows.filter(standing).flatMap((row) => (row.playerId ? [row.playerId] : [])),
  ])
  const proposed = rows
    .filter((row) => !standing(row))
    .map((row) => ({ row, decision: decide(row.key) }))
  const claims = new Map<number, number>()
  for (const { decision } of proposed)
    if (decision.status === 'linked')
      claims.set(decision.playerId, (claims.get(decision.playerId) ?? 0) + 1)
  return proposed.map(({ row, decision }) => {
    if (decision.status !== 'linked') return { row, decision }
    if (held.has(decision.playerId))
      return {
        row,
        decision: {
          status: 'ambiguous' as const,
          note: `Another ${label} player already links to this Sleeper player.`,
        },
      }
    if ((claims.get(decision.playerId) ?? 0) > 1)
      return {
        row,
        decision: {
          status: 'ambiguous' as const,
          note: `More than one ${label} player matches this Sleeper player.`,
        },
      }
    return { row, decision }
  })
}

async function applyDecisions(
  plan: ReturnType<typeof planDecisions>,
  update: (key: string, data: Record<string, unknown>) => Promise<unknown>,
  now: Date,
) {
  for (const { row, decision } of plan) {
    const playerId = decision.status === 'linked' ? decision.playerId : null
    if (
      row.matchStatus === decision.status &&
      row.playerId === playerId &&
      row.matchNote === decision.note &&
      row.matchMethod === 'automatic'
    )
      continue
    await update(row.key, {
      playerId,
      matchStatus: decision.status,
      matchMethod: 'automatic',
      matchNote: decision.note,
      matchedAt: decision.status === 'linked' ? now : null,
    })
  }
}

function summarize(rows: CatalogState[], plan: ReturnType<typeof planDecisions>): MatchSummary {
  const decided = new Map(plan.map(({ row, decision }) => [row.key, decision.status]))
  const summary: MatchSummary = { linked: 0, ambiguous: 0, unmatched: 0, skipped: 0 }
  for (const row of rows) {
    const status = (decided.get(row.key) ?? row.matchStatus) as keyof MatchSummary
    if (status in summary) summary[status]++
  }
  return summary
}

export async function matchProviderCatalogs(db: PrismaClient, now = new Date()) {
  const canonical = await db.player.findMany({
    where: { sleeperId: { not: null }, position: { in: [...matchedPositions] } },
    select: { id: true, name: true, position: true, birthDate: true },
  })
  const find = indexCanonicalPlayers(canonical)
  return db.$transaction(async (tx: Tx) => {
    const gmRows = await tx.dynastyGmPlayer.findMany({
      where: { position: { in: [...dynastyGmPositions] } },
    })
    const gmByKey = new Map(gmRows.map((row) => [String(row.id), row]))
    const gmPlan = planDecisions(
      gmRows.map((row) => ({ ...row, key: String(row.id) })),
      (key) => {
        const row = gmByKey.get(key)!
        return matchByBirthDate(
          {
            name: `${row.firstName} ${row.lastName}`,
            position: row.position,
            birthDate: row.birthDate,
          },
          find,
        )
      },
      'Dynasty GM',
    )
    await applyDecisions(
      gmPlan,
      (key, data) => tx.dynastyGmPlayer.update({ where: { id: Number(key) }, data }),
      now,
    )

    const dtcRows = await tx.dtcPlayer.findMany()
    const latestDtcSeenAt = Math.max(...dtcRows.map((row) => +row.lastSeenAt))
    const currentDtcRows = dtcRows.filter((row) => +row.lastSeenAt === latestDtcSeenAt)
    const staleDtcRows = dtcRows.filter((row) => +row.lastSeenAt !== latestDtcSeenAt)
    // DTC has no stable player IDs. If a current export changes a spelling or position, preserve the
    // older row but release its automatic claim so the current identity can link. Manual links stand.
    if (staleDtcRows.length)
      await tx.dtcPlayer.updateMany({
        where: {
          lastSeenAt: { lt: new Date(latestDtcSeenAt) },
          matchMethod: 'automatic',
          playerId: { not: null },
        },
        data: {
          playerId: null,
          matchStatus: 'unmatched',
          matchNote: 'Not listed in the latest DTC catalog.',
          matchedAt: null,
        },
      })
    const dtcByKey = new Map(currentDtcRows.map((row) => [row.key, row]))
    const dtcPlan = planDecisions(
      currentDtcRows,
      (key) => {
        const row = dtcByKey.get(key)!
        return matchByAge(
          {
            name: row.name,
            position: row.position,
            age: row.age,
            observedAt: row.ageObservedAt ?? row.lastSeenAt,
          },
          find,
        )
      },
      'DTC',
      staleDtcRows.flatMap((row) =>
        row.matchMethod === 'manual' && row.playerId ? [row.playerId] : [],
      ),
    )
    await applyDecisions(dtcPlan, (key, data) => tx.dtcPlayer.update({ where: { key }, data }), now)

    return {
      'dynasty-nerds': summarize(
        gmRows.map((row) => ({ ...row, key: String(row.id) })),
        gmPlan,
      ),
      'dynasty-calculator': summarize(currentDtcRows, dtcPlan),
    }
  }, catalogTransaction)
}
