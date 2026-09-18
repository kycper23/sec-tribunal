'use client'

/**
 * The Prophecy Engine's entry ritual: seal the tribunal at a date in the
 * past. When engaged, the clerk redacts every filing dated after the seal
 * before the agents ever see the brief (see `cutoff` in `src/sec/facts.ts` /
 * `src/sec/events.ts`) — the trial argues blind, exactly as a reader of that
 * day's newspaper would have. What actually happened next stays sealed
 * until the user chooses to break the seal after the verdict (Etap G).
 */
import { useId } from 'react'

/** Custom engraved hourglass — matches the sages' SVG icon language, no emoji/glyph font. */
function Hourglass({ sealed }: { sealed: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`hourglass-icon${sealed ? ' sealed' : ''}`}
    >
      <path d="M6.5 3.5h11 M6.5 20.5h11" />
      <path d="M7.5 3.5c0 4 2.2 6.2 4.5 8 2.3-1.8 4.5-4 4.5-8 M7.5 20.5c0-4 2.2-6.2 4.5-8 2.3 1.8 4.5 4 4.5 8" />
      <path className="hourglass-sand" d="M9.6 6.2c.6 1.8 1.4 3 2.4 3.8 1-.8 1.8-2 2.4-3.8" strokeWidth="1.1" />
    </svg>
  )
}

const todayISO = () => new Date().toISOString().slice(0, 10)
const EARLIEST_CUTOFF = '2010-01-01'

export function BlindTrialToggle({
  enabled,
  cutoff,
  onToggle,
  onCutoffChange,
  disabled,
}: {
  enabled: boolean
  cutoff: string
  onToggle: (next: boolean) => void
  onCutoffChange: (next: string) => void
  disabled?: boolean
}) {
  const inputId = useId()
  return (
    <div className={`blind-trial${enabled ? ' active' : ''}`}>
      <button
        type="button"
        className="blind-trial-switch"
        onClick={() => onToggle(!enabled)}
        disabled={disabled}
        aria-pressed={enabled}
      >
        <Hourglass sealed={enabled} />
        <span>
          <span className="blind-trial-title">Blind Trial</span>
          <span className="blind-trial-hint">
            {enabled ? 'Sealed — the tribunal argues blind' : 'Seal the tribunal at a date in the past'}
          </span>
        </span>
      </button>
      {enabled && (
        <div className="blind-trial-date">
          <label htmlFor={inputId}>Seal date</label>
          <input
            id={inputId}
            type="date"
            value={cutoff}
            min={EARLIEST_CUTOFF}
            max={todayISO()}
            disabled={disabled}
            onChange={(e) => onCutoffChange(e.target.value)}
          />
          <p className="blind-trial-note">
            Every exhibit is redacted to what was actually on file by this date. The verdict is rendered blind —
            what really happened next stays sealed until you break it, after the ruling.
          </p>
        </div>
      )}
    </div>
  )
}
