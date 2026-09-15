import { defineConfig } from 'prisma/config'
import { resolvedDatabaseUrl } from './src/server/config'

// Prisma 7's env() throws on a missing variable, even for `generate`, and no longer loads .env
// files itself. src/server/config.ts already does dotenv-then-default resolution as a side
// effect of import, so reuse it here instead of duplicating that logic.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: resolvedDatabaseUrl() },
})
