import fs from 'node:fs'
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
console.log(
  `Local credentials file: ${fs.existsSync('.env.local') ? 'present (contents not inspected)' : 'optional; absent'}`,
)
console.log(
  `SQLite database: ${fs.existsSync('prisma/dev.db') ? 'present' : 'run npm run db:deploy'}`,
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
