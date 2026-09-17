import { NextResponse } from 'next/server'

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
