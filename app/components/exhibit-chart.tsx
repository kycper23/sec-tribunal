/**
 * Exhibit A, plotted: the numeric annual series the clerk already read out
 * as prose (Revenue / Net income / Operating cash flow), drawn as a
 * hand-ruled line chart styled like a ledger page bound into the dossier —
 * dashed rules, serif tick labels, no gradients or glow (matches the rest
 * of the engraving-styled UI). Pure presentation: the numbers come straight
 * from `/api/evidence`'s `series` field (see `extractSeries` in
 * `src/sec/facts.ts`), never recomputed here.
 *
 * When a blind trial's seal is broken (`future` prop), the points filed
 * after the cutoff are spliced onto the same axes as a dashed continuation —
 * "The Reveal" rendered as a literal extension of the ledger the tribunal
 * was shown, so it's visually obvious how much the sealed record hid.
 */
import type { ChartSeries } from '../trial'

const SERIES_CLASS: Record<string, string> = {
  Revenue: 'revenue',
  'Net income': 'net-income',
  'Operating cash flow': 'ocf',
}

const fmtAxisMoney = (v: number): string => {
  const sign = v < 0 ? '-' : ''
  const abs = Math.abs(v)
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(abs >= 10e9 ? 0 : 1)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`
  return `${sign}$${abs.toFixed(0)}`
}

const fyLabel = (period: string): string => period.slice(0, 4)

const W = 620
const H = 260
const PAD_L = 54
const PAD_R = 16
const PAD_T = 18
const PAD_B = 30

export function ExhibitChart({ series, future = [] }: { series: ChartSeries[]; future?: ChartSeries[] }) {
  const plottable = series.filter((s) => s.points.length >= 2)
  if (plottable.length === 0) return null
  const revealMap = new Map(future.map((s) => [s.label, s.points]))

  // Union of fiscal periods across all series (known + revealed), sorted
  // chronologically — metrics can have slightly different coverage, so the
  // x-axis is built from whichever periods actually appear, not assumed to
  // line up 1:1.
  const periods = [
    ...new Set([...plottable.flatMap((s) => s.points.map((p) => p.period)), ...future.flatMap((s) => s.points.map((p) => p.period))]),
  ].sort()
  const values = [...plottable.flatMap((s) => s.points.map((p) => p.value)), ...future.flatMap((s) => s.points.map((p) => p.value))]
  const rawMax = Math.max(...values, 0)
  const rawMin = Math.min(...values, 0)
  const span = rawMax - rawMin || 1
  const yMax = rawMax + span * 0.12
  const yMin = rawMin - span * 0.12

  const xFor = (period: string) => {
    const i = periods.indexOf(period)
    return periods.length > 1 ? PAD_L + (i / (periods.length - 1)) * (W - PAD_L - PAD_R) : W / 2
  }
  const yFor = (value: number) => PAD_T + (1 - (value - yMin) / (yMax - yMin)) * (H - PAD_T - PAD_B)
  const yZero = yFor(0)

  const gridValues = [yMax, yMax - (yMax - yMin) / 2, yMin]

  return (
    <figure className="exhibit-chart">
      <figcaption>Exhibit A · Five-Year Ledger</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Chart of annual revenue, net income and operating cash flow">
        {/* Hand-ruled horizontal guides, dashed like faint pencil lines on a ledger. */}
        {gridValues.map((v, i) => (
          <g key={i}>
            <line x1={PAD_L} y1={yFor(v)} x2={W - PAD_R} y2={yFor(v)} className="exhibit-grid" />
            <text x={PAD_L - 8} y={yFor(v)} className="exhibit-axis-y" textAnchor="end" dominantBaseline="middle">
              {fmtAxisMoney(v)}
            </text>
          </g>
        ))}
        {/* Zero baseline, solid — the ledger's true horizon when a series dips negative. */}
        {rawMin < 0 && <line x1={PAD_L} y1={yZero} x2={W - PAD_R} y2={yZero} className="exhibit-baseline" />}

        {periods.map((p) => (
          <text key={p} x={xFor(p)} y={H - 8} className="exhibit-axis-x" textAnchor="middle">
            {fyLabel(p)}
          </text>
        ))}

        {plottable.map((s) => {
          const cls = SERIES_CLASS[s.label] ?? 'other'
          const d = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(p.period)},${yFor(p.value)}`).join(' ')
          return (
            <g key={s.label} className={`exhibit-series ${cls}`}>
              <path d={d} fill="none" />
              {s.points.map((p) => (
                <circle key={p.period} cx={xFor(p.period)} cy={yFor(p.value)} r={2.6} />
              ))}
            </g>
          )
        })}

        {/* The Reveal: what was filed after the seal, spliced on as a dashed
            continuation from the last known point — same axes, same colour,
            visibly "unlocked" rather than a separate chart. */}
        {plottable.map((s) => {
          const revealPoints = revealMap.get(s.label)
          if (!revealPoints?.length) return null
          const lastKnown = s.points[s.points.length - 1]
          const cls = SERIES_CLASS[s.label] ?? 'other'
          const chain = [lastKnown, ...revealPoints]
          const d = chain.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(p.period)},${yFor(p.value)}`).join(' ')
          return (
            <g key={`reveal-${s.label}`} className={`exhibit-series exhibit-reveal ${cls}`}>
              <path d={d} fill="none" />
              {revealPoints.map((p) => (
                <circle key={p.period} cx={xFor(p.period)} cy={yFor(p.value)} r={2.6} />
              ))}
            </g>
          )
        })}
      </svg>
      <ul className="exhibit-legend">
        {plottable.map((s) => (
          <li key={s.label} className={`exhibit-series ${SERIES_CLASS[s.label] ?? 'other'}`}>
            <span className="exhibit-swatch" />
            {s.label}
          </li>
        ))}
        {future.length > 0 && (
          <li className="exhibit-series exhibit-reveal-legend">
            <span className="exhibit-swatch" />
            Filed after the seal (The Reveal)
          </li>
        )}
      </ul>
    </figure>
  )
}
