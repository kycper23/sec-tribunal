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
import { ForensicReport, type ForensicsResult } from './components/forensic-report'
import { Markdown } from './components/markdown'
import { ProphecyCardActions } from './components/prophecy-card'
import { ProphecyLedger } from './components/prophecy-ledger'
import { ProphecyModal, ProphecyPanel, ProphecyStickyBar } from './components/prophecy-panel'
import { RevealBanner } from './components/reveal-banner'
import { TempleGate } from './components/temple-gate'
import { TrialProgress, type Phase } from './components/trial-progress'
import {
  buildDossier,
  post,
  sumBill,
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

/** Five-phase ordering used by the phase progress bar (mirrors the stepper's own steps). */
const PHASE_ORDER: Phase[] = ['evidence', 'prosecution', 'defense', 'rebuttal', 'verdict']

/** Model calls made per trial: Prosecutor, Defense, Prosecutor (rebuttal), Judge. */
const MODEL_CALLS_TOTAL = 4

/** 1-based phase number of the active phase (0 when no trial is running). */
const phaseNumber = (phase: Phase | null): number => {
  if (!phase) return 0
  const i = PHASE_ORDER.indexOf(phase)
  return i < 0 ? 0 : i + 1
}

/**
 * How many of the five phases are fully finished — the active phase itself
 * doesn't count until it's done, so the bar advances in discrete 1/5 steps
 * as each phase wraps up rather than tracking a made-up percentage.
 */
const completedPhaseCount = (phase: Phase | null, done: boolean): number => {
  if (done) return PHASE_ORDER.length
  if (!phase) return 0
  const i = PHASE_ORDER.indexOf(phase)
  return i < 0 ? 0 : i
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

/**
 * Turns a raw error (thrown by `post()` from any stage of the trial — evidence,
 * prosecutor, defense, rebuttal, judge) into a message the user can act on.
 * The server's `{ error }` string is the only signal we have client-side, so
 * classification is done by matching on it: a missing ticker (SEC 404) gets a
 * specific hint, a model-call timeout keeps its own message (already
 * descriptive), anything else collapses into a generic "try again".
 */
const trialErrorMessage = (err: unknown): string => {
  const message = err instanceof Error ? err.message : ''
  if (/not found|404/i.test(message)) {
    return 'No SEC filings found for that ticker. Try a US-listed company (e.g. MSFT, NVDA).'
  }
  if (/timed out|timeout/i.test(message)) {
    return message || 'The tribunal could not convene. Please try again.'
  }
  if (/No usable us-gaap financial data|Unknown ticker/i.test(message)) {
    return message
  }
  return 'The tribunal could not convene. Please try again.'
}

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
  // Flashes true for a moment right after a phase's model call lands, so the
  // live cost readout below the progress bar visibly "ticks" instead of just
  // silently updating its number.
  const [costFlash, setCostFlash] = useState(false)
  const [docket, setDocket] = useState<Docket | null>(null)
  const [forensic, setForensic] = useState<ForensicsResult | null>(null)
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
  // Blind Trial gate: the ticker waiting on the player's prophecy modal.
  // Set the instant "Seal the Tribunal" is clicked; the actual trial only
  // starts once a rise/fall choice clears it.
  const [pendingTicker, setPendingTicker] = useState<string | null>(null)
  // Reveal gate for the speeches/report section: hidden entirely while the
  // trial is busy (only the bench scene + timer show), then gated behind a
  // "READ THE RULING" button once the verdict lands, so the user always
  // notices the trial finished instead of it silently rendering off-screen.
  const [reportRevealed, setReportRevealed] = useState(false)
  const verdictRef = useRef<HTMLDivElement>(null)
  const reportRef = useRef<HTMLDivElement>(null)
  const benchRef = useRef<HTMLDivElement>(null)
  // Scroll hint: tells the user there's more beneath the first screen.
  // Hides itself once they've scrolled past it — no need for it after that.
  const [showScrollHint, setShowScrollHint] = useState(true)
  // Floating "↓ the ruling" hint: sticks to the bottom of the viewport once the
  // report is revealed, and hides itself as soon as the verdict card scrolls
  // into view (tracked via IntersectionObserver on verdictRef).
  const [verdictInView, setVerdictInView] = useState(false)

  // The ledger lives in localStorage: read only after mount so the server
  // render (empty) always matches the first client render.
  useEffect(() => {
    setLedger(loadLedger())
  }, [])

  // Scroll hint listener: hide the ↓ prompt once the user has scrolled.
  useEffect(() => {
    const onScroll = () => setShowScrollHint(window.scrollY <= 100)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Tracks whether the verdict card is on screen, so the floating
  // "↓ the ruling" hint can hide itself once the user has reached it.
  useEffect(() => {
    const el = verdictRef.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setVerdictInView(true)
      return
    }
    const observer = new IntersectionObserver(([entry]) => setVerdictInView(entry.isIntersecting))
    observer.observe(el)
    return () => observer.disconnect()
  }, [verdict])

  const addSpeech = (s: Speech) => setSpeeches((prev) => [...prev, s])
  const finishLast = useCallback(
    () => setSpeeches((prev) => prev.map((s, i) => (i === prev.length - 1 ? { ...s, done: true } : s))),
    [],
  )
  const addBill = (label: string, usage?: CallUsage) => {
    if (!usage) return
    setBill((prev) => [...prev, { label, usage }])
    // Brief flash to mark the moment the running total just grew.
    setCostFlash(true)
    setTimeout(() => setCostFlash(false), 500)
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
    if (!company || !verdict || !reality || !sealedCutoff) return
    setRevealed(true)
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

  const runTrial = (e: React.FormEvent) => {
    e.preventDefault()
    const t = ticker.trim().toUpperCase()
    if (busy) return
    if (!t) {
      setTickerError('Enter a ticker symbol first')
      return
    }
    setTickerError('')
    if (blindTrial) {
      // Gate on the prophecy modal first — the trial itself starts only
      // once the player commits to a rise/fall call.
      setPendingTicker(t)
      return
    }
    void startTrial(t, null)
  }

  /** Resolves the pending prophecy modal and immediately starts the sealed trial. */
  const confirmProphecy = (call: Call) => {
    const t = pendingTicker
    if (!t) return
    setPendingTicker(null)
    setUserCall(call)
    void startTrial(t, cutoff)
  }

  const startTrial = async (t: string, sealAt: string | null) => {
    setBusy(true)
    setError('')
    setSpeeches([])
    setVerdict(null)
    setCompany(null)
    setBench(BENCH_IDLE)
    setBill([])
    setDocket(null)
    setForensic(null)
    setSeries([])
    setPhase('evidence')
    setPhaseDone(false)
    setCostFlash(false)
    startElapsedTimer()
    followRef.current = true
    setFollow(true)
    dossierRef.current = null
    setSealedCutoff(sealAt)
    setReality(null)
    setRevealed(false)
    setReportRevealed(false)
    if (!sealAt) setUserCall(null)
    requestAnimationFrame(() => {
      benchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })

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
        forensic: ForensicsResult
      }>('/api/evidence', { ticker: t, ...(sealAt ? { cutoff: sealAt } : {}) })
      setCompany(ev.company)
      setDocket(ev.docket)
      setForensic(ev.forensic)
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
        forensic: ev.forensic,
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
      setError(trialErrorMessage(err))
      setStatus('')
      setBench(BENCH_IDLE)
      setPhase(null)
      stopElapsedTimer()
    } finally {
      setBusy(false)
    }
  }

  /** Unhides the speeches/report section and smooth-scrolls straight to the top of
   *  the report (phase stepper, Court Bill, Scribe's speech + Exhibit A chart).
   *  Manual offset scroll instead of scrollIntoView: scroll-margin-top isn't reliable
   *  across browsers here, so the landing position is computed explicitly. */
  const revealReport = () => {
    setReportRevealed(true)
    requestAnimationFrame(() => {
      const el = reportRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top + window.scrollY - 100
      window.scrollTo({ top, behavior: 'smooth' })
    })
  }

  /** Scrolls straight to the verdict card, same offset as revealReport. */
  const scrollToVerdict = () => {
    const el = verdictRef.current
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY - 100
    window.scrollTo({ top, behavior: 'smooth' })
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
      <div className="scene-banner scene-banner-left" aria-hidden="true">
        <img className="scene-banner-logo" src="/orb.png" alt="" />
        <span className="scene-banner-label">ORBIO</span>
      </div>
      <div className="scene-banner scene-banner-right" aria-hidden="true">
        <img className="scene-banner-logo" src="/orb.png" alt="" />
        <span className="scene-banner-label">ORBIO</span>
      </div>
      {showScrollHint && (
        <div className="scroll-hint" aria-hidden="true">
          ↓
        </div>
      )}
      {pendingTicker && <ProphecyModal cutoff={cutoff} onCall={confirmProphecy} />}
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
        <Link href="/dossier/TSLA">Example trial: TSLA</Link>
      </nav>

      <section className="how-it-works" aria-label="How the tribunal works">
        <h2 className="how-it-works-title">HOW THE TRIBUNAL WORKS</h2>
        <div className="how-it-works-steps">
          <div className="how-it-works-step">
            <span className="how-it-works-num">01</span>
            <h3 className="how-it-works-step-title">EVIDENCE</h3>
            <p className="how-it-works-step-desc">
              The Scribe pulls real XBRL financials and 8-K filings straight from SEC EDGAR. No
              scraping, no guesswork.
            </p>
          </div>
          <div className="how-it-works-step">
            <span className="how-it-works-num">02</span>
            <h3 className="how-it-works-step-title">THE CASE</h3>
            <p className="how-it-works-step-desc">
              The Skeptic builds a bear case from the numbers. The Advocate answers it. The
              Skeptic replies once more.
            </p>
          </div>
          <div className="how-it-works-step">
            <span className="how-it-works-num">03</span>
            <h3 className="how-it-works-step-title">THE RULING</h3>
            <p className="how-it-works-step-desc">
              The Arbiter weighs both sides and scores the company&apos;s financial health from 0
              to 100, charge by charge.
            </p>
          </div>
          <div className="how-it-works-step">
            <span className="how-it-works-num">04</span>
            <h3 className="how-it-works-step-title">THE WAGER</h3>
            <p className="how-it-works-step-desc">
              In Blind Trial the record is sealed at a past date. Call the company&apos;s
              direction before the ruling, then break the seal and see who was right — you, the
              tribunal, or neither.
            </p>
          </div>
        </div>
        <p className="how-it-works-footnote">
          Four model calls per trial · multiple models on one Orbio key · exact cost shown on
          every ruling
        </p>
      </section>

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
          placeholder="Enter ticker"
          maxLength={10}
          aria-label="Stock ticker"
        />
        <button type="submit" disabled={busy}>
          {busy ? 'In session…' : blindTrial ? 'Seal the Tribunal' : 'Put on Trial'}
        </button>
      </form>

      {tickerError && <p className="ticker-error">{tickerError}</p>}

      {status && <p className="status-line">{status}</p>}
      {error && (
        <div
          role="alert"
          style={{
            background: 'rgba(161, 60, 44, 0.15)',
            border: '1px solid #A13C2C',
            color: '#EDE4D0',
            borderRadius: 0,
            padding: 16,
            margin: '0 0 1.5rem',
            textAlign: 'center',
          }}
        >
          {error}
        </div>
      )}

      {busy && !verdict && (
        <div className="trial-phase-progress">
          <div className="trial-phase-progress-bar">
            <div
              className="trial-phase-progress-fill"
              style={{ width: `${(completedPhaseCount(phase, phaseDone) / PHASE_ORDER.length) * 100}%` }}
            />
          </div>
          <p className="trial-phase-progress-label">
            Phase {phaseNumber(phase)} of {PHASE_ORDER.length} · {phaseLabel(phase)} {formatElapsed(elapsed)}
          </p>
          <p className={`live-cost-meter${costFlash ? ' live-cost-meter-flash' : ''}`}>
            ${sumBill(bill).cost.toFixed(4)} spent · {bill.length} of {MODEL_CALLS_TOTAL} model calls
          </p>
        </div>
      )}

      <div ref={benchRef} style={{ scrollMarginTop: 120 }}>
        <AgentBench
          states={bench}
          activeSpeech={speeches.length > 0 ? speeches[speeches.length - 1] : null}
          sticky={busy && !verdict}
        />
      </div>

      {!busy && verdict && !reportRevealed && (
        <div className="ruling-reveal">
          <button type="button" className="ruling-reveal-btn" onClick={revealReport}>
            READ THE RULING ↓
          </button>
        </div>
      )}

      {/*
       * Speeches + report are rendered here but visually collapsed
       * (display: none) while the trial is busy — during that phase the
       * bench scene + elapsed-time counter above are the only visible
       * signal that something is happening. Once the verdict lands the
       * "READ THE RULING" button flips `reportRevealed` and this section
       * becomes visible again.
       */}
      <div ref={reportRef} className={busy || (verdict && !reportRevealed) ? 'trial-report trial-report-hidden' : 'trial-report'}>
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
          {s.role === 'clerk' && <ForensicReport forensic={forensic} />}
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
        <div ref={verdictRef} className="verdict-section">
          <VerdictCard verdict={verdict} forensic={forensic} />
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
              clerkScore={forensic?.total}
              costUsd={sumBill(bill).cost}
            />
          )}
          <BillReceipt entries={bill} />
          <div className="actions">
            <button onClick={downloadDossier}>Download dossier (.md)</button>
          </div>
        </div>
        <div className="verdict-scroll-hint" aria-hidden="true">
          <span className="verdict-scroll-arrow">↓</span>
          <span className="verdict-scroll-label">the full record continues below</span>
        </div>
        </>
      )}
      </div>

      {reportRevealed && verdict && !verdictInView && (
        <button
          type="button"
          className="ruling-float-btn"
          onClick={scrollToVerdict}
          aria-label="Scroll to the ruling"
        >
          <span className="ruling-float-arrow">↓</span> the ruling
        </button>
      )}

      <ProphecyLedger entries={ledger} onClear={wipeLedger} />

      <footer className="footer">
        Built for Orbio Build Week · Data: SEC EDGAR XBRL companyfacts · Not investment advice.
      </footer>
    </main>
  )
}
