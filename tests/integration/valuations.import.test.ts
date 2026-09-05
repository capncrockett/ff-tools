import request from 'supertest'
import { PrismaClient } from '@prisma/client'
import { createApp } from '../../src/server/app'
import {
  saveSnapshot,
  getMarket,
  contextIdentity,
  parseCsvSnapshot,
} from '../../src/server/services/valuations'
import { calculateReturn } from '../../src/shared/tracker'
const db = new PrismaClient()
const app = createApp(db)
const context = {
  label: '12 teams / 1QB / PPR',
  settings: { teams: 12, scoring: 'PPR', qb: '1QB' },
}
const capture = (overrides: Record<string, unknown> = {}) => ({
  source: 'dynasty-nerds',
  context,
  capturedAt: '2026-01-01T00:00:00Z',
  records: [
    { sourceKey: 'a', sleeperId: '123', playerName: 'Sample Alpha', position: 'WR', value: 100 },
  ],
  ...overrides,
})
const post = (url: string, body: unknown) =>
  request(app).post(url).set('x-tracker-request', '1').send(body)
beforeEach(async () => {
  await db.holding.deleteMany()
  await db.valuation.deleteMany()
  await db.snapshot.deleteMany()
  await db.mapping.deleteMany()
  await db.player.deleteMany()
  await db.source.deleteMany()
  await db.syncRun.deleteMany()
})
afterAll(() => db.$disconnect())

