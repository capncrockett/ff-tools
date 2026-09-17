import { jest } from '@jest/globals'
import type { AxiosInstance } from 'axios'
import { createTestPrismaClient } from '../testPrismaClient'
import {
  acceptLastRemovalValue,
  acknowledgeMissingValue,
  getRosterAutomation,
  reconcileSleeperRoster,
} from '../../src/server/services/rosterAutomation'
import { saveSnapshot } from '../../src/server/services/valuations'

const db = createTestPrismaClient()
const leagueId = '1378427936817815552'
const ownerId = '82289736559247360'
const context = (label: string) => ({
  label,
  settings: { leagueId, scope: 'owned-roster', scoring: label },
})
const observation = (
  source: 'dynasty-nerds' | 'dynasty-calculator',
  sleeperId: string,
  playerName: string,
  value: number,
  capturedAt: string,
) =>
  saveSnapshot(
    db,
    {
      source,
      capturedAt,
      context: context(source),
      records: [
        {
          sourceKey: `${source}:${sleeperId}`,
          sleeperId,
          playerName,
          position: 'WR',
          value,
        },
      ],
    },
    'browser',
  )

type TransactionFixture = {
  transaction_id: string
  type: string
  status: string
  status_updated: number
  adds?: Record<string, number> | null
  drops?: Record<string, number> | null
}

function sleeperHttp(players: string[], transactions: TransactionFixture[] = []) {
  return {
    get: jest.fn(async (url: string) => {
      if (url.endsWith('/state/nfl')) return { data: { week: 1 } }
      if (url.endsWith(`/league/${leagueId}`))
        return { data: { name: 'A League For All Seasons', season: '2026' } }
      if (url.endsWith('/rosters'))
        return {
          data: [
            { roster_id: 2, owner_id: 'other', players: ['999'] },
            { roster_id: 7, owner_id: ownerId, players, taxi: [], reserve: [] },
          ],
        }
      if (url.includes('/transactions/')) return { data: transactions }
      throw new Error(`Unexpected fixture URL: ${url}`)
    }),
  } as unknown as AxiosInstance
}

async function clear() {
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
}

beforeEach(clear)
afterAll(async () => {
  await clear()
  await db.$disconnect()
})

test('baselines the current roster once and reuses the persisted hourly check', async () => {
  await observation('dynasty-nerds', '101', 'Baseline Receiver', 100, '2026-09-01T08:00:00Z')
  await observation('dynasty-calculator', '101', 'Baseline Receiver', 10, '2026-09-01T08:05:00Z')
  const http = sleeperHttp(['101'])
  const first = await reconcileSleeperRoster(db, {
    http,
    now: new Date('2026-09-01T09:00:00Z'),
  })
  expect(first).toMatchObject({ cached: false, playerIds: ['101'], pending: 0, needsReview: 0 })
  expect(await db.holding.findMany({ orderBy: { costBasis: 'desc' } })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        costBasis: 100,
        targetRoi: 20,
        originMovementId: expect.any(String),
      }),
      expect.objectContaining({
        costBasis: 10,
        targetRoi: 20,
        originMovementId: expect.any(String),
      }),
    ]),
  )

  const calls = (http.get as jest.Mock).mock.calls.length
  const cached = await reconcileSleeperRoster(db, {
    http,
    now: new Date('2026-09-01T09:30:00Z'),
    allowCached: true,
  })
  expect(cached.cached).toBe(true)
  expect((http.get as jest.Mock).mock.calls).toHaveLength(calls)
  expect(await db.holding.count()).toBe(2)
  await expect(
    reconcileSleeperRoster(db, {
      http,
      now: new Date('2026-09-01T09:45:00Z'),
    }),
  ).rejects.toMatchObject({ status: 429 })
})

test('applies additions and removals independently for both provider contexts', async () => {
  await observation('dynasty-nerds', '101', 'Baseline Receiver', 100, '2026-09-01T08:00:00Z')
  await observation('dynasty-calculator', '101', 'Baseline Receiver', 10, '2026-09-01T08:05:00Z')
  await reconcileSleeperRoster(db, {
    http: sleeperHttp(['101']),
    now: new Date('2026-09-01T09:00:00Z'),
  })

  const addedAt = '2026-09-01T10:00:00Z'
  const added = {
    transaction_id: 'tx-add',
    type: 'waiver',
    status: 'complete',
    status_updated: Date.parse(addedAt),
    adds: { '202': 7 },
  }
  await observation('dynasty-nerds', '202', 'Added Receiver', 80, '2026-09-01T10:10:00Z')
  await observation('dynasty-calculator', '202', 'Added Receiver', 8, '2026-09-01T10:15:00Z')
  await reconcileSleeperRoster(db, {
    http: sleeperHttp(['101', '202'], [added]),
    now: new Date('2026-09-01T11:00:00Z'),
  })
  expect(await db.holding.count({ where: { player: { sleeperId: '202' }, closedAt: null } })).toBe(
    2,
  )

  const removedAt = '2026-09-01T20:00:00Z'
  const removed = {
    transaction_id: 'tx-remove',
    type: 'trade',
    status: 'complete',
    status_updated: Date.parse(removedAt),
    drops: { '202': 7 },
  }
  const result = await reconcileSleeperRoster(db, {
    http: sleeperHttp(['101'], [added, removed]),
    now: new Date('2026-09-01T21:00:00Z'),
  })
  expect(result.needsReview).toBe(0)
  const exits = await db.holding.findMany({
    where: { player: { sleeperId: '202' } },
    orderBy: { proceeds: 'desc' },
  })
  expect(exits).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ proceeds: 80, closedAt: new Date(removedAt) }),
      expect.objectContaining({ proceeds: 8, closedAt: new Date(removedAt) }),
    ]),
  )
  expect(new Set(exits.map((holding) => holding.exitMovementId))).toEqual(
    new Set(['sleeper:tx-remove:remove:202']),
  )
})

