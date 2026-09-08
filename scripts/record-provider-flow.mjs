import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const providers = {
  'dynasty-calculator': 'https://dynastytradecalculator.com/calculator/',
  'dynasty-nerds': 'https://app.dynastynerds.com/analyzer/273947',
}
const source = process.argv[2]
if (!(source in providers)) {
  console.error('Choose dynasty-calculator or dynasty-nerds.')
  process.exit(1)
}

const local = path.resolve('.local')
const recordingDir = path.join(local, 'recordings')
const sessionDir = path.join(local, 'sessions')
const state = path.join(sessionDir, `${source}.json`)
const recordedState = path.join(sessionDir, `${source}-recording.json`)
const output = path.join(recordingDir, `${source}-flow.spec.ts`)
fs.mkdirSync(recordingDir, { recursive: true })

console.log(`Recording ${source}. Walk through one normal flow, then close the browser.`)
console.log(`Generated code stays local at ${path.relative(process.cwd(), output)}.`)
const args = [
  'node_modules/playwright/cli.js',
  'codegen',
  '--target=playwright-test',
  `--output=${output}`,
  `--save-storage=${recordedState}`,
  '--viewport-size=1440,1000',
]
if (fs.existsSync(state)) args.push(`--load-storage=${state}`)
args.push(providers[source])
const result = spawnSync(process.execPath, args, { stdio: 'inherit', windowsHide: false })
process.exitCode = result.status ?? 1
