import Database from 'better-sqlite3'
import { databaseFile } from '../../src/server/config'
import { createTestPrismaClient } from '../testPrismaClient'

// The real database stores every DateTime column as an integer epoch millisecond, not ISO text.
// The adapter's default timestampFormat is 'iso8601'; createTestPrismaClient() must override it to
// 'unixepoch-ms' or writes through Prisma would silently mix formats with the existing data.
test('DateTime columns are stored as integer epoch milliseconds, not ISO text', async () => {
  const db = createTestPrismaClient()
  try {
    await db.syncRun.deleteMany()
    const startedAt = new Date('2026-09-15T12:00:00Z')
    const run = await db.syncRun.create({
      data: { sourceName: 'timestamp-check', status: 'success', message: 'ok', startedAt },
    })

    const file = databaseFile()
    if (!file) throw new Error('expected a SQLite file database in test mode')
    const raw = new Database(file, { readonly: true, fileMustExist: true })
    try {
      const row = raw.prepare('SELECT startedAt FROM SyncRun WHERE id = ?').get(run.id) as {
        startedAt: unknown
      }
      expect(typeof row.startedAt).toBe('number')
      const value = row.startedAt as number
      // Plausible epoch-ms range: after 2020-01-01, before 2100-01-01.
      expect(value).toBeGreaterThan(1_577_836_800_000)
      expect(value).toBeLessThan(4_102_444_800_000)
      expect(value).toBe(+startedAt)
    } finally {
      raw.close()
    }

    await db.syncRun.deleteMany()
  } finally {
    await db.$disconnect()
  }
})
