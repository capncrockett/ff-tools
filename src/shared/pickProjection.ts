export type PickBand = 'early' | 'mid' | 'late'
export type ProjectedBracket = 'lottery' | 'middling' | 'championship'

export type PickProjectionTeam = {
  rosterId: number
  divisionId: number | null
  wins: number
  losses: number
  ties: number
  pointsFor: number
}

export type PickProjection = {
  rosterId: number
  seed: number
  seasonAverage: number
  projectedFinish: number
  bracket: ProjectedBracket
  band: PickBand
}

type RankedTeam = PickProjectionTeam & { inputOrder: number; rank: number }
type SeededTeam = RankedTeam & { seed: number; seasonAverage: number }

function compareRecord(a: RankedTeam, b: RankedTeam) {
  if (b.wins !== a.wins) return b.wins - a.wins
  if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor
  if (a.losses !== b.losses) return a.losses - b.losses
  if (a.ties !== b.ties) return a.ties - b.ties
  return a.inputOrder - b.inputOrder
}

function validateTeams(teams: PickProjectionTeam[]) {
  if (teams.length !== 12)
    throw new Error(`Pick projection requires exactly 12 teams; received ${teams.length}.`)
  if (new Set(teams.map((team) => team.rosterId)).size !== teams.length)
    throw new Error('Pick projection requires unique Sleeper roster IDs.')
  for (const team of teams) {
    const fields = [team.rosterId, team.wins, team.losses, team.ties, team.pointsFor]
    if (fields.some((value) => !Number.isFinite(value)) || team.rosterId <= 0)
      throw new Error('Pick projection received invalid team data.')
    if (
      !Number.isInteger(team.rosterId) ||
      !Number.isInteger(team.wins) ||
      !Number.isInteger(team.losses) ||
      !Number.isInteger(team.ties) ||
      team.wins < 0 ||
      team.losses < 0 ||
      team.ties < 0 ||
      team.pointsFor < 0
    )
      throw new Error('Pick projection received invalid team data.')
  }
}

function seedTeams(teams: PickProjectionTeam[]): SeededTeam[] {
  const standings = teams
    .map((team, inputOrder) => ({ ...team, inputOrder, rank: 0 }))
    .sort(compareRecord)
    .map((team, index) => ({ ...team, rank: index + 1 }))
  const seeded: RankedTeam[] = []
  const used = new Set<number>()
  const divisionIds = [
    ...new Set(
      standings
        .map((team) => team.divisionId)
        .filter((divisionId): divisionId is number => divisionId !== null),
    ),
  ]

  const divisionWinners = divisionIds
    .map((divisionId) => standings.find((team) => team.divisionId === divisionId))
    .filter((team): team is RankedTeam => Boolean(team))
    .sort((a, b) => a.rank - b.rank)
  for (const team of divisionWinners) {
    seeded.push(team)
    used.add(team.rosterId)
  }

  for (const team of standings) {
    if (seeded.length >= 5) break
    if (used.has(team.rosterId)) continue
    seeded.push(team)
    used.add(team.rosterId)
  }

  const pointsSeed = standings
    .filter((team) => !used.has(team.rosterId))
    .sort((a, b) => b.pointsFor - a.pointsFor || a.rank - b.rank)[0]
  if (!pointsSeed) throw new Error('Pick projection could not determine the points-for seed.')
  seeded.push(pointsSeed)
  used.add(pointsSeed.rosterId)

  seeded.push(...standings.filter((team) => !used.has(team.rosterId)))
  return seeded.map((team, index) => {
    const gamesPlayed = team.wins + team.losses + team.ties
    return {
      ...team,
      seed: index + 1,
      seasonAverage: gamesPlayed > 0 ? team.pointsFor / gamesPlayed : 0,
    }
  })
}

function playGame(a: SeededTeam, b: SeededTeam) {
  const aWins =
    a.seasonAverage > b.seasonAverage || (a.seasonAverage === b.seasonAverage && a.seed < b.seed)
  return aWins ? { winner: a, loser: b } : { winner: b, loser: a }
}

function assignGame(
  finishes: Map<number, number>,
  game: ReturnType<typeof playGame>,
  winner: number,
) {
  finishes.set(game.winner.rosterId, winner)
  finishes.set(game.loser.rosterId, winner + 1)
}

/**
 * Mirrors the League for All Seasons "If the Season Ended Today" bracket at
 * revision 9336059a23032fe5e06f4f9dfb0bc1c0421490f5. It uses the site's seeding,
 * season-average projections, better-seed tie-breaker, and championship-loser routing.
 */
export function projectPickBands(teams: PickProjectionTeam[]): PickProjection[] {
  validateTeams(teams)
  const seeded = seedTeams(teams)
  const bySeed = (seed: number) => {
    const team = seeded.find((candidate) => candidate.seed === seed)
    if (!team) throw new Error(`Pick projection could not resolve seed ${seed}.`)
    return team
  }

  const champRoundOneA = playGame(bySeed(4), bySeed(5))
  const champRoundOneB = playGame(bySeed(3), bySeed(6))
  const champSemiA = playGame(bySeed(1), champRoundOneA.winner)
  const champSemiB = playGame(bySeed(2), champRoundOneB.winner)
  const championship = playGame(champSemiA.winner, champSemiB.winner)
  const thirdPlace = playGame(champSemiA.loser, champSemiB.loser)

  const middlingSemiA = playGame(champRoundOneA.loser, bySeed(7))
  const middlingSemiB = playGame(champRoundOneB.loser, bySeed(8))
  const middlingFinal = playGame(middlingSemiA.winner, middlingSemiB.winner)
  const middlingConsolation = playGame(middlingSemiA.loser, middlingSemiB.loser)

  const lotterySemiA = playGame(bySeed(9), bySeed(12))
  const lotterySemiB = playGame(bySeed(10), bySeed(11))
  const lotteryFinal = playGame(lotterySemiA.winner, lotterySemiB.winner)
  const lotteryConsolation = playGame(lotterySemiA.loser, lotterySemiB.loser)

  const finishes = new Map<number, number>()
  assignGame(finishes, championship, 1)
  assignGame(finishes, thirdPlace, 3)
  assignGame(finishes, middlingFinal, 5)
  assignGame(finishes, middlingConsolation, 7)
  assignGame(finishes, lotteryFinal, 9)
  assignGame(finishes, lotteryConsolation, 11)

  return seeded.map((team) => {
    const projectedFinish = finishes.get(team.rosterId)
    if (!projectedFinish)
      throw new Error(`Pick projection did not place Sleeper roster ${team.rosterId}.`)
    const bracket: ProjectedBracket =
      projectedFinish <= 4 ? 'championship' : projectedFinish <= 8 ? 'middling' : 'lottery'
    const band: PickBand =
      bracket === 'championship' ? 'late' : bracket === 'middling' ? 'mid' : 'early'
    return {
      rosterId: team.rosterId,
      seed: team.seed,
      seasonAverage: team.seasonAverage,
      projectedFinish,
      bracket,
      band,
    }
  })
}

const genericRoundLabels = ['1st', '2nd', '3rd', '4th'] as const

export function formatPickLabel(round: number, exactSlot?: number | null) {
  if (!Number.isInteger(round) || round < 1 || round > 4)
    throw new Error('Pick round must be an integer from 1 through 4.')
  if (exactSlot == null) return genericRoundLabels[round - 1]
  if (!Number.isInteger(exactSlot) || exactSlot < 1 || exactSlot > 12)
    throw new Error('Exact pick slot must be an integer from 1 through 12.')
  return `${round}.${exactSlot.toString().padStart(2, '0')}`
}
