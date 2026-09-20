/**
 * The three tribunal agents, run as sequential completions (same pattern as
 * examples/07-agent.ts): Prosecutor and Defense argue in free text, the Judge
 * returns a structured verdict validated with Zod.
 */
import { z } from 'zod'
import { openrouterFetch } from '../lib/openrouter.js'
import type { ForensicsResult } from '../sec/forensics.js'
import { renderForensics } from '../sec/forensics.js'
import { getRole, MODEL_FAST } from './roster.js'

// Models come from the tribunal roster (src/tribunal/roster.ts) — the single
// source of truth for the cast. Split per role to cut trial latency
// (~150s end-to-end): the argumentative rounds (prosecutor/defense/rebuttal)
// run on a faster model, while the judge keeps the higher-quality model for
// its structured verdict. `?? MODEL_FAST` only narrows the `string | null`
// type — every LLM role in the roster carries a concrete model.
const MODEL_PROSECUTION = getRole('prosecution').model ?? MODEL_FAST
const MODEL_DEFENSE = getRole('defense').model ?? MODEL_FAST
const MODEL_REBUTTAL = getRole('rebuttal').model ?? MODEL_FAST
const MODEL_JUDGE = getRole('judge').model ?? MODEL_FAST

// Fallback models from the same roster — used once per call when the primary
// model is unavailable (no provider, 404, 429/5xx after retries). `?? undefined`
// only narrows `string | null`; every LLM role carries a concrete fallback.
const FALLBACK_PROSECUTION = getRole('prosecution').fallback ?? undefined
const FALLBACK_DEFENSE = getRole('defense').fallback ?? undefined
const FALLBACK_REBUTTAL = getRole('rebuttal').fallback ?? undefined
const FALLBACK_JUDGE = getRole('judge').fallback ?? undefined

interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

/**
 * The Court Bill — real cost of a model call, straight from Orbio's `usage`
 * block (`usage.cost` is USD, funded by tokenized $ORBIO credits). Every
 * field defaults to 0 so a gateway that omits `usage` degrades gracefully
 * instead of breaking the trial.
 */
export interface CallUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cachedTokens: number
  cost: number
  /** The model that ACTUALLY answered — differs from the role's primary when the fallback kicked in. */
  model: string
  /** true when the primary model failed and the ROSTER fallback answered instead. */
  fellBack: boolean
}

const ZERO_USAGE: CallUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  cachedTokens: 0,
  cost: 0,
  model: '',
  fellBack: false,
}

export const sumUsage = (entries: CallUsage[]): CallUsage =>
  entries.reduce(
    (acc, u) => ({
      promptTokens: acc.promptTokens + u.promptTokens,
      completionTokens: acc.completionTokens + u.completionTokens,
      totalTokens: acc.totalTokens + u.totalTokens,
      cachedTokens: acc.cachedTokens + u.cachedTokens,
      cost: acc.cost + u.cost,
      // An aggregate spans several models, so `model` stays '' — per-call
      // attribution lives in the individual CallUsage entries.
      model: acc.model,
      fellBack: acc.fellBack || u.fellBack,
    }),
    ZERO_USAGE,
  )

interface CompletionResult {
  content: string
  usage: CallUsage
}

/** Retry transient failures (429 / 5xx) with exponential backoff — hackathon-week insurance. */
const MAX_ATTEMPTS = 3

/**
 * Hard ceiling on a single model call. Without this, a hung upstream request
 * just rides the route's `maxDuration` (up to 300s) with zero feedback until
 * the platform kills the function — the user sees a generic timeout, not a
 * useful message. Aborting client-side lets us surface a clear error instead.
 */
const COMPLETION_TIMEOUT_MS = 90_000

