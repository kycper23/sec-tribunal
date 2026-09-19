'use client'

/** Shared verdict card — used by the live courtroom, permalinks and compare mode. */
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { scoreColor, type Verdict } from './trial'

/**
 * Counts 0 → target once, ~1.5s ease-out cubic (mirrors the Court Bill
 * ticker). Guarded by a ref so a re-render never restarts the count —
 * the verdict arrives ready, but the reveal still has to earn its number.
 */
function useCountUp(target: number, duration = 1500): number {
  const [shown, setShown] = useState(0)
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(target)
      return
    }
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      setShown(target * (1 - Math.pow(1 - t, 3)))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
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
  const shown = useCountUp(score)
  return (
    <div className="gauge-wrap">
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
      <table className="charges">
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
              className="charge-row"
              style={{ animationDelay: `${i * ROW_STAGGER_MS}ms` } as CSSProperties}
            >
              <td>{c.charge}</td>
              <td>{c.rebuttal}</td>
              <td>
                <span
                  className={`stamp ${c.status === 'PARTIALLY VALID' ? 'PARTIAL' : c.status}`}
                  style={
                    {
                      '--stamp-tilt': `${stampTilt(i)}deg`,
                      animationDelay: `${i * ROW_STAGGER_MS + STAMP_DELAY_MS}ms`,
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
