import { playerIdentityKey } from './playerIdentity.js'

// Provider catalogs are matched to canonical Sleeper players. A link needs a unique name-and-position
// candidate confirmed by an independent identity detail; everything else is left for review.
export const matchedPositions: readonly string[] = ['QB', 'RB', 'WR', 'TE']

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
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    ? value
    : null
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
    return { status: 'skipped', note: 'Only QB, RB, WR, and TE are matched.' }
  const candidates = find(source.name, source.position)
  const birthDate = validBirthDate(source.birthDate)
  const confirmed = birthDate ? candidates.filter((c) => c.birthDate === birthDate) : []
  return decide(candidates, confirmed, Boolean(birthDate), 'birth date')
}

const yearMs = 365.2425 * 24 * 60 * 60 * 1000
export function ageOn(birthDate: string, at: Date) {
  return (+at - Date.parse(`${birthDate}T00:00:00Z`)) / yearMs
}

// DTC shows an age to one decimal instead of a birth date. The tolerance covers that rounding plus
// DTC computing ages on a slightly different day than the capture.
export function matchByAge(
  source: { name: string; position: string; age: number | null; observedAt: Date },
  find: CanonicalIndex,
  toleranceYears = 0.15,
): MatchDecision {
  if (!matchedPositions.includes(source.position))
    return { status: 'skipped', note: 'Only QB, RB, WR, and TE are matched.' }
  const candidates = find(source.name, source.position)
  const age = source.age !== null && Number.isFinite(source.age) ? source.age : null
  const confirmed =
    age === null
      ? []
      : candidates.filter(
          (c) =>
            c.birthDate && Math.abs(ageOn(c.birthDate, source.observedAt) - age) <= toleranceYears,
        )
  return decide(candidates, confirmed, age !== null, 'age')
}
