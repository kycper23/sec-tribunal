'use client'

/** Shared verdict card — used by the live courtroom, permalinks and compare mode. */
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import type { ForensicsResult } from './components/forensic-report'
import { scoreColor, type Verdict } from './trial'

const prefersReducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * True once the observed element has crossed `threshold` of its area into
 * the viewport. Fires once, then disconnects — the reveal only needs to
 * know "has this been seen yet?", not a live intersection ratio.
 */
function useInView<T extends Element>(threshold = 0.3) {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { threshold }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])
  return [ref, inView] as const
}

/**
 * Counts 0 → target once, ~1.5s ease-out cubic (mirrors the Court Bill
 * ticker). Doesn't start until `start` flips true, so the count only ever
 * fires once the gauge is actually on screen. Guarded by a ref so a
 * re-render never restarts it — the verdict arrives ready, but the reveal
 * still has to earn its number.
 */
function useCountUp(target: number, start: boolean, duration = 1500): number {
  const [shown, setShown] = useState(0)
  const started = useRef(false)
  useEffect(() => {
    if (!start || started.current) return
    started.current = true
    if (prefersReducedMotion()) {
      setShown(target)
      return
    }
    const startTime = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration)
      setShown(target * (1 - Math.pow(1 - t, 3)))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, start, duration])
  return shown
}

/**
 * The score gauge dressed as an engraved seal: the conic-gradient dial sits
 * inside a double ring with circumtext on an SVG textPath. Pure presentation.
 * Once a clerk forensic result is available the dial's headline product
 * switches from the tribunal's raw score to the Narrative Gap — the signed
 * spread (tribunal − clerk) — since the judge never sees the clerk's number
 * and the spread now measures independent judgment, not a correction. Falls
 * back to the plain Financial Health score wherever no forensic result
 * exists (e.g. /compare, which never fetches one). Either way, the reveal
 * (0 → target) is animated exactly as before.
 */
