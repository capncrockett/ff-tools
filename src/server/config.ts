import { config } from 'dotenv'
import path from 'node:path'

// Environment variables take precedence, then ignored local secrets, then old defaults.
if (process.env.NODE_ENV !== 'test') {
  config({ path: '.env.local', quiet: true })
  config({ path: '.env', quiet: true })
}
process.env.DATABASE_URL ??= 'file:./dev.db'

export const localDir = path.resolve(process.cwd(), '.local')
// User-confirmed limit: at most one refresh per source per hour, including failed attempts.
export const syncSuccessMs = 60 * 60 * 1000
export const syncFailureMs = 60 * 60 * 1000
