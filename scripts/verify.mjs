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
  // One command string: Windows can only start pnpm.cmd through a shell, and Node deprecates
  // passing an argument array to a shell. Step names are fixed above, so nothing needs escaping.
  const result = spawnSync(`pnpm run ${step}`, { stdio: 'inherit', shell: true })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
