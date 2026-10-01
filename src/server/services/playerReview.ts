import type { PrismaClient } from '../generated/prisma/client.js'
import {
  indexCanonicalPlayers,
  matchedPositions,
  matchByAge,
  matchByBirthDate,
} from '../../shared/playerMatching.js'
import { playerIdentityKey } from '../../shared/playerIdentity.js'
import type { SnapshotInput } from '../../shared/tracker.js'
import { ProviderError, type ProviderCatalog } from '../providers/types.js'
import type { PlayerMatchReview, PlayerMatchRow } from '../../shared/playerReview.js'
import type { SourceName } from '../../shared/tracker.js'
import { sleeperLeagueId, sleeperOwnerId } from '../config.js'
import { DataError } from './valuations.js'

export async function getPlayerMatchReview(
  db: PrismaClient,
  options: {
    source?: SourceName
    search?: string
    scope?: 'roster' | 'all'
    status?: 'review' | 'all'
  },
): Promise<PlayerMatchReview> {
  const [players, state, gm, dtc] = await Promise.all([
    db.player.findMany({
      where: { sleeperId: { not: null }, position: { in: [...matchedPositions] } },
    }),
    db.rosterSyncState.findFirst({ where: { leagueId: sleeperLeagueId, ownerId: sleeperOwnerId } }),
    options.source === 'dynasty-calculator'
      ? []
      : db.dynastyGmPlayer.findMany({ where: { position: { in: [...matchedPositions] } } }),
    options.source === 'dynasty-nerds'
      ? []
      : db.dtcPlayer.findMany({ where: { position: { in: [...matchedPositions] } } }),
  ])
  let rosterIds: unknown = []
  try {
    rosterIds = JSON.parse(state?.playerIdsJson ?? '[]')
  } catch {
    /* Corrupt state must not claim a roster match. */
  }
  const owned = new Set(
    Array.isArray(rosterIds) ? rosterIds.filter((id): id is string => typeof id === 'string') : [],
  )
  const candidates = players.map((p) => ({
    id: p.id,
    name: p.name,
    position: p.position,
    birthDate: p.birthDate,
    sleeperId: p.sleeperId,
    rostered: owned.has(p.sleeperId!),
  }))
  const byId = new Map(candidates.map((p) => [p.id, p]))
  const find = indexCanonicalPlayers(candidates)
  const latestDtc = Math.max(...dtc.map((r) => +r.lastSeenAt))
  const rows: PlayerMatchRow[] = [
    ...gm.map((r) => ({
      source: 'dynasty-nerds' as const,
      key: String(r.id),
      name: `${r.firstName} ${r.lastName}`,
      position: r.position,
      birthDate: r.birthDate,
      age: null,
      lastSeenAt: r.lastSeenAt.toISOString(),
      current: true,
      status: r.matchStatus,
      method: r.matchMethod,
      note: r.matchNote,
      playerId: r.playerId,
    })),
    ...dtc.map((r) => ({
      source: 'dynasty-calculator' as const,
      key: r.key,
      name: r.name,
      position: r.position,
      birthDate: null,
      age: r.age,
      lastSeenAt: r.lastSeenAt.toISOString(),
      current: +r.lastSeenAt === latestDtc,
      status: r.matchStatus,
      method: r.matchMethod,
      note: r.matchNote,
      playerId: r.playerId,
    })),
  ]
    .map(({ playerId, ...r }) => {
      const found = find(r.name, r.position).map((p) => byId.get(p.id)!)
      const linked = playerId ? (byId.get(playerId) ?? null) : null
      return {
        ...r,
        linked,
        candidates: found,
        rostered: Boolean(linked?.rostered || found.some((p) => p.rostered)),
      }
    })
    .filter(
      (r) =>
        (options.scope === 'all' || r.rostered) &&
        (options.status === 'all' ||
          (r.current && ['ambiguous', 'unmatched'].includes(r.status))) &&
        (!options.search ||
          `${r.name} ${r.linked?.name ?? ''}`.toLowerCase().includes(options.search.toLowerCase())),
    )
    .sort(
      (a, b) =>
        Number(b.rostered) - Number(a.rostered) ||
        a.name.localeCompare(b.name) ||
        a.source.localeCompare(b.source),
    )
  return { rows: rows.slice(0, 50), total: rows.length, rosterAvailable: Boolean(state) }
}