/** One model call with the existing 429/5xx retry loop — no fallback logic here. */
const completeOnce = async (
  messages: ChatMessage[],
  responseFormat: object | undefined,
  model: string,
): Promise<CompletionResult> => {
  for (let attempt = 1; ; attempt++) {
    let res: Response
    try {
      res = await openrouterFetch('/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(COMPLETION_TIMEOUT_MS),
        body: JSON.stringify({
          model,
          messages,
          usage: { include: true },
          ...(responseFormat ? { response_format: responseFormat, provider: { require_parameters: true } } : {}),
        }),
      })
    } catch (err) {
      // AbortSignal.timeout fires a DOMException named "TimeoutError" — not
      // transient in any useful sense (the upstream is unresponsive), so
      // surface a clear message immediately instead of burning the retry
      // budget on more multi-minute hangs.
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new Error(
          `The tribunal timed out waiting for a response after ${COMPLETION_TIMEOUT_MS / 1000}s. Please retry.`,
        )
      }
      // Network-level failure (DNS hiccup, connection reset) — no HTTP
      // response was ever received, so there's no res.status to check.
      // Treat it the same as a retryable 5xx instead of letting it sink the
      // whole trial on a transient blip. Configuration errors (e.g. a
      // missing API key, thrown synchronously by openrouterFetch before it
      // ever calls fetch) are not transient, so they skip the retry loop.
      if (err instanceof Error && err.message.includes('OPENROUTER_API_KEY')) throw err
      if (attempt >= MAX_ATTEMPTS) throw err instanceof Error ? err : new Error(String(err))
      const delayMs = 1500 * 2 ** (attempt - 1)
      const reason = err instanceof Error ? err.message : String(err)
      console.warn(`  (model call network error "${reason}"; retry ${attempt}/${MAX_ATTEMPTS - 1} in ${delayMs} ms)`)
      await new Promise((r) => setTimeout(r, delayMs))
      continue
    }
    if (res.ok) {
      const data = (await res.json()) as {
        choices: Array<{ message: { content: string } }>
        usage?: {
          prompt_tokens?: number
          completion_tokens?: number
          total_tokens?: number
          cost?: number
          prompt_tokens_details?: { cached_tokens?: number }
        }
      }
      const u = data.usage
      const usage: CallUsage = {
        promptTokens: u?.prompt_tokens ?? 0,
        completionTokens: u?.completion_tokens ?? 0,
        totalTokens: u?.total_tokens ?? 0,
        cachedTokens: u?.prompt_tokens_details?.cached_tokens ?? 0,
        cost: u?.cost ?? 0,
        // The model that actually answered; `fellBack` is finalized by the
        // complete() wrapper, which knows whether this was the fallback run.
        model,
        fellBack: false,
      }
      return { content: data.choices[0].message.content, usage }
    }
    const body = await res.text()
    const retryable = res.status === 429 || res.status >= 500
    if (!retryable || attempt >= MAX_ATTEMPTS) throw new Error(`${res.status} ${body}`)
    const delayMs = 1500 * 2 ** (attempt - 1)
    console.warn(`  (model call failed with ${res.status}; retry ${attempt}/${MAX_ATTEMPTS - 1} in ${delayMs} ms)`)
    await new Promise((r) => setTimeout(r, delayMs))
  }
}

/**
 * completeOnce + one-shot model fallback. When the primary model is
 * unavailable (Orbio "no provider serving this model", 404, or 429/5xx that
 * exhausted the retry budget), the call is repeated ONCE on `fallbackModel`
 * from the ROSTER and the switch is recorded on the returned CallUsage
 * (`model` = the model that actually answered, `fellBack: true`). If the
 * fallback fails too, the ORIGINAL error is rethrown. Schema-validation
 * errors never reach this catch — Zod parsing happens in the callers, after
 * complete() has already returned — so only network/availability failures
 * trigger the fallback. Configuration errors (missing API key) are not
 * availability issues and are rethrown immediately.
 */
const complete = async (
  messages: ChatMessage[],
  responseFormat?: object,
  model: string = MODEL_FAST,
  fallbackModel?: string,
): Promise<CompletionResult> => {
  try {
    return await completeOnce(messages, responseFormat, model)
  } catch (err) {
    if (err instanceof Error && err.message.includes('OPENROUTER_API_KEY')) throw err
    if (!fallbackModel || fallbackModel === model) throw err
    const reason = err instanceof Error ? err.message : String(err)
    console.warn(`  (model "${model}" unavailable — "${reason}"; falling back to "${fallbackModel}")`)
    try {
      const result = await completeOnce(messages, responseFormat, fallbackModel)
      return { ...result, usage: { ...result.usage, fellBack: true } }
    } catch {
      // Fallback failed too — surface the ORIGINAL error, which names the
      // role's primary model and is the more useful diagnostic.
      throw err
    }
  }
}

// --- 0. Peer suggestion (one cheap call, used when the dictionary has no entry)

