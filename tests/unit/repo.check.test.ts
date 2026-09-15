import { jest } from '@jest/globals'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

jest.setTimeout(30_000)

const script = path.resolve('scripts/check-repo.mjs')
// Synthetic keys and values are assembled at runtime so this file never contains a
// line the scanner itself would flag.
const fake = ['syn', 'thetic', 'Value', '7Q'].join('')
const upperKey = ['API', 'TOKEN'].join('_')
const camelKey = ['api', 'Token'].join('')

// Isolate from the user's Git configuration: no autocrlf rewriting, hooks, or signing.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-check-'))
const gitConfig = path.join(home, 'gitconfig')
fs.writeFileSync(gitConfig, '')
const env = { ...process.env, GIT_CONFIG_GLOBAL: gitConfig, GIT_CONFIG_NOSYSTEM: '1' }
afterAll(() => fs.rmSync(home, { recursive: true, force: true }))

function repo(files: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(home, 'repo-'))
  const write = (entries: Record<string, string>) => {
    for (const [file, contents] of Object.entries(entries)) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
      fs.writeFileSync(path.join(dir, file), contents)
    }
  }
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, env, stdio: 'pipe' })
  git('init', '-q')
  write(files)
  const check = () => {
    const result = spawnSync(process.execPath, [script], { cwd: dir, env, encoding: 'utf8' })
    return { status: result.status, stderr: result.stderr }
  }
  return { dir, git, write, check }
}

describe('staged and working-copy contents (S12)', () => {
  test('scans staged content the working copy no longer shows', () => {
    const r = repo({
      'partial.txt': `${upperKey}=${fake}\n`,
      'deleted.txt': `${upperKey}=${fake}\n`,
    })
    r.git('add', '.')
    r.write({ 'partial.txt': `${upperKey}=\n` })
    fs.rmSync(path.join(r.dir, 'deleted.txt'))

    const { status, stderr } = r.check()
    expect(status).toBe(1)
    expect(stderr).toContain(`partial.txt:1 (${upperKey}) [staged]`)
    expect(stderr).toContain(`deleted.txt:1 (${upperKey}) [staged]`)
    expect(stderr).not.toContain(fake)
  })

  test('still scans unstaged edits and untracked files, but not ignored files', () => {
    const r = repo({ '.gitignore': 'ignored.txt\n', 'edited.txt': 'clean\n' })
    r.git('add', '.')
    r.write({
      'edited.txt': `${upperKey}=${fake}\n`,
      'untracked.txt': `${upperKey}=${fake}\n`,
      'ignored.txt': `${upperKey}=${fake}\n`,
    })

    const { status, stderr } = r.check()
    expect(status).toBe(1)
    expect(stderr).toContain(`edited.txt:1 (${upperKey}) [working copy]`)
    expect(stderr).toContain(`untracked.txt:1 (${upperKey}) [untracked]`)
    expect(stderr).not.toContain('ignored.txt')
  })

  test('reports a credential once when staged and working copy agree', () => {
    const r = repo({ 'both.txt': `${upperKey}=${fake}\n` })
    r.git('add', '.')

    const { stderr } = r.check()
    expect(stderr.match(/both\.txt/g)).toHaveLength(1)
    expect(stderr).toContain(`both.txt:1 (${upperKey}) [staged]`)
  })

  test('rejects a staged dotenv file even after it is deleted from disk', () => {
    const r = repo({ '.env': 'PORT=1\n' })
    r.git('add', '.')
    fs.rmSync(path.join(r.dir, '.env'))

    const { status, stderr } = r.check()
    expect(status).toBe(1)
    expect(stderr).toContain('Environment file must not be tracked or stageable: .env')
  })
})

describe('credential forms (S13)', () => {
  const privateKey = ['private', 'key'].join('_')
  const passwordKey = ['pass', 'word'].join('')
  const flagged: [string, string, string, string][] = [
    ['a literal containing brackets', 'bracket.sh', `${upperKey}=ab[cd]${fake}\n`, upperKey],
    ['a bracketed literal', 'wrapped.sh', `${upperKey}=[${fake}]\n`, upperKey],
    ['a JSON field', 'minified.json', `${JSON.stringify({ [camelKey]: fake })}\n`, camelKey],
    [
      'a nested JSON field',
      'pretty.json',
      `${JSON.stringify({ nested: { [camelKey]: fake } }, null, 2)}\n`,
      camelKey,
    ],
    ['a quoted source literal', 'client.ts', `const ${camelKey} = '${fake}'\n`, camelKey],
    ['a quoted shell export', 'run.sh', `export ${upperKey}="${fake}"\n`, upperKey],
    ['an unquoted YAML value', 'app.yaml', `${passwordKey}: ${fake}\n`, passwordKey],
    ['a qualified key', 'settings.py', `${privateKey} = "${fake}"\n`, privateKey],
  ]
  let result: { status: number | null; stderr: string }

  beforeAll(() => {
    const r = repo(Object.fromEntries(flagged.map(([, file, contents]) => [file, contents])))
    r.git('add', '.')
    result = r.check()
  })

  test.each(flagged)('flags %s', (_, file, __, key) => {
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(`${file}:${file === 'pretty.json' ? 3 : 1} (${key}) [staged]`)
  })

  test('never prints a value', () => {
    expect(result.stderr).not.toContain(fake)
  })

  test('accepts references, placeholders, and keys that do not name a credential', () => {
    const r = repo({
      '.env.example': [`${upperKey}=`, `${upperKey}=<token>`, `${upperKey}=your-token`, ''].join(
        '\n',
      ),
      'interpolate.sh': [`${upperKey}="\${OTHER}"`, `${upperKey}=$OTHER`, ''].join('\n'),
      'settings.py': [
        `${upperKey} = st.secrets["NAME"]`,
        `${upperKey} = os.environ.get("NAME", "")`,
        '',
      ].join('\n'),
      'server.ts': [
        `const ${upperKey} = process.env[\`\${prefix}_NAME\`]`,
        `const ${upperKey} = requireEnv('NAME')`,
        `const schema = { ${upperKey}: z.string() }`,
        `if (${camelKey} === '${fake}') reject()`,
        `const fixture = { ${upperKey}: 'fixture-only' }`,
        '',
      ].join('\n'),
      'response.json': `${JSON.stringify({ token_type: 'bearer', max_tokens: 1600, cookieName: 'sid' })}\n`,
      '.github/workflow.yml': `with:\n  token: \${{ secrets.NAME }}\n`,
      'pnpm-lock.yaml': 'packages:\n  cookie: 0.7.1\n',
    })
    r.git('add', '.')

    expect(r.check()).toEqual({ status: 0, stderr: '' })
  })
})
