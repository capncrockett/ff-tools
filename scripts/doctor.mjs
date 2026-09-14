import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let failed = false
function check(label, ok) {
  console.log(`${ok ? 'OK' : 'MISSING'} ${label}`)
  failed ||= !ok
}
check('Node 24+', Number(process.versions.node.split('.')[0]) >= 24)
for (const name of ['vite', 'typescript', 'prisma', '@prisma/client', 'playwright', 'jest']) {
  try {
    require.resolve(name === 'prisma' ? 'prisma/package.json' : name)
    check(name, true)
  } catch {
    check(name, false)
  }
}
try {
  console.log(execFileSync('git', ['status', '--short', '--branch'], { encoding: 'utf8' }).trim())
} catch {
  check('Git checkout', false)
}
try {
  const version =
    process.platform === 'win32'
      ? execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'zg version'], {
          encoding: 'utf8',
        }).trim()
      : execFileSync('zg', ['version'], { encoding: 'utf8' }).trim()
  console.log(`Optional zvec-grep: ${version}`)
} catch {
  console.log('Optional zvec-grep: absent (exact rg search remains available)')
}
console.log(
  `Local credentials file: ${fs.existsSync('.env.local') ? 'present (contents not inspected)' : 'optional; absent'}`,
)
console.log(
  `SQLite database: ${fs.existsSync('prisma/dev.db') ? 'present' : 'run npm run db:deploy'}`,
)
// Reads file names and times only. A TRACKER_BACKUP_DIR set only in .env.local is not seen here.
const backupDir = path.resolve(
  process.env.TRACKER_BACKUP_DIR || path.join(os.homedir(), 'ff-tools-backups'),
)
const backups = fs.existsSync(backupDir)
  ? fs.readdirSync(backupDir).filter((name) => /^tracker-\d{8}T\d{9}Z-[a-z-]+\.db\.gz$/.test(name))
  : []
const newest = backups.sort().at(-1)
const ageHours = newest
  ? (Date.now() - fs.statSync(path.join(backupDir, newest)).mtimeMs) / 3_600_000
  : null
console.log(
  `Database backups: ${
    newest
      ? `${backups.length} in ${backupDir}; newest ${ageHours < 1 ? 'under an hour' : `${Math.round(ageHours)} hours`} old${ageHours > 48 ? ' (start the app or run npm run db:backup)' : ''}`
      : `none yet in ${backupDir} (run npm run db:backup)`
  }`,
)
try {
  const { chromium } = require('playwright')
  console.log(
    `Bundled browser: ${fs.existsSync(chromium.executablePath()) ? 'present' : 'run npm run browser:install (or configure PLAYWRIGHT_CHANNEL)'}`,
  )
} catch {
  /* package failure reported above */
}
process.exitCode = failed ? 1 : 0
