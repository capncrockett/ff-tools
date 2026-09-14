import { spawnSync } from 'node:child_process'

// Validation only parses the schema, but Prisma still requires the datasource variable to exist.
// Supply a harmless placeholder in clean checkouts while preserving an explicitly configured URL.
const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'validate'], {
  env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL || 'file:./validation-only.db' },
  stdio: 'inherit',
})
process.exitCode = result.status ?? 1
