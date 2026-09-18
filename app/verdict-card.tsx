/** Shared verdict card — used by the live courtroom, permalinks and compare mode. */
import { useId } from 'react'
import { scoreColor, type Verdict } from './trial'

/**
 * The score gauge dressed as an engraved seal: the conic-gradient dial sits
 * inside a double ring with circumtext on an SVG textPath. Pure presentation —
 * the score maths is untouched.
 */
export function Gauge({ score }: { score: number }) {
  // Ids must be unique when two seals share a page (/compare).
  const pathId = `seal-text-path-${useId()}`
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
          style={{ background: `conic-gradient(${scoreColor(score)} ${score * 3.6}deg, var(--gauge-track) 0deg)` }}
        >
          <div className="gauge-inner">
            <div>
              <div className="gauge-score" style={{ color: scoreColor(score) }}>
                {Math.round(score)}
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

export function VerdictCard({ verdict, title = 'THE VERDICT' }: { verdict: Verdict; title?: string }) {
  return (
    <section className="verdict-card verdict-scroll">
      <h2>{title}</h2>
      <Gauge score={verdict.score} />
      <p>{verdict.summary}</p>
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
            <tr key={i}>
              <td>{c.charge}</td>
              <td>{c.rebuttal}</td>
              <td>
                <span
                  className={`stamp ${c.status === 'PARTIALLY VALID' ? 'PARTIAL' : c.status}`}
                  style={{ transform: `rotate(${stampTilt(i)}deg)` }}
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
