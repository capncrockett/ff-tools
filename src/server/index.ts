import 'dotenv/config'
import path from 'node:path'
import { logger } from './logger.js'
import express from 'express'
import { z } from 'zod'
import { app } from './app.js'

// Serve built client
const clientDir = path.resolve(process.cwd(), 'dist/client')
app.use(express.static(clientDir))
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'))
})

const portSchema = z.coerce.number().int().min(1).max(65535)
const PORT = portSchema.parse(process.env.PORT ?? 3000)

app.listen(PORT, () => {
  logger.info({ PORT }, 'Server listening')
})
