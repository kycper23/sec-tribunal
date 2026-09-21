'use client'

/**
 * The Court Bill — the tribunal's answer to "what can you do with tokenized
 * credits?": every model call costs real $ORBIO credits (via Orbio's
 * `usage.cost`), and the courtroom shows the meter running live instead of
 * hiding it. A taxi-meter ticker above the bench, a cost badge per speech,
 * and a receipt once the verdict is in.
 */
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { BillEntry, CallUsage } from '../trial'
import { sumBill } from '../trial'

const fmtCost = (n: number) => `$${n.toFixed(4)}`
const fmtTok = (n: number) => n.toLocaleString('en-US')

/**
 * Model used per agent role. Mirrors `src/tribunal/agents.ts`: the
 * argumentative rounds (prosecutor/defense/rebuttal) run on the fast model,
 * while the judge keeps the higher-quality model for its structured verdict.
 */
const modelForLabel = (label: string): string => (label === 'Judge' ? 'fable-5' : 'sonnet-5')

/**
 * `app/trial.ts`'s `CallUsage` predates the `model`/`fellBack` fields that
 * `src/tribunal/agents.ts` now attaches to every usage block (the model that
 * ACTUALLY answered, and whether the ROSTER fallback kicked in). Widening
 * the type locally — rather than touching `trial.ts` — keeps this read safe
 * without assuming either field is present (older demo JSON, e.g.
 * `demos/TSLA.json` before this change, may omit them).
 */
type UsageWithModel = CallUsage & { model?: string; fellBack?: boolean }

/** "openai/gpt-5.2" → "gpt-5.2"; "anthropic/claude-fable-5" → "fable-5". */
const shortModel = (model: string): string => {
  const afterSlash = model.includes('/') ? model.slice(model.indexOf('/') + 1) : model
  return afterSlash.replace(/^claude-/, '')
}

/**
 * The full (provider-prefixed) model id that actually answered for one bill
 * row — e.g. "openai/gpt-5.2". Falls back to guessing from the agent role
 * (the old behavior) only when `usage.model` is missing — e.g. demo JSON
 * captured before Orbio started reporting it.
 */
const rawModelForEntry = (e: BillEntry): string => {
  const usage = e.usage as UsageWithModel
  return usage.model && usage.model.length > 0 ? usage.model : modelForLabel(e.label)
}

/**
 * The model that actually answered for one bill row, shortened, with a
 * " (fallback)" suffix when the primary model failed and the ROSTER
 * fallback answered instead.
 */
const modelForEntry = (e: BillEntry): string => {
  const short = shortModel(rawModelForEntry(e))
  return (e.usage as UsageWithModel).fellBack ? `${short} (fallback)` : short
}

/**
 * Small mono badge shown in a speech header: "2,431 tok · $0.0182".
 * Gated on `totalTokens` (not `cost`) — a free or fully-cached call still
 * has a real token count worth showing; hiding it entirely would quietly
 * undercut the "Court Bill" theme of always showing the real usage. Only
 * genuinely missing usage data (e.g. a gateway that omits the `usage`
 * block, which surfaces as the all-zero ZERO_USAGE default) is hidden.
 */
export function CostBadge({ usage }: { usage?: CallUsage }) {
  if (!usage || usage.totalTokens <= 0) return null
  return (
    <span className="cost-badge" title="Real cost of this model call, fueled by tokenized $ORBIO credits">
      {fmtTok(usage.totalTokens)} tok · {fmtCost(usage.cost)}
    </span>
  )
}

/** Animated running total above the agents' bench — a taxi meter for the trial. */
export function CourtBill({ entries }: { entries: BillEntry[] }) {
  const target = sumBill(entries).cost
  const [shown, setShown] = useState(0)
  const fromRef = useRef(0)
  useEffect(() => {
    const from = fromRef.current
    if (target === from) return
    const start = performance.now()
    const duration = 550
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      setShown(from + (target - from) * (1 - Math.pow(1 - t, 3)))
      if (t < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  if (entries.length === 0) return null
  return (
    <div className="court-bill" title="Running cost of this trial, fueled by tokenized $ORBIO credits">
      <span className="court-bill-label">COURT BILL</span>
      <span className="court-bill-amount">{fmtCost(shown)}</span>
    </div>
  )
}

/** Itemized receipt shown once the verdict is in. */
export function BillReceipt({ entries }: { entries: BillEntry[] }) {
  if (entries.length === 0) return null
  const total = sumBill(entries)
  const priciest = entries.reduce((a, b) => (b.usage.cost > a.usage.cost ? b : a), entries[0])
  const rawModels = entries.map(rawModelForEntry)
  const providerCount = new Set(rawModels.map((m) => (m.includes('/') ? m.slice(0, m.indexOf('/')) : m))).size
  const modelCount = new Set(rawModels).size
  return (
    <section className="bill-receipt">
      <h3>Cost of this ruling</h3>
      <div className="table-scroll">
        <table>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i} className={e === priciest ? 'priciest' : undefined}>
                <td>{e.label}</td>
                <td>{modelForEntry(e)}</td>
                <td>{fmtTok(e.usage.totalTokens)} tok</td>
                <td>{fmtCost(e.usage.cost)}</td>
              </tr>
            ))}
            <tr className="total">
              <td>Total</td>
              <td></td>
              <td>{fmtTok(total.totalTokens)} tok</td>
              <td>{fmtCost(total.cost)}</td>
            </tr>
            <tr className="orbio-savings">
              <td colSpan={4}>
                This trial burned {total.cost.toFixed(4)} CREDIT · 1 CREDIT = $1 at list price
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="bill-multimodel">
        One Orbio key · {providerCount} {providerCount === 1 ? 'provider' : 'providers'} · {modelCount}{' '}
        {modelCount === 1 ? 'model' : 'models'} · no subscriptions
      </p>
      <p className="bill-footnote">
        Every ruling is a data point on what a dollar of thinking buys — see the{' '}
        <Link href="/scoreboard">Scoreboard</Link>.
      </p>
      <p className="bill-footnote">
        CREDIT trades below par on Orbio&apos;s order book — the USDG you pay depends on the discount you bought at.
      </p>
      <p className="bill-footnote">
        {entries.length} model calls · fueled by tokenized $ORBIO credits · {priciest.label} argued the most
        expensively.
      </p>
    </section>
  )
}
