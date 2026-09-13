import '../config.js'
import { setTimeout } from 'node:timers/promises'
import { prisma } from '../db.js'
import { dynastyNerdsProvider } from '../providers/dynastyNerds.js'
import { dynastyCalculatorProvider } from '../providers/dynastyCalculator.js'
import { runCaptureWorkerTick } from '../services/captureWorker.js'

const args = process.argv.slice(2)
const controller = new AbortController()
const stop = () => controller.abort()
process.once('SIGINT', stop)
process.once('SIGTERM', stop)

try {
  if (args.some((arg) => !['--once', '--dry-run'].includes(arg)))
    throw new Error('Unsupported worker argument')
  const dryRun = args.includes('--dry-run')
  const once = args.includes('--once') || dryRun
  console.log(
    'Local capture worker: 04:00-06:00 America/Los_Angeles, and soon after a Sleeper roster addition (checked hourly); at most two attempts per trigger; one-hour minimum. Ctrl+C stops after the active capture.',
  )
  let previous = ''
  do {
    const reports = await runCaptureWorkerTick(
      prisma,
      {
        'dynasty-nerds': dynastyNerdsProvider,
        'dynasty-calculator': dynastyCalculatorProvider,
      },
      { dryRun, stopped: () => controller.signal.aborted },
    )
    const signature = JSON.stringify(reports)
    if (signature !== previous) {
      console.log(JSON.stringify({ checkedAt: new Date().toISOString(), dryRun, reports }))
      previous = signature
    }
    if (once) {
      if (reports.some((report) => report.status === 'failed')) process.exitCode = 1
      break
    }
    await setTimeout(60_000, undefined, { signal: controller.signal }).catch((error: unknown) => {
      if (!controller.signal.aborted) throw error
    })
  } while (!controller.signal.aborted)
} catch {
  console.error(
    'Worker stopped. Check database migrations, browser setup, and arguments (--once or --dry-run). No raw provider error is logged.',
  )
  process.exitCode = 1
} finally {
  process.removeListener('SIGINT', stop)
  process.removeListener('SIGTERM', stop)
  await prisma.$disconnect()
}
