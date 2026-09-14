import type { SnapshotInput, SourceName } from '../../shared/tracker.js'
import type { CanonicalPlayer } from '../services/players.js'
export type { SourceName } from '../../shared/tracker.js'

export type ProviderRunOptions = {
  headless?: boolean
  sleeperRoster?: CanonicalPlayer[]
}

// Every player a provider lists, as its capture already received it. Saved to that provider's
// player table after a successful capture; never part of valuation identity.
export type DynastyGmCatalogEntry = {
  id: number
  firstName: string
  lastName: string
  pos: string
  team: string | null
  dob?: unknown
  draftYear?: unknown
  status?: unknown
}
export type DtcCatalogRow = {
  rank: number
  playerName: string
  team: string
  position: string
  age: string
}
export type ProviderCatalog =
  | { source: 'dynasty-nerds'; players: DynastyGmCatalogEntry[] }
  | { source: 'dynasty-calculator'; rows: DtcCatalogRow[] }

// Capture diagnostics are saved with the run, never mixed into valuation identity.
export type ProviderSnapshot = SnapshotInput & { warnings?: string[]; catalog?: ProviderCatalog }

export interface ValueProvider {
  name: SourceName
  tracksSleeperRoster?: boolean
  needsSleeperRoster?: boolean
  run(options?: ProviderRunOptions): Promise<ProviderSnapshot>
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
