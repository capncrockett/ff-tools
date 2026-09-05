import './config.js'
import path from 'node:path'
import express from 'express'
import { z } from 'zod'
import { logger } from './logger.js'
import { app } from './app.js'
const clientDir = path.resolve(process.cwd(), 'dist/client')
app.use(express.static(clientDir))
app.get('*', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')))
const port = z.coerce
  .number()
  .int()
  .min(1)
  .max(65535)
  .parse(process.env.PORT ?? 3000)
app.listen(port, '127.0.0.1', () => logger.info({ port }, 'Dynasty tracker listening on 127.0.0.1'))
