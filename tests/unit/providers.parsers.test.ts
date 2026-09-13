import { parseNerdsRows } from '../../src/server/providers/dynastyNerds'
const init = {
  players: {
    '1': { id: 1, firstName: 'Sample', lastName: 'Quarterback', pos: 'QB', team: 'LAC' },
    '2': { id: 2, firstName: 'Sample', lastName: 'Receiver', pos: 'WR', team: null },
  },
  valueSet: 'DynastyGM',
  leagues: [
    {
      id: 273947,
      extId: '1378427936817815552',
      name: 'Fixture League',
      scoringType: 'ppr',
      fantasyType: 'dynasty',
      number_of_teams: 12,
      number_of_starters: 8,
      rosterPositions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX'],
      teams: [
        {
          id: 11,
          name: 'My Team',
          owned: true,
          sleeperUsername: 'Owner',
          starters: [1],
          bench: [2],
          taxi: [],
          ir: [],
        },
      ],
    },
  ],
}
const rows = [
  { sourceKey: '1', text: 'Sample Quarterback \n(LAC)\n2,624\n(QB7)' },
  { sourceKey: '2', text: 'Sample Receiver \n(FA)\n0\n(NR)' },
]
test('parses displayed trade values, not rank or ADP from initialization', () => {
  const result = parseNerdsRows(
    rows,
    { ...init, values: { PPR: { values: { '1': 7, '2': 900 } } } },
    '273947',
    new Date('2026-01-01T00:00:00Z'),
  )
  expect(result.records.map((r) => r.value)).toEqual([2624, 0])
  expect(result.context.settings.scoring).toBe('ppr')
})
test('fails closed on truncated roster, duplicate rows, missing values and unsupported league', () => {
  expect(() => parseNerdsRows(rows.slice(0, 1), init, '273947')).toThrow('incomplete')
  expect(() => parseNerdsRows([rows[0], rows[0]], init, '273947')).toThrow('incomplete')
  expect(() =>
    parseNerdsRows(
      [{ ...rows[0], text: 'Sample Quarterback\n(LAC)\n\n(QB7)' }, rows[1]],
      init,
      '273947',
    ),
  ).toThrow('changed')
  expect(() => parseNerdsRows(rows, init, '999')).toThrow('not available')
  expect(() =>
    parseNerdsRows(rows, { ...init, leagues: [{ ...init.leagues[0], teams: [] }] }, '273947'),
  ).toThrow('exactly one')
})

const sleeperRoster = [
  { sleeperId: '101', name: 'Sample Quarterback', position: 'QB', team: 'LAC' },
  { sleeperId: '102', name: 'Sample Receiver', position: 'WR' },
  { sleeperId: '103', name: 'Sample Unlisted', position: 'RB' },
]

test('Dynasty GM values an absent catalog player at zero but preserves real provider values', () => {
  const result = parseNerdsRows(rows, init, '273947', new Date(), sleeperRoster)
  expect(result.records.map((r) => r.value)).toEqual([2624, 0, 0])
  expect(result.records[0]).toMatchObject({ sleeperId: '101', sourceKey: '1' })
  expect(result.records[2]).toMatchObject({
    sleeperId: '103',
    sourceKey: 'absent:sleeper:103',
    value: 0,
  })
  expect(result.warnings?.[0]).toContain('Sample Unlisted')
  expect(result.context).toEqual(parseNerdsRows(rows, init, '273947').context)
})

test('a player present in the catalog but missing from the captured roster is not zero', () => {
  const listed = {
    ...init,
    players: {
      ...init.players,
      '3': { id: 3, firstName: 'Sample', lastName: 'Unlisted', pos: 'RB', team: null },
    },
  }
  expect(() => parseNerdsRows(rows, listed, '273947', new Date(), sleeperRoster)).toThrow(
    expect.objectContaining({
      code: 'unavailable',
      message: expect.stringContaining('not on its copy of the owned roster yet'),
    }),
  )
  expect(() => parseNerdsRows(rows.slice(0, 1), init, '273947', new Date(), sleeperRoster)).toThrow(
    'incomplete',
  )
  const renamed = sleeperRoster.map((player) => ({ ...player, name: `${player.name} Renamed` }))
  expect(() => parseNerdsRows(rows, init, '273947', new Date(), renamed)).toThrow(
    'matched none of the 3 owned Sleeper players',
  )
  const broken = { ...init, players: { '1': init.players['1'] } }
  expect(() => parseNerdsRows(rows, broken, '273947', new Date(), sleeperRoster)).toThrow(
    'metadata is incomplete',
  )
})

test('a Dynasty GM roster that still holds a departed Sleeper player is a temporary mismatch', () => {
  // Sleeper traded the receiver away for a player Dynasty GM has not synced or does not list.
  const traded = [sleeperRoster[0], { sleeperId: '104', name: 'Sample Arrival', position: 'TE' }]
  expect(() => parseNerdsRows(rows, init, '273947', new Date(), traded)).toThrow(
    expect.objectContaining({
      code: 'unavailable',
      message: expect.stringContaining('Sample Receiver is not on the Sleeper roster'),
    }),
  )
  // Without the optional Sleeper roster there is nothing to compare, so verified rows still save.
  expect(parseNerdsRows(rows, init, '273947').records).toHaveLength(2)
})

test('Dynasty GM canonical matching rejects ambiguous names and accepts unique suffix differences', () => {
  const duplicate = { ...init, players: { ...init.players, '3': { ...init.players['1'], id: 3 } } }
  expect(() => parseNerdsRows(rows, duplicate, '273947', new Date(), sleeperRoster)).toThrow(
    'ambiguous',
  )
  const suffixed = sleeperRoster.map((player) => ({ ...player, name: `${player.name} Jr.` }))
  expect(parseNerdsRows(rows, init, '273947', new Date(), suffixed).records[0].sleeperId).toBe(
    '101',
  )
  expect(() =>
    parseNerdsRows(rows, init, '273947', new Date(), [
      sleeperRoster[0],
      { ...sleeperRoster[0], sleeperId: '999' },
    ]),
  ).toThrow('ambiguous')
})
