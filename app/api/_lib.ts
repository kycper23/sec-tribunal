import { NextResponse } from 'next/server'
import { RESERVE_USD, getBalance, llmCallAllowed, recordLlmCall } from '../../src/orbio/treasury.js'

export const jsonError = (message: string, status = 400) => NextResponse.json({ error: message }, { status })

export const asString = (v: unknown): string => (typeof v === 'string' ? v : '')

/**
 * Wrap a route handler so any thrown error (missing env var, upstream
 * OpenRouter/Orbio failure, model returning malformed JSON, etc.) becomes a
 * proper `{ error }` JSON response instead of an unhandled exception —
 * which Next.js turns into a generic, empty-body 500 with no diagnostics.
 */
export const withErrorHandling =
  (handler: (req: Request) => Promise<NextResponse>) =>
  async (req: Request): Promise<NextResponse> => {
    try {
      return await handler(req)
    } catch (err) {
      console.error('API route error:', err)
      const message = err instanceof Error ? err.message : 'Unexpected server error.'
      return jsonError(message, 500)
    }
  }

/** Maksymalna łączna długość pojedynczego tekstu wejściowego do modelu. */
const MAX_MODEL_INPUT_CHARS = 40_000

const LLM_RATE_LIMIT_MESSAGE = 'Too many model calls from your IP — please wait before trying again.'
const TREASURY_EMPTY_MESSAGE = "The tribunal's CREDIT treasury is spent. A finished ruling is on file."

/**
 * Bramka przed każdym płatnym wywołaniem modelu (prosecutor/defense/rebuttal/
 * judge/followup): limit długości wejścia, rate limit wywołań modeli per IP
 * oraz rezerwa skarbca. Zwraca gotową odpowiedź błędu albo null, gdy wolno
 * kontynuować (wtedy wywołanie jest już odnotowane w puli IP).
 */
export async function guardModelCall(req: Request, texts: string[]): Promise<Response | null> {
  const forwardedFor = req.headers.get('x-forwarded-for') ?? ''
  const ip = forwardedFor.split(',')[0]?.trim() || 'unknown'

  if (texts.some((t) => t.length > MAX_MODEL_INPUT_CHARS)) {
    return jsonError('Input text too large for the tribunal to hear.', 413)
  }
  if (!llmCallAllowed(ip)) {
    return jsonError(LLM_RATE_LIMIT_MESSAGE, 429)
  }
  // Gdy saldo jest null (awaria odczytu), NIE blokujemy — awaria po naszej
  // stronie nie może karać użytkownika (ta sama zasada co canConveneNow).
  const balance = await getBalance()
  if (balance !== null && balance.availableUsd <= RESERVE_USD) {
    return jsonError(TREASURY_EMPTY_MESSAGE, 429)
  }

  recordLlmCall(ip)
  return null
}
