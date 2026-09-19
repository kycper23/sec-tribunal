'use client'

/**
 * The Court Bill — the tribunal's answer to "what can you do with tokenized
 * credits?": every model call costs real $ORBIO credits (via Orbio's
 * `usage.cost`), and the courtroom shows the meter running live instead of
 * hiding it. A taxi-meter ticker above the bench, a cost badge per speech,
 * and a receipt once the verdict is in.
 */
import { useEffect, useRef, useState } from 'react'
import type { BillEntry, CallUsage } from '../trial'
import { sumBill } from '../trial'

const fmtCost = (n: number) => `$${n.toFixed(4)}`
const fmtTok = (n: number) => n.toLocaleString('en-US')

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
  const listPrice = total.cost / 0.775
  const saved = listPrice - total.cost
  return (
    <section className="bill-receipt">
      <h3>Cost of this ruling</h3>
      <table>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i} className={e === priciest ? 'priciest' : undefined}>
              <td>{e.label}</td>
              <td>{fmtTok(e.usage.totalTokens)} tok</td>
              <td>{fmtCost(e.usage.cost)}</td>
            </tr>
          ))}
          <tr className="total">
            <td>Total</td>
            <td>{fmtTok(total.totalTokens)} tok</td>
            <td>{fmtCost(total.cost)}</td>
          </tr>
          <tr className="orbio-savings">
            <td colSpan={3}>
              Through Orbio: {fmtCost(total.cost)} · list price: {fmtCost(listPrice)} · saved{' '}
              <span style={{ color: '#3E6B4F' }}>
                {fmtCost(saved)} (22.5%)
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="bill-footnote">
        {entries.length} model calls · fueled by tokenized $ORBIO credits · {priciest.label} argued the most
        expensively.
      </p>
    </section>
  )
}
