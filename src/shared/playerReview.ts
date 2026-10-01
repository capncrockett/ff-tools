import type { SourceName } from './tracker.js'

export type ReviewPlayer = {
  id: number
  name: string
  position: string | null
  birthDate: string | null
  sleeperId: string | null
  rostered: boolean
}
export type PlayerMatchRow = {
  source: SourceName
  key: string
  name: string
  position: string
  birthDate: string | null
  age: number | null
  lastSeenAt: string
  current: boolean
  status: string
  method: string | null
  note: string
  linked: ReviewPlayer | null
  candidates: ReviewPlayer[]
  rostered: boolean
}
export type PlayerMatchReview = { rows: PlayerMatchRow[]; total: number; rosterAvailable: boolean }
