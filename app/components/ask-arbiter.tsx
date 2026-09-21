'use client'

/**
 * Ask the Arbiter — after the verdict, the audience may ask the Judge one of
 * three pre-baked follow-up questions (a closed set, mirroring
 * `app/api/followup/route.ts`). Each question can be asked exactly once;
 * answers accumulate as judge quotes with a Court-Bill-style cost line.
 * Nothing is persisted — refresh and the tribunal forgets you asked.
 */
import { useEffect, useState } from 'react'

const fmtTok = (n: number) => n.toLocaleString('en-US')

/** "openai/gpt-5.2" → "gpt-5.2"; "anthropic/claude-fable-5" → "fable-5". */
const shortModel = (model: string): string => {
  const afterSlash = model.includes('/') ? model.slice(model.indexOf('/') + 1) : model
  return afterSlash.replace(/^claude-/, '')
}

/** The ONLY three questions — keys must match QUESTIONS in the followup route. */
const QUESTIONS: Array<{ key: string; label: string }> = [
  { key: 'gap', label: 'Why did you depart from the arithmetic?' },
  { key: 'change', label: 'What would change your verdict?' },
  { key: 'closest', label: 'Which charge came closest to falling?' },
]

/** Shape of a successful /api/followup response (see route.ts). */
interface FollowupUsage {
  totalTokens: number
  cost: number
  model: string
  fellBack: boolean
}

interface AnswerEntry {
  question: string
  answer: string
  usage: FollowupUsage
}

export default function AskArbiter({ brief, verdict }: { brief: string; verdict: unknown }) {
  const [answers, setAnswers] = useState<AnswerEntry[]>([])
  const [used, setUsed] = useState<string[]>([])
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dots, setDots] = useState('.')
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (pending === null) return
    const dotCycle = ['.', '..', '...']
    let dotIndex = 0
    let tick = 0
    setDots(dotCycle[dotIndex])
    setSeconds(0)
    const interval = setInterval(() => {
      tick += 1
      dotIndex = (dotIndex + 1) % dotCycle.length
      setDots(dotCycle[dotIndex])
      if (tick % 2 === 0) setSeconds((s) => s + 1)
    }, 500)
    return () => clearInterval(interval)
  }, [pending])

  const ask = async (key: string, label: string) => {
    setPending(key)
    setError(null)
    try {
      const res = await fetch('/api/followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: key, brief, verdict }),
      })
      if (!res.ok) {
        // 429 (rate limit) or any other error: surface the API's own message
        // and leave the button usable for a retry.
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        setError(data?.error ?? `The Arbiter did not answer (HTTP ${res.status}).`)
        return
      }
      const data = (await res.json()) as { answer: string; usage: FollowupUsage }
      setAnswers((prev) => [...prev, { question: label, answer: data.answer, usage: data.usage }])
      setUsed((prev) => [...prev, key])
    } catch {
      setError('The Arbiter did not answer — network error.')
    } finally {
      setPending(null)
    }
  }

  const remaining = QUESTIONS.filter((q) => !used.includes(q.key))

  return (
    <section className="bill-receipt">
      <h3>Ask the Arbiter</h3>
      {remaining.length > 0 ? (
        <nav className="nav-links">
          {remaining.map((q) => (
            <button
              key={q.key}
              type="button"
              className="nav-link"
              disabled={pending !== null}
              onClick={() => ask(q.key, q.label)}
            >
              {pending === q.key ? 'The Arbiter considers…' : q.label}
            </button>
          ))}
        </nav>
      ) : (
        <p className="bill-footnote">The tribunal has adjourned.</p>
      )}
      {pending !== null && (
        <div>
          <p className="bill-footnote">
            The Arbiter is deliberating{dots} · {seconds}s
          </p>
          <p className="bill-footnote">
            Q: {QUESTIONS.find((q) => q.key === pending)?.label}
          </p>
        </div>
      )}
      {error && <p className="bill-footnote">{error}</p>}
      {answers.map((a, i) => (
        <div key={i}>
          <p className="bill-footnote">Q: {a.question}</p>
          <blockquote>
            <p>{a.answer}</p>
          </blockquote>
          <p className="bill-footnote">
            Arbiter · {shortModel(a.usage.model)}
            {a.usage.fellBack ? ' (fallback)' : ''} · {fmtTok(a.usage.totalTokens)} tok ·{' '}
            {a.usage.cost.toFixed(4)} CREDIT
          </p>
        </div>
      ))}
    </section>
  )
}
