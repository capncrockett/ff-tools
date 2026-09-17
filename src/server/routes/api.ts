import type { Express, RequestHandler } from 'express'
import type { PrismaClient } from '../generated/prisma/client.js'
import { z } from 'zod'
import { sourceSchema, contextSchema } from '../../shared/tracker.js'
import { getAdpData } from '../services/adp.js'
import { getKeeperData } from '../services/keeper.js'
import { dynastyNerdsProvider } from '../providers/dynastyNerds.js'
import { dynastyCalculatorProvider } from '../providers/dynastyCalculator.js'
import { matchProviderCatalogs } from '../services/playerCatalogs.js'
import { listPlayers, seedPlayersFromSleeper } from '../services/players.js'
import { DataError, getMarket, parseCsvSnapshot, saveSnapshot } from '../services/valuations.js'
import { addHolding, closeHolding, getHoldings } from '../services/holdings.js'
import { getSourceStatuses, syncSource } from '../services/sync.js'
import {
  acceptLastRemovalValue,
  acknowledgeMissingValue,
  getRosterAutomation,
  reconcileSleeperRoster,
} from '../services/rosterAutomation.js'

const route =
  (handler: RequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next)
  }
export function registerApiRoutes(app: Express, injected?: PrismaClient) {
  const database = async () => injected ?? (await import('../db.js')).prisma
  app.get(
    '/api/sleeper-tools/adp',
    route(async (_req, res) => {
      res.json(await getAdpData())
    }),
  )
  app.get(
    '/api/sleeper-tools/keeper-data',
    route(async (_req, res) => {
      res.json(await getKeeperData())
    }),
  )
  app.get(
    '/api/tracker',
    route(async (_req, res) => {
      const db = await database()
      const market = await getMarket(db)
      const [holdings, sources, roster] = await Promise.all([
        getHoldings(db, market),
        getSourceStatuses(db),
        getRosterAutomation(db),
      ])
      res.json({ market, holdings, sources, roster })
    }),
  )
  app.post(
    '/api/roster/reconcile',
    route(async (_req, res) => {
      res.json(await reconcileSleeperRoster(await database()))
    }),
  )
  app.post(
    '/api/roster/reviews/:id/accept-last-value',
    route(async (req, res) => {
      res.json(await acceptLastRemovalValue(await database(), z.string().parse(req.params.id)))
    }),
  )
  app.post(
    '/api/roster/reviews/:id/acknowledge',
    route(async (req, res) => {
      res.json(await acknowledgeMissingValue(await database(), z.string().parse(req.params.id)))
    }),
  )
  app.post(
    '/api/sync/:source',
    route(async (req, res) => {
      const source = sourceSchema.parse(req.params.source)
      if (req.query.dry_run === '1')
        return res.json([
          { source, playerName: 'Sample Player', value: 123, capturedAt: new Date().toISOString() },
        ])
      res.json(
        await syncSource(
          await database(),
          source,
          source === 'dynasty-nerds' ? dynastyNerdsProvider : dynastyCalculatorProvider,
        ),
      )
    }),
  )
  app.post(
    '/api/snapshots/import',
    route(async (req, res) => {
      res.json(await saveSnapshot(await database(), req.body))
    }),
  )
  app.post(
    '/api/valuations/import',
    route(async (req, res) => {
      const source = sourceSchema.parse(req.query.source)
      const context = contextSchema.parse({
        label: req.query.format,
        settings: { format: req.query.format },
      })
      if (typeof req.body !== 'string') throw new DataError('Upload CSV as text/csv.')
      res.json(
        await saveSnapshot(await database(), parseCsvSnapshot(req.body, source, context), 'csv'),
      )
    }),
  )
  app.get(
    '/api/valuations/latest',
    route(async (req, res) => {
      const source = req.query.source ? sourceSchema.parse(req.query.source) : undefined
      const limit = z.coerce.number().int().min(1).max(10000).default(200).parse(req.query.limit)
      res.json(
        (await getMarket(await database()))
          .filter((r) => !source || r.source === source)
          .slice(0, limit),
      )
    }),
  )
  app.get(
    '/api/timeseries/:playerId',
    route(async (req, res) => {
      const playerId = z.coerce.number().int().positive().parse(req.params.playerId)
      res.json(
        (await getMarket(await database(), playerId)).map((r) => ({
          source: r.source,
          contextKey: r.contextKey,
          contextLabel: r.contextLabel,
          history: r.history,
        })),
      )
    }),
  )
  app.post(
    '/api/holdings',
    route(async (req, res) => {
      res.status(201).json(await addHolding(await database(), req.body))
    }),
  )
  app.post(
    '/api/holdings/:id/exit',
    route(async (req, res) => {
      res.json(await closeHolding(await database(), z.string().parse(req.params.id), req.body))
    }),
  )
  app.get(
    '/api/export',
    route(async (_req, res) => {
      const db = await database()
      const [observations, holdings] = await Promise.all([
        db.valuation.findMany({
          include: { player: true, source: true, snapshot: true },
          orderBy: { capturedAt: 'asc' },
        }),
        db.holding.findMany({ include: { player: true } }),
      ])
      // Deliberate allowlist: export contains no account/session or raw provider responses.
      const rows = observations.map((v) => ({
        playerId: v.playerId,
        playerName: v.player.name,
        sleeperId: v.player.sleeperId,
        position: v.player.position,
        team: v.player.team,
        source: v.source.name,
        sourceKey: v.sourceKey,
        value: v.value,
        capturedAt: v.capturedAt,
        contextKey: v.contextKey,
        context: v.snapshot ? JSON.parse(v.snapshot.contextJson) : null,
      }))
      res
        .attachment(`dynasty-history-${new Date().toISOString().slice(0, 10)}.json`)
        .json({ version: 1, exportedAt: new Date().toISOString(), observations: rows, holdings })
    }),
  )
  app.get(
    '/api/players',
    route(async (req, res) => {
      const params = z
        .object({
          search: z.string().max(100).optional(),
          position: z.string().max(5).optional(),
          limit: z.coerce.number().int().min(1).max(200).optional(),
        })
        .parse(req.query)
      res.json(await listPlayers({ ...params, prisma: await database() }))
    }),
  )
  app.post(
    '/api/players/seed',
    route(async (req, res) => {
      if (req.query.dry_run === '1') return res.json({ created: 0, upserts: 0, total: 2 })
      const db = await database()
      const seeded = await seedPlayersFromSleeper({ prisma: db })
      res.json({ ...seeded, matching: await matchProviderCatalogs(db) })
    }),
  )
}
