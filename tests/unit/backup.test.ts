import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  backupDatabase,
  backupTrackerDatabase,
  listBackups,
  restoreDatabase,
} from '../../src/server/services/backup'

// Every database here is a throwaway file in the system temp folder.
let dir: string
let databaseFile: string
let backupDir: string
const exec = (sql: string, file = databaseFile) => {
  const db = new DatabaseSync(file)
  db.exec(sql)
  db.close()
}
const count = (file: string) => {
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    return Number(db.prepare('SELECT count(*) AS n FROM valuation').get()?.n)
  } finally {
    db.close()
  }
}
// Filesystem timestamps can be coarse; move the write clearly past the last backup.
const markChanged = () => {
  const later = new Date(Date.now() + 5_000)
  return fs.utimes(databaseFile, later, later)
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tracker-backup-test-'))
  databaseFile = path.join(dir, 'tracker.db')
  backupDir = path.join(dir, 'backups')
  exec(
    'CREATE TABLE valuation (id INTEGER PRIMARY KEY, value INTEGER); INSERT INTO valuation (value) VALUES (10), (20)',
  )
  // A write in the same millisecond as a backup's start is indistinguishable from a later write
  // (the backup is then simply repeated), so date the fixture clearly before any backup.
  const earlier = new Date(Date.now() - 60_000)
  await fs.utimes(databaseFile, earlier, earlier)
})
afterEach(() => fs.rm(dir, { recursive: true, force: true }))

test('saves a verified compressed copy only when the database changed, and never deletes one', async () => {
  const first = await backupDatabase({ databaseFile, backupDir, reason: 'pre-capture' })
  expect(first).toMatchObject({
    status: 'created',
    file: expect.stringMatching(/tracker-\d{8}T\d{9}Z-pre-capture\.db\.gz$/),
  })
  expect(await backupDatabase({ databaseFile, backupDir, reason: 'scheduled' })).toMatchObject({
    status: 'skipped',
    reason: expect.stringContaining('not changed'),
  })
  exec('INSERT INTO valuation (value) VALUES (30)')
  await markChanged()
  expect(await backupDatabase({ databaseFile, backupDir, reason: 'scheduled' })).toMatchObject({
    status: 'created',
  })
  // A forced backup in the same millisecond gets its own name instead of replacing another.
  const now = new Date()
  const forced = await Promise.all(
    [
      backupDatabase({ databaseFile, backupDir, reason: 'manual', force: true, now }),
      backupDatabase({ databaseFile, backupDir, reason: 'manual', force: true, now }),
    ].map((p) => p.then((r) => (r.status === 'created' ? r.file : ''))),
  )
  expect(new Set(forced).size).toBe(2)
  expect(await listBackups(backupDir)).toHaveLength(4)
  expect((await fs.readdir(backupDir)).filter((name) => name.includes('partial'))).toEqual([])
})

test('restoring backs up the current database first, so a restore can itself be undone', async () => {
  const good = await backupDatabase({ databaseFile, backupDir, reason: 'scheduled' })
  if (good.status !== 'created') throw new Error('expected a backup')
  exec('DELETE FROM valuation')
  await markChanged()
  expect(count(databaseFile)).toBe(0)

  const restored = await restoreDatabase({ databaseFile, backupDir, backupFile: good.file })
  expect(count(databaseFile)).toBe(2)
  expect(restored.safety).toMatchObject({
    status: 'created',
    file: expect.stringContaining('pre-restore'),
  })
  if (restored.safety.status !== 'created') throw new Error('expected a safety backup')
  const undo = path.join(dir, 'undo.db')
  await restoreDatabase({ databaseFile: undo, backupDir, backupFile: restored.safety.file })
  expect(count(undo)).toBe(0)
})

test('restore refuses unfinished transactions and unreadable backups without touching the database', async () => {
  const good = await backupDatabase({ databaseFile, backupDir, reason: 'scheduled' })
  if (good.status !== 'created') throw new Error('expected a backup')
  await fs.writeFile(`${databaseFile}-journal`, 'hot journal')
  await expect(restoreDatabase({ databaseFile, backupDir, backupFile: good.file })).rejects.toThrow(
    'unfinished transaction',
  )
  await fs.rm(`${databaseFile}-journal`)

  const corrupt = path.join(dir, 'corrupt.db')
  await fs.writeFile(corrupt, 'not a database')
  await expect(restoreDatabase({ databaseFile, backupDir, backupFile: corrupt })).rejects.toThrow()
  expect(count(databaseFile)).toBe(2)
  expect(await listBackups(backupDir)).toHaveLength(1)
})

test('test mode has no backup folder, so tests never back up into the real one', async () => {
  expect(await backupTrackerDatabase('scheduled')).toEqual({
    status: 'skipped',
    reason: 'Backups are off in test mode.',
  })
  expect(
    await backupDatabase({ databaseFile: path.join(dir, 'missing.db'), backupDir, reason: 'x' }),
  ).toMatchObject({
    status: 'skipped',
  })
})
