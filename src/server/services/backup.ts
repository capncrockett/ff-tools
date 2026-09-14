import { createReadStream, createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createGunzip, createGzip } from 'node:zlib'
import { backupDir, databaseFile } from '../config.js'

// The tracker database is the only copy of captured history, so backups are compressed,
// integrity-checked SQLite copies that are never deleted automatically.
export type BackupResult =
  { status: 'created'; file: string; bytes: number } | { status: 'skipped'; reason: string }

const backupName = /^tracker-(\d{8}T\d{9}Z)-([a-z-]+)\.db\.gz$/

export async function listBackups(dir: string) {
  const names = await fs.readdir(dir).catch(() => [] as string[])
  const files = names.filter((name) => backupName.test(name)).sort()
  return files.reverse().map((name) => path.join(dir, name))
}

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

async function verifySqlite(file: string) {
  // Loaded lazily: Node prints an experimental-feature warning the first time this module loads.
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    const result = db.prepare('PRAGMA integrity_check').get()
    const tables = db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'").get()
    if (result?.integrity_check !== 'ok' || !Number(tables?.n))
      throw new Error('The database copy failed its integrity check.')
  } finally {
    db.close()
  }
}

export async function backupDatabase(options: {
  databaseFile: string
  backupDir: string
  reason: string
  force?: boolean
  now?: Date
}): Promise<BackupResult> {
  const source = await fs.stat(options.databaseFile).catch(() => null)
  if (!source?.size) return { status: 'skipped', reason: 'No database file to back up yet.' }
  const [newest] = await listBackups(options.backupDir)
  // A backup's mtime is set to when it started, so any write during or after it triggers another.
  if (!options.force && newest && (await fs.stat(newest)).mtimeMs >= source.mtimeMs)
    return { status: 'skipped', reason: 'The database has not changed since the last backup.' }

  const started = options.now ?? new Date()
  const reason = options.reason.toLowerCase().replace(/[^a-z]+/g, '-') || 'manual'
  await fs.mkdir(options.backupDir, { recursive: true })
  // Never replace an existing backup, even one started concurrently in the same millisecond.
  // An exclusive lock file reserves the name; the recheck catches a backup that finished between
  // the first check and the lock.
  let file = ''
  for (let stampTime = +started; !file; stampTime++) {
    const stamp = new Date(stampTime).toISOString().replace(/[-:.]/g, '')
    const candidate = path.join(options.backupDir, `tracker-${stamp}-${reason}.db.gz`)
    if (await fs.stat(candidate).catch(() => null)) continue
    const locked = await fs.writeFile(`${candidate}.lock`, '', { flag: 'wx' }).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'EEXIST') return false
        throw error
      },
    )
    if (!locked) continue
    if (await fs.stat(candidate).catch(() => null)) await fs.rm(`${candidate}.lock`)
    else file = candidate
  }
  const copy = `${file}.copy.partial`
  try {
    const { DatabaseSync } = await import('node:sqlite')
    // VACUUM INTO takes a consistent snapshot even while the app holds the database open.
    const db = new DatabaseSync(options.databaseFile, { readOnly: true, timeout: 15_000 })
    try {
      db.exec(`VACUUM INTO ${sqlString(copy)}`)
    } finally {
      db.close()
    }
    await verifySqlite(copy)
    await pipeline(
      createReadStream(copy),
      createGzip({ level: 9 }),
      createWriteStream(`${file}.partial`),
    )
    await fs.rename(`${file}.partial`, file)
    await fs.utimes(file, started, started)
    return { status: 'created', file, bytes: (await fs.stat(file)).size }
  } finally {
    await fs.rm(copy, { force: true })
    await fs.rm(`${file}.partial`, { force: true })
    await fs.rm(`${file}.lock`, { force: true })
  }
}

// Uses the configured tracker database and backup folder. Test mode has no default folder.
export async function backupTrackerDatabase(reason: string, force = false): Promise<BackupResult> {
  const file = databaseFile()
  if (!backupDir) return { status: 'skipped', reason: 'Backups are off in test mode.' }
  if (!file) return { status: 'skipped', reason: 'Only SQLite file databases are backed up.' }
  return backupDatabase({ databaseFile: file, backupDir, reason, force })
}

export async function restoreDatabase(options: {
  databaseFile: string
  backupDir: string
  backupFile: string
}) {
  for (const suffix of ['-journal', '-wal'])
    if (await fs.stat(`${options.databaseFile}${suffix}`).catch(() => null))
      throw new Error(
        'The database has an unfinished transaction file. Stop the app and capture worker, then retry.',
      )
  const staged = `${options.databaseFile}.restore-partial`
  try {
    if (options.backupFile.endsWith('.gz'))
      await pipeline(
        createReadStream(options.backupFile),
        createGunzip(),
        createWriteStream(staged),
      )
    else await fs.copyFile(options.backupFile, staged)
    await verifySqlite(staged)
    // Nothing is lost by restoring: the current database is backed up first, even if unchanged.
    const safety = await backupDatabase({
      databaseFile: options.databaseFile,
      backupDir: options.backupDir,
      reason: 'pre-restore',
      force: true,
    })
    try {
      await fs.rename(staged, options.databaseFile)
    } catch {
      throw new Error('The database is in use. Stop the app and capture worker, then retry.')
    }
    return { restoredFrom: options.backupFile, safety }
  } finally {
    await fs.rm(staged, { force: true })
  }
}
