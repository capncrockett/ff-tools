import { playerIdentityKey } from './playerIdentity.js'

// Provider catalogs are matched to canonical Sleeper players. A link needs a unique name-and-position
// candidate confirmed by an independent identity detail; everything else is left for review.
// A League for All Seasons rosters only these positions and trades draft picks. Every other position
// is out of scope and is not stored (user, 2026-09-14).
export const matchedPositions: readonly string[] = ['QB', 'RB', 'WR', 'TE']

// A Sleeper player's league position: the listed position, or a fantasy eligibility such as a
// fullback eligible at RB. Null means the league has no use for the player.
export function leaguePosition(position: unknown, fantasyPositions?: unknown): string | null {
  if (typeof position === 'string' && matchedPositions.includes(position)) return position
  if (!Array.isArray(fantasyPositions)) return null
  const eligible = fantasyPositions.find(
    (value): value is string => typeof value === 'string' && matchedPositions.includes(value),
  )
  return eligible ?? null
}

const notMatched = (position: string) =>
  position === 'pick'
    ? 'Picks are tracked separately from players.'
    : 'Only QB, RB, WR, and TE are matched.'

export type CanonicalCandidate = {
  id: number
  name: string
  position: string | null
  birthDate: string | null
}

export type MatchDecision =
  | { status: 'linked'; playerId: number; note: string }
  | { status: 'ambiguous' | 'unmatched' | 'skipped'; note: string }

export function validBirthDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(+parsed) && parsed.toISOString().slice(0, 10) === value ? value : null
}

export function indexCanonicalPlayers(players: CanonicalCandidate[]) {
  const exact = new Map<string, CanonicalCandidate[]>()
  const withoutSuffix = new Map<string, CanonicalCandidate[]>()
  for (const player of players) {
    if (!player.position || !matchedPositions.includes(player.position)) continue
    for (const [map, removeSuffix] of [
      [exact, false],
      [withoutSuffix, true],
    ] as const) {
      const key = playerIdentityKey(player.name, player.position, removeSuffix)
      map.set(key, [...(map.get(key) ?? []), player])
    }
  }
  return (name: string, position: string) => {
    const found = exact.get(playerIdentityKey(name, position))
    return found?.length
      ? found
      : (withoutSuffix.get(playerIdentityKey(name, position, true)) ?? [])
  }
}
export type CanonicalIndex = ReturnType<typeof indexCanonicalPlayers>

function decide(
  candidates: CanonicalCandidate[],
  confirmed: CanonicalCandidate[],
  hasDetail: boolean,
  detail: string,
): MatchDecision {
  if (!candidates.length)
    return { status: 'unmatched', note: 'No Sleeper player has this name and position.' }
  if (confirmed.length === 1)
    return {
      status: 'linked',
      playerId: confirmed[0].id,
      note: `Name, position, and ${detail} agree.`,
    }
  if (confirmed.length > 1)
    return {
      status: 'ambiguous',
      note: `${confirmed.length} Sleeper players share this name, position, and ${detail}.`,
    }
  if (!hasDetail)
    return {
      status: 'ambiguous',
      note: `${candidates.length === 1 ? 'A Sleeper player matches' : `${candidates.length} Sleeper players match`} by name, but there is no ${detail} to confirm it.`,
    }
  return {
    status: 'ambiguous',
    note: candidates.some((candidate) => candidate.birthDate)
      ? `${candidates.length === 1 ? 'A Sleeper player matches' : `${candidates.length} Sleeper players match`} by name, but the ${detail} differs.`
      : `${candidates.length === 1 ? 'A Sleeper player matches' : `${candidates.length} Sleeper players match`} by name, but Sleeper has no birth date to confirm it.`,
  }
}

// Dynasty GM lists birth dates, so a link requires the same birth date as Sleeper.
export function matchByBirthDate(
  source: { name: string; position: string; birthDate: string | null },
  find: CanonicalIndex,
): MatchDecision {
  if (!matchedPositions.includes(source.position))
    return { status: 'skipped', note: notMatched(source.position) }
  const candidates = find(source.name, source.position)
  const birthDate = validBirthDate(source.birthDate)
  const confirmed = birthDate ? candidates.filter((c) => c.birthDate === birthDate) : []
  return decide(candidates, confirmed, Boolean(birthDate), 'birth date')
}

const yearMs = 365.2425 * 24 * 60 * 60 * 1000
export function ageOn(birthDate: string, at: Date) {
  return (+at - Date.parse(`${birthDate}T00:00:00Z`)) / yearMs
}

// DTC shows completed years ("25Y") instead of a birth date. In a 2026-09-13 export, the Sleeper
// birth-date age exceeded DTC's number by a median 0.50 years and by under one year for 98% of 805
// comparable players, so an age is confirmed when the exact age is 0 to 1 year above it. The lag
// allowance covers DTC refreshing ages a few weeks after a birthday.
export function matchByAge(
  source: { name: string; position: string; age: number | null; observedAt: Date },
  find: CanonicalIndex,
  lagYears = 0.1,
): MatchDecision {
  if (!matchedPositions.includes(source.position))
    return { status: 'skipped', note: notMatched(source.position) }
  const candidates = find(source.name, source.position)
  const age = source.age !== null && Number.isFinite(source.age) ? source.age : null
  const confirmed =
    age === null
      ? []
      : candidates.filter((c) => {
          if (!c.birthDate) return false
          const above = ageOn(c.birthDate, source.observedAt) - age
          return above >= 0 && above < 1 + lagYears
        })
  return decide(candidates, confirmed, age !== null, 'age')
}