export const askForPeerTicker = async (companyName: string, ticker: string): Promise<string | null> => {
  const { content } = await complete([
    {
      role: 'system',
      content:
        'Name the single closest US-listed public competitor of the given company. Reply with its stock ticker only — one word, uppercase, no punctuation, no explanation. If unsure, reply NONE.',
    },
    { role: 'user', content: `${companyName} (${ticker})` },
  ])
  const candidate = content.trim().toUpperCase().replace(/[^A-Z.-]/g, '')
  return candidate && candidate !== 'NONE' && candidate.length <= 6 ? candidate : null
}

// --- 1. Prosecutor -----------------------------------------------------------

export const runProsecutor = async (brief: string): Promise<{ bearCase: string; usage: CallUsage }> => {
  const { content, usage } = await complete([
    {
      role: 'system',
      content: [
        'You are the Prosecutor in the SEC Tribunal, a financial court that judges the health of public companies.',
        'Build the strongest evidence-based bear case against the company using ONLY the SEC-filed figures provided in Exhibit A.',
        'Focus on: shrinking margins, rising debt, weakening year-over-year revenue, and worrying trends in the most recent quarters and fiscal years.',
        'Exhibit A may end with a "RECENT MATERIAL EVENTS — 8-K DOCKET" section listing recent SEC 8-K filings (restatements, auditor changes, bankruptcy, executive departures, new debt, impairments, delisting notices). Treat red-flagged docket entries as serious evidence and cite them by date as [Exhibit A].',
        'Present AT MOST 4 numbered charges — quality over quantity. Each charge must be AT MOST 3 sentences and cite specific figures and periods, referencing the evidence as [Exhibit A]. Do not invent numbers. Be sharp but factual.',
        'Do not use opening formulas such as "May it please the Tribunal" or "In re:" — start directly with the first charge.',
      ].join(' '),
    },
      { role: 'user', content: `EXHIBIT A — Financial evidence from SEC EDGAR:\n\n${brief}` },
    ],
    undefined,
    MODEL_PROSECUTION,
    FALLBACK_PROSECUTION,
  )
  return { bearCase: content, usage }
}

// --- 2. Defense --------------------------------------------------------------

export const runDefense = async (
  brief: string,
  bearCase: string,
  peerBrief: string | null,
): Promise<{ defense: string; usage: CallUsage }> => {
  const { content, usage } = await complete([
    {
      role: 'system',
      content: [
        'You are the Defense counsel in the SEC Tribunal.',
        'You receive the SEC-filed financial data (Exhibit A), the prosecution\'s bear case,',
        peerBrief
          ? 'and Exhibit B — the same SEC-filed data for a direct industry competitor. Use Exhibit B to give industry context: if the sector shares the same headwinds, or your client compares favourably, say so with the competitor\'s actual numbers.'
          : 'with no peer data available this session.',
        'Rebut AT MOST 4 charges by number — pick the ones you can win. Each rebuttal must be AT MOST 3 sentences: industry context, deliberate growth investment, one-off costs, balance-sheet strength, improving recent trends. Reference evidence as [Exhibit A] and [Exhibit B].',
        'If the prosecution cites the 8-K docket, do not dismiss red-flagged entries (restatements, auditor changes, bankruptcy, delisting) as noise — argue timing, remediation, or materiality instead.',
        'Use ONLY the figures provided — do not invent numbers. Where a charge is genuinely hard to argue, concede it honestly rather than spin.',
        'Do not use opening formulas such as "May it please the Tribunal" or "In re:" — start directly with the first rebuttal.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `EXHIBIT A — Financial evidence from SEC EDGAR:\n\n${brief}`,
        ...(peerBrief ? [`EXHIBIT B — Industry peer comparison (SEC EDGAR):\n\n${peerBrief}`] : []),
        `PROSECUTION'S BEAR CASE:\n\n${bearCase}`,
        ].join('\n\n---\n\n'),
      },
    ],
    undefined,
    MODEL_DEFENSE,
    FALLBACK_DEFENSE,
  )
  return { defense: content, usage }
}

// --- 3. Prosecutor's rebuttal (cross-examination round) -----------------------

