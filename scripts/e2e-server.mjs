import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

// Every browser suite gets an isolated SQLite database. Never load local credentials.
fs.mkdirSync('.local', { recursive: true })
const dir = fs.mkdtempSync(path.resolve('.local', 'e2e-'))
// Prisma cannot migrate a missing SQLite file here; an empty file is a valid empty database.
fs.closeSync(fs.openSync(path.join(dir, 'test.db'), 'a'))
Object.assign(process.env, {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  PORT: '4174',
  DATABASE_URL: `file:${path.join(dir, 'test.db').replaceAll('\\', '/')}`,
  DYNASTY_NERDS_EMAIL: 'fixture@example.test',
  DYNASTY_NERDS_PASSWORD: 'fixture-only',
  DYNASTY_CALC_EMAIL: 'fixture@example.test',
  DYNASTY_CALC_PASSWORD: 'fixture-only',
})
const migration = spawnSync(
  process.execPath,
  ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
  { env: process.env, stdio: 'inherit' },
)
if (migration.status !== 0) process.exit(migration.status ?? 1)
const [{ default: express }, { createServer }, { createApp }, { prisma }] = await Promise.all([
  import('express'),
  import('vite'),
  import('../src/server/app.ts'),
  import('../src/server/db.ts'),
])
const app = express()
// Browser tests can exercise failures, but cannot reach a paid provider or fetch the Sleeper catalog.
app.use('/api/sync', (_req, res) =>
  res
    .status(502)
    .json({ error: 'Fixture provider unavailable. Saved history is still available.' }),
)
app.use('/api/players/seed', (_req, res) =>
  res.status(403).json({ error: 'External fetches are disabled in browser tests.' }),
)
app.use('/api/roster/reconcile', (_req, res) =>
  res.status(403).json({ error: 'External fetches are disabled in browser tests.' }),
)
app.use(createApp(prisma))
const vite = await createServer({
  configFile: 'vite.config.ts',
  server: { middlewareMode: true, hmr: false },
})
app.use(vite.middlewares)
const server = app.listen(4174, '127.0.0.1', () => console.log('Isolated browser test app ready'))
let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  await new Promise((resolve) => server.close(resolve))
  await vite.close()
  await prisma.$disconnect()
  if (path.dirname(dir) === path.resolve('.local')) fs.rmSync(dir, { recursive: true, force: true })
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
