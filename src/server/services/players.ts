import { PrismaClient } from '@prisma/client'
import axios, { type AxiosInstance } from 'axios'
import fs from 'node:fs/promises'
import path from 'node:path'
import { leaguePosition, validBirthDate } from '../../shared/playerMatching.js'
import { localDir } from '../config.js'

export type CanonicalPlayer = {
  sleeperId: string
  name: string
  position?: string | null
  team?: string | null
  birthDate?: string | null
}
// Only players the league can roster: QB, RB, WR, or TE by position or fantasy eligibility.
export function mapSleeperPlayers(playersMap: Record<string, any>): CanonicalPlayer[] {
  return Object.entries(playersMap || {}).flatMap(([pid, info]) => {
    if (!info || typeof info !== 'object') return []
    const position = leaguePosition(info.position, info.fantasy_positions)
    if (!position) return []
    const name =
      info.full_name || [info.first_name, info.last_name].filter(Boolean).join(' ') || pid
    return [
      {
        sleeperId: pid,
        name,
        position,
        team: info.team || null,
        birthDate: validBirthDate(info.birth_date),
      },
    ]
  })
}
export async function fetchSleeperPlayers(http: AxiosInstance = axios): Promise<CanonicalPlayer[]> {
  return mapSleeperPlayers(
    (await http.get('https://api.sleeper.app/v1/players/nfl', { timeout: 30_000 })).data,
  )
}
export async function loadSleeperPlayers(opts?: {
  http?: AxiosInstance
  now?: number
}): Promise<CanonicalPlayer[]> {
  const cache = path.join(localDir, 'sleeper-players.json')
  let players: CanonicalPlayer[] | undefined
  if (!opts?.http) {
    try {
      const stat = await fs.stat(cache)
      if ((opts?.now ?? Date.now()) - stat.mtimeMs < 86_400_000) {
        players = JSON.parse(await fs.readFile(cache, 'utf8')) as CanonicalPlayer[]
        // A cache written before birth dates were kept would leave them empty for a day.
        if (players.length && !('birthDate' in players[0])) players = undefined
        // A cache written before the league scope still holds every position.
        else players = players.filter((player) => leaguePosition(player.position))
      }
    } catch {
      /* first refresh */
    }
  }
  if (!players) {
    players = await fetchSleeperPlayers(opts?.http)
    if (!opts?.http) {
      await fs.mkdir(localDir, { recursive: true })
      await fs.writeFile(cache, JSON.stringify(players))
    }
  }
  return players
}
export async function seedPlayersFromSleeper(opts?: {
  http?: AxiosInstance
  prisma?: PrismaClient
}) {
  const db = opts?.prisma || (await import('../db.js')).prisma
  const players = await loadSleeperPlayers({ http: opts?.http })
  // SQLite does not support Prisma's createMany skipDuplicates option.
  let created = 0
  for (const p of players) {
    const existing = await db.player.findUnique({ where: { sleeperId: p.sleeperId } })
    await db.player.upsert({
      where: { sleeperId: p.sleeperId },
      update: { name: p.name, position: p.position, team: p.team, birthDate: p.birthDate },
      create: { ...p },
    })
    if (!existing) created++
  }
  return { created, upserts: players.length, total: players.length }
}
export async function listPlayers(params?: {
  prisma?: PrismaClient
  search?: string
  position?: string
  limit?: number
}): Promise<CanonicalPlayer[]> {
  const db = params?.prisma || (await import('../db.js')).prisma
  const rows = await db.player.findMany({
    where: {
      ...(params?.search ? { name: { contains: params.search } } : {}),
      ...(params?.position ? { position: params.position } : {}),
    },
    take: Math.max(1, Math.min(params?.limit ?? 50, 200)),
    orderBy: { name: 'asc' },
  })
  return rows.map((r) => ({
    sleeperId: r.sleeperId!,
    name: r.name,
    position: r.position,
    team: r.team,
  }))
}