test('a provider whose first capture comes later still gets entries for players it can value', async () => {
  // A fresh database where Dynasty GM captures first, so the roster is baselined from it alone.
  await observation('dynasty-nerds', '101', 'Baseline Receiver', 100, '2026-09-01T08:00:00Z')
  await observation('dynasty-nerds', '202', 'Departing Receiver', 50, '2026-09-01T08:01:00Z')
  await reconcileSleeperRoster(db, {
    http: sleeperHttp(['101', '202']),
    now: new Date('2026-09-01T09:00:00Z'),
  })
  expect(await db.rosterMovement.count({ where: { kind: 'baseline', status: 'applied' } })).toBe(2)

  // The second player leaves before DTC's first capture, so only the first gains a DTC entry.
  const removed = {
    transaction_id: 'tx-exit',
    type: 'trade',
    status: 'complete',
    status_updated: Date.parse('2026-09-02T10:00:00Z'),
    drops: { '202': 7 },
  }
  await reconcileSleeperRoster(db, {
    http: sleeperHttp(['101'], [removed]),
    now: new Date('2026-09-02T11:00:00Z'),
  })
  await observation('dynasty-calculator', '101', 'Baseline Receiver', 10, '2026-09-03T08:00:00Z')
  await observation('dynasty-calculator', '202', 'Departing Receiver', 5, '2026-09-03T08:01:00Z')
  const result = await reconcileSleeperRoster(db, {
    http: sleeperHttp(['101'], [removed]),
    now: new Date('2026-09-03T09:00:00Z'),
  })

  const calculator = await db.holding.findMany({
    where: { sourceName: 'dynasty-calculator' },
    include: { player: true },
  })
  expect(calculator.map((h) => [h.player.sleeperId, h.costBasis, h.closedAt])).toEqual([
    ['101', 10, null],
  ])
  expect(result).toMatchObject({ pending: 0, needsReview: 0 })
  // Existing Dynasty GM entries and exits are untouched.
  const nerds = await db.holding.findMany({
    where: { sourceName: 'dynasty-nerds' },
    include: { player: true },
    orderBy: { costBasis: 'desc' },
  })
  expect(nerds.map((h) => [h.player.sleeperId, h.costBasis, Boolean(h.closedAt)])).toEqual([
    ['101', 100, false],
    ['202', 50, true],
  ])
})

test('keeps stale removals open until the last known value is explicitly accepted', async () => {
  await observation('dynasty-nerds', '303', 'Stale Receiver', 60, '2026-09-01T08:00:00Z')
  await observation('dynasty-calculator', '303', 'Stale Receiver', 6, '2026-09-01T08:05:00Z')
  const removedAt = '2026-09-05T20:00:00Z'
  await reconcileSleeperRoster(db, {
    http: sleeperHttp(
      [],
      [
        {
          transaction_id: 'tx-stale',
          type: 'trade',
          status: 'complete',
          status_updated: Date.parse(removedAt),
          drops: { '303': 7 },
        },
      ],
    ),
    now: new Date('2026-09-05T21:00:00Z'),
  })
  expect(await db.holding.count({ where: { closedAt: null, reviewReason: { not: null } } })).toBe(2)
  const before = await getRosterAutomation(db)
  expect(before.reviews).toHaveLength(2)
  expect(before.reviews.every((review) => review.canAcceptLastValue)).toBe(true)

  await acceptLastRemovalValue(db, before.reviews[0].id, new Date('2026-09-05T21:05:00Z'))
  const accepted = await db.holding.findFirst({ where: { closedAt: new Date(removedAt) } })
  expect(accepted).toMatchObject({ proceeds: before.reviews[0].suggestedValue, reviewReason: null })
  expect((await getRosterAutomation(db)).reviews).toHaveLength(1)
  await expect(acceptLastRemovalValue(db, before.reviews[0].id)).rejects.toMatchObject({
    status: 409,
  })
})

