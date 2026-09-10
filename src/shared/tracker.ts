import { z } from 'zod'

export const sourceSchema = z.enum(['dynasty-nerds', 'dynasty-calculator'])
export type SourceName = z.infer<typeof sourceSchema>
export const sourceLabels: Record<SourceName, string> = {
  'dynasty-nerds': 'Dynasty GM',
  'dynasty-calculator': 'Dynasty Trade Calculator',
}

export const contextSchema = z
  .object({
    label: z.string().trim().min(1).max(180),
    settings: z.record(z.union([z.string().max(200), z.number().finite(), z.boolean(), z.null()])),
  })
  .strict()
export type ValueContext = z.infer<typeof contextSchema>

export const observationSchema = z
  .object({
    sourceKey: z.string().trim().min(1).max(180),
    playerName: z.string().trim().min(2).max(120),
    sleeperId: z.string().regex(/^\d+$/).optional(),
    position: z
      .enum(['QB', 'RB', 'WR', 'TE', 'K', 'DL', 'LB', 'DB', 'DE', 'DT', 'CB', 'S'])
      .optional(),
    team: z.string().max(8).nullable().optional(),
    value: z.number().finite().min(0).max(1_000_000_000),
  })
  .strict()
export type Observation = z.infer<typeof observationSchema>

export const snapshotSchema = z
  .object({
    source: sourceSchema,
    context: contextSchema,
    capturedAt: z.string().datetime({ offset: true }),
    records: z.array(observationSchema).min(1).max(10_000),
  })
  .strict()
export type SnapshotInput = z.infer<typeof snapshotSchema>

export type HistoryPoint = { value: number; capturedAt: string }
export type MarketRow = {
  playerId: number
  playerName: string
  sleeperId: string | null
  position: string | null
  team: string | null
  source: SourceName
  contextKey: string
  contextLabel: string
  value: number
  capturedAt: string
  previousValue: number | null
  changePct: number | null
  baselineValue: number
  baselineAt: string
  baselineChangePct: number | null
  observations: number
  history: HistoryPoint[]
}
export type HoldingView = {
  id: string
  acquisitionKey: string
  playerId: number
  playerName: string
  sourceName: SourceName
  contextKey: string
  contextLabel: string
  portfolio: string
  acquiredAt: string
  costBasis: number
  targetRoi: number
  notes: string
  closedAt: string | null
  proceeds: number | null
  automated: boolean
  reviewReason: string | null
  currentValue: number | null
  capturedAt: string | null
  gain: number | null
  roi: number | null
  targetValue: number | null
  targetReached: boolean
}
export type SourceStatus = {
  source: SourceName
  label: string
  configured: boolean
  lastSuccess: string | null
  lastAttempt: string | null
  status: string
  message: string
  nextAllowedAt: string | null
}
export type RosterReviewItem = {
  id: string
  movementId: string
  playerName: string
  sleeperPlayerId: string
  direction: 'add' | 'remove'
  kind: string
  occurredAt: string
  sourceName: SourceName | null
  contextKey: string | null
  message: string
  suggestedValue: number | null
  suggestedCapturedAt: string | null
  canAcceptLastValue: boolean
}
export type RosterAutomationView = {
  leagueName: string
  status: string
  message: string
  lastCheckedAt: string | null
  nextAllowedAt: string | null
  rosterPlayers: number
  pending: number
  reviews: RosterReviewItem[]
}
export type Dashboard = {
  market: MarketRow[]
  holdings: HoldingView[]
  sources: SourceStatus[]
  roster: RosterAutomationView | null
}

export const trackerAlertThresholds = {
  staleMs: 36 * 60 * 60 * 1000,
  sharpMovePct: 10,
} as const

export type TrackerAlert = {
  id: string
  kind: 'target' | 'movement' | 'divergence' | 'stale'
  tone: 'success' | 'warning' | 'info'
  title: string
  detail: string
  playerId?: number
}

export function isTrackerValueFresh(time: string | null, now = Date.now()) {
  if (!time) return false
  const capturedAt = Date.parse(time)
  return Number.isFinite(capturedAt) && now - capturedAt <= trackerAlertThresholds.staleMs
}

const signedPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`

export function buildTrackerAlerts(dashboard: Dashboard, now = Date.now()): TrackerAlert[] {
  const targets: TrackerAlert[] = dashboard.holdings
    .filter(
      (holding) =>
        !holding.closedAt && holding.targetReached && isTrackerValueFresh(holding.capturedAt, now),
    )
    .map((holding) => ({
      id: `target:${holding.id}`,
      kind: 'target',
      tone: 'success',
      title: `${holding.playerName} reached the ${holding.targetRoi}% target`,
      detail: `${sourceLabels[holding.sourceName]} return is ${holding.roi === null ? 'unavailable' : signedPercent(holding.roi)} using a fresh value.`,
      playerId: holding.playerId,
    }))

  const movements: Array<TrackerAlert & { magnitude: number }> = dashboard.market
    .filter(
      (row) =>
        row.changePct !== null &&
        Math.abs(row.changePct) >= trackerAlertThresholds.sharpMovePct &&
        isTrackerValueFresh(row.capturedAt, now),
    )
    .map((row) => ({
      id: `movement:${row.playerId}:${row.source}:${row.contextKey}`,
      kind: 'movement',
      tone: row.changePct! < 0 ? 'warning' : 'info',
      title: `${row.playerName} ${row.changePct! < 0 ? 'fell' : 'rose'} ${Math.abs(row.changePct!).toFixed(1)}%`,
      detail: `${sourceLabels[row.source]} / ${row.contextLabel} since the previous capture.`,
      playerId: row.playerId,
      magnitude: Math.abs(row.changePct!),
    }))
  movements.sort((a, b) => b.magnitude - a.magnitude || a.title.localeCompare(b.title))

  const latestByPlayer = new Map<number, Partial<Record<SourceName, MarketRow>>>()
  for (const row of dashboard.market) {
    if (!isTrackerValueFresh(row.capturedAt, now) || row.baselineChangePct === null) continue
    const sources = latestByPlayer.get(row.playerId) ?? {}
    const current = sources[row.source]
    if (!current || Date.parse(row.capturedAt) > Date.parse(current.capturedAt))
      sources[row.source] = row
    latestByPlayer.set(row.playerId, sources)
  }
  const divergences: TrackerAlert[] = []
  for (const [playerId, sources] of latestByPlayer) {
    const nerds = sources['dynasty-nerds']
    const calculator = sources['dynasty-calculator']
    if (!nerds || !calculator) continue
    const nerdsGrowth = nerds.baselineChangePct!
    const calculatorGrowth = calculator.baselineChangePct!
    const oppositeDirections = nerdsGrowth * calculatorGrowth < 0
    if (
      !oppositeDirections ||
      Math.abs(nerdsGrowth - calculatorGrowth) < trackerAlertThresholds.sharpMovePct
    )
      continue
    divergences.push({
      id: `divergence:${playerId}`,
      kind: 'divergence',
      tone: 'info',
      title: `${nerds.playerName} is moving in opposite directions`,
      detail: `Growth from each source's own baseline: GM ${signedPercent(nerdsGrowth)}, DTC ${signedPercent(calculatorGrowth)}.`,
      playerId,
    })
  }
  divergences.sort((a, b) => a.title.localeCompare(b.title))

  const stale: TrackerAlert[] = dashboard.sources
    .filter((source) => source.configured && !isTrackerValueFresh(source.lastSuccess, now))
    .map((source) => ({
      id: `stale:${source.source}`,
      kind: 'stale',
      tone: 'warning',
      title: `${source.label} values need a fresh capture`,
      detail: source.lastSuccess
        ? `The last successful browser capture was more than 36 hours ago.`
        : `No successful browser capture is recorded yet.`,
    }))

  return [...targets, ...movements, ...divergences, ...stale]
}

export function percentageChange(current: number, basis: number): number | null {
  return basis > 0 ? ((current - basis) / basis) * 100 : null
}

export function calculateReturn(cost: number, value: number | null, targetRoi: number) {
  const targetValue = cost > 0 ? cost * (1 + targetRoi / 100) : null
  return {
    gain: value === null ? null : value - cost,
    roi: value === null ? null : percentageChange(value, cost),
    targetValue,
    targetReached: value !== null && targetValue !== null && value >= targetValue,
  }
}
