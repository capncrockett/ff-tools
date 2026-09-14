import { databaseFile } from '../config.js'

// Agents and people inspect the tracker database through this path only. The connection is opened
// read-only and query_only, so SQLite itself rejects writes. The statement allowlist additionally
// blocks VACUUM INTO and ATTACH, which a read-only connection could still use to write other files.
const readStatement = /^\s*(select|with|explain)\b/i

export type QueryResult = { rows: Record<string, unknown>[]; total: number }

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
  // Loaded lazily: Node prints an experimental-feature warning the first time this module loads.
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(file, { readOnly: true, timeout: 5_000 })
  try {
    db.exec('PRAGMA query_only = ON')
    const rows = db.prepare(statement).all()
    return { rows: rows.slice(0, options.maxRows ?? 500), total: rows.length }
  } finally {
    db.close()
  }
}

export const tableListQuery =
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_prisma%' ESCAPE '\\' ORDER BY name"
