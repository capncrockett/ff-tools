import {
  buildTrackerAlerts,
  isTrackerValueFresh,
  trackerAlertThresholds,
  type Dashboard,
  type HoldingView,
  type MarketRow,
  type SourceName,
  type SourceStatus,
} from '../../src/shared/tracker'

const now = Date.parse('2026-09-09T12:00:00Z')
const freshAt = '2026-09-09T11:00:00Z'
const staleAt = '2026-09-07T23:00:00Z'

function marketRow(source: SourceName, values: Partial<MarketRow> = {}): MarketRow {
  return {
    playerId: 1,
    playerName: 'Example Receiver',
    sleeperId: '1001',
    position: 'WR',
    team: 'SEA',
    source,
    contextKey: `${source}:fixture`,
    contextLabel: source === 'dynasty-nerds' ? 'PPR / 1QB' : 'Half PPR / 1QB',
    value: 120,
    capturedAt: freshAt,
    previousValue: 100,
    changePct: 20,
    baselineValue: 100,
    baselineAt: '2026-09-08T11:00:00Z',
    baselineChangePct: 20,
    observations: 2,
    history: [],
    ...values,
  }
}

function holding(values: Partial<HoldingView> = {}): HoldingView {
  return {
    id: 'holding-1',
    acquisitionKey: 'manual:holding-1',
    playerId: 1,
    playerName: 'Example Receiver',
    sourceName: 'dynasty-nerds',
    contextKey: 'dynasty-nerds:fixture',
    contextLabel: 'PPR / 1QB',
    portfolio: 'A League For All Seasons',
    acquiredAt: '2026-09-08T11:00:00Z',
    costBasis: 100,
    targetRoi: 20,
    notes: '',
    closedAt: null,
    proceeds: null,
    automated: false,
    reviewReason: null,
    currentValue: 120,
    capturedAt: freshAt,
    gain: 20,
    roi: 20,
    targetValue: 120,
    targetReached: true,
    ...values,
  }
}

function sourceStatus(source: SourceName, values: Partial<SourceStatus> = {}): SourceStatus {
  return {
    source,
    label: source === 'dynasty-nerds' ? 'Dynasty GM' : 'Dynasty Trade Calculator',
    configured: true,
    lastSuccess: freshAt,
    lastAttempt: freshAt,
    status: 'success',
    message: 'Saved fixture values.',
    nextAllowedAt: null,
    ...values,
  }
}

test('freshness uses the confirmed 36-hour boundary', () => {
  const boundary = new Date(now - trackerAlertThresholds.staleMs).toISOString()
  expect(isTrackerValueFresh(boundary, now)).toBe(true)
  expect(isTrackerValueFresh(new Date(Date.parse(boundary) - 1).toISOString(), now)).toBe(false)
  expect(isTrackerValueFresh(null, now)).toBe(false)
  expect(isTrackerValueFresh('not-a-date', now)).toBe(false)
})

test('builds target, sharp-move, divergence, and stale alerts without mixing raw scales', () => {
  const dashboard: Dashboard = {
    market: [
      marketRow('dynasty-nerds'),
      marketRow('dynasty-calculator', {
        value: 9,
        previousValue: 10,
        changePct: -10,
        baselineValue: 10,
        baselineChangePct: -10,
      }),
      marketRow('dynasty-nerds', {
        playerId: 2,
        playerName: 'Old Runner',
        capturedAt: staleAt,
        changePct: -50,
      }),
    ],
    holdings: [
      holding(),
      holding({ id: 'old-target', playerId: 2, playerName: 'Old Runner', capturedAt: staleAt }),
      holding({ id: 'closed', closedAt: freshAt, proceeds: 130 }),
    ],
    sources: [
      sourceStatus('dynasty-nerds', { lastSuccess: staleAt }),
      sourceStatus('dynasty-calculator'),
    ],
    roster: null,
  }

  const alerts = buildTrackerAlerts(dashboard, now)
  expect(alerts.map((alert) => alert.kind)).toEqual([
    'target',
    'movement',
    'movement',
    'divergence',
    'stale',
  ])
  expect(alerts[0].title).toBe('Example Receiver reached the 20% target')
  expect(alerts.find((alert) => alert.kind === 'divergence')?.detail).toContain(
    'GM +20.0%, DTC -10.0%',
  )
  expect(alerts.some((alert) => alert.title.includes('Old Runner'))).toBe(false)
})

test('does not flag an unconfigured source with no successful capture', () => {
  const dashboard: Dashboard = {
    market: [],
    holdings: [],
    sources: [
      sourceStatus('dynasty-nerds', {
        configured: false,
        lastSuccess: null,
        lastAttempt: null,
        status: 'idle',
      }),
    ],
    roster: null,
  }

  expect(buildTrackerAlerts(dashboard, now)).toEqual([])
})
