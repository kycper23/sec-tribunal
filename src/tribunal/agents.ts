/**
 * The three tribunal agents, run as sequential completions (same pattern as
 * examples/07-agent.ts): Prosecutor and Defense argue in free text, the Judge
 * returns a structured verdict validated with Zod.
 */
import { z } from 'zod'
import { openrouterFetch } from '../lib/openrouter.js'

// `||` (not `??`) so an env var present but set to an empty string still
// falls back to the default — Vercel dashboards make it easy to add a key
// with a blank value, which would otherwise send an empty "model" to the
// gateway and fail with "A model is required."
// Split models per role to cut trial latency (~150s end-to-end): the
// argumentative rounds (prosecutor/defense/rebuttal) run on a faster model,
// while the judge keeps the higher-quality model for its structured verdict.
const MODEL_FAST = process.env.OPENROUTER_MODEL_FAST || 'anthropic/claude-sonnet-5'
const MODEL_JUDGE = process.env.OPENROUTER_MODEL_JUDGE || 'anthropic/claude-fable-5'

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
}

const ZERO_USAGE: CallUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedTokens: 0, cost: 0 }

export const sumUsage = (entries: CallUsage[]): CallUsage =>
  entries.reduce(
    (acc, u) => ({
      promptTokens: acc.promptTokens + u.promptTokens,
      completionTokens: acc.completionTokens + u.completionTokens,
      totalTokens: acc.totalTokens + u.totalTokens,
      cachedTokens: acc.cachedTokens + u.cachedTokens,
      cost: acc.cost + u.cost,
    }),
    ZERO_USAGE,
  )

interface CompletionResult {
  content: string
  usage: CallUsage
}

/** Retry transient failures (429 / 5xx) with exponential backoff — hackathon-week insurance. */
const MAX_ATTEMPTS = 3

const complete = async (
  messages: ChatMessage[],
  responseFormat?: object,
  model: string = MODEL_FAST,
): Promise<CompletionResult> => {
  for (let attempt = 1; ; attempt++) {
    const res = await openrouterFetch('/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model,
        messages,
        usage: { include: true },
        ...(responseFormat ? { response_format: responseFormat, provider: { require_parameters: true } } : {}),
      }),
    })
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
      const usage: CallUsage = u
        ? {
            promptTokens: u.prompt_tokens ?? 0,
            completionTokens: u.completion_tokens ?? 0,
            totalTokens: u.total_tokens ?? 0,
            cachedTokens: u.prompt_tokens_details?.cached_tokens ?? 0,
            cost: u.cost ?? 0,
          }
        : ZERO_USAGE
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
  ])
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
  ])
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
  ])
  return { rebuttal: content, usage }
}

// --- 3. Judge (structured verdict) -------------------------------------------

export const Verdict = z.object({
  summary: z.string().describe('Two or three sentences: the essence of the case and the ruling.'),
  charges: z.array(
    z.object({
      charge: z.string().describe('The prosecution charge, condensed to one sentence with its key figure.'),
      rebuttal: z.string().describe('The defense counter-argument, condensed to one sentence.'),
      status: z.enum(['SUSTAINED', 'DISMISSED', 'PARTIALLY VALID']),
    }),
  ),
  score: z.number().min(1).max(100).describe('Financial Health Score: 1 = distressed, 100 = excellent.'),
  recommendation: z.string().describe('One short paragraph: the tribunal recommendation for an investor.'),
})

export type VerdictData = z.infer<typeof Verdict>

export const runJudge = async (
  bearCase: string,
  defense: string,
  rebuttal: string,
): Promise<{ verdict: VerdictData; usage: CallUsage }> => {
  const { content, usage } = await complete(
    [
      {
        role: 'system',
        content: [
          'You are the Judge of the SEC Tribunal. Weigh the prosecution\'s case, the defense, and the prosecution\'s closing rebuttal impartially.',
          'For each original prosecution charge, decide: SUSTAINED (the concern stands), DISMISSED (the defense convincingly refuted it), or PARTIALLY VALID.',
          'Give weight to concessions on either side and to which arguments survived cross-examination.',
          'Write the "summary" field as 2 to 3 short paragraphs separated by a blank line ("\\n\\n") — never one dense block of text. The first paragraph must be a single-sentence conclusion (the ruling in one line). Each following paragraph must be 2 to 3 sentences of reasoning that supports it.',
          'Then assign a Financial Health Score from 1 to 100 and give an investor-facing recommendation. Base everything strictly on the arguments and figures presented.',
        ].join(' '),
      },
      {
        role: 'user',
        content: `--- PROSECUTION ---\n\n${bearCase}\n\n--- DEFENSE ---\n\n${defense}\n\n--- PROSECUTION'S REBUTTAL ---\n\n${rebuttal}`,
      },
    ],
    {
      type: 'json_schema',
      json_schema: { name: 'verdict', strict: true, schema: z.toJSONSchema(Verdict) },
    },
    MODEL_JUDGE,
  )
  return { verdict: Verdict.parse(JSON.parse(content)), usage }
}
