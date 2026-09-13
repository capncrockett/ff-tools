import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
const maintained =
  /^(src\/|tests\/|e2e\/|scripts\/|prisma\/|\.github\/|\.claude\/|docs\/(architecture|agent-channel|agent-workflow|grill-me-dynasty-tracker|local-capture-worker|sources|versioning|workbook-review)|AGENTS\.md$|CLAUDE\.md$|CONTEXT\.md$|README\.md$|TODO\.md$)/
const paths = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean)
// A dotenv file must never enter Git. .gitignore does not protect an already-tracked
// file, so this checks what Git actually carries rather than what the ignore rules claim.
const envFile = /(^|\/)\.env(?:$|\.(?!example$))/
// An uppercase KEY=value line is the shape a dotenv file uses. A value that is code
// (a call, a lookup, an interpolation) names a secret; it does not contain one.
const assignment = /^[ \t]*(?:export[ \t]+)?([A-Z][A-Z0-9_]*)[ \t]*=[ \t]*(.*)$/
const secretName = /(PASSWORD|SECRET|TOKEN|APIKEY|API_KEY|CREDENTIAL|COOKIE|SESSION)/
const placeholder = /^(|""|''|<.*>|\$\{.*\}|your[-_].*|changeme|xxx+|\.\.\.)$/i
const reference = /[()[\]]|^os\.|^process\.|^env\.|\bgetenv\b|^["']?\$/

let failed = false
for (const file of new Set(paths)) {
  if (envFile.test(file)) {
    console.error(`Environment file must not be tracked or stageable: ${file}`)
    failed = true
  }
  if (!fs.existsSync(file)) continue
  if (maintained.test(file) && /\.(md|ts|tsx|js|mjs|json|yml|yaml|sql)$/.test(file)) {
    if (/[\u2013\u2014]/.test(fs.readFileSync(file, 'utf8'))) {
      console.error(`Prohibited dash punctuation: ${file}`)
      failed = true
    }
  }
  // Scan every committable file, not only maintained ones. A leaked credential
  // anywhere in the tree reaches the public repository just the same.
  let contents
  try {
    contents = fs.readFileSync(file)
  } catch {
    continue
  }
  if (contents.length > 2_000_000 || contents.includes(0)) continue
  for (const [index, line] of contents.toString('utf8').split(/\r?\n/).entries()) {
    const match = assignment.exec(line)
    if (!match) continue
    const [, key, rawValue] = match
    const value = rawValue.trim().replace(/\s*(#|\/\/).*$/, '')
    if (!secretName.test(key) || placeholder.test(value) || reference.test(value)) continue
    // Never print the value itself.
    console.error(`Possible credential in a committable file: ${file}:${index + 1} (${key})`)
    failed = true
  }
}
execFileSync('git', ['diff', '--check'], { stdio: 'inherit' })
process.exitCode = failed ? 1 : 0
