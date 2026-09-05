import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
const maintained =
  /^(src\/|tests\/|e2e\/|scripts\/|prisma\/|\.github\/|docs\/(architecture|agent-workflow|grill-me-dynasty-tracker|sources|versioning)|AGENTS\.md$|CONTEXT\.md$|README\.md$|TODO\.md$)/
const paths = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean)
let failed = false
for (const file of new Set(paths)) {
  if (
    !maintained.test(file) ||
    !fs.existsSync(file) ||
    !/\.(md|ts|tsx|js|mjs|json|yml|yaml|sql)$/.test(file)
  )
    continue
  if (/[\u2013\u2014]/.test(fs.readFileSync(file, 'utf8'))) {
    console.error(`Prohibited dash punctuation: ${file}`)
    failed = true
  }
}
execFileSync('git', ['diff', '--check'], { stdio: 'inherit' })
process.exitCode = failed ? 1 : 0
