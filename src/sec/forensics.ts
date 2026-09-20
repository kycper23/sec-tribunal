/**
 * Deterministic forensic scorer: a second, code-computed opinion on a
 * company's financial health that sits ALONGSIDE the LLM tribunal verdict —
 * not a replacement for it. Five sub-scores (0-20 each, 100 total) derived
 * purely from arithmetic on the annual series `facts.ts` already extracts,
 * plus a short list of red/amber flags. Every sub-score degrades to a
 * neutral 10/20 with an explanatory note when the underlying data is
 * missing or unusable — this must never throw, since it runs on whatever a
 * real filer happened to tag.
 */
import type { ChartSeries, SeriesPoint } from './facts.js'

export type Severity = 'red' | 'amber'

export interface Flag {
  severity: Severity
  label: string
  note: string
}

export interface SubScore {
  label: string
  score: number // 0-20
  note: string
}

export interface ForensicsResult {
  subScores: SubScore[]
  total: number // 0-100, sum of subScores
  flags: Flag[]
}

const NEUTRAL = 10
const clamp = (v: number, lo = 0, hi = 20): number => Math.max(lo, Math.min(hi, v))

const seriesMap = (series: ChartSeries[]): Map<string, SeriesPoint[]> =>
  new Map(series.map((s) => [s.label, s.points]))

/** Last point, one before that, two before that — annual points come sorted oldest-first. */
const at = (points: SeriesPoint[] | undefined, fromEnd: number): number | null => {
  if (!points || points.length <= fromEnd) return null
  return points[points.length - 1 - fromEnd].value
}

const pct1 = (v: number): string => `${(v * 100).toFixed(1)}%`

/** YoY revenue growth; a top line still below its level from 2 fiscal years ago is capped and flagged. */
const scoreGrowth = (m: Map<string, SeriesPoint[]>, flags: Flag[]): SubScore => {
  const rev = m.get('Revenue')
  const latest = at(rev, 0)
  const prior = at(rev, 1)
  if (latest === null || prior === null || prior === 0) {
    return { label: 'Growth', score: NEUTRAL, note: 'Insufficient revenue history — neutral score.' }
  }
  const yoy = (latest - prior) / Math.abs(prior)
  let score = yoy >= 0.15 ? 20 : yoy >= 0.05 ? 16 : yoy >= 0 ? 12 : yoy >= -0.1 ? 6 : 2
  let note = `Revenue YoY ${pct1(yoy)}.`

  const twoAgo = at(rev, 2)
  if (twoAgo !== null && latest < twoAgo) {
    score = Math.min(score, 8)
    flags.push({
      severity: 'red',
      label: 'Revenue below 2-year-ago level',
      note: 'Latest revenue is below the figure reported two fiscal years ago.',
    })
    note += ' Revenue has not recovered to its level from two fiscal years ago.'
  }
  return { label: 'Growth', score: clamp(score), note }
}

/** Net-margin level, with a small trend adjustment; any net loss is a red flag regardless of trend. */
const scoreProfitability = (m: Map<string, SeriesPoint[]>, flags: Flag[]): SubScore => {
  const rev = m.get('Revenue')
  const ni = m.get('Net income')
  const latestRev = at(rev, 0)
  const latestNi = at(ni, 0)
  if (latestRev === null || latestNi === null || latestRev === 0) {
    return { label: 'Profitability', score: NEUTRAL, note: 'Insufficient revenue/net income data — neutral score.' }
  }
  const margin = latestNi / latestRev
  let score = margin >= 0.15 ? 20 : margin >= 0.08 ? 16 : margin >= 0.02 ? 12 : margin >= 0 ? 8 : 2
  let note = `Net margin ${pct1(margin)}.`

  const priorRev = at(rev, 1)
  const priorNi = at(ni, 1)
  if (priorRev !== null && priorNi !== null && priorRev !== 0) {
    const priorMargin = priorNi / priorRev
    const delta = margin - priorMargin
    if (delta >= 0.02) score += 2
    else if (delta <= -0.02) score -= 2
    note += ` Trend vs prior year: ${delta >= 0 ? '+' : ''}${pct1(delta)}pt.`
  }
  if (margin < 0) {
    flags.push({ severity: 'red', label: 'Net loss', note: `Latest fiscal year net margin is ${pct1(margin)}.` })
  }
  return { label: 'Profitability', score: clamp(score), note }
}

/** Cash conversion of reported earnings — the classic "paper profits" tell when OCF trails net income. */
const scoreEarningsQuality = (m: Map<string, SeriesPoint[]>, flags: Flag[]): SubScore => {
  const ocf = at(m.get('Operating cash flow'), 0)
  const ni = at(m.get('Net income'), 0)
  if (ocf === null || ni === null) {
    return { label: 'Earnings quality', score: NEUTRAL, note: 'Insufficient OCF/net income data — neutral score.' }
  }
  if (ni <= 0) {
    if (ocf > 0) {
      return {
        label: 'Earnings quality',
        score: clamp(12),
        note: 'Net income is zero/negative but operating cash flow is positive — earnings quality not directly comparable.',
      }
    }
    flags.push({
      severity: 'red',
      label: 'Negative cash earnings',
      note: 'Both net income and operating cash flow are zero or negative.',
    })
    return { label: 'Earnings quality', score: clamp(2), note: 'Net income and operating cash flow are both non-positive.' }
  }
  const ratio = ocf / ni
  let score: number
  if (ratio >= 1.0) score = 20
  else if (ratio >= 0.8) score = 16
  else if (ratio >= 0.5) {
    score = 10
    flags.push({
      severity: 'amber',
      label: 'Paper profits',
      note: `OCF/NI is ${ratio.toFixed(2)} — operating cash flow trails net income (0.5–0.8 range).`,
    })
  } else {
    score = 2
    flags.push({
      severity: 'red',
      label: 'Weak earnings quality',
      note: `OCF/NI is ${ratio.toFixed(2)}, well below net income — reported earnings are not backed by cash.`,
    })
  }
  return { label: 'Earnings quality', score: clamp(score), note: `OCF/NI ratio ${ratio.toFixed(2)}.` }
}

