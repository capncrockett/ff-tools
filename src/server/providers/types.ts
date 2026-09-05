import type { SnapshotInput, SourceName } from '../../shared/tracker.js'
export type { SourceName } from '../../shared/tracker.js'

export interface ValueProvider {
  name: SourceName
  run(options?: { headless?: boolean }): Promise<SnapshotInput>
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
