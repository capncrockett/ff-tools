import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
fs.mkdirSync('.local', { recursive: true })
const dir = fs.mkdtempSync(path.resolve('.local', 'test-'))
// Prisma cannot migrate a missing SQLite file here; an empty file is a valid empty database.
fs.closeSync(fs.openSync(path.join(dir, 'test.db'), 'a'))
const env = {
  ...process.env,
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: `file:${path.join(dir, 'test.db').replaceAll('\\', '/')}`,
}
try {
  for (const args of [
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    ['node_modules/jest/bin/jest.js', '--runInBand', ...process.argv.slice(2)],
  ]) {
    const result = spawnSync(process.execPath, args, { env, stdio: 'inherit' })
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1
      break
    }
  }
} finally {
  if (path.dirname(dir) === path.resolve('.local')) fs.rmSync(dir, { recursive: true, force: true })
}
