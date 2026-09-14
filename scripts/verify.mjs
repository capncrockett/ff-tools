import { spawnSync } from 'node:child_process'

const steps = [
  'repo:check',
  'format',
  'prisma:validate',
  'lint',
  'typecheck',
  ...(!process.argv.includes('--quick') ? ['test', 'build'] : []),
  ...(process.argv.includes('--e2e') ? ['test:e2e'] : []),
]
for (const step of steps) {
  console.log(`\nChecking ${step}`)
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', step], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
