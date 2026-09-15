import { jest } from '@jest/globals'
import request from 'supertest'
import type { AxiosInstance } from 'axios'
import { createTestPrismaClient } from '../testPrismaClient'
import { syncSource, getSourceStatuses } from '../../src/server/services/sync'
import { ProviderError, type ValueProvider } from '../../src/server/providers/types'
import { createApp } from '../../src/server/app'
import { runCaptureWorkerTick } from '../../src/server/services/captureWorker'
import * as syncService from '../../src/server/services/sync'
import { buildDtcSnapshot } from '../../src/server/providers/dynastyCalculator'
const db = createTestPrismaClient()
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
  await db.movementResolution.deleteMany()
  await db.rosterMovement.deleteMany()
  await db.rosterSyncState.deleteMany()
  await db.holding.deleteMany()
  await db.valuation.deleteMany()
  await db.snapshot.deleteMany()
  await db.mapping.deleteMany()
  await db.source.deleteMany()
  await db.player.deleteMany()
  await db.syncRun.deleteMany()
  jest.clearAllMocks()
})
afterAll(async () => {
  await db.movementResolution.deleteMany()
  await db.rosterMovement.deleteMany()
  await db.rosterSyncState.deleteMany()
  await db.$disconnect()
})
test('persisted success cache prevents a second browser call, including another process connection', async () => {
  await syncSource(db, 'dynasty-nerds', provider)
  const other = createTestPrismaClient()
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

test('DTC coverage warnings persist across reloads and failed captures preserve saved values', async () => {
  const rankings = [
    {
      rank: 1,
      playerName: 'Fixture Receiver',
      position: 'WR' as const,
      team: 'FA',
      age: '25',
      value: 0,
    },
  ]
  const roster = [
    { sleeperId: '1', name: 'Fixture Receiver', position: 'WR' },
    { sleeperId: '2', name: 'Fixture Missing', position: 'RB' },
  ]
  const partial: ValueProvider = {
    name: 'dynasty-calculator',
    run: async () => buildDtcSnapshot(rankings, roster),
  }
  const result = await syncSource(db, 'dynasty-calculator', partial)
  expect(result).toMatchObject({ saved: 2, warnings: [expect.stringContaining('Fixture Missing')] })
  const first = await db.valuation.findMany()
  expect(first).toHaveLength(2)
  expect(first[0].value).toBe(0)
  expect(first.find((row) => row.sourceKey === 'absent:sleeper:2')?.value).toBe(0)
  const dashboard = (await request(createApp(db)).get('/api/tracker').expect(200)).body
  expect(
    dashboard.sources.find((s: { source: string }) => s.source === 'dynasty-calculator'),
  ).toMatchObject({
    status: 'success',
    message: expect.stringContaining(
      'unlisted player valued at 0 by the tracker rule: Fixture Missing',
    ),
  })
  const snapshot = await db.snapshot.findFirstOrThrow()
  expect(snapshot.contextJson).not.toContain('Fixture Missing')
  await db.syncRun.updateMany({ data: { startedAt: new Date(Date.now() - 3_600_001) } })
  const unexpected: ValueProvider = {
    ...partial,
    run: async () => buildDtcSnapshot([], roster),
  }
  await expect(syncSource(db, 'dynasty-calculator', unexpected)).rejects.toThrow(
    'rankings are empty',
  )
  expect(await db.valuation.findMany()).toEqual(first)
  expect(await db.snapshot.count()).toBe(1)
  const status = (await getSourceStatuses(db)).find((s) => s.source === 'dynasty-calculator')!
  expect(status).toMatchObject({
    status: 'failed',
    message: expect.stringContaining('No snapshot saved'),
    nextAllowedAt: expect.any(String),
  })
  await db.syncRun.updateMany({ data: { startedAt: new Date(Date.now() - 3_600_001) } })
  await syncSource(db, 'dynasty-calculator', {
    ...partial,
    run: async () =>
      buildDtcSnapshot(
        [...rankings, { ...rankings[0], playerName: 'Fixture Missing', position: 'RB', value: 12 }],
        roster,
      ),
  })
  const after = (await request(createApp(db)).get('/api/tracker').expect(200)).body
  const returned = after.market.filter((row: { sleeperId: string }) => row.sleeperId === '2')
  expect(returned).toHaveLength(1)
  expect(returned[0].history.map((point: { value: number }) => point.value)).toEqual([0, 12])
  expect(returned[0].baselineChangePct).toBeNull()
})

test('tracked providers share the persisted Sleeper roster with the capture', async () => {
  await db.player.create({
    data: { sleeperId: '123', name: 'Sync Player', position: 'WR', team: 'SEA' },
  })
  const http = {
    get: jest.fn(async (url: string) => {
      if (url.endsWith('/state/nfl')) return { data: { week: 1 } }
      if (url.endsWith('/rosters'))
        return {
          data: [
            {
              roster_id: 7,
              owner_id: '82289736559247360',
              players: ['123'],
              taxi: [],
              reserve: [],
            },
          ],
        }
      if (url.includes('/transactions/')) return { data: [] }
      return { data: { name: 'A League For All Seasons', season: '2026' } }
    }),
  } as unknown as AxiosInstance
  const tracked: ValueProvider = {
    name: 'dynasty-calculator',
    tracksSleeperRoster: true,
    needsSleeperRoster: true,
    run: jest.fn(async (options) => ({
      source: 'dynasty-calculator',
      capturedAt: new Date().toISOString(),
      context: {
        label: 'Fixture half-PPR',
        settings: {
          leagueId: '1378427936817815552',
          scope: 'owned-roster',
          scoring: 'half_ppr',
        },
      },
      records: [
        {
          sourceKey: 'sleeper:123',
          sleeperId: '123',
          playerName: options?.sleeperRoster?.[0]?.name ?? 'Missing Roster',
          position: 'WR',
          value: 50,
        },
      ],
    })),
  }
  await syncSource(db, 'dynasty-calculator', tracked, { rosterHttp: http })
  expect(tracked.run).toHaveBeenCalledWith(
    expect.objectContaining({
      sleeperRoster: [
        expect.objectContaining({ sleeperId: '123', name: 'Sync Player', position: 'WR' }),
      ],
    }),
  )
  expect(await db.holding.count()).toBe(1)
})

describe('local scheduled worker', () => {
  const morning = new Date('2026-09-12T11:00:00Z')
  const providers = {
    'dynasty-nerds': provider,
    'dynasty-calculator': {
      name: 'dynasty-calculator',
      run: jest.fn(async () => ({ ...(await provider.run()), source: 'dynasty-calculator' })),
    } as ValueProvider,
  }
  beforeEach(() => {
    jest.useFakeTimers({
      doNotFake: [
        'nextTick',
        'setImmediate',
        'clearImmediate',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'performance',
        'queueMicrotask',
        'hrtime',
      ],
    })
    jest.setSystemTime(morning)
    jest.spyOn(syncService.sourceConfig, 'isConfigured').mockReturnValue(true)
  })
  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  test('dry-run has no writes or provider calls; repeated ticks and restarts do not repeat success', async () => {
    const plan = await runCaptureWorkerTick(db, providers, { dryRun: true })
    expect(plan.map((report) => report.status)).toEqual(['due', 'due'])
    expect(await db.syncRun.count()).toBe(0)
    expect(provider.run).not.toHaveBeenCalled()
    expect((await runCaptureWorkerTick(db, providers)).map((report) => report.status)).toEqual([
      'saved',
      'saved',
    ])
    jest.setSystemTime(new Date(+morning + 3_600_000))
    const restarted = createTestPrismaClient()
    try {
      expect(
        (await runCaptureWorkerTick(restarted, providers)).every(
          (report) => report.status === 'waiting',
        ),
      ).toBe(true)
    } finally {
      await restarted.$disconnect()
    }
    expect(await db.syncRun.count()).toBe(2)
    // Direct scheduled calls enforce the same policy inside the reservation transaction.
    await expect(
      syncSource(db, 'dynasty-nerds', provider, { scheduled: true }),
    ).rejects.toMatchObject({ status: 429 })
  })

  test('one provider failure does not block the other; transient failure gets only one retry', async () => {
    const failing: ValueProvider = {
      name: 'dynasty-nerds',
      run: jest.fn(async () => {
        throw new ProviderError('unavailable', 'Provider is temporarily unavailable.')
      }),
    }
    const sources = { ...providers, 'dynasty-nerds': failing }
    expect((await runCaptureWorkerTick(db, sources)).map((report) => report.status)).toEqual([
      'failed',
      'saved',
    ])
    expect((await runCaptureWorkerTick(db, sources))[0].status).toBe('waiting')
    jest.setSystemTime(new Date(+morning + 3_600_000))
    expect((await runCaptureWorkerTick(db, sources))[0].status).toBe('failed')
    expect((await runCaptureWorkerTick(db, sources))[0].status).toBe('waiting')
    expect(failing.run).toHaveBeenCalledTimes(2)
    expect(await db.syncRun.count({ where: { sourceName: 'dynasty-nerds' } })).toBe(2)
  })

  test('challenge stays paused across nights until a manual capture verifies recovery', async () => {
    const failing: ValueProvider = {
      name: 'dynasty-nerds',
      run: jest.fn(async () => {
        throw new ProviderError('challenge', 'Resolve the browser challenge manually.')
      }),
    }
    await runCaptureWorkerTick(db, { ...providers, 'dynasty-nerds': failing })
    expect(await db.syncRun.findFirst({ where: { sourceName: 'dynasty-nerds' } })).toMatchObject({
      failureCode: 'challenge',
    })
    jest.setSystemTime(new Date(+morning + 24 * 3_600_000))
    expect((await runCaptureWorkerTick(db, providers))[0].status).toBe('waiting')
    await syncSource(db, 'dynasty-nerds', provider)
    jest.setSystemTime(new Date(+morning + 48 * 3_600_000))
    expect((await runCaptureWorkerTick(db, providers))[0].status).toBe('saved')
  })

  test('a Sleeper roster addition triggers one prompt daytime capture for roster-tracked providers', async () => {
    const daytime = new Date('2026-09-12T20:00:00Z')
    jest.setSystemTime(daytime)
    for (const [sleeperId, name] of [
      ['123', 'Sync Player'],
      ['456', 'Arriving Player'],
    ])
      await db.player.create({ data: { sleeperId, name, position: 'WR', team: 'SEA' } })
    let transactions: unknown[] = []
    const rosterHttp = {
      get: jest.fn(async (url: string) => {
        if (url.endsWith('/state/nfl')) return { data: { week: 1 } }
        if (url.endsWith('/rosters'))
          return {
            data: [
              {
                roster_id: 7,
                owner_id: '82289736559247360',
                players: transactions.length ? ['123', '456'] : ['123'],
                taxi: [],
                reserve: [],
              },
            ],
          }
        if (url.includes('/transactions/')) return { data: transactions }
        return { data: { name: 'A League For All Seasons', season: '2026' } }
      }),
    } as unknown as AxiosInstance
    const tracked: ValueProvider = {
      name: 'dynasty-nerds',
      tracksSleeperRoster: true,
      run: jest.fn(async (options) => ({
        source: 'dynasty-nerds',
        capturedAt: new Date().toISOString(),
        context: {
          label: 'Fixture roster',
          settings: { leagueId: '1378427936817815552', scope: 'owned-roster', scoring: 'ppr' },
        },
        records: (options?.sleeperRoster ?? []).map((player) => ({
          sourceKey: `sleeper:${player.sleeperId}`,
          sleeperId: player.sleeperId,
          playerName: player.name,
          position: 'WR' as const,
          value: 40,
        })),
      })),
    }
    // Dynasty GM follows the roster; the untracked provider keeps nightly-only behavior.
    const mixed = { ...providers, 'dynasty-nerds': tracked }
    const statuses = async () =>
      (await runCaptureWorkerTick(db, mixed, { rosterHttp })).map((r) => `${r.source}:${r.status}`)

    expect(await statuses()).toEqual([
      'sleeper:checked',
      'dynasty-nerds:waiting',
      'dynasty-calculator:waiting',
    ])
    transactions = [
      {
        transaction_id: 'fixture-trade',
        type: 'trade',
        status: 'complete',
        status_updated: +daytime + 30 * 60_000,
        adds: { '456': 7 },
        drops: null,
      },
    ]
    // Before the hourly Sleeper limit, the addition is not yet known.
    jest.setSystemTime(new Date(+daytime + 3_600_000 - 1))
    expect(await statuses()).toEqual(['dynasty-nerds:waiting', 'dynasty-calculator:waiting'])
    jest.setSystemTime(new Date(+daytime + 3_600_000))
    expect(await statuses()).toEqual([
      'sleeper:checked',
      'dynasty-nerds:saved',
      'dynasty-calculator:waiting',
    ])
    expect(tracked.run).toHaveBeenCalledWith(
      expect.objectContaining({
        sleeperRoster: expect.arrayContaining([expect.objectContaining({ sleeperId: '456' })]),
      }),
    )
    expect(provider.run).not.toHaveBeenCalled()

    jest.setSystemTime(new Date(+daytime + 3 * 3_600_000))
    const later = await runCaptureWorkerTick(db, mixed, { rosterHttp })
    expect(later.find((r) => r.source === 'dynasty-nerds')).toMatchObject({
      status: 'waiting',
      message: 'A capture already followed the latest Sleeper roster addition.',
    })
    // Outside the 36-hour entry window the addition no longer drives captures.
    jest.setSystemTime(new Date(+daytime + 44 * 3_600_000))
    const expired = await runCaptureWorkerTick(db, mixed, { rosterHttp })
    expect(expired.find((r) => r.source === 'dynasty-nerds')?.message).toContain('capture window')
    expect(tracked.run).toHaveBeenCalledTimes(1)
  })

  test('unconfigured sources, shutdown, and daytime checks never launch a browser', async () => {
    jest.mocked(syncService.sourceConfig.isConfigured).mockReturnValue(false)
    expect(
      (await runCaptureWorkerTick(db, providers)).every((report) => report.status === 'waiting'),
    ).toBe(true)
    jest.mocked(syncService.sourceConfig.isConfigured).mockReturnValue(true)
    expect(await runCaptureWorkerTick(db, providers, { stopped: () => true })).toEqual([])
    jest.setSystemTime(new Date('2026-09-12T20:00:00Z'))
    expect(
      (await runCaptureWorkerTick(db, providers)).every((report) => report.status === 'waiting'),
    ).toBe(true)
    expect(await db.syncRun.count()).toBe(0)
    expect(provider.run).not.toHaveBeenCalled()
  })
})