export function Gauge({ score, forensic }: { score: number; forensic?: ForensicsResult | null }) {
  // Ids must be unique when two seals share a page (/compare).
  const pathId = `seal-text-path-${useId()}`
  const [gaugeRef, inView] = useInView<HTMLDivElement>(0.3)
  const gap = forensic ? score - forensic.total : null
  const shown = useCountUp(gap ?? score, inView)
  const shownAbs = Math.abs(shown)
  // Ring fills against the score's own 0–100 scale, or against a 0–30 spread
  // scale (above 30 points of drift, the ring is simply full).
  const ringFraction = gap === null ? shown / 100 : Math.min(1, shownAbs / 30)
  const color = gap === null ? scoreColor(score) : spreadColor(Math.abs(gap))
  const sign = gap === null ? '' : gap > 0 ? '+' : gap < 0 ? '−' : '±'
  return (
    <div className="gauge-wrap" ref={gaugeRef}>
      <div className="seal">
        <svg className="seal-ring" viewBox="0 0 220 220" aria-hidden="true">
          <circle cx="110" cy="110" r="108" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="110" cy="110" r="102" fill="none" stroke="currentColor" strokeWidth="0.75" />
          <circle cx="110" cy="110" r="84" fill="none" stroke="currentColor" strokeWidth="0.75" />
          <path id={pathId} d="M110 17 a93 93 0 1 1 -0.01 0" fill="none" />
          <text className="seal-text">
            <textPath href={`#${pathId}`} startOffset="0%">
              {gap === null
                ? '· TRIBVNAL · FINANCIAL HEALTH · TRIBVNAL · FINANCIAL HEALTH ·'
                : '· TRIBVNAL · NARRATIVE GAP · TRIBVNAL · NARRATIVE GAP ·'}
            </textPath>
          </text>
        </svg>
        <div className="gauge" style={{ background: `conic-gradient(${color} ${ringFraction * 360}deg, var(--gauge-track) 0deg)` }}>
          <div className="gauge-inner">
            <div>
              <div className="gauge-score" style={{ color }}>
                {gap === null ? Math.round(shown) : `${sign}${Math.round(shownAbs)}`}
              </div>
              <div className="gauge-label">{gap === null ? 'FINANCIAL HEALTH / 100' : 'NARRATIVE GAP'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Deterministic, SSR-safe ink-stamp tilt: same index, same angle (−2°…+2°). */
const stampTilt = (i: number) => ((i * 47) % 5) - 2

/** Row-by-row reveal, one charge every 200ms; the stamp lands 150ms after its row. */
const ROW_STAGGER_MS = 200
const STAMP_DELAY_MS = 150

/** Spread color thresholds: tight agreement, contextual adjustment, sharp departure. */
const spreadColor = (abs: number): string => (abs <= 5 ? '#6E6250' : abs <= 15 ? '#A87718' : '#A13C2C')

/**
 * The variable half of the Narrative Gap note. Signed (not absolute) —
 * "talked itself into optimism" only makes sense when the tribunal scored
 * *above* the clerk, "read distress" only when it scored below.
 */
const gapNote = (gap: number): string =>
  Math.abs(gap) <= 5
    ? 'The tribunal stayed anchored to the arithmetic.'
    : gap > 15
      ? "The tribunal talked itself into optimism the numbers don't show."
      : gap < -15
        ? "The tribunal read distress the numbers don't support."
        : 'A moderate drift — see the charges below.'

// Verdict carries an explicit revenue call from the judge, independent of the
// score — added server-side (src/tribunal/agents.ts) but not yet threaded
// through the shared `Verdict` type in trial.ts. Declared locally so this
// file can read it without touching that type.
type VerdictWithCall = Verdict & {
  revenueCall?: 'rise' | 'fall'
  revenueCallConfidence?: 'low' | 'medium' | 'high'
}

/**
 * Sets the Clerk's deterministic score against the tribunal's verdict score,
 * side by side, so the 92/100 forensic figure earlier in the page isn't left
 * floating without a point of reference — then unpacks the Narrative Gap
 * (the signed spread already sitting inside the gauge above) into its
 * constant framing, its variable read, and the tribunal's independent
 * revenue call. Silent (renders nothing) when no forensic result is
 * available — the comparison needs both numbers to mean anything.
 */
function ScoreCompareBar({ forensic, verdict }: { forensic: ForensicsResult; verdict: VerdictWithCall }) {
  const tribunalScore = verdict.score
  const gap = tribunalScore - forensic.total
  return (
    <div className="score-compare">
      <div className="score-compare-row">
        <span className="score-compare-item">
          CLERK <span className="score-compare-num">{forensic.total}</span>
        </span>
        <span className="score-compare-sep">·</span>
        <span className="score-compare-item">
          TRIBUNAL <span className="score-compare-num">{tribunalScore}</span>
        </span>
      </div>
      <div className="score-compare-note">
        How far the argument drifted from the arithmetic. The judge never sees the clerk&rsquo;s score.
      </div>
      <div className="score-compare-note" style={{ color: spreadColor(Math.abs(gap)) }}>
        {gapNote(gap)}
      </div>
      {verdict.revenueCall && (
        <div className="score-compare-note">
          TRIBUNAL CALLS: {verdict.revenueCall.toUpperCase()}
          {verdict.revenueCallConfidence ? ` · ${verdict.revenueCallConfidence} confidence` : ''}
        </div>
      )}
    </div>
  )
}

export function VerdictCard({
  verdict,
  title = 'THE VERDICT',
  forensic,
}: {
  verdict: Verdict
  title?: string
  forensic?: ForensicsResult | null
}) {
  // Charge-row / stamp reveal is gated behind the same "has it been seen
  // yet?" check as the gauge, so the whole table doesn't burn its stagger
  // before the user scrolls anywhere near it. Rows/stamps stay paused on
  // their opening (opacity 0) keyframe — via animation-play-state, not by
  // touching animation-name — until the table crosses the threshold, then
  // the existing staggered animations simply resume. Reduced-motion users
  // are left alone entirely: globals.css already forces `animation: none`
  // for them, which overrides animation-play-state regardless.
  const [tableRef, tableInView] = useInView<HTMLTableElement>(0.3)
  const playState: CSSProperties['animationPlayState'] = tableInView ? 'running' : 'paused'
  return (
    <section className="verdict-card verdict-scroll">
      <h2>{title}</h2>
      <Gauge score={verdict.score} forensic={forensic} />
      {forensic && <ScoreCompareBar forensic={forensic} verdict={verdict} />}
      {verdict.summary
        .split('\n\n')
        .filter((para) => para.trim().length > 0)
        .map((para, i) => (
          <p key={i} style={{ marginBottom: '1rem' }}>
            {para}
          </p>
        ))}
      {(() => {
        const total = verdict.charges.length
        const sustained = verdict.charges.filter((c) => c.status === 'SUSTAINED').length
        const partial = verdict.charges.filter((c) => c.status === 'PARTIALLY VALID').length
        const parts = [`${total} charge${total === 1 ? '' : 's'} filed`]
        if (sustained > 0) parts.push(`${sustained} sustained`)
        if (partial > 0) parts.push(`${partial} partially valid`)
        return <div className="score-compare-note">{parts.join(' · ')}</div>
      })()}
      <table className="charges" ref={tableRef}>
        <thead>
          <tr>
            <th>Charge</th>
            <th>Rebuttal</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {verdict.charges.map((c, i) => (
            <tr
              key={i}
              className={`charge-row${tableInView ? ' in-view' : ''}`}
              style={
                {
                  animationDelay: `${i * ROW_STAGGER_MS}ms`,
                  animationPlayState: playState,
                } as CSSProperties
              }
            >
              <td>{c.charge}</td>
              <td>{c.rebuttal}</td>
              <td>
                <span
                  className={`stamp ${c.status === 'PARTIALLY VALID' ? 'PARTIAL' : c.status}${tableInView ? ' in-view' : ''}`}
                  style={
                    {
                      '--stamp-tilt': `${stampTilt(i)}deg`,
                      animationDelay: `${i * ROW_STAGGER_MS + STAMP_DELAY_MS}ms`,
                      animationPlayState: playState,
                    } as CSSProperties
                  }
                >
                  {c.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <strong>Recommendation:</strong> {verdict.recommendation}
      </p>
    </section>
  )
}
