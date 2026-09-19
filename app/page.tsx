'use client'

/**
 * The courtroom. The trial runs as staged API calls; each agent's speech is
 * revealed with a typewriter effect so the debate plays out live on screen.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AgentBench, type BenchStates } from './components/agent-bench'
import { BlindTrialToggle } from './components/blind-trial-toggle'
import { BillReceipt, CostBadge, CourtBill } from './components/court-bill'
import { DocketPanel } from './components/docket'
import { ExhibitChart } from './components/exhibit-chart'
import { Markdown } from './components/markdown'
import { ProphecyCardActions } from './components/prophecy-card'
import { ProphecyLedger } from './components/prophecy-ledger'
import { ProphecyPanel, ProphecyStickyBar } from './components/prophecy-panel'
import { RevealBanner } from './components/reveal-banner'
import { TempleGate } from './components/temple-gate'
import { TrialProgress, type Phase } from './components/trial-progress'
import {
  buildDossier,
  post,
  type BillEntry,
  type CallUsage,
  type ChartSeries,
  type Company,
  type Docket,
  type RealityReport,
  type Speech,
  type Verdict,
} from './trial'
import { VerdictCard } from './verdict-card'
import { judgeOutcome, realityCall, tribunalCall, type Call } from './prophecy'
import { appendLedger, clearLedger, loadLedger, type LedgerEntry } from './ledger'

/** Default seal date offered when Blind Trial is first switched on: one year back. */
const defaultCutoff = (): string => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 1)
  return d.toISOString().slice(0, 10)
}

const BENCH_IDLE: BenchStates = { prosecutor: 'idle', defense: 'idle', judge: 'idle' }

