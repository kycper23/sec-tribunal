/**
 * The Filings Docket — recent SEC 8-K "material event" disclosures, shown as
 * a compact panel under the clerk's speech. Red flags (restatements,
 * bankruptcy, auditor changes...) jump out immediately; routine disclosures
 * (earnings releases, proxy votes) stay muted so they don't dilute the signal.
 */
import type { Docket } from '../trial'

const SEVERITY_LABEL: Record<'red' | 'amber' | 'info', string> = {
  red: 'Red flag',
  amber: 'Watch',
  info: 'Routine',
}

export function DocketPanel({ docket }: { docket: Docket | null | undefined }) {
  if (!docket || docket.events.length === 0) return null
  return (
    <section className="docket">
      <div className="docket-head">
        <span className="docket-title">FILINGS DOCKET</span>
        <span className="docket-tally">
          {docket.counts.red > 0 && <span className="docket-count red">{docket.counts.red} red</span>}
          {docket.counts.amber > 0 && <span className="docket-count amber">{docket.counts.amber} watch</span>}
          <span className="docket-count info">{docket.counts.info} routine</span>
          {docket.lateFilings > 0 && (
            <span className="docket-count red">{docket.lateFilings} late filing{docket.lateFilings > 1 ? 's' : ''}</span>
          )}
        </span>
      </div>
      <ul className="docket-list">
        {docket.events.map((e, i) => (
          <li key={i} className={`docket-row ${e.severity}`}>
            <span className="docket-date">{e.date}</span>
            <span className="docket-form">{e.form}</span>
            <span className={`docket-badge ${e.severity}`}>{SEVERITY_LABEL[e.severity]}</span>
            <span className="docket-labels">{e.labels.join('; ')}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
