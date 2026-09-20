/**
 * CLERK'S FORENSIC REPORT — the deterministic, code-computed second opinion
 * from `src/sec/forensics.ts`, rendered as its own exhibit panel: the Clerk
 * Score as a large number, five horizontal sub-score bars (Growth,
 * Profitability, Earnings quality, Leverage, Liquidity — each 0-20), and a
 * list of red/amber flags underneath. Pure presentation: every figure comes
 * straight from `/api/evidence`'s `forensic` field (or a precomputed demo's
 * `TrialResult.forensic`), never recomputed here.
 */
export interface ForensicSubScore {
  label: string
  score: number
  note: string
}

export interface ForensicFlag {
  severity: 'red' | 'amber'
  label: string
  note: string
}

export interface ForensicsResult {
  subScores: ForensicSubScore[]
  total: number
  flags: ForensicFlag[]
}

const FLAG_COLOR: Record<'red' | 'amber', string> = {
  red: '#A13C2C',
  amber: '#A87718',
}

export function ForensicReport({ forensic }: { forensic: ForensicsResult | null | undefined }) {
  if (!forensic) return null
  return (
    <section className="forensic-report">
      <div className="forensic-report-head">
        <span className="forensic-report-title">CLERK&apos;S FORENSIC REPORT</span>
        <span className="forensic-report-sub">Deterministic, code-computed — independent of the tribunal&apos;s verdict</span>
      </div>
      <div className="forensic-score">
        <span className="forensic-score-num">{forensic.total}</span>
        <span className="forensic-score-den">/100</span>
      </div>
      <ul className="forensic-bars">
        {forensic.subScores.map((s) => (
          <li key={s.label} className="forensic-bar-row" title={s.note}>
            <span className="forensic-bar-label">{s.label}</span>
            <div className="forensic-bar-track">
              <div className="forensic-bar-fill" style={{ width: `${(s.score / 20) * 100}%` }} />
            </div>
            <span className="forensic-bar-score">{s.score}/20</span>
          </li>
        ))}
      </ul>
      {forensic.flags.length > 0 ? (
        <ul className="forensic-flags">
          {forensic.flags.map((f, i) => (
            <li key={i} className="forensic-flag-row">
              <span className="forensic-flag-badge" style={{ color: FLAG_COLOR[f.severity] }}>
                {f.severity.toUpperCase()}
              </span>
              <span className="forensic-flag-label">{f.label}</span>
              <span className="forensic-flag-note">{f.note}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="forensic-flags-none">No red/amber flags raised.</p>
      )}
    </section>
  )
}
