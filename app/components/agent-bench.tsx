'use client'

/**
 * The agents' bench: three cast cards above the transcript, animated through
 * idle → thinking (pulsing ring + rotating status) → speaking → done, so the
 * long model calls feel like a live courtroom instead of dead air.
 */
import { useEffect, useState } from 'react'
import type { Speech } from '../trial'
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

/** Strip markdown markers (**, ###, ---, #) so raw formatting never leaks into the speech bubble. */
const stripMarkdown = (text: string): string =>
  text
    .replace(/\*\*/g, '')
    .replace(/^-{3,}\s*$/gm, '')
    .replace(/#/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** First full sentence (up to the period), capped at 100 chars with an ellipsis if longer — a live
 * "what they're saying" snippet in the bubble. */
const snippet = (text: string): string => {
  const clean = stripMarkdown(text)
  const firstSentence = clean.match(/^[^.!?]*[.!?]/)
  const sentence = (firstSentence ? firstSentence[0] : clean).trim()
  return sentence.length > 100 ? `${sentence.slice(0, 100)}…` : sentence
}

export function AgentBench({
  states,
  activeSpeech,
  sticky = false,
}: {
  states: BenchStates
  /** The speech currently being typed out, if any — powers the live discussion bubble. */
  activeSpeech?: Speech | null
  /** While the trial is running, pin the bench to the top of the viewport (shrunk) so the reader always knows who's speaking. */
  sticky?: boolean
}) {
  const [expanded, setExpanded] = useState<AgentKey | null>(null)
  const bubbleKey =
    activeSpeech && !activeSpeech.done && activeSpeech.role in states ? (activeSpeech.role as AgentKey) : null

  return (
    <div className={`bench bench-stage${sticky ? ' bench-sticky' : ''}`}>
      {CAST.map((agent) => {
        const state = states[agent.key]
        const isOpen = expanded === agent.key
        const descId = `bench-desc-${agent.key}`
        const showBubble = bubbleKey === agent.key
        return (
          <button
            key={agent.key}
            type="button"
            className={`bench-agent ${agent.key} ${state}${isOpen ? ' expanded' : ''}`}
            onClick={() => setExpanded((prev) => (prev === agent.key ? null : agent.key))}
            aria-expanded={isOpen}
            aria-controls={descId}
          >
            {showBubble && activeSpeech && (
              <div className="speech-bubble" role="status">
                {snippet(activeSpeech.text)}
              </div>
            )}
            <div className="bench-portrait">
              <AgentAvatar role={agent.key} size={sticky ? 80 : 160} />
            </div>
            <div className="bench-label">
              <div className="bench-name">{agent.name}</div>
              <div className="bench-role-sub">{agent.sub}</div>
            </div>
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