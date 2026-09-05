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
