import type { AxiosInstance } from 'axios'
import {
  buildDtcSnapshot,
  fetchOwnedSleeperRoster,
  parseDtcRankingsCsv,
  parseDtcAllowedMissingIds,
  type DtcRankingRow,
} from '../../src/server/providers/dynastyCalculator'
import type { CanonicalPlayer } from '../../src/server/services/players'

const header = '"Rank","Name","Team","Pos","Age","Value"'
const rankings: DtcRankingRow[] = [
  {
    rank: 1,
    playerName: 'Example Receiver',
    team: 'CIN',
    position: 'WR',
    age: '25.4',
    value: 48,
  },
  {
    rank: 2,
    playerName: 'Example Tight End',
    team: 'CHI',
    position: 'TE',
    age: '27.2',
    value: 0,
  },
]
const roster: CanonicalPlayer[] = [
  { sleeperId: '1', name: 'Example Receiver', position: 'WR', team: 'CIN' },
  { sleeperId: '2', name: 'Example Tight End', position: 'TE', team: 'CHI' },
  { sleeperId: '3', name: 'Unsupported Runner', position: 'RB', team: 'FA' },
]

test('DTC parses the official quoted export, including commas and zero values', () => {
  const csv = `${header}\r\n"1","Receiver, Example","CIN","WR","25.4","48.0"\r\n"2","Quote ""Test""","FA","WR","","0.0"\r\n`
  expect(parseDtcRankingsCsv(csv, 'WR')).toEqual([
    {
      rank: 1,
      playerName: 'Receiver, Example',
      team: 'CIN',
      position: 'WR',
      age: '25.4',
      value: 48,
    },
    {
      rank: 2,
      playerName: 'Quote "Test"',
      team: 'FA',
      position: 'WR',
      age: '',
      value: 0,
    },
  ])
})

test('DTC rejects changed columns, wrong positions, malformed values and duplicate ranks', () => {
  expect(() => parseDtcRankingsCsv('Name,Value\nPlayer,1', 'WR')).toThrow('columns changed')
  expect(() => parseDtcRankingsCsv(header, 'WR')).toThrow('export is empty')
  expect(() => parseDtcRankingsCsv(`${header}\n"1","Too Short"`, 'WR')).toThrow('invalid row')
  expect(() => parseDtcRankingsCsv(`${header}\n"1","Unclosed`, 'WR')).toThrow('invalid CSV')
  expect(() => parseDtcRankingsCsv('x'.repeat(1_000_001), 'WR')).toThrow('unexpectedly large')
  expect(() =>
    parseDtcRankingsCsv(`${header}\n"1","Wrong Position","FA","RB","24","1"`, 'WR'),
  ).toThrow('invalid player row')
  expect(() =>
    parseDtcRankingsCsv(`${header}\n"1","Missing Value","FA","WR","24",""`, 'WR'),
  ).toThrow('invalid player row')
  expect(() =>
    parseDtcRankingsCsv(
      `${header}\n"1","One","FA","WR","24","1"\n"1","Two","FA","WR","24","2"`,
      'WR',
    ),
  ).toThrow('duplicate ranks')
})

test('DTC matches exports to canonical Sleeper IDs and preserves half-PPR context', () => {
  const result = buildDtcSnapshot(rankings, roster, new Date('2026-09-08T12:00:00Z'), ['3'])
  expect(result.records).toEqual([
    {
      sourceKey: 'sleeper:1',
      sleeperId: '1',
      playerName: 'Example Receiver',
      team: 'CIN',
      position: 'WR',
      value: 48,
    },
    {
      sourceKey: 'sleeper:2',
      sleeperId: '2',
      playerName: 'Example Tight End',
      team: 'CHI',
      position: 'TE',
      value: 0,
    },
  ])
  expect(result.context.settings).toMatchObject({
    team_size: '12',
    team_type: 'half_ppr',
    team_format: 'standard',
    tepre: 0,
    rbppc: 0,
    devy: 0,
    offense: 1,
    idp: 0,
  })
  expect(result.warnings).toEqual([
    expect.stringContaining(
      '2 of 3 owned players. Missing DTC values (configured exceptions): Unsupported Runner (RB, Sleeper 3)',
    ),
  ])
})

