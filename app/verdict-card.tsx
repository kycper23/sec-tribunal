'use client'

/** Shared verdict card — used by the live courtroom, permalinks and compare mode. */
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
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
 * inside a double ring with circumtext on an SVG textPath. Pure presentation —
 * the score maths is untouched, only the reveal (0 → score) is animated.
 */
export function Gauge({ score }: { score: number }) {
  // Ids must be unique when two seals share a page (/compare).
  const pathId = `seal-text-path-${useId()}`
  const [gaugeRef, inView] = useInView<HTMLDivElement>(0.3)
  const shown = useCountUp(score, inView)
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
              · TRIBVNAL · FINANCIAL HEALTH · TRIBVNAL · FINANCIAL HEALTH ·
            </textPath>
          </text>
        </svg>
        <div
          className="gauge"
          style={{ background: `conic-gradient(${scoreColor(score)} ${shown * 3.6}deg, var(--gauge-track) 0deg)` }}
        >
          <div className="gauge-inner">
            <div>
              <div className="gauge-score" style={{ color: scoreColor(score) }}>
                {Math.round(shown)}
              </div>
              <div className="gauge-label">FINANCIAL HEALTH / 100</div>
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

export function VerdictCard({ verdict, title = 'THE VERDICT' }: { verdict: Verdict; title?: string }) {
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
      <Gauge score={verdict.score} />
      {verdict.summary
        .split('\n\n')
        .filter((para) => para.trim().length > 0)
        .map((para, i) => (
          <p key={i} style={{ marginBottom: '1rem' }}>
            {para}
          </p>
        ))}
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
