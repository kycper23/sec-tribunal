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

/** localStorage key marking that this browser has already clicked through the gate once. */
const SEEN_KEY = 'tribunal-gate-seen'

export function TempleGate() {
  const [status, setStatus] = useState<GateStatus>('gate')

  // Client-only skip check: a returning visitor (SEEN_KEY already set) or a
  // `?skip` URL param goes straight past the gate. This must run in an
  // effect, never during the first render — the server (and the initial
  // client render, before hydration) has no access to localStorage/location,
  // so rendering 'gate' first on both sides keeps them in sync and avoids a
  // hydration mismatch. Storage access is wrapped in try/catch for
  // private-mode browsers, which fall back to showing the gate as before.
  useEffect(() => {
    let seen = false
    try {
      seen = window.localStorage.getItem(SEEN_KEY) === '1'
    } catch {
      // Private mode / storage disabled — behave as if never seen.
    }
    const skipParam = new URLSearchParams(window.location.search).has('skip')
    if (seen || skipParam) setStatus('gone')
  }, [])

  useEffect(() => {
    if (status === 'gone') return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [status])

  const enter = () => {
    try {
      window.localStorage.setItem(SEEN_KEY, '1')
    } catch {
      // Private mode / storage disabled — gate just won't be remembered.
    }
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
        <p className="eyebrow">a benchmark for bought intelligence</p>
        <p>Code scores the filings with no model at all.</p>
        <p>Three agents argue the same evidence.</p>
        <p>The gap between them is the product.</p>
        <button type="button" className="temple-gate-cta" onClick={enter} autoFocus>
          Enter the Hall of the Tribunal ⟶
        </button>
      </div>
    </div>
  )
}
