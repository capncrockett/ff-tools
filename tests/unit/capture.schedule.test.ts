import {
  captureWindowStart,
  decideAdditionCapture,
  decideScheduledCapture,
  type CaptureAttempt,
} from '../../src/shared/captureSchedule'

const hour = 3_600_000
const now = new Date('2026-09-12T11:00:00Z')
const attempt = (
  status: string,
  elapsed = 0,
  failureCode: string | null = null,
): CaptureAttempt => ({
  status,
  startedAt: new Date(+now + elapsed),
  failureCode,
})

test.each([
  ['2026-09-12T11:00:00Z', '2026-09-12T11:00:00Z'],
  ['2026-09-12T12:59:59.999Z', '2026-09-12T11:00:00Z'],
  ['2026-01-12T12:00:00Z', '2026-01-12T12:00:00Z'],
  ['2026-03-08T11:30:00Z', '2026-03-08T11:00:00Z'],
  ['2026-11-01T12:30:00Z', '2026-11-01T12:00:00Z'],
])('uses Pacific local time including DST at %s', (input, expected) => {
  expect(captureWindowStart(new Date(input))).toEqual(new Date(expected))
})

test.each(['2026-09-12T10:59:59.999Z', '2026-09-12T13:00:00Z', '2026-11-01T09:30:00Z'])(
  'never catches up outside the morning window: %s',
  (input) => {
    expect(captureWindowStart(new Date(input))).toBeNull()
    expect(decideScheduledCapture(new Date(input), null, [], hour).due).toBe(false)
  },
)

test('allows one initial attempt and one transient retry only after the full hour', () => {
  expect(decideScheduledCapture(now, null, [], hour).due).toBe(true)
  const failed = attempt('failed', 0, 'unavailable')
  expect(decideScheduledCapture(new Date(+now + hour - 1), failed, [failed], hour).due).toBe(false)
  expect(decideScheduledCapture(new Date(+now + hour), failed, [failed], hour).due).toBe(true)
  const retried = attempt('failed', hour, 'unavailable')
  expect(
    decideScheduledCapture(new Date(+now + hour + 1), retried, [failed, retried], hour).due,
  ).toBe(false)
})

test.each(['login', 'challenge', 'rate-limit', 'format', 'configuration', 'validation', null])(
  'requires manual recovery for %s failures even on a later day',
  (code) => {
    expect(decideScheduledCapture(now, attempt('failed', -24 * hour, code), [], hour).due).toBe(
      false,
    )
  },
)

test('manual success suppresses a nightly run and also clears earlier recovery pauses', () => {
  const success = attempt('success')
  expect(decideScheduledCapture(new Date(+now + hour), success, [success], hour).due).toBe(false)
  expect(decideScheduledCapture(now, attempt('success', -2 * hour), [], hour).due).toBe(true)
  expect(decideScheduledCapture(now, attempt('success', -hour + 1), [], hour).due).toBe(false)
})

test('an interrupted capture is not retried that night but is eligible the next night', () => {
  const running = attempt('running')
  expect(decideScheduledCapture(new Date(+now + hour), running, [running], hour).due).toBe(false)
  expect(decideScheduledCapture(now, attempt('running', -24 * hour), [], hour).due).toBe(true)
})

test('a roster addition is due outside the window, once, with one transient retry after the hour', () => {
  const daytime = new Date('2026-09-12T20:00:00Z')
  const at = (status: string, elapsed: number, code: string | null = null) => ({
    status,
    startedAt: new Date(+daytime + elapsed),
    failureCode: code,
  })
  expect(decideAdditionCapture(daytime, null, [], hour)).toMatchObject({
    due: true,
    reason: 'A Sleeper roster addition needs fresh values.',
  })
  // The shared limit counts the attempt before the addition too.
  const earlier = at('success', -hour + 1)
  expect(decideAdditionCapture(daytime, earlier, [], hour).due).toBe(false)
  expect(decideAdditionCapture(new Date(+daytime + 1), earlier, [], hour).due).toBe(true)

  const success = at('success', 0)
  expect(decideAdditionCapture(new Date(+daytime + 2 * hour), success, [success], hour).due).toBe(
    false,
  )
  const failed = at('failed', 0, 'unavailable')
  expect(decideAdditionCapture(new Date(+daytime + hour - 1), failed, [failed], hour).due).toBe(
    false,
  )
  expect(decideAdditionCapture(new Date(+daytime + hour), failed, [failed], hour).reason).toBe(
    'Single retry after a Sleeper roster addition is due.',
  )
  const retried = at('failed', hour, 'unavailable')
  expect(
    decideAdditionCapture(new Date(+daytime + 3 * hour), retried, [failed, retried], hour).due,
  ).toBe(false)
  const running = at('running', 0)
  expect(decideAdditionCapture(new Date(+daytime + hour), running, [running], hour).due).toBe(false)
  expect(decideAdditionCapture(daytime, at('failed', -2 * hour, 'format'), [], hour)).toMatchObject(
    { due: false, reason: expect.stringContaining('paused') },
  )
})

test('the daytime plan exposes recovery requirements before the next capture window', () => {
  expect(
    decideScheduledCapture(
      new Date('2026-09-12T20:00:00Z'),
      attempt('failed', 0, 'login'),
      [],
      hour,
    ),
  ).toMatchObject({ due: false, reason: expect.stringContaining('paused') })
})
