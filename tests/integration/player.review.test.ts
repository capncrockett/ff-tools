import request from 'supertest'
import { createTestPrismaClient } from '../testPrismaClient'
import { createApp } from '../../src/server/app'
import { sleeperLeagueId, sleeperOwnerId } from '../../src/server/config'
import {
  saveDynastyGmCatalog,
  saveDtcCatalog,
  matchProviderCatalogs,
} from '../../src/server/services/playerCatalogs'
import {
  getManualPlayerLinks,
  validateCapturedPlayerLinks,
} from '../../src/server/services/playerReview'
import { saveSnapshot } from '../../src/server/services/valuations'
import { buildDtcSnapshot } from '../../src/server/providers/dynastyCalculator'
import { playerIdentityKey } from '../../src/shared/playerIdentity'
import { syncSource } from '../../src/server/services/sync'
import type { SnapshotInput } from '../../src/shared/tracker'

const db = createTestPrismaClient()
const app = createApp(db)
const at = new Date('2026-09-14T12:00:00Z')
const gm = (id: number, firstName = 'Common', lastName = 'Name', dob = '1990-01-01') => ({
  id,
  firstName,
  lastName,
  pos: 'WR',
  dob,
  team: 'FA',
})
const dtc = (playerName = 'Common Name') => ({
  playerName,
  position: 'WR',
  team: 'FA',
  age: '19Y',
  rank: 1,
  value: 100,
})
const post = (body: unknown) =>
  request(app).post('/api/player-matches/link').set('x-tracker-request', '1').send(body)
async function clear() {
  await db.movementResolution.deleteMany()
  await db.rosterMovement.deleteMany()
  await db.rosterSyncState.deleteMany()
  await db.holding.deleteMany()
  await db.valuation.deleteMany()
  await db.snapshot.deleteMany()
  await db.mapping.deleteMany()
  await db.source.deleteMany()
  await db.dynastyGmPlayer.deleteMany()
  await db.dtcPlayer.deleteMany()
  await db.player.deleteMany()
  await db.syncRun.deleteMany()
}
beforeEach(async () => {
  await clear()
  await db.player.createMany({
    data: [
      { sleeperId: '88001', name: 'Common Name', position: 'WR', birthDate: '2000-01-01' },
      { sleeperId: '88002', name: 'Common Name', position: 'WR', birthDate: '2002-01-01' },
      { sleeperId: '88003', name: 'Outside Roster', position: 'WR', birthDate: '2001-01-01' },
      { sleeperId: '88004', name: 'Fixture Back', position: 'RB', birthDate: '2000-01-01' },
    ],
  })
  await db.rosterSyncState.create({
    data: {
      id: 'review-roster',
      leagueId: sleeperLeagueId,
      ownerId: sleeperOwnerId,
      leagueName: 'Fixture',
      trackingStartedAt: at,
      playerIdsJson: '["88001"]',
    },
  })
  await saveDynastyGmCatalog(db, [gm(501), gm(502, 'Outside', 'Roster')], at)
  await saveDtcCatalog(db, [dtc()], at)
  await matchProviderCatalogs(db, at)
})
afterAll(async () => {
  await clear()
  await db.$disconnect()
})
const player = (sleeperId = '88001') => db.player.findUniqueOrThrow({ where: { sleeperId } })
const snapshot = (): SnapshotInput => ({
  source: 'dynasty-nerds',
  capturedAt: at.toISOString(),
  context: { label: 'Fixture', settings: { scoring: 'PPR' } },
  records: [
    {
      sourceKey: '501',
      sleeperId: '88001',
      playerName: 'Common Name',
      position: 'WR',
      value: 100,
    },
  ],
})

test('review leads with rostered players and bounds searchable catalog results', async () => {
  const review = await request(app).get('/api/player-matches').expect(200)
  expect(review.body.total).toBe(2)
  expect(review.body.rows.every((r: { rostered: boolean }) => r.rostered)).toBe(true)
  expect(review.body.rows[0].candidates).toHaveLength(2)
  const all = await request(app).get('/api/player-matches?scope=all&search=Outside').expect(200)
  expect(all.body.rows).toHaveLength(1)
  expect(all.body.rows[0].rostered).toBe(false)
  const search = await request(app)
    .get('/api/player-matches/players?search=Common&position=WR')
    .expect(200)
  expect(search.body).toHaveLength(2)
  expect(search.body[0]).toHaveProperty('birthDate')
  await request(app).get('/api/player-matches/players?search=Common&position=K').expect(400)
})

