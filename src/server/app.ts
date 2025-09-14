import express from 'express'
import cors from 'cors'
import { registerApiRoutes } from './routes/api.js'
import pinoHttp from 'pino-http'
import { logger } from './logger.js'

export function createApp() {
  const app = express()
  app.use(pinoHttp({ logger }))
  app.use(cors())
  app.use(express.json({ limit: '1mb' }))
  app.use(express.text({ type: ['text/*', 'application/csv', 'text/csv'], limit: '1mb' }))
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'ff-tools', ts: Date.now() })
  })
  registerApiRoutes(app)
  return app
}

export const app = createApp()