export const runProsecutorRebuttal = async (
  brief: string,
  bearCase: string,
  defense: string,
): Promise<{ rebuttal: string; usage: CallUsage }> => {
  const { content, usage } = await complete([
    {
      role: 'system',
      content: [
        'You are the Prosecutor in the SEC Tribunal, returning for a short rebuttal after the defense has spoken.',
        'Pick AT MOST 4 of the WEAKEST points of the defense and dismantle them with specific figures from Exhibit A. Each point must be AT MOST 3 sentences.',
        'If the defense conceded a charge, note it for the record. If a defense point is genuinely strong, do not pretend otherwise — drop it and focus where you can win.',
        'Be brief: a few sharp points, not a repeat of the original case. Do not invent numbers.',
        'Do not use opening formulas such as "May it please the Tribunal" or "In re:" — start directly with the first point.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `EXHIBIT A — Financial evidence from SEC EDGAR:\n\n${brief}`,
        `YOUR ORIGINAL CHARGES:\n\n${bearCase}`,
        `DEFENSE'S RESPONSE:\n\n${defense}`,
        ].join('\n\n---\n\n'),
      },
    ],
    undefined,
    MODEL_REBUTTAL,
    FALLBACK_REBUTTAL,
  )
  return { rebuttal: content, usage }
}

// --- 3. Judge (structured verdict) -------------------------------------------

const ChargeVerdict = z.object({
  charge: z.string().describe('The prosecution charge, condensed to one sentence with its key figure.'),
  rebuttal: z.string().describe('The defense counter-argument, condensed to one sentence.'),
  status: z.enum(['SUSTAINED', 'DISMISSED', 'PARTIALLY VALID']),
  category: z
    .enum(['growth', 'profitability', 'earnings_quality', 'leverage', 'liquidity', 'other'])
    .describe('The sub-score bucket this charge belongs to; use "other" only when none of the five fits.'),
})

// Sent to the model as the structured `response_format`. Splitting the
// verdict narrative into three dedicated fields — rather than one free-form
// "summary" string — is what actually forces the model to structure its
// prose; asking for "2-3 paragraphs" inside a single string field was
// consistently ignored and came back as one dense block of text.
const JudgeOutput = z.object({
  conclusion: z.string().describe('One sentence: the verdict in brief.'),
  reasoning: z.string().describe('Two or three sentences: why this score, based on which arguments survived cross-examination.'),
  outlook: z.string().describe('Two or three sentences: what to watch going forward for this company.'),
  charges: z.array(ChargeVerdict),
  score: z.number().min(1).max(100).describe('Financial Health Score: 1 = distressed, 100 = excellent.'),
  recommendation: z.string().describe('One short paragraph: the tribunal recommendation for an investor.'),
  revenueCall: z
    .enum(['rise', 'fall'])
    .describe('Explicit call: will revenue in the NEXT reported fiscal year rise or fall vs the last full year in evidence? Independent of the score.'),
  revenueCallConfidence: z.enum(['low', 'medium', 'high']).describe('Confidence in the revenue call.'),
})

// Public shape consumed by the rest of the app (report.ts, verdict-card.tsx,
// trial.ts, ...). `summary` is kept for compatibility — it is assembled from
// `conclusion` + `reasoning` + `outlook`, joined by a blank line, once the
// judge call returns.
export const Verdict = z.object({
  summary: z.string(),
  charges: z.array(ChargeVerdict),
  score: z.number().min(1).max(100),
  recommendation: z.string(),
  revenueCall: z.enum(['rise', 'fall']),
  revenueCallConfidence: z.enum(['low', 'medium', 'high']),
})

export type VerdictData = z.infer<typeof Verdict>

/**
 * Anchoring guard for the judge: removes the clerk's "DETERMINISTIC FORENSIC
 * SCORE" block — the five sub-scores, the total, and the Flags section — from
 * a brief. Cuts from the line starting with "DETERMINISTIC FORENSIC SCORE" up
 * to the next ALL-CAPS section header, or to the end of the string when the
 * Flags section closes the brief. Everything else (raw filed figures,
 * "Derived ratios", the 8-K docket) survives the cut. Pure: a brief without
 * the block is returned unchanged.
 */
