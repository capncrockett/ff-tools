import fs from 'node:fs'
import path from 'node:path'
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
  options?: { headless?: boolean },
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
    const snapshot = await provider.run(options)
    if (snapshot.source !== source)
      throw new ProviderError('format', 'Provider returned the wrong source. No values saved.')
    const result = await saveSnapshot(db, snapshot, 'browser')
    await db.syncRun.update({
      where: { id: run.id },
      data: {
        status: 'success',
        message: `Saved ${result.saved} player observations.`,
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
