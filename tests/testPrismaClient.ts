import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { resolvedDatabaseUrl } from '../src/server/config.js'
import { PrismaClient } from '../src/server/generated/prisma/client.js'

// Shared factory for tests that need a real PrismaClient. Resolves the same throwaway
// .local/test-*/test.db path databaseGuard.ts validates, with the same date encoding db.ts uses.
export function createTestPrismaClient() {
  const adapter = new PrismaBetterSqlite3(
    { url: resolvedDatabaseUrl() },
    { timestampFormat: 'unixepoch-ms' },
  )
  return new PrismaClient({ adapter })
}
