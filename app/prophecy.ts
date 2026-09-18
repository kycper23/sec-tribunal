/**
 * "Beat the Tribunal" — the Prophecy Engine's game logic. Pure arithmetic
 * over data that already exists (the judge's score, the deterministic
 * RealityReport): no model is ever consulted to settle a prophecy, so the
 * outcome can be trusted as ground truth.
 *
 * The wager is the DIRECTION of Revenue after the seal date: 'rise' or
 * 'fall'. The tribunal "bets" implicitly through its financial-health score
 * (>= 50 reads as confidence the business rises); the player bets explicitly
 * before the verdict; SEC EDGAR's filed reality settles both.
 */
import type { RealityReport, Verdict } from './trial'

export type Call = 'rise' | 'fall'

export type ProphecyOutcome =
  | 'both-right'
  | 'user-beats-tribunal'
  | 'tribunal-beats-user'
  | 'both-wrong'

/** The tribunal's implicit bet: a healthy score is a bet on rise. */
export const tribunalCall = (verdict: Verdict): Call => (verdict.score >= 50 ? 'rise' : 'fall')

/**
 * Reality's answer: the sign of the Revenue delta filed after the seal.
 * `null` when reality can't settle it (no Revenue delta after the cutoff).
 */
export const realityCall = (reality: RealityReport | null): Call | null => {
  if (!reality) return null
  const revenue = reality.deltas.find((d) => d.label === 'Revenue')
  if (!revenue || revenue.changePct === null) return null
  return revenue.changePct > 0 ? 'rise' : 'fall'
}

/** Settle the wager. Only meaningful when the player actually prophesied. */
export const judgeOutcome = (user: Call, tribunal: Call, reality: Call): ProphecyOutcome => {
  const userRight = user === reality
  const tribunalRight = tribunal === reality
  if (userRight && tribunalRight) return 'both-right'
  if (userRight) return 'user-beats-tribunal'
  if (tribunalRight) return 'tribunal-beats-user'
  return 'both-wrong'
}

export const OUTCOME_LABEL: Record<ProphecyOutcome, string> = {
  'both-right': 'BOTH CALLED IT',
  'user-beats-tribunal': 'YOU BEAT THE TRIBUNAL',
  'tribunal-beats-user': 'THE TRIBUNAL BEAT YOU',
  'both-wrong': 'REALITY FOOLED YOU BOTH',
}

export const CALL_LABEL: Record<Call, string> = { rise: 'Rise', fall: 'Fall' }
