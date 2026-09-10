import type { AxiosInstance } from 'axios'
import { PrismaClient } from '@prisma/client'
import {
  acceptLastRemovalValue,
  getRosterAutomation,
  reconcileSleeperRoster,
} from '../../src/server/services/rosterAutomation'
import { saveSnapshot } from '../../src/server/services/valuations'

const db = new PrismaClient()
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
