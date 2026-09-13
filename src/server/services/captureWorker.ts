import type { PrismaClient } from '@prisma/client'
import { sourceSchema, type SourceName } from '../../shared/tracker.js'
import { captureWindowStart, decideScheduledCapture } from '../../shared/captureSchedule.js'
import { syncSuccessMs } from '../config.js'
import type { ValueProvider } from '../providers/types.js'
import { sourceConfigured, syncSource } from './sync.js'
import { DataError } from './valuations.js'

export type WorkerReport = {
  source: SourceName
  status: 'waiting' | 'due' | 'saved' | 'failed'
  message: string
}

export async function runCaptureWorkerTick(
  db: PrismaClient,
  providers: Record<SourceName, ValueProvider>,
  options: { dryRun?: boolean; stopped?: () => boolean } = {},
): Promise<WorkerReport[]> {
  const reports: WorkerReport[] = []
  for (const source of sourceSchema.options) {
    if (options.stopped?.()) break
    if (!sourceConfigured(source)) {
      reports.push({
        source,
        status: 'waiting',
        message: 'Configure credentials or a saved session first.',
      })
      continue
    }
    const now = new Date()
    const start = captureWindowStart(now)
    const [latest, attempts] = await Promise.all([
      db.syncRun.findFirst({ where: { sourceName: source }, orderBy: { startedAt: 'desc' } }),
      start
        ? db.syncRun.findMany({ where: { sourceName: source, startedAt: { gte: start } } })
        : [],
    ])
    const decision = decideScheduledCapture(now, latest, attempts, syncSuccessMs)
    if (!decision.due || options.dryRun) {
      reports.push({ source, status: decision.due ? 'due' : 'waiting', message: decision.reason })
      continue
    }
    try {
      // Recheck eligibility inside the same transaction as the shared reservation.
      const result = await syncSource(db, source, providers[source], {
        headless: true,
        scheduled: true,
      })
      reports.push({ source, status: 'saved', message: `Saved ${result.saved} observations.` })
    } catch (error) {
      reports.push({
        source,
        status: error instanceof DataError && error.status === 429 ? 'waiting' : 'failed',
        message:
          error instanceof DataError
            ? error.message
            : 'Worker could not complete capture. Check local database and browser setup.',
      })
    }
  }
  return reports
}