test('DTC fails closed when any unapproved player is missing or names are ambiguous', () => {
  expect(() => buildDtcSnapshot(rankings, roster)).toThrow('Unsupported Runner (RB, Sleeper 3)')
  expect(() => buildDtcSnapshot(rankings.slice(0, 1), roster)).toThrow('matched 1 of 3')
  expect(() => buildDtcSnapshot([...rankings, rankings[0]], roster)).toThrow('ambiguous')
  expect(() =>
    buildDtcSnapshot(rankings, [{ sleeperId: '9', name: 'Kicker', position: 'K' }]),
  ).toThrow('no eligible players')
  expect(() =>
    buildDtcSnapshot(
      [{ ...rankings[0], playerName: 'Michael Penix Jr.', position: 'QB' }],
      [
        { sleeperId: '4', name: 'Michael Penix', position: 'QB' },
        { sleeperId: '5', name: 'Michael Penix Jr.', position: 'QB' },
      ],
    ),
  ).toThrow('more than one roster player')
})

test('a known absence never absorbs another missing player, even with the same name', () => {
  const changedRoster = roster.map((player) =>
    player.sleeperId === '3' ? { ...player, sleeperId: '4' } : player,
  )
  expect(() => buildDtcSnapshot(rankings, changedRoster, new Date(), ['3'])).toThrow('Sleeper 4')
  expect(() => buildDtcSnapshot(rankings.slice(0, 1), roster, new Date(), ['3'])).toThrow(
    'Sleeper 2',
  )
  expect(() => buildDtcSnapshot([], [roster[2]], new Date(), ['3'])).toThrow('matched 0 of 1')
})

test('a previously absent player is captured normally when it returns to the export', () => {
  const result = buildDtcSnapshot(
    [...rankings, { ...rankings[0], playerName: roster[2].name, position: 'RB' }],
    roster,
    new Date(),
    ['3'],
  )
  expect(result.records).toHaveLength(3)
  expect(result.records[2]).toMatchObject({ sleeperId: '3', value: 48 })
  expect(result.warnings).toBeUndefined()
  expect(result.context).toEqual(buildDtcSnapshot(rankings, roster, new Date(), ['3']).context)
})

test('DTC missing-player configuration defaults to strict and rejects malformed IDs', () => {
  expect(parseDtcAllowedMissingIds()).toEqual([])
  expect(parseDtcAllowedMissingIds('  ')).toEqual([])
  expect(parseDtcAllowedMissingIds('3, 4,3')).toEqual(['3', '4'])
  for (const value of ['3,', 'any', '3;4', Array.from({ length: 11 }, (_, i) => i).join(',')])
    expect(() => parseDtcAllowedMissingIds(value)).toThrow('comma-separated numeric Sleeper IDs')
})

test('DTC uses a unique suffix-insensitive fallback for Sleeper name differences', () => {
  const result = buildDtcSnapshot(
    [
      { ...rankings[0], playerName: 'Michael Penix Jr.', position: 'QB' },
      { ...rankings[0], playerName: 'Michael Carter', position: 'RB' },
      { ...rankings[0], playerName: 'Michael Carter Jr.', position: 'RB', rank: 2 },
    ],
    [{ sleeperId: '4', name: 'Michael Penix', position: 'QB', team: 'ATL' }],
  )
  expect(result.records[0]).toMatchObject({ sleeperId: '4', value: 48 })
})

test('Sleeper roster lookup selects the configured owner and requires complete metadata', async () => {
  const http = {
    get: jest.fn(async () => ({
      data: [
        { owner_id: 'other', players: ['9'] },
        { owner_id: 'owner', players: ['1', '2'] },
      ],
    })),
  } as unknown as AxiosInstance
  await expect(
    fetchOwnedSleeperRoster('league', 'owner', { http, catalog: roster }),
  ).resolves.toEqual(roster.slice(0, 2))
  await expect(
    fetchOwnedSleeperRoster('league', 'owner', { http, catalog: roster.slice(0, 1) }),
  ).rejects.toThrow('metadata is incomplete')
  await expect(
    fetchOwnedSleeperRoster('league', 'missing', { http, catalog: roster }),
  ).rejects.toThrow('configured owned roster')
  await expect(
    fetchOwnedSleeperRoster('league', 'owner', {
      http: { get: jest.fn(async () => ({ data: {} })) } as unknown as AxiosInstance,
      catalog: roster,
    }),
  ).rejects.toThrow('response changed')
  await expect(
    fetchOwnedSleeperRoster('league', 'owner', {
      http: {
        get: jest.fn(async () => Promise.reject(new Error('offline'))),
      } as unknown as AxiosInstance,
      catalog: roster,
    }),
  ).rejects.toThrow('roster refresh failed')
})
