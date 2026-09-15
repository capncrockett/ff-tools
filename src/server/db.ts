import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { resolvedDatabaseUrl } from './config.js'
import { PrismaClient } from './generated/prisma/client.js'

const adapter = new PrismaBetterSqlite3(
  { url: resolvedDatabaseUrl() },
  { timestampFormat: 'unixepoch-ms' },
)
export const prisma = new PrismaClient({ adapter })
