import { config } from 'dotenv'
import OpenAI from 'openai'

config({ path: ['.env.local', '.env'], quiet: true })

const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY
if (!apiKey) {
  throw new Error(
    'OPENROUTER_API_KEY is not set. Claim a key on Orbio, then copy .env.example to .env.local.',
  )
}

const baseURL = process.env.OPENAI_BASE_URL || 'https://api.orbio.so/api/v1'

export const openrouter = new OpenAI({
  apiKey,
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
      authorization: 'Bearer ' + apiKey,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

export const DEFAULT_MODEL = process.env.OPENROUTER_MODEL ?? 'anthropic/claude-sonnet-4.5'
