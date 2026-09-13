import './config.js'
import path from 'node:path'
import express from 'express'
import { z } from 'zod'
import { logger } from './logger.js'
import { app, errors } from './app.js'
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
