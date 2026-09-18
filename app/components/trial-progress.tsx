'use client'

/**
 * Five-step stepper for the trial's phases, so the long wait between model
 * calls reads as visible progress instead of a stalled page. Complete steps
 * get a filled dot + checkmark, the active step pulses, pending steps stay
 * dim. A connecting line behind the dots fills in as the trial advances.
 */
export type Phase = 'evidence' | 'prosecution' | 'defense' | 'rebuttal' | 'verdict'

const STEPS: { key: Phase; label: string }[] = [
  { key: 'evidence', label: 'Evidence' },
  { key: 'prosecution', label: 'Prosecution' },
  { key: 'defense', label: 'Defense' },
  { key: 'rebuttal', label: 'Rebuttal' },
  { key: 'verdict', label: 'Verdict' },
]

export function TrialProgress({ phase, done }: { phase: Phase | null; done: boolean }) {
  if (!phase) return null
  const activeIndex = STEPS.findIndex((s) => s.key === phase)
  const completeCount = done ? STEPS.length : Math.max(0, activeIndex)
  const fillPercent = Math.min(100, (completeCount / (STEPS.length - 1)) * 80)

  return (
    <div className="stepper" role="list" aria-label="Trial progress">
      <div className="stepper-fill" style={{ width: `${fillPercent}%` }} />
      {STEPS.map((s, i) => {
        const state = done || i < activeIndex ? 'complete' : i === activeIndex ? 'active' : 'pending'
        return (
          <div key={s.key} className={`step ${state}`} role="listitem" aria-current={state === 'active'}>
            <span className="step-dot">{state === 'complete' ? '✓' : i + 1}</span>
            <span className="step-label">{s.label}</span>
          </div>
        )
      })}
    </div>
  )
}
