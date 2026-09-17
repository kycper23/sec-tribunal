'use client'

/**
 * The courtroom. The trial runs as staged API calls; each agent's speech is
 * revealed with a typewriter effect so the debate plays out live on screen.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { buildDossier, post, type Company, type Speech, type Verdict } from './trial'
import { VerdictCard } from './verdict-card'

function Typewriter({ text, done, onDone }: { text: string; done: boolean; onDone: () => void }) {
  const [shown, setShown] = useState(0)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  useEffect(() => {
    if (done || shown >= text.length) {
      if (!done && shown >= text.length) onDoneRef.current()
      return
    }
    const step = Math.max(2, Math.round(text.length / 400))
    const id = setTimeout(() => setShown((s) => Math.min(s + step, text.length)), 12)
    return () => clearTimeout(id)
  }, [shown, text, done])
  const visible = done ? text : text.slice(0, shown)
  return (
    <div className="speech-body">
      {visible}
      {!done && <span className="cursor">&nbsp;</span>}
    </div>
  )
}

export default function Courtroom() {
  const [ticker, setTicker] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [speeches, setSpeeches] = useState<Speech[]>([])
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const dossierRef = useRef<string | null>(null)

  const addSpeech = (s: Speech) => setSpeeches((prev) => [...prev, s])
  const finishLast = useCallback(
    () => setSpeeches((prev) => prev.map((s, i) => (i === prev.length - 1 ? { ...s, done: true } : s))),
    [],
  )

  const runTrial = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = ticker.trim().toUpperCase()
    if (!t || busy) return
    setBusy(true)
    setError('')
    setSpeeches([])
    setVerdict(null)
    setCompany(null)
    dossierRef.current = null

    try {
      setStatus('The clerk is gathering SEC filings…')
      const ev = await post<{ company: Company; peer: Company | null; brief: string; peerBrief: string | null }>(
        '/api/evidence',
        { ticker: t },
      )
      setCompany(ev.company)
      addSpeech({
        role: 'clerk',
        title: 'Clerk of the Tribunal',
        text:
          `Case called: ${ev.company.name} (${ev.company.ticker}), CIK ${ev.company.cik10}.\n` +
          `Exhibit A entered: XBRL financial facts from SEC EDGAR 10-K/10-Q filings.` +
          (ev.peer ? `\nExhibit B entered: industry peer ${ev.peer.name} (${ev.peer.ticker}).` : ''),
        done: true,
      })

      setStatus('The prosecution has the floor…')
      const pr = await post<{ bearCase: string }>('/api/prosecutor', { brief: ev.brief })
      addSpeech({ role: 'prosecutor', title: 'The Prosecution', text: pr.bearCase, done: false })

      setStatus('The defense prepares…')
      const df = await post<{ defense: string }>('/api/defense', {
        brief: ev.brief,
        bearCase: pr.bearCase,
        peerBrief: ev.peerBrief,
      })
      finishLast()
      addSpeech({ role: 'defense', title: 'The Defense', text: df.defense, done: false })

      setStatus('Cross-examination…')
      const rb = await post<{ rebuttal: string }>('/api/rebuttal', {
        brief: ev.brief,
        bearCase: pr.bearCase,
        defense: df.defense,
      })
      finishLast()
      addSpeech({ role: 'prosecutor', title: 'The Prosecution — Rebuttal', text: rb.rebuttal, done: false })

      setStatus('The judge deliberates…')
      const jd = await post<{ verdict: Verdict }>('/api/judge', {
        bearCase: pr.bearCase,
        defense: df.defense,
        rebuttal: rb.rebuttal,
      })
      finishLast()
      setVerdict(jd.verdict)
      setStatus('')
      dossierRef.current = buildDossier(ev.company, pr.bearCase, df.defense, rb.rebuttal, jd.verdict)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The trial was interrupted. Please retry.')
      setStatus('')
    } finally {
      setBusy(false)
    }
  }

  const downloadDossier = () => {
    if (!dossierRef.current || !company) return
    const blob = new Blob([dossierRef.current], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `DOSSIER_${company.ticker}.md`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <main className="container">
      <header className="masthead">
        <h1>⚖️ SEC TRIBUNAL</h1>
        <p>Three AI agents put a public company on trial — evidence: real SEC EDGAR filings.</p>
      </header>

      <nav className="nav-links">
        <Link href="/compare">Double trial (compare two tickers)</Link>
        <Link href="/dossier/TSLA">Demo: TSLA</Link>
        <Link href="/dossier/INTC">Demo: INTC</Link>
        <Link href="/dossier/AAPL">Demo: AAPL</Link>
      </nav>

      <form className="ticker-form" onSubmit={runTrial}>
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder="TSLA"
          maxLength={10}
          aria-label="Stock ticker"
        />
        <button type="submit" disabled={busy}>
          {busy ? 'In session…' : 'Put on Trial'}
        </button>
      </form>

      {status && <p className="status-line">{status}</p>}
      {error && <p className="error">{error}</p>}

      {speeches.map((s, i) => (
        <section key={i} className="speech">
          <div className="speech-head">
            <span className={`speech-role ${s.role}`}>{s.title}</span>
            {company && <span className="speech-sub">In re {company.name}</span>}
          </div>
          <Typewriter text={s.text} done={s.done} onDone={finishLast} />
        </section>
      ))}

      {verdict && company && (
        <>
          <VerdictCard verdict={verdict} />
          <div className="actions">
            <button onClick={downloadDossier}>Download dossier (.md)</button>
          </div>
        </>
      )}

      <footer className="footer">
        Built for Orbio Build Week · Data: SEC EDGAR XBRL companyfacts · Not investment advice.
      </footer>
    </main>
  )
}
