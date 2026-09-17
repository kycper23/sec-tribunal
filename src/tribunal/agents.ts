/**
 * The three tribunal agents, run as sequential completions (same pattern as
 * examples/07-agent.ts): Prosecutor and Defense argue in free text, the Judge
 * returns a structured verdict validated with Zod.
 */
import { z } from 'zod'
import { openrouterFetch } from '../lib/openrouter.js'

const MODEL = process.env.OPENROUTER_MODEL ?? 'anthropic/claude-fable-5'

interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

/** Retry transient failures (429 / 5xx) with exponential backoff — hackathon-week insurance. */
const MAX_ATTEMPTS = 3

const complete = async (messages: ChatMessage[], responseFormat?: object): Promise<string> => {
  for (let attempt = 1; ; attempt++) {
    const res = await openrouterFetch('/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: MODEL,
        messages,
        ...(responseFormat ? { response_format: responseFormat, provider: { require_parameters: true } } : {}),
      }),
    })
    if (res.ok) {
      const data = (await res.json()) as { choices: Array<{ message: { content: string } }> }
      return data.choices[0].message.content
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
  const answer = await complete([
    {
      role: 'system',
      content:
        'Name the single closest US-listed public competitor of the given company. Reply with its stock ticker only — one word, uppercase, no punctuation, no explanation. If unsure, reply NONE.',
    },
    { role: 'user', content: `${companyName} (${ticker})` },
  ])
  const candidate = answer.trim().toUpperCase().replace(/[^A-Z.-]/g, '')
  return candidate && candidate !== 'NONE' && candidate.length <= 6 ? candidate : null
}

// --- 1. Prosecutor -----------------------------------------------------------

export const runProsecutor = (brief: string): Promise<string> =>
  complete([
    {
      role: 'system',
      content: [
        'You are the Prosecutor in the SEC Tribunal, a financial court that judges the health of public companies.',
        'Build the strongest evidence-based bear case against the company using ONLY the SEC-filed figures provided in Exhibit A.',
        'Focus on: shrinking margins, rising debt, weakening year-over-year revenue, and worrying trends in the most recent quarters and fiscal years.',
        'Present 3 to 6 numbered charges. Each charge must cite specific figures and periods, referencing the evidence as [Exhibit A]. Do not invent numbers. Be sharp but factual.',
      ].join(' '),
    },
    { role: 'user', content: `EXHIBIT A — Financial evidence from SEC EDGAR:\n\n${brief}` },
  ])

// --- 2. Defense --------------------------------------------------------------

export const runDefense = (brief: string, bearCase: string, peerBrief: string | null): Promise<string> =>
  complete([
    {
      role: 'system',
      content: [
        'You are the Defense counsel in the SEC Tribunal.',
        'You receive the SEC-filed financial data (Exhibit A), the prosecution\'s bear case,',
        peerBrief
          ? 'and Exhibit B — the same SEC-filed data for a direct industry competitor. Use Exhibit B to give industry context: if the sector shares the same headwinds, or your client compares favourably, say so with the competitor\'s actual numbers.'
          : 'with no peer data available this session.',
        'Rebut each charge by number: industry context, deliberate growth investment, one-off costs, balance-sheet strength, improving recent trends. Reference evidence as [Exhibit A] and [Exhibit B].',
        'Use ONLY the figures provided — do not invent numbers. Where a charge is genuinely hard to argue, concede it honestly rather than spin.',
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

// --- 3. Prosecutor's rebuttal (cross-examination round) -----------------------

export const runProsecutorRebuttal = (brief: string, bearCase: string, defense: string): Promise<string> =>
  complete([
    {
      role: 'system',
      content: [
        'You are the Prosecutor in the SEC Tribunal, returning for a short rebuttal after the defense has spoken.',
        'Pick the 2-3 WEAKEST points of the defense and dismantle them with specific figures from Exhibit A.',
        'If the defense conceded a charge, note it for the record. If a defense point is genuinely strong, do not pretend otherwise — drop it and focus where you can win.',
        'Be brief: a few sharp paragraphs, not a repeat of the original case. Do not invent numbers.',
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

export const runJudge = async (bearCase: string, defense: string, rebuttal: string): Promise<VerdictData> => {
  const content = await complete(
    [
      {
        role: 'system',
        content: [
          'You are the Judge of the SEC Tribunal. Weigh the prosecution\'s case, the defense, and the prosecution\'s closing rebuttal impartially.',
          'For each original prosecution charge, decide: SUSTAINED (the concern stands), DISMISSED (the defense convincingly refuted it), or PARTIALLY VALID.',
          'Give weight to concessions on either side and to which arguments survived cross-examination.',
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
  )
  return Verdict.parse(JSON.parse(content))
}
