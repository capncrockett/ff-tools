import './config.js'
import path from 'node:path'
import express from 'express'
import { z } from 'zod'
import { logger } from './logger.js'
import { app, errors } from './app.js'
import { backupTrackerDatabase } from './services/backup.js'
const clientDir = path.resolve(process.cwd(), 'dist/client')
app.use(express.static(clientDir))
app.get('*', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')))
// Registered after the static and SPA layers so their failures reach the JSON handler.
app.use(errors)
const port = z.coerce
  .number()
  .int()
  .min(1)
  .max(65535)
  .parse(process.env.PORT ?? 3000)
app.listen(port, '127.0.0.1', () => logger.info({ port }, 'Dynasty tracker listening on 127.0.0.1'))

// Back up at startup and hourly while running; unchanged databases are skipped.
async function scheduledBackup() {
  try {
    const result = await backupTrackerDatabase('scheduled')
    if (result.status === 'created') logger.info({ file: result.file }, 'Database backup saved')
  } catch {
    logger.warn('Database backup failed. New history is unprotected until a backup succeeds.')
  }
}
void scheduledBackup()
setInterval(() => void scheduledBackup(), 60 * 60 * 1000).unref()
