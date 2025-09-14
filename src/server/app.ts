import express from 'express'
import cors from 'cors'
import { registerApiRoutes } from './routes/api.js'

export function createApp() {
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '1mb' }))
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'ff-tools', ts: Date.now() })
  })
  registerApiRoutes(app)
  return app
}

export const app = createApp()

