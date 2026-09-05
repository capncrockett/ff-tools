import { createHash } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'
import {
  snapshotSchema,
  type SnapshotInput,
  type ValueContext,
  type Observation,
  type MarketRow,
  sourceSchema,
  percentageChange,
} from '../../shared/tracker.js'

export class DataError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message)
    this.name = 'DataError'
  }
}

export function contextIdentity(context: ValueContext): string {
  const settings = Object.fromEntries(
    Object.entries(context.settings).sort(([a], [b]) => a.localeCompare(b)),
  )
  return createHash('sha256').update(JSON.stringify(settings)).digest('hex').slice(0, 24)
}

function normalizeName(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+(jr\.?|sr\.?|ii|iii|iv)$/i, '')
    .replace(/[^a-z0-9]/g, '')
}

async function resolvePlayer(tx: Prisma.TransactionClient, sourceId: number, record: Observation) {
  const mapping = await tx.mapping.findUnique({
    where: { sourceId_sourceKey: { sourceId, sourceKey: record.sourceKey } },
    include: { player: true },
  })
  if (mapping) {
    if (
      record.sleeperId &&
      mapping.player.sleeperId &&
      mapping.player.sleeperId !== record.sleeperId
    )
      throw new DataError(`Conflicting player ID for ${record.playerName}. Review its mapping.`)
    return mapping.player
  }
  let player = record.sleeperId
    ? await tx.player.findUnique({ where: { sleeperId: record.sleeperId } })
    : null
  if (!player && !record.sleeperId && record.position) {
    // Only canonical Sleeper identities are candidates. Never merge two source-only players by name.
    const candidates = (
      await tx.player.findMany({ where: { sleeperId: { not: null }, position: record.position } })
    ).filter((p) => normalizeName(p.name) === normalizeName(record.playerName))
    if (candidates.length > 1)
      throw new DataError(
        `Ambiguous player: ${record.playerName}. Supply a Sleeper ID or confirmed mapping.`,
      )
    player = candidates[0] ?? null
  }
  player ??= await tx.player.create({
    data: {
      name: record.playerName,
      sleeperId: record.sleeperId,
      position: record.position,
      team: record.team,
    },
  })
  await tx.mapping.create({ data: { sourceId, sourceKey: record.sourceKey, playerId: player.id } })
  return player
}

export async function saveSnapshot(db: PrismaClient, raw: unknown, method = 'import') {
  const input = snapshotSchema.parse(raw)
  const capturedAt = new Date(input.capturedAt)
  if (+capturedAt > Date.now() + 60_000)
    throw new DataError('Capture time cannot be in the future.')
  if (!Object.keys(input.context.settings).length)
    throw new DataError('At least one valuation setting is required.')
  if (new Set(input.records.map((r) => r.sourceKey)).size !== input.records.length)
    throw new DataError('Duplicate source player IDs in this snapshot.')
  const contextKey = contextIdentity(input.context)
  const checksum = createHash('sha256')
    .update(
      JSON.stringify([...input.records].sort((a, b) => a.sourceKey.localeCompare(b.sourceKey))),
    )
    .digest('hex')
  return db.$transaction(
    async (tx) => {
      const source = await tx.source.upsert({
        where: { name: input.source },
        create: { name: input.source },
        update: {},
      })
      const previous = await tx.snapshot.findUnique({
        where: { sourceId_contextKey_capturedAt: { sourceId: source.id, contextKey, capturedAt } },
      })
      if (previous) {
        if (previous.checksum !== checksum)
          throw new DataError(
            'A different snapshot already exists at this source, format, and time.',
            409,
          )
        return { saved: 0, duplicate: true, snapshotId: previous.id, contextKey }
      }
      const snapshot = await tx.snapshot.create({
        data: {
          sourceId: source.id,
          contextKey,
          contextJson: JSON.stringify(input.context),
          capturedAt,
          checksum,
          rowCount: input.records.length,
          method,
        },
      })
      const playerIds = new Set<number>()
      for (const r of input.records) {
        const player = await resolvePlayer(tx, source.id, r)
        if (playerIds.has(player.id))
          throw new DataError(
            `Multiple source records resolve to ${player.name}. Nothing was imported.`,
          )
        playerIds.add(player.id)
        await tx.valuation.create({
          data: {
            playerId: player.id,
            sourceId: source.id,
            value: r.value,
            capturedAt,
            contextKey,
            snapshotId: snapshot.id,
            sourceKey: r.sourceKey,
          },
        })
      }
      return { saved: input.records.length, duplicate: false, snapshotId: snapshot.id, contextKey }
    },
    { timeout: 60_000 },
  )
}