/** mm:ss for the elapsed-time readout. */
const formatElapsed = (totalSeconds: number): string => {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Human phase description shown above the bench while the trial is in session. */
const phaseLabel = (phase: Phase | null): string => {
  switch (phase) {
    case 'evidence':
      return 'The Scribe is gathering evidence…'
    case 'prosecution':
      return 'The Skeptic is building the case…'
    case 'defense':
      return 'The Advocate is preparing the defense…'
    case 'rebuttal':
      return 'The Skeptic is replying…'
    case 'verdict':
      return 'The Arbiter is deliberating…'
    default:
      return 'The tribunal is in session…'
  }
}

/** How close to the bottom of the page (px) still counts as "following" live output. */
const FOLLOW_THRESHOLD = 160

function Typewriter({
  text,
  done,
  onDone,
  onTick,
}: {
  text: string
  done: boolean
  onDone: () => void
  onTick?: () => void
}) {
  const [shown, setShown] = useState(0)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  const onTickRef = useRef(onTick)
  onTickRef.current = onTick
  useEffect(() => {
    if (done || shown >= text.length) {
      if (!done && shown >= text.length) onDoneRef.current()
      return
    }
    const step = Math.max(2, Math.round(text.length / 400))
    const id = setTimeout(() => {
      setShown((s) => Math.min(s + step, text.length))
      onTickRef.current?.()
    }, 12)
    return () => clearTimeout(id)
  }, [shown, text, done])
  const visible = done ? text : text.slice(0, shown)
  return (
    <div className="speech-body">
      <Markdown text={visible} />
      {!done && <span className="cursor">&nbsp;</span>}
    </div>
  )
}

export default function Courtroom() {
  const [ticker, setTicker] = useState('')
  const [tickerError, setTickerError] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [speeches, setSpeeches] = useState<Speech[]>([])
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [bench, setBench] = useState<BenchStates>(BENCH_IDLE)
  const [bill, setBill] = useState<BillEntry[]>([])
  const [docket, setDocket] = useState<Docket | null>(null)
  const [series, setSeries] = useState<ChartSeries[]>([])
  const [phase, setPhase] = useState<Phase | null>(null)
  const [phaseDone, setPhaseDone] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [follow, setFollow] = useState(true)
  const followRef = useRef(true)
  const dossierRef = useRef<string | null>(null)
  const [blindTrial, setBlindTrial] = useState(false)
  const [cutoff, setCutoff] = useState(defaultCutoff)
  const [sealedCutoff, setSealedCutoff] = useState<string | null>(null)
  const [reality, setReality] = useState<RealityReport | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [futureSeries, setFutureSeries] = useState<ChartSeries[]>([])
  const [userCall, setUserCall] = useState<Call | null>(null)
  const [ledger, setLedger] = useState<LedgerEntry[]>([])

  // The ledger lives in localStorage: read only after mount so the server
  // render (empty) always matches the first client render.
  useEffect(() => {
    setLedger(loadLedger())
  }, [])

  const addSpeech = (s: Speech) => setSpeeches((prev) => [...prev, s])
  const finishLast = useCallback(
    () => setSpeeches((prev) => prev.map((s, i) => (i === prev.length - 1 ? { ...s, done: true } : s))),
    [],
  )
  const addBill = (label: string, usage?: CallUsage) => {
    if (!usage) return
    setBill((prev) => [...prev, { label, usage }])
  }

  const stopElapsedTimer = useCallback(() => {
    if (elapsedTimerRef.current !== null) {
      clearInterval(elapsedTimerRef.current)
      elapsedTimerRef.current = null
    }
  }, [])

  const startElapsedTimer = useCallback(() => {
    stopElapsedTimer()
    setElapsed(0)
    elapsedTimerRef.current = setInterval(() => {
      setElapsed((s) => s + 1)
    }, 1000)
  }, [stopElapsedTimer])

  // Always clear the interval when the courtroom unmounts.
  useEffect(() => stopElapsedTimer, [stopElapsedTimer])

  const scrollToBottom = useCallback(() => {
    window.scrollTo(0, document.documentElement.scrollHeight)
  }, [])

  // Track whether the user is glued to the bottom of the page (i.e. "following"
  // the live trial) so we don't yank their scroll position if they've scrolled
  // up to re-read an earlier speech.
  useEffect(() => {
    const onScroll = () => {
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - FOLLOW_THRESHOLD
      followRef.current = atBottom
      setFollow(atBottom)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const jumpToLive = () => {
    followRef.current = true
    setFollow(true)
    scrollToBottom()
  }

  /**
   * Breaking the seal is the one moment verdict + reality + wager are all
   * known — so it's also the moment the trial is written into the ledger.
   */
  const breakSeal = () => {
    setRevealed(true)
    if (!company || !verdict || !reality || !sealedCutoff) return
    const actual = realityCall(reality)
    const tribunal = tribunalCall(verdict)
    setLedger(
      appendLedger({
        ts: Date.now(),
        ticker: company.ticker,
        cutoff: sealedCutoff,
        score: verdict.score,
        userCall,
        tribunalCall: tribunal,
        realityCall: actual,
        outcome: userCall !== null && actual !== null ? judgeOutcome(userCall, tribunal, actual) : null,
      }),
    )
  }

  const wipeLedger = () => {
    clearLedger()
    setLedger([])
  }

  const runTrial = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = ticker.trim().toUpperCase()
    if (busy) return
    if (!t) {
      setTickerError('Enter a ticker symbol first')
      return
    }
    setTickerError('')
    setBusy(true)
    setError('')
    setSpeeches([])
    setVerdict(null)
    setCompany(null)
    setBench(BENCH_IDLE)
    setBill([])
    setDocket(null)
    setSeries([])
    setPhase('evidence')
    setPhaseDone(false)
    startElapsedTimer()
    followRef.current = true
    setFollow(true)
    dossierRef.current = null
    const sealAt = blindTrial ? cutoff : null
    setSealedCutoff(sealAt)
    setReality(null)
    setRevealed(false)
    setUserCall(null)

    try {
      setStatus(sealAt ? `The clerk is sealing the record at ${sealAt}…` : 'The clerk is gathering SEC filings…')
      const ev = await post<{
        company: Company
        peer: Company | null
        brief: string
        peerBrief: string | null
        docket: Docket | null
        series: ChartSeries[]
        reality: RealityReport | null
        futureSeries: ChartSeries[]
      }>('/api/evidence', { ticker: t, ...(sealAt ? { cutoff: sealAt } : {}) })
      setCompany(ev.company)
      setDocket(ev.docket)
      setSeries(ev.series)
      setReality(ev.reality)
      setFutureSeries(ev.futureSeries ?? [])
      addSpeech({
        role: 'clerk',
        title: 'The Scribe — Clerk of the Tribunal',
        text:
          `Case called: ${ev.company.name} (${ev.company.ticker}), CIK ${ev.company.cik10}.\n` +
          `Exhibit A entered: XBRL financial facts from SEC EDGAR 10-K/10-Q filings.` +
          (ev.peer ? `\nExhibit B entered: industry peer ${ev.peer.name} (${ev.peer.ticker}).` : ''),
        done: true,
      })
      if (followRef.current) scrollToBottom()

      setStatus('The prosecution has the floor…')
      setPhase('prosecution')
      setBench({ prosecutor: 'thinking', defense: 'idle', judge: 'idle' })
      const pr = await post<{ bearCase: string; usage?: CallUsage }>('/api/prosecutor', { brief: ev.brief })
      addSpeech({ role: 'prosecutor', title: 'The Skeptic — Prosecution', text: pr.bearCase, done: false, usage: pr.usage })
      addBill('Prosecutor', pr.usage)
      if (followRef.current) scrollToBottom()

      setStatus('The defense prepares…')
      setPhase('defense')
      setBench({ prosecutor: 'speaking', defense: 'thinking', judge: 'idle' })
      const df = await post<{ defense: string; usage?: CallUsage }>('/api/defense', {
        brief: ev.brief,
        bearCase: pr.bearCase,
        peerBrief: ev.peerBrief,
      })
      finishLast()
      addSpeech({ role: 'defense', title: 'The Advocate — Defense', text: df.defense, done: false, usage: df.usage })
      addBill('Defense', df.usage)
      if (followRef.current) scrollToBottom()

      setStatus('Cross-examination…')
      setPhase('rebuttal')
      setBench({ prosecutor: 'thinking', defense: 'speaking', judge: 'idle' })
      const rb = await post<{ rebuttal: string; usage?: CallUsage }>('/api/rebuttal', {
        brief: ev.brief,
        bearCase: pr.bearCase,
        defense: df.defense,
      })
      finishLast()
      addSpeech({
        role: 'prosecutor',
        title: 'The Skeptic — Rebuttal',
        text: rb.rebuttal,
        done: false,
        usage: rb.usage,
      })
      addBill('Prosecutor (rebuttal)', rb.usage)
      if (followRef.current) scrollToBottom()

      setStatus('The judge deliberates…')
      setPhase('verdict')
      setBench({ prosecutor: 'speaking', defense: 'done', judge: 'thinking' })
      const jd = await post<{ verdict: Verdict; usage?: CallUsage }>('/api/judge', {
        bearCase: pr.bearCase,
        defense: df.defense,
        rebuttal: rb.rebuttal,
      })
      finishLast()
      addBill('Judge', jd.usage)
      setVerdict(jd.verdict)
      setBench({ prosecutor: 'done', defense: 'done', judge: 'done' })
      setPhaseDone(true)
      setStatus('')
      stopElapsedTimer()
      if (followRef.current) scrollToBottom()
      const fullBill: BillEntry[] = [
        ...(pr.usage ? [{ label: 'Prosecutor', usage: pr.usage }] : []),
        ...(df.usage ? [{ label: 'Defense', usage: df.usage }] : []),
        ...(rb.usage ? [{ label: 'Prosecutor (rebuttal)', usage: rb.usage }] : []),
        ...(jd.usage ? [{ label: 'Judge', usage: jd.usage }] : []),
      ]
      dossierRef.current = buildDossier(ev.company, pr.bearCase, df.defense, rb.rebuttal, jd.verdict, fullBill)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The trial was interrupted. Please retry.')
      setStatus('')
      setBench(BENCH_IDLE)
      setPhase(null)
      stopElapsedTimer()
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
    <main className={`container${sealedCutoff && !revealed ? ' sealed-courtroom' : ''}`}>
      {sealedCutoff && !revealed && userCall !== null && (
        <ProphecyStickyBar call={userCall} cutoff={sealedCutoff} />
      )}
      <TempleGate />
      <header className="masthead">
        <div className="eyebrow">AI Courtroom · SEC EDGAR Evidence</div>
        <h1>SEC Tribunal</h1>
        <p>
          {sealedCutoff
            ? revealed
              ? `Seal broken — the record was sealed at ${sealedCutoff}; reality is now unlocked below.`
              : `Sealed at ${sealedCutoff} — the tribunal argues blind, as if it never happened.`
            : 'Three AI agents put a public company on trial — evidence: real SEC EDGAR filings.'}
        </p>
      </header>

      <nav className="nav-links">
        <Link href="/compare">Double trial (compare two tickers)</Link>
        <Link href="/dossier/TSLA">Demo: TSLA</Link>
        <Link href="/dossier/INTC">Demo: INTC</Link>
        <Link href="/dossier/AAPL">Demo: AAPL</Link>
      </nav>

      {busy && !verdict && (
        <div className="trial-timer-bar">
          {phaseLabel(phase)} {formatElapsed(elapsed)}
        </div>
      )}

      <AgentBench states={bench} activeSpeech={speeches.length > 0 ? speeches[speeches.length - 1] : null} />

      <BlindTrialToggle
        enabled={blindTrial}
        cutoff={cutoff}
        onToggle={setBlindTrial}
        onCutoffChange={setCutoff}
        disabled={busy}
      />

      <form className="ticker-form" onSubmit={runTrial}>
        <input
          value={ticker}
          onChange={(e) => {
            setTicker(e.target.value)
            if (tickerError) setTickerError('')
          }}
          placeholder="Enter ticker (e.g. TSLA)"
          maxLength={10}
          aria-label="Stock ticker"
        />
        <button type="submit" disabled={busy}>
          {busy ? 'In session…' : blindTrial ? 'Seal the Tribunal' : 'Put on Trial'}
        </button>
      </form>

      {tickerError && <p className="ticker-error">{tickerError}</p>}

      {status && <p className="status-line">{status}</p>}
      {error && <p className="error">{error}</p>}

      <TrialProgress phase={phase} done={phaseDone} />

      {(busy || speeches.length > 0) && <CourtBill entries={bill} />}

      {speeches.map((s, i) => (
        <section key={i} className={`speech ${s.role}`}>
          <div className="speech-head">
            <span className={`speech-role ${s.role}`}>{s.title}</span>
            {company && <span className="speech-sub">In re {company.name}</span>}
            <CostBadge usage={s.usage} />
          </div>
          <Typewriter
            text={s.text}
            done={s.done}
            onDone={finishLast}
            onTick={() => followRef.current && scrollToBottom()}
          />
          {s.role === 'clerk' && <ExhibitChart series={series} future={revealed ? futureSeries : []} />}
          {s.role === 'clerk' && <DocketPanel docket={docket} />}
          {s.role === 'clerk' && sealedCutoff && (
            <ProphecyPanel
              cutoff={sealedCutoff}
              userCall={userCall}
              onCall={setUserCall}
              locked={verdict !== null}
            />
          )}
        </section>
      ))}

      {busy && !follow && (
        <button type="button" className="live-btn" onClick={jumpToLive}>
          ↓ Live
        </button>
      )}

      {verdict && company && (
        <>
          <VerdictCard verdict={verdict} />
          {sealedCutoff && (
            <RevealBanner
              reality={reality}
              revealed={revealed}
              onReveal={breakSeal}
              userCall={userCall}
              verdict={verdict}
            />
          )}
          {sealedCutoff && revealed && reality && (
            <ProphecyCardActions
              ticker={company.ticker}
              companyName={company.name}
              cutoff={sealedCutoff}
              verdict={verdict}
              reality={reality}
              userCall={userCall}
            />
          )}
          <BillReceipt entries={bill} />
          <div className="actions">
            <button onClick={downloadDossier}>Download dossier (.md)</button>
          </div>
        </>
      )}

      <ProphecyLedger entries={ledger} onClear={wipeLedger} />

      <footer className="footer">
        Built for Orbio Build Week · Data: SEC EDGAR XBRL companyfacts · Not investment advice.
      </footer>
    </main>
  )
}
