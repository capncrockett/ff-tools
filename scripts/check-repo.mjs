import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
const maintained =
  /^(src\/|tests\/|e2e\/|scripts\/|prisma\/|\.github\/|\.claude\/|docs\/(architecture|agent-channel|agent-workflow|grill-me-dynasty-tracker|local-capture-worker|sources|versioning|workbook-review)|AGENTS\.md$|CLAUDE\.md$|CONTEXT\.md$|README\.md$|TODO\.md$)/
// En dash and em dash, by code point so this file never contains either.
const dashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
const maxBytes = 2_000_000
const git = (args, options) =>
  execFileSync('git', args, { maxBuffer: 512 * 1024 * 1024, ...options })
const list = (...args) =>
  git([...args, '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)

// The index is what the next commit carries and the working copy is what the next
// `git add` carries. Either can hold a credential the other lacks: a partially staged
// file, or a staged file since deleted from disk. Scan both.
const indexed = list('ls-files', '--stage').map((entry) => {
  const tab = entry.indexOf('\t')
  return { oid: entry.slice(0, tab).split(' ')[1], file: entry.slice(tab + 1) }
})
const untracked = list('ls-files', '--others', '--exclude-standard')

function readBlobs(oids) {
  const blobs = new Map()
  const unique = [...new Set(oids)]
  if (!unique.length) return blobs
  // Submodule entries resolve to a missing object or a commit, never a blob.
  const wanted = git(['cat-file', '--batch-check'], {
    input: `${unique.join('\n')}\n`,
    encoding: 'utf8',
  })
    .split('\n')
    .map((line) => line.split(' '))
    .filter(([, type, size]) => type === 'blob' && Number(size) <= maxBytes)
    .map(([oid]) => oid)
  if (!wanted.length) return blobs
  const output = git(['cat-file', '--batch'], { input: `${wanted.join('\n')}\n` })
  let offset = 0
  while (offset < output.length) {
    const header = output.indexOf(10, offset)
    const [oid, , size] = output.toString('latin1', offset, header).split(' ')
    const start = header + 1
    blobs.set(oid, output.subarray(start, start + Number(size)))
    offset = start + Number(size) + 1
  }
  return blobs
}

function readWorkingCopy(file) {
  try {
    const stat = fs.statSync(file)
    return stat.isFile() && stat.size <= maxBytes ? fs.readFileSync(file) : undefined
  } catch {
    return undefined
  }
}

// file -> text -> the first label it was found under. A working copy identical to its
// staged blob is scanned once.
const sources = new Map()
function addSource(file, label, contents) {
  if (!contents || contents.includes(0)) return
  const text = contents.toString('utf8').replace(/\r\n/g, '\n')
  const texts = sources.get(file) ?? new Map()
  sources.set(file, texts)
  if (!texts.has(text)) texts.set(text, label)
}
const blobs = readBlobs(indexed.map(({ oid }) => oid))
for (const { oid, file } of indexed) addSource(file, 'staged', blobs.get(oid))
for (const file of new Set(indexed.map(({ file }) => file)))
  addSource(file, 'working copy', readWorkingCopy(file))
for (const file of untracked) addSource(file, 'untracked', readWorkingCopy(file))

// A heuristic for accidental leaks, not a general secret scanner. It finds a literal
// value bound to a key whose last word names a credential, in dotenv, shell, YAML,
// JSON, and source-code assignment forms. It cannot see a credential under an
// innocuous key, split across lines, or deliberately obscured.
const pair =
  /(?<![\w$.-])["']?([A-Za-z_][\w.-]*)["']?\s*[:=](?![=>:])\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|`((?:\\.|[^`\\])*)`|([^\s,;#"'`][^\s,;#]*))/g
const credentialWord =
  /^(password|passwd|passphrase|pass|secret|token|apikey|credentials?|cookies?|session)$/
const keyQualifier = /^(api|access|private|secret|signing|encryption|master)$/
const placeholder =
  /^(<.*>|your[-_].*|changeme|x{3,}|\*{3,}|\.{3}|redacted|(fixture|test|example|dummy|fake|sample|placeholder)([-_].*)?)?$/i
// A quoted string is literal unless it interpolates.
const interpolated = /\$\{|^\$[A-Za-z_]\w*$/
// An unquoted value is literal in dotenv, shell, and YAML, but is a variable or
// expression in source code. Only uppercase environment-style keys and config files
// are held to the literal reading there.
const uppercase = /^[A-Z][A-Z0-9_.]*$/
const configFile = /\.(ya?ml|toml|ini|cfg|conf|properties)$|(^|\/)\.env\.example$/
const lockfile = /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/
const scalar =
  /^(-?\d[\d._]*|true|false|null|none|nil|yes|no|on|off|undefined|\[\]?|\{\}?|[|>][-+]?\d*)$/i
// Code that reads a secret rather than containing one: an interpolation or shell
// expansion, a call, a quoted lookup, or a path through an environment or config
// object. A bracket inside an otherwise literal value is not code.
const chain = String.raw`[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*`
const reference = new RegExp(
  String.raw`^\$|^${chain}\(|^${chain}\s*\[\s*["'\x60]|(?:^|\.)(?:env|environ|secrets|config|settings|vars)(?:[.[(]|$)`,
)

function credentialKey(key) {
  const words = key
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z\d]+/)
    .filter(Boolean)
  const last = words.at(-1) ?? ''
  return credentialWord.test(last) || (last === 'key' && keyQualifier.test(words.at(-2) ?? ''))
}

function* credentials(file, text) {
  if (lockfile.test(file)) return
  for (const [index, line] of text.split('\n').entries()) {
    for (const [, key, double, single, backtick, bare] of line.matchAll(pair)) {
      if (!credentialKey(key)) continue
      const literal = double ?? single ?? backtick
      if (literal !== undefined) {
        if (placeholder.test(literal) || interpolated.test(literal)) continue
      } else if (
        !(uppercase.test(key) || configFile.test(file)) ||
        placeholder.test(bare) ||
        scalar.test(bare) ||
        reference.test(bare)
      ) {
        continue
      }
      yield { line: index + 1, key }
    }
  }
}

let failed = false
// message -> labels of the contents it was found in
const findings = new Map()
const report = (message, label) =>
  findings.set(message, (findings.get(message) ?? new Set()).add(label))

// A dotenv file must never enter Git. .gitignore does not protect an already-tracked
// file, so this checks what Git actually carries rather than what the ignore rules claim.
const envFile = /(^|\/)\.env(?:$|\.(?!example$))/
for (const file of new Set([...indexed.map(({ file }) => file), ...untracked])) {
  if (envFile.test(file)) {
    console.error(`Environment file must not be tracked or stageable: ${file}`)
    failed = true
  }
}
for (const [file, texts] of sources) {
  for (const [text, label] of texts) {
    if (
      maintained.test(file) &&
      /\.(md|ts|tsx|js|mjs|json|yml|yaml|sql)$/.test(file) &&
      dashes.test(text)
    ) {
      report(`Prohibited dash punctuation: ${file}`, label)
    }
    // Scan every committable file, not only maintained ones. A leaked credential
    // anywhere in the tree reaches the public repository just the same.
    for (const { line, key } of credentials(file, text)) {
      // Never print the value itself.
      report(`Possible credential in a committable file: ${file}:${line} (${key})`, label)
    }
  }
}
for (const [message, labels] of findings) {
  console.error(`${message} [${[...labels].join(', ')}]`)
  failed = true
}
for (const args of [
  ['diff', '--check'],
  ['diff', '--cached', '--check'],
]) {
  if (spawnSync('git', args, { stdio: 'inherit' }).status !== 0) failed = true
}
process.exitCode = failed ? 1 : 0
