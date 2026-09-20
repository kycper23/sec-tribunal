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
  const opIncPts = m.get('Operating income')
  const intPts = m.get('Interest expense')
  const opIncLast = opIncPts?.length ? opIncPts[opIncPts.length - 1] : null
  const intLast = intPts?.length ? intPts[intPts.length - 1] : null

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
  const samePeriod = opIncLast !== null && intLast !== null && opIncLast.period === intLast.period
  if (opIncLast !== null && !samePeriod) {
    note += ' Interest expense not reported for the latest fiscal year — coverage not computed.'
  }
  const coverageComputed = samePeriod && intLast.value > 0
  if (coverageComputed) {
    const coverage = opIncLast.value / intLast.value
    note += ` Interest coverage ${coverage.toFixed(1)}x.`
    if (coverage > 15) {
      score = Math.max(score, 17)
      note += ' Very strong interest coverage outweighs the debt/equity level.'
    } else if (coverage >= 8) {
      score = Math.max(score, 14)
      note += ' Solid interest coverage supports the debt/equity level.'
    } else if (coverage < 2) {
      score = Math.min(score, 6)
      flags.push({
        severity: 'red',
        label: 'Weak interest coverage',
        note: `Operating income covers interest expense only ${coverage.toFixed(1)}x (below 2x).`,
      })
    }
  } else {
    // Coverage could not be computed (missing interest expense or mismatched periods) — never
    // penalize for absent data; floor at the neutral level without adding a flag.
    score = Math.max(score, 10)
  }
  return { label: 'Leverage', score: clamp(score), note }
}

/** Cash generation and cushion: sign of OCF (the primary signal), OCF-to-debt payback horizon, and cash trend. */
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
      score += 10
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

  if (ocf !== null && ocf > 0 && debt !== null && debt > 0) {
    const payback = debt / ocf
    if (payback < 2) {
      score += 6
      notes.push(`Operating cash flow covers long-term debt in ${payback.toFixed(1)} years (under 2).`)
    } else if (payback <= 5) {
      score += 3
      notes.push(`Operating cash flow covers long-term debt in ${payback.toFixed(1)} years (2-5).`)
    }
  }

  if (cash !== null && priorCash !== null) {
    if (cash > priorCash) {
      score += 2
      notes.push('Cash balance grew year over year.')
    } else if (cash < priorCash) {
      score -= 2
      notes.push('Cash balance shrank year over year.')
      flags.push({ severity: 'amber', label: 'Cash balance declining', note: 'Cash & equivalents fell versus the prior fiscal year.' })
    }
  }

  return { label: 'Liquidity', score: clamp(score), note: notes.join(' ') || 'No liquidity signal available.' }
}

/** SIC 6000-6799: banks, insurers, REITs, and other financial institutions. */
const isFinancialSic = (sic?: string): boolean => {
  const code = Number(sic)
  return Number.isFinite(code) && code >= 6000 && code <= 6799
}

/**
 * Run all five sub-scores against an annual series set (as produced by
 * `extractForensicsSeries`) and total them into a 0-100 deterministic
 * score, independent of and complementary to the LLM tribunal's verdict.
 *
 * When `sic` identifies a financial institution (6000-6799), Leverage and
 * Liquidity are scored neutral without flags: negative OCF reflects loan/
 * trading-book swings, and debt ratios are structural, not distress signals.
 */
export const runForensics = (series: ChartSeries[], sic?: string): ForensicsResult => {
  const m = seriesMap(series)
  const flags: Flag[] = []
  const financial = isFinancialSic(sic)
  const subScores = [
    scoreGrowth(m, flags),
    scoreProfitability(m, flags),
    scoreEarningsQuality(m, flags),
    financial
      ? {
          label: 'Leverage',
          score: NEUTRAL,
          note: 'Leverage ratios are not meaningful for financial institutions — scored neutral.',
        }
      : scoreLeverage(m, flags),
    financial
      ? {
          label: 'Liquidity',
          score: NEUTRAL,
          note: 'Operating cash flow swings with the loan and trading book — not a liquidity signal for financial institutions. Scored neutral.',
        }
      : scoreLiquidity(m, flags),
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