test('explicit ambiguous links survive catalog changes and automatic rematching for both providers', async () => {
  const selected = await player('88002')
  for (const [source, key] of [
    ['dynasty-nerds', '501'],
    ['dynasty-calculator', playerIdentityKey('Common Name', 'WR')],
  ])
    await post({ source, key, playerId: selected.id }).expect(200)
  await saveDynastyGmCatalog(
    db,
    [gm(501, 'Renamed', 'Receiver', '1991-01-01')],
    new Date(+at + 86_400_000),
  )
  await saveDtcCatalog(db, [{ ...dtc(), age: '90Y' }], new Date(+at + 86_400_000))
  await matchProviderCatalogs(db)
  expect(await db.dynastyGmPlayer.findUniqueOrThrow({ where: { id: 501 } })).toMatchObject({
    playerId: selected.id,
    matchMethod: 'manual',
  })
  expect(await db.dtcPlayer.findFirstOrThrow()).toMatchObject({
    playerId: selected.id,
    matchMethod: 'manual',
  })
  expect((await request(app).get('/api/player-matches').expect(200)).body.total).toBe(0)
})

test('corrected mappings affect future observations and preserve history and holdings', async () => {
  const original = await player()
  const corrected = await player('88002')
  await saveSnapshot(db, snapshot())
  const source = await db.source.findUniqueOrThrow({ where: { name: 'dynasty-nerds' } })
  await db.holding.create({
    data: {
      playerId: original.id,
      sourceName: 'dynasty-nerds',
      contextKey: 'fixture',
      portfolio: 'Fixture',
      acquiredAt: at,
      costBasis: 100,
    },
  })
  await post({ source: 'dynasty-nerds', key: '501', playerId: corrected.id }).expect(200)
  expect(
    await db.mapping.findUniqueOrThrow({
      where: { sourceId_sourceKey: { sourceId: source.id, sourceKey: '501' } },
    }),
  ).toMatchObject({ playerId: corrected.id })
  expect(await db.valuation.findFirstOrThrow()).toMatchObject({ playerId: original.id })
  expect(await db.holding.findFirstOrThrow()).toMatchObject({ playerId: original.id })
  await saveSnapshot(db, {
    ...snapshot(),
    capturedAt: new Date(+at + 60_000).toISOString(),
    records: [{ ...snapshot().records[0], sleeperId: corrected.sleeperId! }],
  })
  expect(
    (await db.valuation.findMany({ orderBy: { capturedAt: 'asc' } })).map((v) => v.playerId),
  ).toEqual([original.id, corrected.id])
})

test('invalid and duplicate links fail atomically with useful errors', async () => {
  const p = await player()
  await post({ source: 'dynasty-nerds', key: '501', playerId: p.id }).expect(200)
  await post({ source: 'dynasty-nerds', key: '502', playerId: p.id }).expect(409)
  expect(await db.dynastyGmPlayer.findUniqueOrThrow({ where: { id: 502 } })).toMatchObject({
    playerId: null,
  })
  await post({ source: 'dynasty-nerds', key: '999', playerId: p.id }).expect(404)
  await post({
    source: 'dynasty-nerds',
    key: '501',
    playerId: (await player('88004')).id,
  }).expect(400)
  await request(app)
    .post('/api/player-matches/link')
    .send({ source: 'dynasty-nerds', key: '501', playerId: p.id })
    .expect(403)
})

