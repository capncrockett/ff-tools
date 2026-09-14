import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { queryDatabaseReadOnly, tableListQuery } from '../../src/server/services/databaseQuery'

// A throwaway database in the system temp folder; the tracker database is never opened here.
let dir: string
let file: string
const count = () => {
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    return Number(db.prepare('SELECT count(*) AS n FROM valuation').get()?.n)
  } finally {
    db.close()
  }
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-query-test-'))
  file = path.join(dir, 'tracker.db')
  const db = new DatabaseSync(file)
  db.exec(
    'CREATE TABLE valuation (id INTEGER PRIMARY KEY, value INTEGER); INSERT INTO valuation (value) VALUES (10), (20), (30)',
  )
  db.close()
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
  // Allowed prefixes cannot smuggle a write past SQLite's read-only connection.
  await expect(
    queryDatabaseReadOnly('WITH gone AS (SELECT 1) DELETE FROM valuation', { file }),
  ).rejects.toThrow()
  await queryDatabaseReadOnly('SELECT 1; DELETE FROM valuation', { file }).catch(() => null)
  expect(count()).toBe(3)
  expect((await fs.readdir(dir)).sort()).toEqual(['tracker.db'])
})
