/** Shared verdict card — used by the live courtroom, permalinks and compare mode. */
import { scoreColor, type Verdict } from './trial'

export function Gauge({ score }: { score: number }) {
  return (
    <div className="gauge-wrap">
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
  )
}

export function VerdictCard({ verdict, title = 'THE VERDICT' }: { verdict: Verdict; title?: string }) {
  return (
    <section className="verdict-card">
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
                <span className={`stamp ${c.status === 'PARTIALLY VALID' ? 'PARTIAL' : c.status}`}>{c.status}</span>
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