test('removing an incorrect link releases its claim without deleting observations', async () => {
  await saveSnapshot(db, snapshot())
  const selected = await player()
  await post({ source: 'dynasty-nerds', key: '501', playerId: selected.id }).expect(200)
  await post({ source: 'dynasty-nerds', key: '501', playerId: null }).expect(200)
  expect(await db.dynastyGmPlayer.findUniqueOrThrow({ where: { id: 501 } })).toMatchObject({
    playerId: null,
    matchMethod: null,
  })
  expect(await db.valuation.count()).toBe(1)
  expect(await db.mapping.count()).toBe(0)
  await post({ source: 'dynasty-nerds', key: '502', playerId: selected.id }).expect(200)
  const key = playerIdentityKey('Common Name', 'WR')
  await post({ source: 'dynasty-calculator', key, playerId: selected.id }).expect(200)
  await post({ source: 'dynasty-calculator', key, playerId: null }).expect(200)
  expect(await db.dtcPlayer.findUniqueOrThrow({ where: { key } })).toMatchObject({
    playerId: null,
    matchMethod: null,
  })
})

test('strict capture blocks an old name-only mapping, keeps the catalog reviewable, then accepts a manual decision', async () => {
  await saveSnapshot(db, snapshot())
  const provider = {
    name: 'dynasty-nerds' as const,
    run: async () => ({
      ...snapshot(),
      capturedAt: new Date(+at + 60_000).toISOString(),
      catalog: { source: 'dynasty-nerds' as const, players: [gm(501)] },
    }),
  }
  await expect(syncSource(db, 'dynasty-nerds', provider)).rejects.toThrow(
    'Player matching needs review',
  )
  expect(await db.valuation.count()).toBe(1)
  await post({ source: 'dynasty-nerds', key: '501', playerId: (await player()).id }).expect(200)
  await db.syncRun.updateMany({ data: { startedAt: new Date(Date.now() - 3_600_001) } })
  expect(await syncSource(db, 'dynasty-nerds', provider)).toMatchObject({ saved: 1 })
  expect(await db.valuation.count()).toBe(2)
})

test('DTC manual spelling corrections drive capture, while date disagreements require review and genuine absence remains zero', async () => {
  const roster = [
    {
      sleeperId: '88001',
      name: 'Sleeper Spelling',
      position: 'WR',
      team: 'FA',
      birthDate: '2000-01-01',
    },
    { sleeperId: '88004', name: 'Fixture Back', position: 'RB', birthDate: '2000-01-01' },
  ]
  const rows = [dtc()]
  await post({
    source: 'dynasty-calculator',
    key: playerIdentityKey('Common Name', 'WR'),
    playerId: (await player()).id,
  }).expect(200)
  const links = await getManualPlayerLinks(db, 'dynasty-calculator')
  const saved = buildDtcSnapshot(rows as never, roster, at, links)
  expect(saved.records.map((r) => r.value)).toEqual([100, 0])
  await expect(
    validateCapturedPlayerLinks(db, saved, { source: 'dynasty-calculator', rows }),
  ).resolves.toBeUndefined()
  await db.dtcPlayer.updateMany({ data: { matchMethod: 'automatic' } })
  await expect(
    validateCapturedPlayerLinks(db, saved, { source: 'dynasty-calculator', rows }),
  ).rejects.toThrow('Player matching needs review')
})

test('a verified Dynasty GM team capture can resolve identity when the live Sleeper roster check is unavailable', async () => {
  const confirmed = { ...snapshot(), records: [{ ...snapshot().records[0], sleeperId: undefined }] }
  await expect(
    validateCapturedPlayerLinks(db, confirmed, {
      source: 'dynasty-nerds',
      players: [gm(501, 'Common', 'Name', '2000-01-01')],
    }),
  ).resolves.toBeUndefined()
  expect(confirmed.records[0].sleeperId).toBe('88001')
  const unconfirmed = {
    ...snapshot(),
    records: [{ ...snapshot().records[0], sleeperId: undefined }],
  }
  await expect(
    validateCapturedPlayerLinks(db, unconfirmed, { source: 'dynasty-nerds', players: [gm(501)] }),
  ).rejects.toThrow('canonical Sleeper identity')
  await post({ source: 'dynasty-nerds', key: '501', playerId: (await player('88002')).id }).expect(
    200,
  )
  await expect(
    validateCapturedPlayerLinks(db, unconfirmed, { source: 'dynasty-nerds', players: [gm(501)] }),
  ).resolves.toBeUndefined()
  expect(unconfirmed.records[0].sleeperId).toBe('88002')
})
