import axios, { AxiosInstance } from 'axios'

export type CanonicalPlayer = {
  sleeperId: string
  name: string
  position?: string | null
  team?: string | null
}

export function mapSleeperPlayers(playersMap: Record<string, any>): CanonicalPlayer[] {
  const out: CanonicalPlayer[] = []
  for (const [pid, info] of Object.entries(playersMap || {})) {
    if (!info || typeof info !== 'object') continue
    const fullName = info.full_name ?? ((info.first_name && info.last_name) ? `${info.first_name} ${info.last_name}` : undefined)
    const name = fullName || info.last_name || info.first_name || pid
    const position = info.position || (Array.isArray(info.fantasy_positions) ? info.fantasy_positions[0] : undefined) || null
    const team = info.team || null
    // Filter out obvious non-players if present
    if (!name || typeof name !== 'string') continue
    out.push({ sleeperId: pid, name, position, team })
  }
  return out
}

export async function fetchSleeperPlayers(http: AxiosInstance = axios): Promise<CanonicalPlayer[]> {
  const url = 'https://api.sleeper.app/v1/players/nfl'
  const data = await http.get(url).then(r => r.data)
  return mapSleeperPlayers(data)
}

export async function seedPlayersFromSleeper(opts?: {
  http?: AxiosInstance
  prisma?: any
}): Promise<{ created: number; upserts: number; total: number }> {
  const http = opts?.http || axios
  const prisma = opts?.prisma || (await import('../db.js')).prisma
  const players = await fetchSleeperPlayers(http)

  // First pass: createMany with skipDuplicates (unique on sleeperId)
  const createdRes = await prisma.player.createMany({
    data: players.map(p => ({ sleeperId: p.sleeperId, name: p.name, position: p.position ?? undefined, team: p.team ?? undefined })),
    skipDuplicates: true,
  })

  // Second pass: update changed fields via upsert (loop to keep it simple for now)
  let upserts = 0
  for (const p of players) {
    await prisma.player.upsert({
      where: { sleeperId: p.sleeperId },
      update: { name: p.name, position: p.position ?? null, team: p.team ?? null },
      create: { sleeperId: p.sleeperId, name: p.name, position: p.position ?? null, team: p.team ?? null },
    })
    upserts += 1
  }

  return { created: createdRes.count, upserts, total: players.length }
}

export async function listPlayers(params?: {
  prisma?: any
  search?: string
  position?: string
  limit?: number
}): Promise<CanonicalPlayer[]> {
  const prisma = params?.prisma || (await import('../db.js')).prisma
  const limit = Math.max(1, Math.min(params?.limit ?? 50, 200))
  const where: any = {}
  if (params?.search) where.name = { contains: params.search, mode: 'insensitive' }
  if (params?.position) where.position = params.position
  const rows = await prisma.player.findMany({ where, take: limit, orderBy: { name: 'asc' } }) as any[]
  return rows.map((r: any) => ({ sleeperId: r.sleeperId!, name: r.name, position: r.position, team: r.team }))
}