test('acknowledges an addition that never had an active provider context to value it', async () => {
  // Matched to a canonical player so the review item is about the missing value, not the match.
  await db.player.create({ data: { sleeperId: '101', name: 'Unvalued Receiver' } })
  await reconcileSleeperRoster(db, {
    http: sleeperHttp([]),
    now: new Date('2026-09-01T09:00:00Z'),
  })
  const added = {
    transaction_id: 'tx-add',
    type: 'waiver',
    status: 'complete',
    status_updated: Date.parse('2026-09-01T10:00:00Z'),
    adds: { '101': 7 },
  }
  await reconcileSleeperRoster(db, {
    http: sleeperHttp(['101'], [added]),
    now: new Date('2026-09-01T10:05:00Z'),
  })
  const movementId = 'sleeper:tx-add:add:101'
  expect(await db.rosterMovement.findUnique({ where: { id: movementId } })).toMatchObject({
    status: 'pending',
  })

  // Past the 36-hour window with no provider context ever active for this league.
  const stale = await reconcileSleeperRoster(db, {
    http: sleeperHttp(['101'], [added]),
    now: new Date('2026-09-02T23:00:00Z'),
  })
  expect(stale.needsReview).toBe(1)
  const before = await getRosterAutomation(db)
  expect(before.reviews).toHaveLength(1)
  expect(before.reviews[0]).toMatchObject({
    id: movementId,
    canAcknowledge: true,
    direction: 'add',
  })

  await acknowledgeMissingValue(db, movementId, new Date('2026-09-02T23:05:00Z'))
  expect(await db.rosterMovement.findUnique({ where: { id: movementId } })).toMatchObject({
    status: 'acknowledged',
  })
  const after = await getRosterAutomation(db)
  expect(after.reviews).toHaveLength(0)
  await expect(acknowledgeMissingValue(db, movementId)).rejects.toMatchObject({ status: 409 })

  // A later capture must not resurrect the item or retroactively open a holding.
  await observation('dynasty-nerds', '101', 'Late Receiver', 70, '2026-09-05T08:00:00Z')
  const later = await reconcileSleeperRoster(db, {
    http: sleeperHttp(['101'], [added]),
    now: new Date('2026-09-05T09:00:00Z'),
  })
  expect(later.needsReview).toBe(0)
  expect(await db.rosterMovement.findUnique({ where: { id: movementId } })).toMatchObject({
    status: 'acknowledged',
  })
  expect(await db.holding.count({ where: { player: { sleeperId: '101' } } })).toBe(0)
})

test('acknowledging one provider context leaves the other context untouched and does not reopen', async () => {
  await observation('dynasty-nerds', '101', 'Baseline Receiver', 100, '2026-09-01T08:00:00Z')
  await observation('dynasty-calculator', '101', 'Baseline Receiver', 10, '2026-09-01T08:05:00Z')
  await reconcileSleeperRoster(db, {
    http: sleeperHttp(['101']),
    now: new Date('2026-09-01T09:00:00Z'),
  })

  const addedAt = '2026-09-01T10:00:00Z'
  const added = {
    transaction_id: 'tx-add',
    type: 'waiver',
    status: 'complete',
    status_updated: Date.parse(addedAt),
    adds: { '202': 7 },
  }
  // Only Dynasty GM captures a value within the window; DTC never does.
  await observation('dynasty-nerds', '202', 'Added Receiver', 80, '2026-09-01T10:10:00Z')
  await reconcileSleeperRoster(db, {
    http: sleeperHttp(['101', '202'], [added]),
    now: new Date('2026-09-01T11:00:00Z'),
  })

  const stale = await reconcileSleeperRoster(db, {
    http: sleeperHttp(['101', '202'], [added]),
    now: new Date('2026-09-03T00:00:00Z'),
  })
  expect(stale.needsReview).toBe(1)
  const movementId = 'sleeper:tx-add:add:202'
  expect(
    await db.holding.count({
      where: { player: { sleeperId: '202' }, sourceName: 'dynasty-nerds' },
    }),
  ).toBe(1)
  expect(
    await db.holding.count({
      where: { player: { sleeperId: '202' }, sourceName: 'dynasty-calculator' },
    }),
  ).toBe(0)

  const before = await getRosterAutomation(db)
  const calculatorReview = before.reviews.find(
    (review) => review.movementId === movementId && review.sourceName === 'dynasty-calculator',
  )
  expect(calculatorReview).toMatchObject({ canAcknowledge: true, direction: 'add' })

  await acknowledgeMissingValue(db, calculatorReview!.id, new Date('2026-09-03T00:05:00Z'))
  expect(await db.rosterMovement.findUnique({ where: { id: movementId } })).toMatchObject({
    status: 'acknowledged',
  })
  expect((await getRosterAutomation(db)).reviews).toHaveLength(0)

  // A later DTC capture must not reopen the acknowledged context.
  await observation('dynasty-calculator', '202', 'Added Receiver', 8, '2026-09-05T08:00:00Z')
  const later = await reconcileSleeperRoster(db, {
    http: sleeperHttp(['101', '202'], [added]),
    now: new Date('2026-09-05T09:00:00Z'),
  })
  expect(later.needsReview).toBe(0)
  expect(
    await db.holding.count({
      where: { player: { sleeperId: '202' }, sourceName: 'dynasty-calculator' },
    }),
  ).toBe(0)
  expect(await db.rosterMovement.findUnique({ where: { id: movementId } })).toMatchObject({
    status: 'acknowledged',
  })
})
