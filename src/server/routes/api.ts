import type { Express, Request, Response } from 'express'
import { z } from 'zod'
import { getAdpData } from '../services/adp.js'
import { getKeeperData } from '../services/keeper.js'
import { dynastyNerdsProvider } from '../providers/dynastyNerds.js'
import { dynastyCalculatorProvider } from '../providers/dynastyCalculator.js'

export function registerApiRoutes(app: Express) {
  app.get('/api/sleeper-tools/adp', async (_req: Request, res: Response) => {
    try {
      const data = await getAdpData()
      res.json(data)
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to load ADP' })
    }
  })

  app.get('/api/sleeper-tools/keeper-data', async (_req: Request, res: Response) => {
    try {
      const data = await getKeeperData()
      res.json(data)
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to load keeper data' })
    }
  })

  // Sync endpoints for value sources
  app.post('/api/sync/:source', async (req: Request, res: Response) => {
    const params = z.object({ source: z.enum(['dynasty-nerds', 'dynasty-calculator']) }).safeParse(req.params)
    if (!params.success) return res.status(400).json({ error: 'invalid source' })
    const source = params.data.source

    // Dry-run returns local samples to avoid live scraping in tests
    const dryRun = String(req.query.dry_run || '') === '1'
    if (dryRun) {
      // Minimal samples
      return res.json([
        { playerName: 'Sample Player', value: 123, source, capturedAt: new Date().toISOString() },
      ])
    }

    try {
      const provider = source === 'dynasty-nerds' ? dynastyNerdsProvider : dynastyCalculatorProvider
      const data = await provider.run({ headless: true })
      res.json(data)
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'sync failed' })
    }
  })
}
