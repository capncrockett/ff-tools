import path from 'node:path'
import type { AxiosInstance } from 'axios'
import type { PrismaClient } from '../generated/prisma/client.js'
import { sourceSchema, type SourceName } from '../../shared/tracker.js'
import { rosterRefreshMs, sleeperLeagueId, sleeperOwnerId } from '../config.js'
import type { ValueProvider } from '../providers/types.js'
import { backupTrackerDatabase } from './backup.js'
import { reconcileSleeperRoster } from './rosterAutomation.js'
import { automaticCaptureDecision, sourceConfig, syncSource } from './sync.js'
import { DataError } from './valuations.js'

export type WorkerReport = {
  source: SourceName | 'sleeper' | 'backup'
  status: 'waiting' | 'due' | 'checked' | 'saved' | 'failed'
  message: string
}

// Detects new roster additions under the shared hourly Sleeper limit. Returns null while cooling down.
async function checkSleeperRoster(
  db: PrismaClient,
  http: AxiosInstance | undefined,
): Promise<WorkerReport | null> {
  const state = await db.rosterSyncState.findFirst({
    where: { leagueId: sleeperLeagueId, ownerId: sleeperOwnerId },
    select: { lastCheckedAt: true },
  })
  if (state?.lastCheckedAt && +state.lastCheckedAt + rosterRefreshMs > Date.now()) return null
  try {
    const result = await reconcileSleeperRoster(db, { http })
    return { source: 'sleeper', status: 'checked', message: result.message }
  } catch (error) {
    return {
      source: 'sleeper',
      status: error instanceof DataError && error.status === 429 ? 'waiting' : 'failed',
      message: error instanceof DataError ? error.message : 'Sleeper roster check failed.',
    }
  }
}

export async function runCaptureWorkerTick(
  db: PrismaClient,
  providers: Record<SourceName, ValueProvider>,
  options: { dryRun?: boolean; stopped?: () => boolean; rosterHttp?: AxiosInstance } = {},
): Promise<WorkerReport[]> {
  const reports: WorkerReport[] = []
  // Each tick backs up whatever changed since the last backup, including this worker's captures.
  if (!options.dryRun && !options.stopped?.()) {
    const backup = await backupTrackerDatabase('scheduled').catch(() => null)
    if (!backup)
      reports.push({ source: 'backup', status: 'failed', message: 'Database backup failed.' })
    else if (backup.status === 'created')
      reports.push({
        source: 'backup',
        status: 'saved',
        message: `Saved ${path.basename(backup.file)}.`,
      })
  }
  // A dry run stays read-only and offline; it reports additions an earlier check already saved.
  if (
    !options.dryRun &&
    !options.stopped?.() &&
    sourceSchema.options.some(
      (source) => providers[source].tracksSleeperRoster && sourceConfig.isConfigured(source),
    )
  ) {
    const roster = await checkSleeperRoster(db, options.rosterHttp)
    if (roster) reports.push(roster)
  }
  for (const source of sourceSchema.options) {
    if (options.stopped?.()) break
    if (!sourceConfig.isConfigured(source)) {
      reports.push({
        source,
        status: 'waiting',
        message: 'Configure credentials or a saved session first.',
      })
      continue
    }
    const decision = await automaticCaptureDecision(
      db,
      source,
      Boolean(providers[source].tracksSleeperRoster),
    )
    if (!decision.due || options.dryRun) {
      reports.push({ source, status: decision.due ? 'due' : 'waiting', message: decision.reason })
      continue
    }
    try {
      // Recheck eligibility inside the same transaction as the shared reservation.
      const result = await syncSource(db, source, providers[source], {
        headless: true,
        scheduled: true,
        rosterHttp: options.rosterHttp,
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
