/**
 * The Prophecy Ledger — a local track record of blind trials, written at the
 * moment the seal breaks (the only moment verdict + reality + wager are all
 * known). Pure localStorage, SSR-safe (every access guarded), capped FIFO so
 * the book can't grow without bound.
 */
import type { Call, ProphecyOutcome } from './prophecy'

export interface LedgerEntry {
  /** Epoch ms when the seal was broken. */
  ts: number
  ticker: string
  cutoff: string
  score: number
  /** The player's wager; null when they declined to prophesy. */
  userCall: Call | null
  tribunalCall: Call
  /** Reality's answer; null when EDGAR filed nothing to settle against. */
  realityCall: Call | null
  /** Settled outcome; null when unsettled or the player didn't wager. */
  outcome: ProphecyOutcome | null
}

const KEY = 'prophecy-ledger-v1'
const MAX_ENTRIES = 50

export const loadLedger = (): LedgerEntry[] => {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as LedgerEntry[]) : []
  } catch {
    return []
  }
}

export const appendLedger = (entry: LedgerEntry): LedgerEntry[] => {
  const next = [entry, ...loadLedger()].slice(0, MAX_ENTRIES)
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Private mode / quota — the ledger simply doesn't persist.
  }
  return next
}

export const clearLedger = (): void => {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}

/** Aggregate tallies for the ledger header. */
export interface LedgerTally {
  trials: number
  /** Settled trials only (reality answered). */
  settled: number
  tribunalRight: number
  userWagers: number
  userRight: number
}

export const tallyLedger = (entries: LedgerEntry[]): LedgerTally => {
  const tally: LedgerTally = { trials: entries.length, settled: 0, tribunalRight: 0, userWagers: 0, userRight: 0 }
  for (const e of entries) {
    if (e.realityCall === null) continue
    tally.settled += 1
    if (e.tribunalCall === e.realityCall) tally.tribunalRight += 1
    if (e.userCall !== null) {
      tally.userWagers += 1
      if (e.userCall === e.realityCall) tally.userRight += 1
    }
  }
  return tally
}
