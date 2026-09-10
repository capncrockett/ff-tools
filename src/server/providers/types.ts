import type { SnapshotInput, SourceName } from '../../shared/tracker.js'
import type { CanonicalPlayer } from '../services/players.js'
export type { SourceName } from '../../shared/tracker.js'

export type ProviderRunOptions = {
  headless?: boolean
  sleeperRoster?: CanonicalPlayer[]
}

export interface ValueProvider {
  name: SourceName
  tracksSleeperRoster?: boolean
  needsSleeperRoster?: boolean
  run(options?: ProviderRunOptions): Promise<SnapshotInput>
}

export class ProviderError extends Error {
  constructor(
    public code: 'login' | 'challenge' | 'rate-limit' | 'format' | 'configuration' | 'unavailable',
    message: string,
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}
