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