/** Balance-sheet leverage: LT-debt/equity level, floored by negative equity, and interest coverage. */
const scoreLeverage = (m: Map<string, SeriesPoint[]>, flags: Flag[]): SubScore => {
  const debt = at(m.get('Long-term debt'), 0)
  const equity = at(m.get('Stockholders equity'), 0)
  const opInc = at(m.get('Operating income'), 0)
  const interest = at(m.get('Interest expense'), 0)

  if (debt === null && equity === null) {
    return { label: 'Leverage', score: NEUTRAL, note: 'Insufficient debt/equity data — neutral score.' }
  }
  if (equity !== null && equity <= 0) {
    flags.push({
      severity: 'red',
      label: 'Negative stockholders equity',
      note: 'Stockholders equity is zero or negative — liabilities exceed assets.',
    })
    return { label: 'Leverage', score: clamp(2), note: 'Negative or zero stockholders equity.' }
  }
  let score = NEUTRAL
  let note = 'Debt/equity not available.'
  if (debt !== null && equity !== null && equity > 0) {
    const de = debt / equity
    score = de <= 0.3 ? 20 : de <= 0.6 ? 16 : de <= 1.0 ? 12 : de <= 2.0 ? 8 : 4
    note = `LT-debt/equity ${de.toFixed(2)}.`
  }
  if (interest !== null && interest > 0 && opInc !== null) {
    const coverage = opInc / interest
    note += ` Interest coverage ${coverage.toFixed(1)}x.`
    if (coverage < 2) {
      score = Math.min(score, 6)
      flags.push({
        severity: 'red',
        label: 'Weak interest coverage',
        note: `Operating income covers interest expense only ${coverage.toFixed(1)}x (below 2x).`,
      })
    }
  }
  return { label: 'Leverage', score: clamp(score), note }
}

/** Cash generation and cushion: sign of OCF, direction of the cash balance, and cash vs. long-term debt. */
const scoreLiquidity = (m: Map<string, SeriesPoint[]>, flags: Flag[]): SubScore => {
  const ocf = at(m.get('Operating cash flow'), 0)
  const cash = at(m.get('Cash & equivalents'), 0)
  const priorCash = at(m.get('Cash & equivalents'), 1)
  const debt = at(m.get('Long-term debt'), 0)

  if (ocf === null && cash === null) {
    return { label: 'Liquidity', score: NEUTRAL, note: 'Insufficient cash-flow/cash-balance data — neutral score.' }
  }

  let score = NEUTRAL
  const notes: string[] = []

  if (ocf !== null) {
    if (ocf > 0) {
      score += 5
      notes.push('Operating cash flow positive.')
    } else {
      score -= 5
      notes.push('Operating cash flow negative.')
      flags.push({
        severity: 'red',
        label: 'Negative operating cash flow',
        note: 'Latest fiscal year operating cash flow is zero or negative.',
      })
    }
  }

  if (cash !== null && priorCash !== null) {
    if (cash > priorCash) {
      score += 3
      notes.push('Cash balance grew year over year.')
    } else if (cash < priorCash) {
      score -= 3
      notes.push('Cash balance shrank year over year.')
      flags.push({ severity: 'amber', label: 'Cash balance declining', note: 'Cash & equivalents fell versus the prior fiscal year.' })
    }
  }

  if (cash !== null && debt !== null && debt > 0) {
    if (cash >= debt) {
      score += 2
      notes.push('Cash covers long-term debt.')
    } else if (cash < debt * 0.5) {
      score -= 2
      notes.push('Cash covers less than half of long-term debt.')
      flags.push({
        severity: 'amber',
        label: 'Thin cash cushion vs. debt',
        note: 'Cash & equivalents cover less than half of long-term debt.',
      })
    }
  }

  return { label: 'Liquidity', score: clamp(score), note: notes.join(' ') || 'No liquidity signal available.' }
}

/**
 * Run all five sub-scores against an annual series set (as produced by
 * `extractForensicsSeries`) and total them into a 0-100 deterministic
 * score, independent of and complementary to the LLM tribunal's verdict.
 */
export const runForensics = (series: ChartSeries[]): ForensicsResult => {
  const m = seriesMap(series)
  const flags: Flag[] = []
  const subScores = [
    scoreGrowth(m, flags),
    scoreProfitability(m, flags),
    scoreEarningsQuality(m, flags),
    scoreLeverage(m, flags),
    scoreLiquidity(m, flags),
  ]
  const total = subScores.reduce((sum, s) => sum + s.score, 0)
  return { subScores, total, flags }
}

/** Compact text block for the agents/UI — same rendering style as the 8-K docket. */
export const renderForensics = (result: ForensicsResult): string => {
  const lines = ['DETERMINISTIC FORENSIC SCORE (code-computed, independent of the LLM verdict):', '']
  for (const s of result.subScores) {
    lines.push(`- ${s.label}: ${s.score}/20 — ${s.note}`)
  }
  lines.push('', `Total: ${result.total}/100.`)
  if (result.flags.length) {
    lines.push('', 'Flags:')
    for (const f of result.flags) {
      lines.push(`- [${f.severity.toUpperCase()}] ${f.label}: ${f.note}`)
    }
  } else {
    lines.push('', 'No red/amber flags raised.')
  }
  return lines.join('\n').trim()
}