export const stripForensicsBlock = (brief: string): string => {
  const lines = brief.split('\n')
  const start = lines.findIndex((line) => line.trimStart().startsWith('DETERMINISTIC FORENSIC SCORE'))
  if (start === -1) return brief
  // A section header is a line with letters but no lowercase ones that is not
  // a list item — e.g. "RECENT MATERIAL EVENTS — 8-K DOCKET". Flag entries
  // ("- [HIGH] ...") start with "-" and are never mistaken for headers.
  const isUpperHeader = (line: string): boolean => {
    const t = line.trim()
    return /[A-Z]/.test(t) && !/[a-z]/.test(t) && !t.startsWith('-')
  }
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (isUpperHeader(lines[i])) {
      end = i
      break
    }
  }
  // Swallow the blank lines that separated the block from the previous
  // section so the seam is a single blank line (or a clean end of string).
  let head = start
  while (head > 0 && lines[head - 1].trim() === '') head--
  const kept = end < lines.length ? [...lines.slice(0, head), '', ...lines.slice(end)] : lines.slice(0, head)
  return kept.join('\n')
}

export const runJudge = async (
  bearCase: string,
  defense: string,
  rebuttal: string,
  forensic?: ForensicsResult,
): Promise<{ verdict: VerdictData; usage: CallUsage }> => {
  // The judge must NOT see the clerk's sub-scores, total or flags — otherwise
  // the CLERK vs TRIBUNAL comparison (Narrative Gap) measures agreement with
  // a printed number, not independent judgment. stripForensicsBlock removes
  // exactly that block BEFORE the message to the model is built; anything
  // else the exhibit carries (raw data, derived ratios, 8-K docket) survives.
  // Prosecutor, defense and rebuttal keep receiving the brief unchanged.
  const forensicText = forensic ? stripForensicsBlock(renderForensics(forensic)).trim() : ''
  const forensicBlock = forensicText ? `\n\n--- CLERK'S FORENSIC REPORT ---\n\n${forensicText}` : ''
  const { content, usage } = await complete(
    [
      {
        role: 'system',
        content: [
          'You are the Judge of the SEC Tribunal. Weigh the prosecution\'s case, the defense, and the prosecution\'s closing rebuttal impartially.',
          'For each original prosecution charge, decide: SUSTAINED (the concern stands), DISMISSED (the defense convincingly refuted it), or PARTIALLY VALID.',
          'Give weight to concessions on either side and to which arguments survived cross-examination.',
          "The clerk's forensic report, when present, is a bespoke, bias-free numeric exhibit — a deterministic score computed directly from the filings, independent of either side's rhetoric — and it must not be ignored. If your Financial Health Score departs from the clerk's total score by more than 15 points, you must justify that gap explicitly in \"reasoning\".",
          'Fill "conclusion" with one sentence stating the verdict in brief. Fill "reasoning" with 2 to 3 sentences on why this score, citing which arguments survived cross-examination (and, if applicable, why the score departs from the clerk\'s forensic score by more than 15 points). Fill "outlook" with 2 to 3 sentences on what to watch going forward. Keep the three fields distinct — do not repeat the same sentence across them.',
          "Then assign a Financial Health Score from 1 to 100 and give an investor-facing recommendation. Base everything strictly on the arguments, figures, and the clerk's forensic report presented.",
          'Separately, issue an explicit revenue call in "revenueCall": will the company\'s revenue in the NEXT reported fiscal year rise or fall versus the last full fiscal year visible in the evidence? This call is INDEPENDENT of the Financial Health Score — the score measures financial condition, not revenue direction: a healthy company can have falling revenue and a weak one can have rising revenue. Never derive the call from the score; base it on the revenue trajectory, guidance, and arguments in evidence. State your confidence in "revenueCallConfidence" (low, medium, or high).',
          'Assign each charge a "category": one of the five sub-score buckets — growth, profitability, earnings_quality, leverage, liquidity — or "other" if none of the five fits.',
        ].join(' '),
      },
      {
        role: 'user',
        content: `--- PROSECUTION ---\n\n${bearCase}\n\n--- DEFENSE ---\n\n${defense}\n\n--- PROSECUTION'S REBUTTAL ---\n\n${rebuttal}${forensicBlock}`,
      },
    ],
    {
      type: 'json_schema',
      json_schema: { name: 'verdict', strict: true, schema: z.toJSONSchema(JudgeOutput) },
    },
    MODEL_JUDGE,
    FALLBACK_JUDGE,
  )
  const parsed = JudgeOutput.parse(JSON.parse(content))
  const { conclusion, reasoning, outlook, ...rest } = parsed
  const summary = [conclusion, reasoning, outlook].join('\n\n')
  return { verdict: Verdict.parse({ ...rest, summary }), usage }
}
