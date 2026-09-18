'use client'

/**
 * The agents' bench: three cast cards above the transcript, animated through
 * idle → thinking (pulsing ring + rotating status) → speaking → done, so the
 * long model calls feel like a live courtroom instead of dead air.
 */
import { useEffect, useState } from 'react'
import { AgentAvatar } from './agent-avatars'

export type AgentState = 'idle' | 'thinking' | 'speaking' | 'done'

export interface BenchStates {
  prosecutor: AgentState
  defense: AgentState
  judge: AgentState
}

const THINKING_LINES: Record<keyof BenchStates, string[]> = {
  prosecutor: [
    'Cross-referencing Exhibit A…',
    'Tracing the margin trend…',
    'Sharpening the charges…',
    'Auditing the debt schedule…',
  ],
  defense: [
    'Reading the charges…',
    'Pulling peer comparisons…',
    'Drafting counter-arguments…',
    'Checking cash-flow cover…',
  ],
  judge: [
    'Weighing the arguments…',
    'Reviewing the transcript…',
    'Scoring financial health…',
    'Drafting the verdict…',
  ],
}

const STATE_LABEL: Record<AgentState, string> = {
  idle: 'Awaiting',
  thinking: '',
  speaking: 'On the floor',
  done: 'Rested',
}

function RotatingStatus({ phrases }: { phrases: string[] }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % phrases.length), 4000)
    return () => clearInterval(id)
  }, [phrases])
  return (
    <span className="bench-status" key={i}>
      {phrases[i]}
    </span>
  )
}

const CAST = [
  { key: 'prosecutor', name: 'The Skeptic', sub: 'prosecution' },
  { key: 'defense', name: 'The Advocate', sub: 'defense' },
  { key: 'judge', name: 'The Arbiter', sub: 'judgement' },
] as const

type AgentKey = (typeof CAST)[number]['key']

/** Shown when a sage's card is clicked — who they are, before the trial ever speaks. */
const DESCRIPTION: Record<AgentKey, string> = {
  prosecutor:
    "The Skeptic trusts nothing but the filings. He builds the bear case from the company's own " +
    '10-K/10-Q figures — margin decay, mounting debt, stalled growth — then returns after the ' +
    'defense to press every crack left in their story.',
  defense:
    'The Advocate reads the same filings looking for context: industry headwinds, one-time charges, ' +
    "a fair peer to compare against. He doesn't deny the numbers — he argues what they actually mean.",
  judge:
    'The Arbiter has the final word. He weighs each charge against its rebuttal, rules SUSTAINED, ' +
    'DISMISSED or PARTIALLY VALID, and sets the Financial Health Score that closes the case.',
}

export function AgentBench({ states }: { states: BenchStates }) {
  const [expanded, setExpanded] = useState<AgentKey | null>(null)
  return (
    <div className="bench">
      {CAST.map((agent) => {
        const state = states[agent.key]
        const isOpen = expanded === agent.key
        const descId = `bench-desc-${agent.key}`
        return (
          <button
            key={agent.key}
            type="button"
            className={`bench-agent ${agent.key} ${state}${isOpen ? ' expanded' : ''}`}
            onClick={() => setExpanded((prev) => (prev === agent.key ? null : agent.key))}
            aria-expanded={isOpen}
            aria-controls={descId}
          >
            <div className="bench-avatar">
              <AgentAvatar role={agent.key} size={40} />
            </div>
            <div className="bench-name">{agent.name}</div>
            <div className="bench-role-sub">{agent.sub}</div>
            <div className="bench-state">
              {state === 'thinking' ? (
                <>
                  <span className="dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  <RotatingStatus phrases={THINKING_LINES[agent.key]} />
                </>
              ) : (
                <span className="bench-status">{STATE_LABEL[state]}</span>
              )}
            </div>
            <div className="bench-desc-wrap" id={descId}>
              <p className="bench-desc">{DESCRIPTION[agent.key]}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}