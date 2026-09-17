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
  done: '✓ Rested',
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
  { key: 'prosecutor', name: 'The Prosecution' },
  { key: 'defense', name: 'The Defense' },
  { key: 'judge', name: 'The Judge' },
] as const

export function AgentBench({ states }: { states: BenchStates }) {
  return (
    <div className="bench">
      {CAST.map((agent) => {
        const state = states[agent.key]
        return (
          <div key={agent.key} className={`bench-agent ${agent.key} ${state}`}>
            <div className="bench-avatar">
              <AgentAvatar role={agent.key} size={40} />
            </div>
            <div className="bench-name">{agent.name}</div>
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
          </div>
        )
      })}
    </div>
  )
}