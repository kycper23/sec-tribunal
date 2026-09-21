/**
 * Post-verdict follow-up: the audience may ask the Judge ONE of three
 * pre-baked questions — no free-text field, so there is zero prompt-injection
 * surface. This route does NOT count against the daily trial budget (it is
 * not a trial), but it DOES respect the per-IP hourly rate limit.
 */
import { NextResponse } from 'next/server'
import { openrouterFetch } from '../../../src/lib/openrouter.js'
import { getRole, MODEL_FAST } from '../../../src/tribunal/roster.js'
import type { CallUsage } from '../../../src/tribunal/agents.js'
import { followupAllowed, recordFollowup } from '../../../src/orbio/treasury.js'
import { asString, jsonError, withErrorHandling } from '../_lib.js'

export const maxDuration = 120

// Same model as runJudge, with the same ROSTER fallback. `?? MODEL_FAST` /
// `?? undefined` only narrow the `string | null` type — the judge role in the
// roster carries a concrete model and fallback.
const MODEL_JUDGE = getRole('judge').model ?? MODEL_FAST
const FALLBACK_JUDGE = getRole('judge').fallback ?? undefined

/** The ONLY three questions the audience can ask — a closed set, no free text. */
const QUESTIONS: Record<string, string> = {
  gap: 'Why did you depart from the arithmetic in your own scoring?',
  change: 'What single piece of evidence would change your verdict?',
  closest: 'Which charge came closest to falling the other way?',
}

interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

/** Hard ceiling on a single model call — same rationale as agents.ts. */
const COMPLETION_TIMEOUT_MS = 90_000

/** One model call; usage mapped to the same CallUsage shape as the other routes. */
const completeOnce = async (messages: ChatMessage[], model: string): Promise<{ content: string; usage: CallUsage }> => {
  const res = await openrouterFetch('/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(COMPLETION_TIMEOUT_MS),
    body: JSON.stringify({ model, messages, usage: { include: true } }),
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
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
    model,
    fellBack: false,
  }
  return { content: data.choices[0].message.content, usage }
}

/** completeOnce + one-shot ROSTER fallback — same contract as agents.ts complete(). */
const complete = async (messages: ChatMessage[]): Promise<{ content: string; usage: CallUsage }> => {
  try {
    return await completeOnce(messages, MODEL_JUDGE)
  } catch (err) {
    if (err instanceof Error && err.message.includes('OPENROUTER_API_KEY')) throw err
    if (!FALLBACK_JUDGE || FALLBACK_JUDGE === MODEL_JUDGE) throw err
    try {
      const result = await completeOnce(messages, FALLBACK_JUDGE)
      return { ...result, usage: { ...result.usage, fellBack: true } }
    } catch {
      // Fallback failed too — surface the ORIGINAL error, which names the primary model.
      throw err
    }
  }
}

export const POST = withErrorHandling(async (req: Request) => {
  const forwardedFor = req.headers.get('x-forwarded-for') ?? ''
  const ip = forwardedFor.split(',')[0]?.trim() || 'unknown'
  if (!followupAllowed(ip)) {
    return jsonError('Rate limit reached for your IP — please wait before asking the Judge again.', 429)
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const questionKey = asString(body.question)
  const question = QUESTIONS[questionKey]
  if (!question) return jsonError('Invalid "question" — must be one of: gap, change, closest.')

  const brief = asString(body.brief)
  const verdict = body.verdict
  if (!brief || typeof verdict !== 'object' || verdict === null) {
    return jsonError('Missing "brief" or "verdict".')
  }

  recordFollowup(ip)

  const { content, usage } = await complete([
    {
      role: 'system',
      content: [
        'You are the Judge of the SEC Tribunal, answering ONE follow-up question from the audience after delivering your verdict.',
        'Answer in AT MOST three sentences.',
        'Base your answer strictly on the evidence brief and your own verdict provided below — do not invent numbers that are not in the evidence.',
      ].join(' '),
    },
    {
      role: 'user',
      content: `--- EVIDENCE BRIEF ---\n\n${brief}\n\n--- YOUR VERDICT ---\n\n${JSON.stringify(verdict, null, 2)}\n\n--- AUDIENCE QUESTION ---\n\n${question}`,
    },
  ])

  return NextResponse.json({ answer: content.trim(), usage })
})
