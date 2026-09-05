import request from 'supertest'
import { PrismaClient } from '@prisma/client'
import { syncSource, getSourceStatuses } from '../../src/server/services/sync'
import { ProviderError, type ValueProvider } from '../../src/server/providers/types'
import { createApp } from '../../src/server/app'
const db = new PrismaClient()
const provider: ValueProvider = {
  name: 'dynasty-nerds',
  run: jest.fn(async () => ({
    source: 'dynasty-nerds',
    capturedAt: new Date().toISOString(),
    context: { label: 'Fixture', settings: { scoring: 'PPR' } },
    records: [{ sourceKey: 'test', playerName: 'Sync Player', value: 50 }],
  })),
}
beforeEach(async () => {
  await db.holding.deleteMany()
  await db.valuation.deleteMany()
  await db.snapshot.deleteMany()
  await db.mapping.deleteMany()
  await db.source.deleteMany()
  await db.player.deleteMany()
  await db.syncRun.deleteMany()
  jest.clearAllMocks()
})
afterAll(() => db.$disconnect())
test('persisted success cache prevents a second browser call, including another process connection', async () => {
  await syncSource(db, 'dynasty-nerds', provider)
  const other = new PrismaClient()
  try {
    await expect(syncSource(other, 'dynasty-nerds', provider)).rejects.toMatchObject({
      status: 429,
    })
  } finally {
    await other.$disconnect()
  }
  expect(provider.run).toHaveBeenCalledTimes(1)
  expect((await getSourceStatuses(db))[0]).toMatchObject({
    status: 'success',
    configured: expect.any(Boolean),
    nextAllowedAt: expect.any(String),
  })
})
test('failed capture keeps observations intact and enforces cooldown', async () => {
  const failing: ValueProvider = {
    name: 'dynasty-nerds',
    run: jest.fn(async () => {
      throw new ProviderError('challenge', 'Challenge needs manual sign-in.')
    }),
  }
  await expect(syncSource(db, 'dynasty-nerds', failing)).rejects.toThrow(
    'Challenge needs manual sign-in.',
  )
  expect(await db.valuation.count()).toBe(0)
  await expect(syncSource(db, 'dynasty-nerds', failing)).rejects.toMatchObject({ status: 429 })
  expect(failing.run).toHaveBeenCalledTimes(1)
  expect((await getSourceStatuses(db))[0].status).toBe('failed')
})
test('unexpected browser errors are redacted and source mismatches rejected', async () => {
  const failing: ValueProvider = {
    name: 'dynasty-nerds',
    run: async () => {
      throw new Error('secret token=abc and password=123')
    },
  }
  await expect(syncSource(db, 'dynasty-nerds', failing)).rejects.toThrow(
    'Capture failed validation',
  )
  expect(JSON.stringify(await db.syncRun.findMany())).not.toContain('secret')
  await db.syncRun.deleteMany()
  const wrong: ValueProvider = {
    name: 'dynasty-nerds',
    run: async () => ({ ...(await provider.run()), source: 'dynasty-calculator' }),
  }
  await expect(syncSource(db, 'dynasty-nerds', wrong)).rejects.toThrow('wrong source')
})
test('expired failure cooldown allows a new capture', async () => {
  await db.syncRun.create({
    data: {
      sourceName: 'dynasty-nerds',
      status: 'running',
      message: 'interrupted',
      startedAt: new Date(Date.now() - 61 * 60_000),
    },
  })
  await syncSource(db, 'dynasty-nerds', provider)
  expect(await db.valuation.count()).toBe(1)
})
test.each(['success', 'failed', 'running'])(
  'the full hour applies after a %s attempt',
  async (status) => {
    const now = Date.now()
    const attempt = await db.syncRun.create({
      data: { sourceName: 'dynasty-nerds', status, message: 'fixture', startedAt: new Date(now) },
    })
    const clock = jest.spyOn(Date, 'now')
    try {
      for (const elapsed of [30 * 60_000, 60 * 60_000 - 1]) {
        clock.mockReturnValue(now + elapsed)
        await expect(syncSource(db, 'dynasty-nerds', provider)).rejects.toMatchObject({
          status: 429,
        })
      }
      expect(provider.run).not.toHaveBeenCalled()
      clock.mockRestore()
      await db.syncRun.update({
        where: { id: attempt.id },
        data: { startedAt: new Date(Date.now() - 60 * 60_000) },
      })
      await syncSource(db, 'dynasty-nerds', provider)
      expect(provider.run).toHaveBeenCalledTimes(1)
    } finally {
      clock.mockRestore()
    }
  },
)
test('reading the dashboard and dry-run never invokes a provider', async () => {
  const app = createApp(db)
  await request(app).get('/api/tracker').expect(200)
  await request(app)
    .post('/api/sync/dynasty-nerds?dry_run=1')
    .set('x-tracker-request', '1')
    .send({})
    .expect(200)
  expect(provider.run).not.toHaveBeenCalled()
})