// Only future identity resolution changes. Valuations, snapshots, and holdings are immutable here.
export async function linkPlayerMatch(
  db: PrismaClient,
  sourceName: SourceName,
  key: string,
  playerId: number | null,
) {
  return db.$transaction(async (tx) => {
    if (playerId === null) {
      const row =
        sourceName === 'dynasty-nerds'
          ? /^\d+$/.test(key)
            ? await tx.dynastyGmPlayer.findUnique({ where: { id: Number(key) } })
            : null
          : await tx.dtcPlayer.findUnique({ where: { key } })
      if (!row || !matchedPositions.includes(row.position))
        throw new DataError('Provider player not found.', 404)
      const data = {
        playerId: null,
        matchStatus: 'unmatched',
        matchMethod: null,
        matchNote: 'Link removed explicitly. Identity needs review.',
        matchedAt: null,
      }
      if (sourceName === 'dynasty-nerds')
        await tx.dynastyGmPlayer.update({ where: { id: Number(key) }, data })
      else await tx.dtcPlayer.update({ where: { key }, data })
      const source = await tx.source.findUnique({ where: { name: sourceName } })
      if (source) await tx.mapping.deleteMany({ where: { sourceId: source.id, sourceKey: key } })
      return { saved: true }
    }
    const player = await tx.player.findUnique({ where: { id: playerId } })
    if (!player?.sleeperId || !matchedPositions.includes(player.position ?? ''))
      throw new DataError('Choose a canonical Sleeper QB, RB, WR, or TE.')
    const row =
      sourceName === 'dynasty-nerds'
        ? /^\d+$/.test(key)
          ? await tx.dynastyGmPlayer.findUnique({ where: { id: Number(key) } })
          : null
        : await tx.dtcPlayer.findUnique({ where: { key } })
    if (!row) throw new DataError('Provider player not found.', 404)
    if (row.position !== player.position)
      throw new DataError('Provider and Sleeper positions must agree.')
    const conflict =
      sourceName === 'dynasty-nerds'
        ? await tx.dynastyGmPlayer.findUnique({ where: { playerId } })
        : await tx.dtcPlayer.findUnique({ where: { playerId } })
    if (
      conflict &&
      (sourceName === 'dynasty-nerds'
        ? String((conflict as { id: number }).id)
        : (conflict as { key: string }).key) !== key
    )
      throw new DataError(
        'Another provider row already links to this player. Correct that link first.',
        409,
      )
    const data = {
      playerId,
      matchStatus: 'linked',
      matchMethod: 'manual',
      matchNote: 'Confirmed manually. Earlier observations and holdings are unchanged.',
      matchedAt: new Date(),
    }
    if (sourceName === 'dynasty-nerds')
      await tx.dynastyGmPlayer.update({ where: { id: Number(key) }, data })
    else await tx.dtcPlayer.update({ where: { key }, data })
    const source = await tx.source.upsert({
      where: { name: sourceName },
      create: { name: sourceName },
      update: {},
    })
    await tx.mapping.upsert({
      where: { sourceId_sourceKey: { sourceId: source.id, sourceKey: key } },
      create: { sourceId: source.id, sourceKey: key, playerId },
      update: { playerId },
    })
    return { saved: true }
  })
}

