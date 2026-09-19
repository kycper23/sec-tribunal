'use client'

/**
 * Compare mode: two companies tried in parallel, verdicts side by side.
 * Each trial runs the same staged API chain as the main courtroom.
 */
import { useState } from 'react'
import { HomeButton } from '../components/home-button'
import { post, type Company, type Verdict } from '../trial'
import { VerdictCard } from '../verdict-card'

interface TrialOutcome {
  company: Company
  verdict: Verdict
}

const runChain = async (ticker: string, onStatus: (s: string) => void): Promise<TrialOutcome> => {
  onStatus('gathering evidence…')
  const ev = await post<{ company: Company; peerBrief: string | null; brief: string }>('/api/evidence', { ticker })
  onStatus('prosecution…')
  const pr = await post<{ bearCase: string }>('/api/prosecutor', { brief: ev.brief })
  onStatus('defense…')
  const df = await post<{ defense: string }>('/api/defense', {
    brief: ev.brief,
    bearCase: pr.bearCase,
    peerBrief: ev.peerBrief,
  })
  onStatus('rebuttal…')
  const rb = await post<{ rebuttal: string }>('/api/rebuttal', {
    brief: ev.brief,
    bearCase: pr.bearCase,
    defense: df.defense,
  })
  onStatus('judge deliberating…')
  const jd = await post<{ verdict: Verdict }>('/api/judge', {
    bearCase: pr.bearCase,
    defense: df.defense,
    rebuttal: rb.rebuttal,
  })
  onStatus('verdict in')
  return { company: ev.company, verdict: jd.verdict }
}

export default function ComparePage() {
  const [tickers, setTickers] = useState(['', ''])
  const [busy, setBusy] = useState(false)
  const [statuses, setStatuses] = useState(['', ''])
  const [error, setError] = useState('')
  const [outcomes, setOutcomes] = useState<(TrialOutcome | null)[]>([null, null])

  const setStatus = (i: number, s: string) =>
    setStatuses((prev) => prev.map((v, j) => (j === i ? s : v)))

  const run = async (e: React.FormEvent) => {
    e.preventDefault()
    const [a, b] = tickers.map((t) => t.trim().toUpperCase())
    if (!a || !b || busy) return
    setBusy(true)
    setError('')
    setOutcomes([null, null])
    try {
      const results = await Promise.all([
        runChain(a, (s) => setStatus(0, s)),
        runChain(b, (s) => setStatus(1, s)),
      ])
      setOutcomes(results)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'A trial was interrupted. Please retry.')
    } finally {
      setBusy(false)
    }
  }

  const [left, right] = outcomes
  const winner =
    left && right && left.verdict.score !== right.verdict.score
      ? (left.verdict.score > right.verdict.score ? left : right).company.ticker
      : null

  return (
    <main className="container container-wide">
      <HomeButton />
      <header className="masthead">
        <div className="eyebrow">Double Trial · Head to Head</div>
        <h1>SEC Tribunal</h1>
        <p>Two companies. Two trials. One healthier balance sheet.</p>
      </header>

      <form className="ticker-form" onSubmit={run}>
        {tickers.map((t, i) => (
          <input
            key={i}
            value={t}
            onChange={(e) => setTickers((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
            placeholder={i === 0 ? 'INTC' : 'AMD'}
            maxLength={10}
            aria-label={`Ticker ${i + 1}`}
          />
        ))}
        <button type="submit" disabled={busy}>
          {busy ? 'In session…' : 'Try Both'}
        </button>
      </form>

      {busy && (
        <p className="status-line">
          {tickers[0].toUpperCase()}: {statuses[0]} · {tickers[1].toUpperCase()}: {statuses[1]}
        </p>
      )}
      {error && <p className="error">{error}</p>}

      {winner && (
        <p className="status-line">
          The tribunal finds <strong>{winner}</strong> in better financial health.
        </p>
      )}

      <div className="compare-grid">
        {outcomes.map(
          (o, i) =>
            o && (
              <div key={i}>
                <VerdictCard verdict={o.verdict} title={`${o.company.ticker} — ${o.company.name}`} />
              </div>
            ),
        )}
      </div>

      <footer className="footer">
        Data: SEC EDGAR XBRL companyfacts · Not investment advice.
      </footer>
    </main>
  )
}
