import { jest } from '@jest/globals'
import path from 'node:path'
import { resolvedDatabaseUrl } from '../../src/server/config'

// A relative file: URL must resolve under prisma/, matching Prisma 6's own behavior and
// databaseFile(). Resolving against the process cwd instead would silently open or create an
// empty database at the repository root rather than the real one.
test('resolvedDatabaseUrl resolves a relative path under prisma/, not the repository root', () => {
  const resolved = resolvedDatabaseUrl('file:./dev.db')
  const expected = `file:${path.resolve(process.cwd(), 'prisma', 'dev.db').replaceAll('\\', '/')}`
  expect(resolved).toBe(expected)
  expect(resolved).not.toBe(`file:${path.resolve(process.cwd(), 'dev.db').replaceAll('\\', '/')}`)
})

// No Prisma client is created here, so this cannot reach any database even if the guard regresses.
test('test mode refuses to fall back to the real local tracker database', async () => {
  const saved = process.env.DATABASE_URL
  delete process.env.DATABASE_URL
  try {
    await jest.isolateModulesAsync(async () => {
      await expect(import('../../src/server/config')).rejects.toThrow(
        'Test mode requires a throwaway DATABASE_URL',
      )
    })
    expect(process.env.DATABASE_URL).toBeUndefined()
  } finally {
    process.env.DATABASE_URL = saved
  }
})
