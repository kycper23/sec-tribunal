'use client'

/**
 * The Prophecy Ledger, rendered as a page of the book: the running record of
 * every blind trial whose seal was broken on this device. Read from
 * localStorage after mount only (SSR-safe — no hydration mismatch), so the
 * server always renders the empty state.
 */
import { tallyLedger, type LedgerEntry } from '../ledger'
import { CALL_LABEL, OUTCOME_LABEL } from '../prophecy'

const fmtDate = (ts: number) => new Date(ts).toISOString().slice(0, 10)
const pct = (num: number, den: number) => (den === 0 ? '—' : `${Math.round((num / den) * 100)}%`)

export function ProphecyLedger({ entries, onClear }: { entries: LedgerEntry[]; onClear: () => void }) {
  if (!entries.length) return null
  const t = tallyLedger(entries)
  return (
    <section className="prophecy-ledger">
      <h3>The Prophecy Ledger</h3>
      <div className="prophecy-ledger-tally">
        <span>
          Trials <strong>{t.trials}</strong>
        </span>
        <span>
          Tribunal right <strong>{pct(t.tribunalRight, t.settled)}</strong>
        </span>
        <span>
          You right <strong>{pct(t.userRight, t.userWagers)}</strong>
        </span>
        <span>
          Your wagers <strong>{t.userWagers}</strong>
        </span>
      </div>
      <table className="prophecy-ledger-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Ticker</th>
            <th>Sealed at</th>
            <th>Score</th>
            <th>You</th>
            <th>Tribunal</th>
            <th>Reality</th>
            <th>Outcome</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={`${e.ts}-${i}`}>
              <td>{fmtDate(e.ts)}</td>
              <td>{e.ticker}</td>
              <td>{e.cutoff}</td>
              <td>{Math.round(e.score)}</td>
              <td>{e.userCall ? CALL_LABEL[e.userCall] : '—'}</td>
              <td>{CALL_LABEL[e.tribunalCall]}</td>
              <td>{e.realityCall ? CALL_LABEL[e.realityCall] : '—'}</td>
              <td className="prophecy-ledger-outcome">{e.outcome ? OUTCOME_LABEL[e.outcome] : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="prophecy-ledger-clear" onClick={onClear}>
        Clear the ledger
      </button>
    </section>
  )
}
