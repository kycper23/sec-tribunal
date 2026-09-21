'use client'

/**
 * Compare mode: two companies tried in parallel, verdicts side by side.
 * Each trial runs the same staged API chain as the main courtroom.
 */
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { BillReceipt } from '../components/court-bill'
import type { ForensicsResult } from '../components/forensic-report'
import { HomeButton } from '../components/home-button'
import { post, type BillEntry, type CallUsage, type Company, type Verdict } from '../trial'
import { VerdictCard } from '../verdict-card'

interface TrialOutcome {
  company: Company
  verdict: Verdict
  forensic: ForensicsResult | null
  bill: BillEntry[]
}

const runChain = async (
  ticker: string,
  onStatus: (s: string) => void,
  onCost: (cost: number) => void,
): Promise<TrialOutcome> => {
  const bill: BillEntry[] = []
  const record = (label: string, usage: CallUsage) => {
    bill.push({ label, usage })
    onCost(usage.cost)
  }
  onStatus('gathering evidence…')
  const ev = await post<{
    company: Company
    peerBrief: string | null
    brief: string
    forensic: ForensicsResult | null
  }>('/api/evidence', { ticker })
  onStatus('prosecution…')
  const pr = await post<{ bearCase: string; usage: CallUsage }>('/api/prosecutor', { brief: ev.brief })
  record('Prosecutor', pr.usage)
  onStatus('defense…')
  const df = await post<{ defense: string; usage: CallUsage }>('/api/defense', {
    brief: ev.brief,
    bearCase: pr.bearCase,
    peerBrief: ev.peerBrief,
  })
  record('Defense', df.usage)
  onStatus('rebuttal…')
  const rb = await post<{ rebuttal: string; usage: CallUsage }>('/api/rebuttal', {
    brief: ev.brief,
    bearCase: pr.bearCase,
    defense: df.defense,
  })
  record('Prosecutor (rebuttal)', rb.usage)
  onStatus('judge deliberating…')
  const jd = await post<{ verdict: Verdict; usage: CallUsage }>('/api/judge', {
    bearCase: pr.bearCase,
    defense: df.defense,
    rebuttal: rb.rebuttal,
  })
  record('Judge', jd.usage)
  onStatus('verdict in')
  return { company: ev.company, verdict: jd.verdict, forensic: ev.forensic ?? null, bill }
}

export default function ComparePage() {
  const [tickers, setTickers] = useState(['', ''])
  const [busy, setBusy] = useState(false)
  const [statuses, setStatuses] = useState(['', ''])
  const [error, setError] = useState('')
  const [outcomes, setOutcomes] = useState<(TrialOutcome | null)[]>([null, null])
  const [elapsed, setElapsed] = useState(0)
  const [liveCost, setLiveCost] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopTimer = () => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }
  useEffect(() => stopTimer, [])

  const setStatus = (i: number, s: string) =>
    setStatuses((prev) => prev.map((v, j) => (j === i ? s : v)))

  const run = async (e: React.FormEvent) => {
    e.preventDefault()
    const [a, b] = tickers.map((t) => t.trim().toUpperCase())
    if (!a || !b || busy) return
    setBusy(true)
    setError('')
    setOutcomes([null, null])
    setElapsed(0)
    setLiveCost(0)
    stopTimer()
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000)
    const onCost = (cost: number) => setLiveCost((prev) => prev + cost)
    try {
      const results = await Promise.all([
        runChain(a, (s) => setStatus(0, s), onCost),
        runChain(b, (s) => setStatus(1, s), onCost),
      ])
      setOutcomes(results)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'A trial was interrupted. Please retry.')
    } finally {
      stopTimer()
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
        <div className="live-cost-meter">
          {tickers[0].trim().toUpperCase()}: {statuses[0]} · {tickers[1].trim().toUpperCase()}: {statuses[1]} ·{' '}
          {elapsed}s · {liveCost.toFixed(4)} CREDIT so far
        </div>
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
                <VerdictCard
                  verdict={o.verdict}
                  title={`${o.company.ticker} — ${o.company.name}`}
                  forensic={o.forensic}
                />
                <BillReceipt entries={o.bill} />
              </div>
            ),
        )}
      </div>

      <footer className="footer">
        Data: SEC EDGAR XBRL companyfacts · Not investment advice ·{' '}
        <Link href="/scoreboard">Scoreboard</Link> · <Link href="/methodology">Methodology</Link>
      </footer>
    </main>
  )
}
