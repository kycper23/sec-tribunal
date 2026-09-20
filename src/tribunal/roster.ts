/**
 * Single source of truth for the tribunal cast. Every role that appears in a
 * trial is declared here — label, model, fallback model, and seed — so that
 * upcoming features (model fallback, the Court Bill, cost forecasting, new
 * roles) only ever touch this file instead of being spread across the app.
 *
 * `||` (not `??`) so an env var present but set to an empty string still
 * falls back to the default — Vercel dashboards make it easy to add a key
 * with a blank value, which would otherwise send an empty "model" to the
 * gateway and fail with "A model is required."
 */

export type RoleId = 'clerk' | 'prosecution' | 'defense' | 'rebuttal' | 'judge'

export interface RosterEntry {
  id: RoleId
  label: string
  /** null = the role runs without an LLM (e.g. the clerk's deterministic forensics), cost 0. */
  model: string | null
  /** Model to fall back to when the primary is unavailable. null for non-LLM roles. */
  fallback: string | null
  /** Fixed seed for reproducible completions (not yet wired into the calls). */
  seed?: number
}

/** Default workhorse model for the argumentative rounds. */
export const MODEL_FAST = process.env.OPENROUTER_MODEL_FAST || 'anthropic/claude-sonnet-5'

// The judge keeps its historical higher-quality default so that, without any
// new env vars, verdicts run on exactly the same model as before.
const MODEL_JUDGE = process.env.OPENROUTER_MODEL_JUDGE || 'anthropic/claude-fable-5'

const MODEL_PROSECUTION = process.env.OPENROUTER_MODEL_PROSECUTION || MODEL_FAST
const MODEL_DEFENSE = process.env.OPENROUTER_MODEL_DEFENSE || MODEL_FAST

/** One fixed seed for every LLM role — reruns of the same trial stay comparable. */
const TRIBUNAL_SEED = 1729

/** The cast, in order of appearance during a trial. */
export const ROSTER: RosterEntry[] = [
  { id: 'clerk', label: 'The Scribe', model: null, fallback: null },
  { id: 'prosecution', label: 'The Skeptic', model: MODEL_PROSECUTION, fallback: MODEL_FAST, seed: TRIBUNAL_SEED },
  { id: 'defense', label: 'The Advocate', model: MODEL_DEFENSE, fallback: MODEL_FAST, seed: TRIBUNAL_SEED },
  {
    id: 'rebuttal',
    label: 'The Skeptic (rebuttal)',
    model: MODEL_PROSECUTION,
    fallback: MODEL_FAST,
    seed: TRIBUNAL_SEED,
  },
  { id: 'judge', label: 'The Arbiter', model: MODEL_JUDGE, fallback: MODEL_FAST, seed: TRIBUNAL_SEED },
]

export const getRole = (id: RoleId): RosterEntry => {
  const entry = ROSTER.find((r) => r.id === id)
  if (!entry) throw new Error(`Unknown tribunal role: ${id}`)
  return entry
}
