import {
  formatPickLabel,
  projectPickBands,
  type PickProjectionTeam,
} from '../../src/shared/pickProjection'

const averages = [120, 105, 90, 100, 110, 95, 80, 85, 70, 65, 75, 60]
const wins = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0]

function league(): PickProjectionTeam[] {
  return averages.map((average, index) => ({
    rosterId: index + 1,
    divisionId: (index % 3) + 1,
    wins: wins[index],
    losses: 10 - wins[index],
    ties: 0,
    pointsFor: average * 10,
  }))
}

test('mirrors the canonical bracket seeding, average projection, and loser routing', () => {
  const result = projectPickBands(league())
  const byRoster = new Map(result.map((row) => [row.rosterId, row]))

  expect(result.map((row) => [row.rosterId, row.seed])).toEqual([
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 4],
    [5, 5],
    [6, 6],
    [7, 7],
    [8, 8],
    [9, 9],
    [10, 10],
    [11, 11],
    [12, 12],
  ])
  expect(
    result
      .slice()
      .sort((a, b) => a.projectedFinish - b.projectedFinish)
      .map((row) => [row.rosterId, row.projectedFinish]),
  ).toEqual([
    [1, 1],
    [2, 2],
    [5, 3],
    [6, 4],
    [4, 5],
    [3, 6],
    [8, 7],
    [7, 8],
    [11, 9],
    [9, 10],
    [10, 11],
    [12, 12],
  ])
  expect(byRoster.get(5)).toMatchObject({ bracket: 'championship', band: 'late' })
  expect(byRoster.get(4)).toMatchObject({ bracket: 'middling', band: 'mid' })
  expect(byRoster.get(11)).toMatchObject({ bracket: 'lottery', band: 'early' })
})

test('breaks an equal average in favor of the better seed', () => {
  const teams = league()
  teams[3] = { ...teams[3], pointsFor: teams[4].pointsFor }
  const byRoster = new Map(projectPickBands(teams).map((row) => [row.rosterId, row]))

  expect(byRoster.get(4)?.band).toBe('late')
  expect(byRoster.get(5)?.band).toBe('mid')
})

test('uses generic round labels until an exact draft slot is known', () => {
  expect(formatPickLabel(1)).toBe('1st')
  expect(formatPickLabel(4, null)).toBe('4th')
  expect(formatPickLabel(1, 3)).toBe('1.03')
  expect(formatPickLabel(4, 12)).toBe('4.12')
  expect(() => formatPickLabel(5)).toThrow('round')
  expect(() => formatPickLabel(1, 13)).toThrow('slot')
})

test('rejects incomplete or duplicate league inputs instead of inventing a projection', () => {
  expect(() => projectPickBands(league().slice(0, 11))).toThrow('exactly 12')
  const duplicate = league()
  duplicate[11] = { ...duplicate[11], rosterId: duplicate[0].rosterId }
  expect(() => projectPickBands(duplicate)).toThrow('unique Sleeper roster IDs')
})