function csvFields(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (!quoted && field.length) throw new DataError('Invalid quote in CSV.')
      else quoted = !quoted
    } else if (c === ',' && !quoted) {
      row.push(field.trim())
      field = ''
    } else if (c === '\n' && !quoted) {
      row.push(field.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []
      field = ''
    } else if (c !== '\r' || quoted) field += c
  }
  if (quoted) throw new DataError('Unclosed CSV quote.')
  row.push(field.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

export function parseCsvSnapshot(
  text: string,
  source: unknown,
  context: ValueContext,
): SnapshotInput {
  const rows = csvFields(text.replace(/^\uFEFF/, ''))
  const headers = rows.shift()?.map((h) => h.toLowerCase()) ?? []
  for (const key of ['player_name', 'value', 'captured_at'])
    if (!headers.includes(key)) throw new DataError(`CSV requires ${key}.`)
  if (!rows.length) throw new DataError('CSV contains no observations.')
  const get = (row: string[], key: string) => row[headers.indexOf(key)] || ''
  const capturedAt = get(rows[0], 'captured_at')
  const records = rows.map((row, index) => {
    if (row.length !== headers.length)
      throw new DataError(`CSV row ${index + 2} has the wrong number of columns.`)
    if (get(row, 'captured_at') !== capturedAt)
      throw new DataError(
        'Import one capture timestamp per CSV. Split historical batches by timestamp.',
      )
    const valueText = get(row, 'value').replaceAll(',', '')
    if (!/^\d+(\.\d+)?$/.test(valueText))
      throw new DataError(`CSV row ${index + 2} has an invalid value.`)
    return {
      playerName: get(row, 'player_name'),
      sourceKey:
        get(row, 'source_key') || get(row, 'sleeper_id') || `name:${get(row, 'player_name')}`,
      value: Number(valueText),
      ...(get(row, 'sleeper_id') ? { sleeperId: get(row, 'sleeper_id') } : {}),
      ...(get(row, 'position') ? { position: get(row, 'position') } : {}),
      ...(get(row, 'team') ? { team: get(row, 'team') } : {}),
    }
  })
  return snapshotSchema.parse({ source, context, capturedAt, records })
}

export async function getMarket(db: PrismaClient): Promise<MarketRow[]> {
  // Do not truncate before grouping: old observations for one player must not hide another player/source.
  const rows = await db.valuation.findMany({
    orderBy: [{ capturedAt: 'asc' }, { id: 'asc' }],
    include: { player: true, source: true, snapshot: true },
  })
  const market = new Map<string, MarketRow>()
  for (const v of rows) {
    const parsed = sourceSchema.safeParse(v.source.name)
    if (!parsed.success) continue
    const key = `${v.playerId}:${v.sourceId}:${v.contextKey}`
    const previous = market.get(key)
    const history = [
      ...(previous?.history ?? []),
      { value: v.value, capturedAt: v.capturedAt.toISOString() },
    ]
    market.set(key, {
      playerId: v.playerId,
      playerName: v.player.name,
      sleeperId: v.player.sleeperId,
      position: v.player.position,
      team: v.player.team,
      source: parsed.data,
      contextKey: v.contextKey,
      contextLabel: v.snapshot
        ? (JSON.parse(v.snapshot.contextJson) as ValueContext).label
        : 'Legacy - unverified settings',
      value: v.value,
      capturedAt: v.capturedAt.toISOString(),
      previousValue: previous?.value ?? null,
      changePct: previous ? percentageChange(v.value, previous.value) : null,
      baselineValue: history[0].value,
      baselineAt: history[0].capturedAt,
      baselineChangePct: percentageChange(v.value, history[0].value),
      observations: history.length,
      history,
    })
  }
  return [...market.values()].sort(
    (a, b) => a.playerName.localeCompare(b.playerName) || a.source.localeCompare(b.source),
  )
}
