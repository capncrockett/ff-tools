import type { Express, Request, Response } from 'express'
import { z } from 'zod'
import { getAdpData } from '../services/adp.js'
import { getKeeperData } from '../services/keeper.js'

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
}

