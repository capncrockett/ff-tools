import express, { type ErrorRequestHandler } from 'express'
import { registerApiRoutes } from './routes/api.js'
import { logger } from './logger.js'
import { z } from 'zod'
import { DataError } from './services/valuations.js'
import type { PrismaClient } from './generated/prisma/client.js'

export function createApp(db?: PrismaClient) {
  const app = express()
  app.disable('x-powered-by')
  app.use((req, res, next) => {
    const host = req.hostname
    if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(host))
      return res.status(403).json({ error: 'This tracker is available on localhost only.' })
    const origin = req.headers.origin
    if (origin) {
      try {
        const url = new URL(origin)
        if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.protocol !== 'http:')
          return res.status(403).json({ error: 'Local origin required.' })
        if (![String(process.env.PORT || 3000), '5173', '4173', '4174'].includes(url.port))
          return res.status(403).json({ error: 'Unrecognized local app origin.' })
      } catch {
        return res.status(403).json({ error: 'Invalid origin.' })
      }
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('x-tracker-request') !== '1')
      return res.status(403).json({ error: 'A tracker request header is required.' })
    res.setHeader('Cache-Control', 'no-store')
    res.on('finish', () =>
      logger.info({ method: req.method, path: req.path, status: res.statusCode }, 'request'),
    )
    next()
  })
  app.use(express.json({ limit: '3mb' }))
  app.use(express.text({ type: ['text/csv', 'application/csv'], limit: '3mb' }))
  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'ff-tools', ts: Date.now() }))
  registerApiRoutes(app, db)
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }))
  app.use(errors)
  return app
}

// Exported so a caller that appends its own routes can register it last. Express only
// reaches an error handler registered after the layer that failed.
export const errors: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof z.ZodError)
    return res
      .status(400)
      .json({ error: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') })
  if (error instanceof DataError) return res.status(error.status).json({ error: error.message })
  if (error instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON.' })
  logger.error({ kind: error instanceof Error ? error.name : 'unknown' }, 'Request failed')
  res
    .status(500)
    .json({ error: 'Unable to complete the request. Check the local database and server setup.' })
}
export const app = createApp()
