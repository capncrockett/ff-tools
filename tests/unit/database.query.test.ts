import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { withSqliteFile } from '../../src/server/services/backup'
import { queryDatabaseReadOnly, tableListQuery } from '../../src/server/services/databaseQuery'

// A throwaway database in the system temp folder; the tracker database is never opened here.
let dir: string
let file: string
const count = () =>
  withSqliteFile(file, async (db) => {
    const [row] = await db.$queryRawUnsafe<{ n: bigint }[]>('SELECT count(*) AS n FROM valuation')
    return Number(row.n)
  })

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-query-test-'))
  file = path.join(dir, 'tracker.db')
  await fs.writeFile(file, '')
  await withSqliteFile(file, async (db) => {
    await db.$executeRawUnsafe('CREATE TABLE valuation (id INTEGER PRIMARY KEY, value INTEGER)')
    await db.$executeRawUnsafe('INSERT INTO valuation (value) VALUES (10), (20), (30)')
  })
})
afterEach(() => fs.rm(dir, { recursive: true, force: true }))

test('reads rows and caps how many are returned', async () => {
  expect(
    await queryDatabaseReadOnly('SELECT value FROM valuation ORDER BY value;', { file }),
  ).toEqual({
    rows: [{ value: 10 }, { value: 20 }, { value: 30 }],
    total: 3,
  })
  expect(
    await queryDatabaseReadOnly('WITH v AS (SELECT value FROM valuation) SELECT * FROM v', {
      file,
      maxRows: 1,
    }),
  ).toEqual({ rows: [{ value: 10 }], total: 3 })
  expect((await queryDatabaseReadOnly(tableListQuery, { file })).rows).toEqual([
    { name: 'valuation' },
  ])
})

test('no statement can change the database or write another file', async () => {
  for (const sql of [
    'DELETE FROM valuation',
    'UPDATE valuation SET value = 0',
    'INSERT INTO valuation (value) VALUES (1)',
    'DROP TABLE valuation',
    'PRAGMA journal_mode = WAL',
    `VACUUM INTO '${path.join(dir, 'copy.db')}'`,
    `ATTACH DATABASE '${path.join(dir, 'other.db')}' AS other`,
  ])
    await expect(queryDatabaseReadOnly(sql, { file })).rejects.toThrow(
      'Only SELECT, WITH, and EXPLAIN',
    )
  // Allowed prefixes cannot smuggle a write past SQLite's query_only connection.
  await expect(
    queryDatabaseReadOnly('WITH gone AS (SELECT 1) DELETE FROM valuation', { file }),
  ).rejects.toThrow()
  await queryDatabaseReadOnly('SELECT 1; DELETE FROM valuation', { file }).catch(() => null)
  expect(await count()).toBe(3)
  expect((await fs.readdir(dir)).sort()).toEqual(['tracker.db'])
  // A missing path is refused rather than created as an empty database.
  await expect(
    queryDatabaseReadOnly('SELECT 1', { file: path.join(dir, 'missing.db') }),
  ).rejects.toThrow('No database file')
  expect((await fs.readdir(dir)).sort()).toEqual(['tracker.db'])
})
