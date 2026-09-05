import { parseDtcRoster } from '../../src/server/providers/dynastyCalculator'
const roster = {
  leagueId: '1378427936817815552',
  leagueName: 'Fixture League',
  ownerId: '82289736559247360',
  rules: {
    team_size: '12',
    team_type: 'half_ppr',
    team_format: 'standard',
    tepre: 0,
    rbppc: 0,
    devy: 0,
    offense: 1,
    idp: 0,
    mode: 'normal',
    startup_rookie: 'no',
  },
  rows: [
    {
      sourceKey: '1',
      playerName: 'Example Receiver',
      team: 'CIN',
      position: 'WR',
      valueText: '48.0',
    },
    {
      sourceKey: '2',
      playerName: 'Example Tight End',
      team: 'CHI',
      position: 'ZTE',
      valueText: '0.0',
    },
  ],
}
const now = new Date('2026-09-04T12:00:00Z')
test('DTC reads roster values, normalizes ZTE, preserves zero and actual scoring', () => {
  const result = parseDtcRoster(roster, now)
  expect(result.records.map((r) => r.value)).toEqual([48, 0])
  expect(result.records[1].position).toBe('TE')
  expect(result.context.settings.team_type).toBe('half_ppr')
})
test('DTC rejects missing values, duplicate players, empty roster and wrong league', () => {
  expect(() => parseDtcRoster({ ...roster, rows: [] }, now)).toThrow()
  expect(() => parseDtcRoster({ ...roster, rows: [roster.rows[0], roster.rows[0]] }, now)).toThrow(
    'duplicate',
  )
  expect(() =>
    parseDtcRoster({ ...roster, rows: [{ ...roster.rows[0], valueText: '' }] }, now),
  ).toThrow()
  expect(() => parseDtcRoster({ ...roster, leagueId: '1234' }, now)).toThrow('another league')
  expect(() => parseDtcRoster({ ...roster, ownerId: '1234' }, now)).toThrow('another owner')
  expect(() =>
    parseDtcRoster({ ...roster, rules: { ...roster.rules, team_size: 'unknown' } }, now),
  ).toThrow('settings')
  expect(() =>
    parseDtcRoster({ ...roster, rules: { ...roster.rules, mode: 'startup' } }, now),
  ).toThrow('settings')
})
