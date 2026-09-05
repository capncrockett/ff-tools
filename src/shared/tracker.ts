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
export type Dashboard = { market: MarketRow[]; holdings: HoldingView[]; sources: SourceStatus[] }

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
