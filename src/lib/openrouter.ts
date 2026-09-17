import { config } from 'dotenv'
import OpenAI from 'openai'

config({ path: ['.env.local', '.env'], quiet: true })

// Resolved lazily (not at module load) so a missing key surfaces as a normal
// catchable Error inside a request handler, instead of crashing the whole
// module at import time (which, in a serverless function, produces an
// unhandled exception and a blank 500 response with no diagnostic message).
const getApiKey = (): string => {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error(
      'OPENROUTER_API_KEY is not set. Claim a key on Orbio, then copy .env.example to .env.local ' +
        "(locally), or add it to your deployment platform's environment variables (production).",
    )
  }
  return apiKey
}

const baseURL = process.env.OPENAI_BASE_URL || 'https://api.orbio.so/api/v1'

export const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || 'missing',
  baseURL,
  defaultHeaders: {
    'HTTP-Referer': process.env.APP_URL ?? 'https://orbio.so/build',
    'X-Title': process.env.APP_NAME ?? 'Orbio Build Week',
  },
})

export const openrouterFetch = (path: string, init: RequestInit = {}) => {
  const cleanBase = baseURL.replace(/\/+$/, '')
  const cleanPath = path.replace(/^\/+/, '')
  return fetch(cleanBase + '/' + cleanPath, {
    ...init,
    headers: {
      authorization: 'Bearer ' + getApiKey(),
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

// `||` (not `??`) so an env var present but set to an empty string still
// falls back to the default.
export const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4.5'
