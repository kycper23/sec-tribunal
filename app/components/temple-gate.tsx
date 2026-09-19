'use client'

/**
 * The temple gate: a full-screen entry plate shown on every visit to `/`.
 * Clicking through fades/zooms the gate away to reveal the courtroom behind
 * it — a bit of ceremony before the trial, without touching any agent logic.
 * State lives only in useState, so it resets on every page load; nothing is
 * persisted. `/compare` and `/dossier/[ticker]` skip this entirely (they
 * keep the static HeroPlate) since those pages open on a finished case, not
 * a fresh session.
 */
import { useEffect, useState } from 'react'

type GateStatus = 'gate' | 'closing' | 'gone'

export function TempleGate() {
  const [status, setStatus] = useState<GateStatus>('gate')

  useEffect(() => {
    if (status === 'gone') return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [status])

  const enter = () => {
    setStatus('closing')
    window.setTimeout(() => setStatus('gone'), 650)
  }

  if (status === 'gone') return null

  return (
    <div
      className={`temple-gate${status === 'closing' ? ' temple-gate-closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Enter the hall of the tribunal"
    >
      <img className="temple-gate-bg" src="/scene-hero.jpg" alt="" aria-hidden="true" />
      <div className="temple-gate-panel">
        <div className="eyebrow">AI Courtroom · SEC EDGAR Evidence</div>
        <h1>SEC Tribunal</h1>
        <p>Three sages wait behind these doors to argue a public company&rsquo;s financial fate.</p>
        <button type="button" className="temple-gate-cta" onClick={enter} autoFocus>
          Enter the Hall of the Tribunal ⟶
        </button>
      </div>
    </div>
  )
}
