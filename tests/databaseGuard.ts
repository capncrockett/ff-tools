// Tests delete every tracker table. Without scripts/test.mjs, config.ts falls back to the local
// tracker database, so a direct jest run once wiped real data. Refuse anything but the throwaway file.
const file = (process.env.DATABASE_URL ?? '').replace(/^file:/, '').replaceAll('\\', '/')
if (!/\/\.local\/test-[^/]+\/test\.db$/.test(file))
  throw new Error(
    'Refusing to run tests outside a throwaway database. Use npm test (or npm run verify), never jest directly.',
  )
