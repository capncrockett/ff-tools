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

test('another league or an orphaned team with incomplete metadata does not block the configured roster', () => {
  // Reproduces the live 2026-09-13 failure: a second account league with null counts and usernames.
  const incomplete = {
    ...init,
    leagues: [
      {
        ...init.leagues[0],
        teams: [
          ...init.leagues[0].teams,
          {
            id: 12,
            name: 'Orphan',
            sleeperUsername: null,
            starters: [],
            bench: [],
            taxi: [],
            ir: [],
          },
        ],
      },
      {
        id: 147139,
        extId: 'other',
        name: 'Other League',
        scoringType: 'ppr',
        fantasyType: 'dynasty',
        number_of_teams: null,
        number_of_starters: null,
        rosterPositions: null,
        teams: [
          {
            id: 1,
            name: 'Other',
            sleeperUsername: null,
            starters: [],
            bench: [],
            taxi: [],
            ir: [],
          },
        ],
      },
    ],
  }
  expect(parseNerdsRows(rows, incomplete, '273947').records.map((r) => r.value)).toEqual([2624, 0])
  // The configured league, the owned team, and the player catalog still fail closed.
  const brokenLeague = { ...init, leagues: [{ ...init.leagues[0], rosterPositions: null }] }
  expect(() => parseNerdsRows(rows, brokenLeague, '273947')).toThrow('league metadata changed')
  const brokenTeam = {
    ...init,
    leagues: [
      { ...init.leagues[0], teams: [{ ...init.leagues[0].teams[0], sleeperUsername: null }] },
    ],
  }
  expect(() => parseNerdsRows(rows, brokenTeam, '273947')).toThrow('team metadata changed')
  const brokenPlayer = { ...init, players: { ...init.players, '9': { id: 9, pos: null } } }
  expect(() => parseNerdsRows(rows, brokenPlayer, '273947')).toThrow('player metadata changed')
})

const sleeperRoster = [
  { sleeperId: '101', name: 'Sample Quarterback', position: 'QB', team: 'LAC' },
  { sleeperId: '102', name: 'Sample Receiver', position: 'WR' },
  { sleeperId: '103', name: 'Sample Unlisted', position: 'RB' },
]

const withCatalog = (
  ...players: { id: number; firstName: string; lastName: string; pos: string }[]
) => ({
  ...init,
  players: {
    ...init.players,
    ...Object.fromEntries(players.map((p) => [String(p.id), { ...p, team: null }])),
  },
})
const owned = sleeperRoster.slice(0, 2)

test('Dynasty GM matches Sleeper players within the owned team, even when the catalog repeats a name', () => {
  const result = parseNerdsRows(rows, init, '273947', new Date(), owned)
  expect(result.records.map((r) => [r.sourceKey, r.sleeperId, r.value])).toEqual([
    ['1', '101', 2624],
    ['2', '102', 0],
  ])
  expect(result.warnings).toBeUndefined()
  expect(result.context).toEqual(parseNerdsRows(rows, init, '273947').context)
  // Another catalog player with the same name and position is not on the team, so it cannot compete.
  const duplicate = withCatalog({ id: 3, firstName: 'Sample', lastName: 'Quarterback', pos: 'QB' })
  expect(parseNerdsRows(rows, duplicate, '273947', new Date(), owned).records[0].sleeperId).toBe(
    '101',
  )
  const suffixed = owned.map((player) => ({ ...player, name: `${player.name} Jr.` }))
  expect(parseNerdsRows(rows, init, '273947', new Date(), suffixed).records[0].sleeperId).toBe(
    '101',
  )
  // Duplicates that really are ambiguous still need an explicit mapping.
  expect(() =>
    parseNerdsRows(rows, init, '273947', new Date(), [owned[0], { ...owned[0], sleeperId: '999' }]),
  ).toThrow('ambiguous')
  const twoOnTeam = {
    ...duplicate,
    leagues: [{ ...init.leagues[0], teams: [{ ...init.leagues[0].teams[0], starters: [1, 3] }] }],
  }
  const rowsWithTwin = [...rows, { sourceKey: '3', text: 'Sample Quarterback\n(FA)\n12\n(NR)' }]
  expect(() => parseNerdsRows(rowsWithTwin, twoOnTeam, '273947', new Date(), owned)).toThrow(
    'ambiguous match for Sample Quarterback on the owned roster',
  )
})

test('a Sleeper player Dynasty GM has no record of is a matching failure, never a zero', () => {
  // The catalog covers the whole player pool, so a miss means the names differ between the sites.
  expect(() => parseNerdsRows(rows, init, '273947', new Date(), sleeperRoster)).toThrow(
    expect.objectContaining({
      code: 'format',
      message: expect.stringContaining('no player named like Sample Unlisted (RB)'),
    }),
  )
  const renamed = sleeperRoster.map((player) => ({ ...player, name: `${player.name} Renamed` }))
  expect(() => parseNerdsRows(rows, init, '273947', new Date(), renamed)).toThrow(
    'matched none of the 3 owned Sleeper players',
  )
  expect(() => parseNerdsRows(rows.slice(0, 1), init, '273947', new Date(), owned)).toThrow(
    'incomplete',
  )
  const broken = { ...init, players: { '1': init.players['1'] } }
  expect(() => parseNerdsRows(rows, broken, '273947', new Date(), owned)).toThrow(
    'metadata is incomplete',
  )
})

test('a Dynasty GM mirror that has not caught up with Sleeper is temporary in both directions', () => {
  const listed = withCatalog(
    { id: 3, firstName: 'Sample', lastName: 'Unlisted', pos: 'RB' },
    { id: 4, firstName: 'Sample', lastName: 'Arrival', pos: 'TE' },
  )
  // Added on Sleeper, listed by Dynasty GM, but not on its copy of the team yet.
  expect(() => parseNerdsRows(rows, listed, '273947', new Date(), sleeperRoster)).toThrow(
    expect.objectContaining({
      code: 'unavailable',
      message: expect.stringContaining('not on its roster: Sample Unlisted (RB)'),
    }),
  )
  // Traded the receiver for an arrival: both sides of a stale mirror are named.
  const traded = [owned[0], { sleeperId: '104', name: 'Sample Arrival', position: 'TE' }]
  expect(() => parseNerdsRows(rows, listed, '273947', new Date(), traded)).toThrow(
    expect.objectContaining({
      code: 'unavailable',
      message: expect.stringMatching(
        /not on its roster: Sample Arrival \(TE\); no longer on the Sleeper roster: Sample Receiver \(WR\)/,
      ),
    }),
  )
  expect(() => parseNerdsRows(rows, init, '273947', new Date(), [owned[0]])).toThrow(
    'no longer on the Sleeper roster: Sample Receiver (WR)',
  )
  // Without the optional Sleeper roster there is nothing to compare, so verified rows still save.
  expect(parseNerdsRows(rows, init, '273947').records).toHaveLength(2)
})
