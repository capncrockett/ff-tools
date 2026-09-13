export type CaptureAttempt = {
  startedAt: Date
  status: string
  failureCode: string | null
}

export type CaptureDecision = { due: boolean; reason: string }

const pacificClock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

// Both DST transitions precede 04:00, so subtracting elapsed local time here
// identifies 04:00 on the same side of the offset change without a fixed UTC offset.
export function captureWindowStart(now: Date): Date | null {
  const parts = pacificClock.formatToParts(now)
  const part = (type: string) => Number(parts.find((value) => value.type === type)?.value)
  const hour = part('hour')
  if (hour < 4 || hour >= 6) return null
  return new Date(
    +now -
      ((hour - 4) * 3600 + part('minute') * 60 + part('second')) * 1000 -
      now.getUTCMilliseconds(),
  )
}

const paused: CaptureDecision = {
  due: false,
  reason: 'Automatic capture paused. Complete a successful manual capture to resume.',
}
const pausedForRecovery = (latest: CaptureAttempt | null) =>
  latest?.status === 'failed' && latest.failureCode !== 'unavailable'

export function decideScheduledCapture(
  now: Date,
  latest: CaptureAttempt | null,
  attempts: CaptureAttempt[],
  cooldownMs: number,
): CaptureDecision {
  if (pausedForRecovery(latest)) return paused
  const start = captureWindowStart(now)
  if (!start) return { due: false, reason: 'Waiting for the 04:00-06:00 Pacific capture window.' }
  if (attempts.some((attempt) => attempt.status === 'success'))
    return { due: false, reason: 'A capture already succeeded in this window.' }
  if (attempts.length >= 2)
    return { due: false, reason: 'The nightly attempt and single retry have been used.' }
  if (latest && +latest.startedAt + cooldownMs > +now)
    return { due: false, reason: 'Waiting for the shared one-hour refresh limit.' }
  if (attempts.some((attempt) => attempt.status === 'running'))
    return { due: false, reason: 'An unfinished capture needs review; no automatic retry tonight.' }
  return {
    due: true,
    reason: attempts.length ? 'Single nightly retry is due.' : 'Nightly capture is due.',
  }
}

// User-confirmed 2026-09-13: a Sleeper roster addition should get provider values promptly rather
// than at the next nightly window. The hourly limit, recovery pause, and single retry still apply.
// `attempts` are this source's attempts started at or after the addition was detected.
export function decideAdditionCapture(
  now: Date,
  latest: CaptureAttempt | null,
  attempts: CaptureAttempt[],
  cooldownMs: number,
): CaptureDecision {
  if (pausedForRecovery(latest)) return paused
  if (attempts.some((attempt) => attempt.status === 'success'))
    return { due: false, reason: 'A capture already followed the latest Sleeper roster addition.' }
  if (attempts.length >= 2)
    return {
      due: false,
      reason:
        'The capture and single retry after the latest Sleeper roster addition have been used.',
    }
  if (latest && +latest.startedAt + cooldownMs > +now)
    return { due: false, reason: 'Waiting for the shared one-hour refresh limit.' }
  if (attempts.some((attempt) => attempt.status === 'running'))
    return {
      due: false,
      reason: 'An unfinished capture needs review; no automatic retry for this roster addition.',
    }
  return {
    due: true,
    reason: attempts.length
      ? 'Single retry after a Sleeper roster addition is due.'
      : 'A Sleeper roster addition needs fresh values.',
  }
}
