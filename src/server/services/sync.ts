import fs from 'node:fs'
import path from 'node:path'
import type { AxiosInstance } from 'axios'
import type { PrismaClient } from '@prisma/client'
import {
  sourceLabels,
  sourceSchema,
  type SourceName,
  type SourceStatus,
} from '../../shared/tracker.js'
import { localDir, syncFailureMs, syncSuccessMs } from '../config.js'
import { ProviderError, type ValueProvider } from '../providers/types.js'
import { DataError, saveSnapshot } from './valuations.js'
import {
  applyRosterMovements,
  loadReconciledRosterPlayers,
  reconcileSleeperRoster,
} from './rosterAutomation.js'

export function sourceConfigured(source: SourceName) {
  const prefix = source === 'dynasty-nerds' ? 'DYNASTY_NERDS' : 'DYNASTY_CALC'
  return Boolean(
    (process.env[`${prefix}_EMAIL`] && process.env[`${prefix}_PASSWORD`]) ||
    fs.existsSync(path.join(localDir, 'sessions', `${source}.json`)),
  )
}

export async function getSourceStatuses(db: PrismaClient): Promise<SourceStatus[]> {
  return Promise.all(
    sourceSchema.options.map(async (source) => {
      const [last, success] = await Promise.all([
        db.syncRun.findFirst({ where: { sourceName: source }, orderBy: { startedAt: 'desc' } }),
        db.syncRun.findFirst({
          where: { sourceName: source, status: 'success' },
          orderBy: { startedAt: 'desc' },
        }),
      ])
      const until = last
        ? +last.startedAt + (last.status === 'success' ? syncSuccessMs : syncFailureMs)
        : null
      return {
        source,
        label: sourceLabels[source],
        configured: sourceConfigured(source),
        lastSuccess: success?.finishedAt?.toISOString() ?? null,
        lastAttempt: last?.startedAt.toISOString() ?? null,
        status: last?.status ?? 'idle',
        message: last?.message ?? 'No browser capture yet.',
        nextAllowedAt: until && until > Date.now() ? new Date(until).toISOString() : null,
      }
    }),
  )
}

export async function syncSource(
  db: PrismaClient,
  source: SourceName,
  provider: ValueProvider,
  options?: { headless?: boolean; rosterHttp?: AxiosInstance },
) {
  // Reserve in SQLite, so a CLI and API process cannot both launch the same provider.
  const run = await db.$transaction(async (tx) => {
    const last = await tx.syncRun.findFirst({
      where: { sourceName: source },
      orderBy: { startedAt: 'desc' },
    })
    const until = last
      ? +last.startedAt + (last.status === 'success' ? syncSuccessMs : syncFailureMs)
      : 0
    if (until > Date.now())
      throw new DataError(
        `This source can refresh after ${new Date(until).toISOString()}. Saved history is still available.`,
        429,
      )
    return tx.syncRun.create({
      data: {
        sourceName: source,
        status: 'running',
        message: 'Reading the selected provider view.',
      },
    })
  })
  try {
    let sleeperRoster
    let rosterMessage = ''
    if (provider.tracksSleeperRoster) {
      try {
        const roster = await reconcileSleeperRoster(db, {
          allowCached: true,
          http: options?.rosterHttp,
        })
        const canonicalRoster = await loadReconciledRosterPlayers(db, roster.playerIds)
        if (provider.needsSleeperRoster) sleeperRoster = canonicalRoster
        rosterMessage = ` ${roster.message}`
      } catch (error) {
        if (provider.needsSleeperRoster) throw error
        rosterMessage = ' Sleeper roster check needs attention.'
      }
    }
    const snapshot = await provider.run({ headless: options?.headless, sleeperRoster })
    if (snapshot.source !== source)
      throw new ProviderError('format', 'Provider returned the wrong source. No values saved.')
    const result = await saveSnapshot(db, snapshot, 'browser')
    if (provider.tracksSleeperRoster) {
      try {
        const applied = await applyRosterMovements(db)
        if (applied.needsReview)
          rosterMessage = ` ${applied.needsReview} roster movement${applied.needsReview === 1 ? '' : 's'} need review.`
      } catch {
        rosterMessage = ' Values were saved, but Sleeper movement application needs attention.'
      }
    }
    await db.syncRun.update({
      where: { id: run.id },
      data: {
        status: 'success',
        message: `Saved ${result.saved} player observations.${rosterMessage}`,
        saved: result.saved,
        finishedAt: new Date(),
      },
    })
    return result
  } catch (error) {
    // Browser exceptions can contain URLs with tokens or filled field values. Store only controlled messages.
    const message =
      error instanceof ProviderError || error instanceof DataError
        ? error.message
        : 'Capture failed validation or the browser was unavailable. No snapshot was saved.'
    await db.syncRun.update({
      where: { id: run.id },
      data: { status: 'failed', message, finishedAt: new Date() },
    })
    throw new DataError(message, 502)
  }
}
