import fs from 'node:fs/promises'
import { databaseFile } from '../config.js'
import { withSqliteFile } from './backup.js'

// Agents and people inspect the tracker database through this path only. The single connection sets
// query_only, so SQLite itself rejects writes. The statement allowlist additionally blocks VACUUM
// INTO and ATTACH, which could otherwise write other files.
const readStatement = /^\s*(select|with|explain)\b/i

export type QueryResult = { rows: Record<string, unknown>[]; total: number }

// Counts arrive as BigInt; plain numbers keep results printable as JSON.
const plain = (row: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      typeof value === 'bigint'
        ? Number.isSafeInteger(Number(value))
          ? Number(value)
          : value.toString()
        : value,
    ]),
  )

export async function queryDatabaseReadOnly(
  sql: string,
  options: { file?: string | null; maxRows?: number } = {},
): Promise<QueryResult> {
  const file = options.file === undefined ? databaseFile() : options.file
  if (!file) throw new Error('Only SQLite file databases can be queried.')
  const statement = sql.trim().replace(/;\s*$/, '')
  if (!readStatement.test(statement))
    throw new Error(
      'Only SELECT, WITH, and EXPLAIN queries are allowed; the database is read-only.',
    )
  // Opening a missing path would create an empty database, so require the file to exist.
  if (!(await fs.stat(file).catch(() => null))) throw new Error('No database file exists there.')
  return withSqliteFile(file, async (db) => {
    await db.$executeRawUnsafe('PRAGMA query_only = ON')
    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(statement)
    return { rows: rows.slice(0, options.maxRows ?? 500).map(plain), total: rows.length }
  })
}

export const tableListQuery =
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_prisma%' ESCAPE '\\' ORDER BY name"
