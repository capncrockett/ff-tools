import { config } from 'dotenv'
import os from 'node:os'
import path from 'node:path'

// Environment variables take precedence, then ignored local secrets, then old defaults.
if (process.env.NODE_ENV !== 'test') {
  config({ path: '.env.local', quiet: true })
  config({ path: '.env', quiet: true })
}
// Tests delete every tracker table, so test mode must never fall back to the real local database (S14).
if (process.env.NODE_ENV === 'test' && !process.env.DATABASE_URL)
  throw new Error('Test mode requires a throwaway DATABASE_URL. Run tests with npm test.')
process.env.DATABASE_URL ??= 'file:./dev.db'

export const localDir = path.resolve(process.cwd(), '.local')
// Outside the repository, so deleting or re-cloning the checkout cannot take the backups too.
// Test mode has no backup folder at all, so tests can never write into the real one.
export const backupDir =
  process.env.NODE_ENV === 'test'
    ? null
    : path.resolve(process.env.TRACKER_BACKUP_DIR || path.join(os.homedir(), 'ff-tools-backups'))

// Prisma resolves a relative SQLite path from the schema folder.
export function databaseFile(url = process.env.DATABASE_URL ?? '') {
  if (!url.startsWith('file:')) return null
  const file = url.slice('file:'.length).split('?')[0]
  return path.isAbsolute(file) ? file : path.resolve(process.cwd(), 'prisma', file)
}

// The driver adapter and prisma.config.ts both need an absolute file: URL, or a relative one
// resolves against the process's cwd instead of prisma/ and quietly opens an empty database.
export function resolvedDatabaseUrl(url = process.env.DATABASE_URL ?? '') {
  const file = databaseFile(url)
  return file ? `file:${file.replaceAll('\\', '/')}` : url
}
// User-confirmed limit: at most one refresh per source per hour, including failed attempts.
export const syncSuccessMs = 60 * 60 * 1000
export const syncFailureMs = 60 * 60 * 1000
export const rosterRefreshMs = 60 * 60 * 1000

export const sleeperLeagueId = process.env.SLEEPER_LEAGUE_ID || '1378427936817815552'
export const sleeperOwnerId = process.env.SLEEPER_USER_ID || '82289736559247360'
export const sleeperLeagueName = process.env.SLEEPER_LEAGUE_NAME || 'A League For All Seasons'
