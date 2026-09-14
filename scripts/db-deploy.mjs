import { config } from 'dotenv'
import path from 'node:path'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
config({ path: '.env.local', quiet: true })
config({ path: '.env', quiet: true })
const url = process.env.DATABASE_URL || 'file:./dev.db'
if (!url.startsWith('file:')) throw new Error('The local tracker requires a SQLite file URL.')
const filename = path.resolve('prisma', url.slice(5))
fs.mkdirSync(path.dirname(filename), { recursive: true })
// Migrations can rewrite tables, so never migrate existing data without a verified backup.
// Imported after dotenv so the backup uses the same database and folder as the app.
const { backupTrackerDatabase } = await import('../src/server/services/backup.ts')
try {
  const backup = await backupTrackerDatabase('pre-migrate')
  if (backup.status === 'created') console.log(`Database backup saved: ${backup.file}`)
} catch {
  console.error('Database backup failed, so migrations were not run. Nothing was changed.')
  process.exit(1)
}
// Prisma 6 on this Windows/Node combination cannot migrate a missing SQLite file. Opening in append
// mode never changes an existing file; for a new one, an empty file is a valid empty database.
fs.closeSync(fs.openSync(filename, 'a'))
const result = spawnSync(
  process.execPath,
  ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
  { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } },
)
process.exitCode = result.status ?? 1