export async function getManualPlayerLinks(db: PrismaClient, source: SourceName) {
  const where = { matchMethod: 'manual', playerId: { not: null } }
  const rows =
    source === 'dynasty-nerds'
      ? (await db.dynastyGmPlayer.findMany({ where, include: { player: true } })).map((r) => ({
          key: String(r.id),
          player: r.player,
        }))
      : (await db.dtcPlayer.findMany({ where, include: { player: true } })).map((r) => ({
          key: r.key,
          player: r.player,
        }))
  return rows.flatMap((r) =>
    r.player?.sleeperId ? [{ key: r.key, sleeperId: r.player.sleeperId }] : [],
  )
}

// Capture parsers establish roster coverage. This second check enforces the user's strict identity
// rule before any observation is saved, including when an older Mapping exists.
export async function validateCapturedPlayerLinks(
  db: PrismaClient,
  snapshot: SnapshotInput,
  catalog: ProviderCatalog,
) {
  const players = await db.player.findMany({
    where: { sleeperId: { not: null }, position: { in: [...matchedPositions] } },
  })
  const bySleeper = new Map(players.map((p) => [p.sleeperId, p]))
  const find = indexCanonicalPlayers(players)
  const manualLinks = await getManualPlayerLinks(db, snapshot.source)
  for (const record of snapshot.records) {
    let player = bySleeper.get(record.sleeperId ?? null)
    // Dynasty GM may still read a verified owned-team view when Sleeper's live check is down.
    // Resolve that identity from a manual link or an independently confirmed birth date.
    if (!record.sleeperId && catalog.source === 'dynasty-nerds') {
      const entry = catalog.players.find((p) => String(p.id) === record.sourceKey)
      const explicit = manualLinks.find((link) => link.key === record.sourceKey)
      if (entry && explicit) {
        const linked = bySleeper.get(explicit.sleeperId)
        if (linked?.position === entry.pos) player = linked
      } else if (entry) {
        const identity = matchByBirthDate(
          {
            name: `${entry.firstName} ${entry.lastName}`,
            position: entry.pos,
            birthDate: typeof entry.dob === 'string' ? entry.dob : null,
          },
          find,
        )
        if (identity.status === 'linked') player = players.find((p) => p.id === identity.playerId)
      }
      if (player) record.sleeperId = player.sleeperId!
    }
    if (!player)
      throw new ProviderError(
        'format',
        'Capture has no canonical Sleeper identity. Review player matches. No snapshot saved.',
      )
    const manual = manualLinks.find((link) => link.sleeperId === player.sleeperId)
    let decision
    if (catalog.source === 'dynasty-nerds') {
      const entry = catalog.players.find((p) => String(p.id) === record.sourceKey)
      if (manual?.key === record.sourceKey && entry?.pos === player.position) continue
      decision = entry
        ? matchByBirthDate(
            {
              name: `${entry.firstName} ${entry.lastName}`,
              position: entry.pos,
              birthDate: typeof entry.dob === 'string' ? entry.dob : null,
            },
            find,
          )
        : null
    } else {
      const candidates = manual
        ? catalog.rows.filter((r) => playerIdentityKey(r.playerName, r.position) === manual.key)
        : catalog.rows.filter(
            (r) =>
              !manualLinks.some(
                (link) => link.key === playerIdentityKey(r.playerName, r.position),
              ) && find(r.playerName, r.position).some((p) => p.id === player.id),
          )
      if (
        !candidates.length &&
        record.sourceKey === `absent:sleeper:${player.sleeperId}` &&
        record.value === 0
      )
        continue
      const entry = candidates.length === 1 ? candidates[0] : null
      if (entry && manual && entry.position === player.position) continue
      decision = entry
        ? matchByAge(
            {
              name: entry.playerName,
              position: entry.position,
              age: Number.isFinite(Number.parseFloat(entry.age))
                ? Number.parseFloat(entry.age)
                : null,
              observedAt: new Date(snapshot.capturedAt),
            },
            find,
          )
        : null
    }
    if (decision?.status !== 'linked' || decision.playerId !== player.id)
      throw new ProviderError(
        'format',
        `Player matching needs review for ${player.name}. Confirm the provider link in Review player matches, then capture again. No snapshot saved.`,
      )
  }
}
