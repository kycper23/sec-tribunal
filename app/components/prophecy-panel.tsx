'use client'

/**
 * "Beat the Tribunal" — the player's prophecy. Shown only during a sealed
 * (blind) trial, after the clerk enters the evidence but before the verdict:
 * the player wagers on the direction of Revenue after the seal date. The
 * wager locks on selection; skipping it entirely is allowed (the game is
 * optional). Settlement lives in `app/prophecy.ts` + `RevealBanner`.
 */
import { CALL_LABEL, type Call } from '../prophecy'

/** Engraved directional arrows — same SVG icon language as the sages/hourglass. */
function ArrowIcon({ dir }: { dir: Call }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {dir === 'rise' ? (
        <>
          <path d="M4 18 L10 11 L14 14 L20 6" />
          <path d="M14.5 6 H20 V11.5" />
        </>
      ) : (
        <>
          <path d="M4 6 L10 13 L14 10 L20 18" />
          <path d="M20 12.5 V18 H14.5" />
        </>
      )}
    </svg>
  )
}

export function ProphecyPanel({
  cutoff,
  userCall,
  onCall,
  locked,
}: {
  cutoff: string
  userCall: Call | null
  onCall: (call: Call) => void
  locked: boolean
}) {
  return (
    <div className="prophecy-panel">
      <h3>Enter your prophecy</h3>
      <p>
        The record is sealed at {cutoff}. Before the tribunal rules — will this company&apos;s revenue rise or
        fall in the filings that came after? Reality will judge you both.
      </p>
      <div className="prophecy-choices">
        {(['rise', 'fall'] as const).map((c) => (
          <button
            key={c}
            type="button"
            className={`prophecy-btn ${c}${userCall === c ? ' chosen' : ''}`}
            onClick={() => onCall(c)}
            disabled={locked || userCall !== null}
            aria-pressed={userCall === c}
          >
            <ArrowIcon dir={c} />
            {CALL_LABEL[c]}
          </button>
        ))}
      </div>
      {userCall !== null && (
        <p className="prophecy-locked">
          Prophecy entered: <strong>{CALL_LABEL[userCall]}</strong>. The wager is sealed with the record — no
          retractions before the bench.
        </p>
      )}
    </div>
  )
}

/**
 * Sticky reminder of the player's wager, pinned to the top of the viewport
 * for the whole ~150s trial so the choice never gets lost off-screen.
 * Shown from the moment a prophecy is entered until the seal is broken.
 */
export function ProphecyStickyBar({ call, cutoff }: { call: Call; cutoff: string }) {
  return (
    <div className={`prophecy-sticky-bar prophecy-sticky-${call}`}>
      YOUR PROPHECY: <span className="prophecy-sticky-word">{CALL_LABEL[call].toUpperCase()}</span> · sealed at{' '}
      {cutoff}
    </div>
  )
}
