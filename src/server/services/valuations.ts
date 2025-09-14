import type { PrismaClient } from '@prisma/client'
import type { SourceName, ValuationRecord } from '@server/providers/types.js'

export async function ensureSource(prisma: PrismaClient, name: string) {
  const src = await (prisma as any).source.upsert({
    where: { name },
    update: {},
    create: { name },
  })
  return src
}

export async function ensurePlayer(prisma: PrismaClient, name: string) {
  const existing = await (prisma as any).player.findFirst({ where: { name } })
  if (existing) return existing
  return (prisma as any).player.create({ data: { name } })
}

export async function saveValuations(prisma: PrismaClient, records: ValuationRecord[]) {
  if (!records?.length) return { created: 0 }
  const counts = { created: 0 }
  // Ensure source exists once
  const sourceName = records[0].source
  const source = await ensureSource(prisma, sourceName)

  for (const r of records) {
    const player = await ensurePlayer(prisma, r.playerName)
    await (prisma as any).valuation.create({
      data: {
        playerId: player.id,
        sourceId: source.id,
        value: r.value,
        capturedAt: new Date(r.capturedAt),
      },
    })
    counts.created++
  }
  return counts
}

export function parseCsvToValuations(csvText: string, source: SourceName): ValuationRecord[] {
  const lines = (csvText || '').split(/\r?\n/).filter(Boolean)
  if (lines.length <= 1) return []
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  const nameIdx = headers.indexOf('player_name')
  const valIdx = headers.indexOf('value')
  const tsIdx = headers.indexOf('captured_at')
  const out: ValuationRecord[] = []
  for (const line of lines.slice(1)) {
    const cols = line.split(',')
    const name = (cols[nameIdx] || '').trim()
    const value = Number((cols[valIdx] || '').replace(/[^0-9.\-]/g, ''))
    const capturedAt = tsIdx >= 0 ? new Date(cols[tsIdx]).toISOString() : new Date().toISOString()
    if (!name || !Number.isFinite(value)) continue
    out.push({ playerName: name, value, source, capturedAt })
  }
  return out
}

export async function getLatestValuations(prisma: PrismaClient, source?: string, limit = 200) {
  // Simple approach: query recent valuations and reduce to latest per player in JS
  const where: any = {}
  if (source) {
    const s = await (prisma as any).source.findUnique({ where: { name: source } })
    if (!s) return []
    where.sourceId = s.id
  }
  const rows = await (prisma as any).valuation.findMany({
    where,
    orderBy: { capturedAt: 'desc' },
    take: Math.max(limit, 2000),
    include: { player: true, source: true },
  })
  const latestByPlayer = new Map<number, any>()
  for (const v of rows) {
    if (!latestByPlayer.has(v.playerId)) latestByPlayer.set(v.playerId, v)
  }
  return Array.from(latestByPlayer.values()).map(v => ({
    playerId: v.playerId,
    playerName: v.player.name,
    source: v.source.name,
    value: v.value,
    capturedAt: v.capturedAt,
  }))
}