test('snapshot is atomic, idempotent, and persisted through another connection', async () => {
  const result = await post('/api/snapshots/import', capture()).expect(200)
  expect(result.body.saved).toBe(1)
  expect((await post('/api/snapshots/import', capture()).expect(200)).body.duplicate).toBe(true)
  const other = new PrismaClient()
  try {
    expect(await other.valuation.count()).toBe(1)
  } finally {
    await other.$disconnect()
  }
  await post(
    '/api/snapshots/import',
    capture({ records: [{ sourceKey: 'a', playerName: 'Sample Alpha', value: 900 }] }),
  ).expect(409)
  expect(await db.valuation.count()).toBe(1)
})
test('both sources, changed settings and out-of-order history remain distinct', async () => {
  await saveSnapshot(db, capture())
  await saveSnapshot(
    db,
    capture({
      capturedAt: '2026-02-01T00:00:00Z',
      records: [{ sourceKey: 'a', sleeperId: '123', playerName: 'Sample Alpha', value: 150 }],
    }),
  )
  await saveSnapshot(db, capture({ capturedAt: '2025-12-01T00:00:00Z' }))
  await saveSnapshot(
    db,
    capture({
      source: 'dynasty-calculator',
      records: [{ sourceKey: 'dtc-a', sleeperId: '123', playerName: 'Sample Alpha', value: 12 }],
    }),
  )
  await saveSnapshot(db, capture({ context: { label: 'SF', settings: { qb: 'SF' } } }))
  const rows = await getMarket(db)
  expect(rows).toHaveLength(3)
  const main = rows.find(
    (r) => r.contextKey === contextIdentity(context) && r.source === 'dynasty-nerds',
  )!
  expect(main.value).toBe(150)
  expect(main.changePct).toBe(50)
  expect(main.baselineValue).toBe(100)
  expect(main.baselineAt).toBe('2025-12-01T00:00:00.000Z')
  expect(main.baselineChangePct).toBe(50)
  expect(main.history).toHaveLength(3)
  expect((await request(app).get('/api/valuations/latest?limit=1').expect(200)).body).toHaveLength(
    1,
  )
  await request(app).get('/api/valuations/latest?source=bogus').expect(400)
  expect(
    (await request(app).get(`/api/timeseries/${main.playerId}`).expect(200)).body,
  ).toHaveLength(3)
})
test('a conflict halfway through a batch rolls back every observation and player', async () => {
  await db.player.create({ data: { name: 'Known Person', sleeperId: '55' } })
  const broken = capture({
    records: [
      { sourceKey: 'new', playerName: 'New Person', value: 10 },
      { sourceKey: 'b', playerName: 'Known Person', sleeperId: '55', value: 15 },
      { sourceKey: 'c', playerName: 'Known Person', sleeperId: '55', value: 15 },
    ],
  })
  await post('/api/snapshots/import', broken).expect(400)
  expect(await db.snapshot.count()).toBe(0)
  expect(await db.valuation.count()).toBe(0)
  expect(await db.player.count()).toBe(1)
})
test.each([NaN, -1, null, '', Infinity])(
  'invalid value %p does not become a free player',
  async (value) => {
    await post(
      '/api/snapshots/import',
      capture({ records: [{ sourceKey: 'x', playerName: 'Bad Value', value }] }),
    ).expect(400)
    expect(await db.valuation.count()).toBe(0)
  },
)
test('duplicate source keys, empty batches and future timestamps are rejected', async () => {
  await post('/api/snapshots/import', capture({ records: [] })).expect(400)
  await post(
    '/api/snapshots/import',
    capture({
      records: [
        { sourceKey: 'x', playerName: 'One Name', value: 0 },
        { sourceKey: 'x', playerName: 'Two Name', value: 2 },
      ],
    }),
  ).expect(400)
  await post('/api/snapshots/import', capture({ capturedAt: '2999-01-01T00:00:00Z' })).expect(400)
})
test('ambiguous canonical names do not merge, source-only names remain separate', async () => {
  await db.player.createMany({
    data: [
      { name: 'Alex Same', sleeperId: '1', position: 'WR' },
      { name: 'Alex Same', sleeperId: '2', position: 'WR' },
    ],
  })
  await post(
    '/api/snapshots/import',
    capture({
      records: [{ sourceKey: 'same', playerName: 'Alex Same', position: 'WR', value: 50 }],
    }),
  ).expect(400)
  await saveSnapshot(
    db,
    capture({
      records: [{ sourceKey: 'unique', playerName: 'Another Guy', position: 'WR', value: 5 }],
    }),
  )
  await saveSnapshot(
    db,
    capture({
      source: 'dynasty-calculator',
      records: [{ sourceKey: 'unique', playerName: 'Another Guy', position: 'WR', value: 5 }],
    }),
  )
  expect((await getMarket(db)).map((r) => r.playerId)[0]).not.toBe(
    (await getMarket(db)).map((r) => r.playerId)[1],
  )
})
test('unique canonical name with position maps across sources', async () => {
  await db.player.create({ data: { name: 'D.J. Moore', sleeperId: '999', position: 'WR' } })
  await saveSnapshot(
    db,
    capture({
      records: [{ sourceKey: 'moore', playerName: 'DJ Moore', position: 'WR', value: 4 }],
    }),
  )
  expect((await getMarket(db))[0].sleeperId).toBe('999')
})
test('records entry, target hit, realized exit and independent reacquisition', async () => {
  await saveSnapshot(
    db,
    capture({ records: [{ sourceKey: 'a', playerName: 'Sample Alpha', value: 150 }] }),
  )
  const row = (await getMarket(db))[0]
  const input = {
    playerId: row.playerId,
    sourceName: row.source,
    contextKey: row.contextKey,
    portfolio: 'League',
    costBasis: 100,
    targetRoi: 20,
    acquiredAt: '2025-01-01T00:00:00Z',
  }
  const saved = await post('/api/holdings', input).expect(201)
  let dashboard = (await request(app).get('/api/tracker').expect(200)).body
  expect(dashboard.holdings[0]).toMatchObject({
    gain: 50,
    roi: 50,
    targetValue: 120,
    targetReached: true,
    closedAt: null,
  })
  await post(`/api/holdings/${saved.body.id}/exit`, {
    proceeds: 130,
    closedAt: '2026-02-01T00:00:00Z',
  }).expect(200)
  await post(`/api/holdings/${saved.body.id}/exit`, {
    proceeds: 140,
    closedAt: '2026-02-02T00:00:00Z',
  }).expect(409)
  dashboard = (await request(app).get('/api/tracker')).body
  expect(dashboard.holdings[0]).toMatchObject({ gain: 30, roi: 30, proceeds: 130 })
  await post('/api/holdings', input).expect(201)
  expect(await db.holding.count()).toBe(2)
  const exported = await request(app).get('/api/export').expect(200)
  expect(exported.body.holdings).toHaveLength(2)
  expect(exported.body.observations).toHaveLength(1)
  expect(JSON.stringify(exported.body)).not.toMatch(/PASSWORD|cookies|jwt|authorization/)
})
test('no price after acquisition means no unrealized ROI; invalid exits rejected', async () => {
  await saveSnapshot(db, capture())
  const row = (await getMarket(db))[0]
  const saved = await post('/api/holdings', {
    playerId: row.playerId,
    sourceName: row.source,
    contextKey: row.contextKey,
    portfolio: 'League',
    costBasis: 0,
    targetRoi: 20,
    acquiredAt: '2026-03-01T00:00:00Z',
  }).expect(201)
  const h = (await request(app).get('/api/tracker')).body.holdings[0]
  expect(h.roi).toBeNull()
  expect(h.currentValue).toBeNull()
  expect(h.targetReached).toBe(false)
  await post(`/api/holdings/${saved.body.id}/exit`, {
    proceeds: 10,
    closedAt: '2026-02-01T00:00:00Z',
  }).expect(400)
  await post('/api/holdings/nope/exit', { proceeds: 0, closedAt: '2026-02-01T00:00:00Z' }).expect(
    404,
  )
  expect(calculateReturn(0, 100, 20)).toEqual({
    gain: 100,
    roi: null,
    targetValue: null,
    targetReached: false,
  })
  expect(calculateReturn(100, 120, 20).targetReached).toBe(true)
})
test('CSV handles quoted commas, rejects missing values and mixed timestamps', async () => {
  const csv = 'player_name,value,captured_at\n"Player, One","1,250.5",2026-01-01T00:00:00Z'
  const parsed = parseCsvSnapshot(csv, 'dynasty-nerds', context)
  expect(parsed.records[0]).toMatchObject({ playerName: 'Player, One', value: 1250.5 })
  await request(app)
    .post('/api/valuations/import?source=dynasty-nerds&format=PPR')
    .set('x-tracker-request', '1')
    .set('content-type', 'text/csv')
    .send(csv)
    .expect(200)
  for (const invalid of [
    'player_name,value\nOne,5',
    'player_name,value,captured_at\nOne,,2026-01-01T00:00:00Z',
    'player_name,value,captured_at\n"One,2,x',
    'player_name,value,captured_at\nOne,5,2026-01-01T00:00:00Z\nTwo,8,2026-02-01T00:00:00Z',
  ])
    expect(() => parseCsvSnapshot(invalid, 'dynasty-nerds', context)).toThrow()
})
test('local API rejects remote hosts, cross-origin writes, invalid JSON and missing request header', async () => {
  await request(app).post('/api/snapshots/import').send(capture()).expect(403)
  await post('/api/snapshots/import', capture()).set('origin', 'https://evil.example').expect(403)
  await request(app).get('/api/tracker').set('host', 'evil.example').expect(403)
  await request(app).get('/api/health').set('origin', 'http://127.0.0.1:8888').expect(403)
  await request(app).get('/api/health').set('origin', 'not-a-url').expect(403)
  await request(app)
    .post('/api/snapshots/import')
    .set('x-tracker-request', '1')
    .set('content-type', 'application/json')
    .send('{oops')
    .expect(400)
  await request(app).get('/api/nope').expect(404)
})
