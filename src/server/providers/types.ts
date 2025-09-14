export type SourceName = 'dynasty-nerds' | 'dynasty-calculator'

export type ValuationRecord = {
  playerName: string
  value: number
  source: SourceName
  capturedAt: string
}

export interface ValueProvider {
  name: SourceName
  run(options?: { headless?: boolean }): Promise<ValuationRecord[]>
}

