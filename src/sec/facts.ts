/**
 * Distil a multi-megabyte companyfacts payload into a compact text brief the
 * agents can actually read: a whitelist of key us-gaap tags (with fallbacks,
 * since companies tag revenue differently), annual 10-K figures for the last
 * five fiscal years plus the most recent 10-Q quarters, deduplicated by
 * period preferring the latest filing (which absorbs restatements).
 */
import type { Company, CompanyFacts, FactValue } from './edgar.js'

interface Metric {
  label: string
  tags: string[]
}

const METRICS: Metric[] = [
  { label: 'Revenue', tags: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet'] },
  { label: 'Gross profit', tags: ['GrossProfit'] },
  { label: 'Operating income', tags: ['OperatingIncomeLoss'] },
  { label: 'Net income', tags: ['NetIncomeLoss'] },
  { label: 'Operating cash flow', tags: ['NetCashProvidedByUsedInOperatingActivities'] },
  { label: 'R&D expense', tags: ['ResearchAndDevelopmentExpense'] },
  {
    label: 'Interest expense',
    tags: [
      'InterestExpense',
      'InterestExpenseDebt',
      'InterestExpenseNonoperating',
      'InterestExpenseBorrowings',
      'InterestIncomeExpenseNet',
    ],
  },
  { label: 'Total assets', tags: ['Assets'] },
  { label: 'Total liabilities', tags: ['Liabilities'] },
  {
    label: 'Long-term debt',
    tags: ['LongTermDebtNoncurrent', 'LongTermDebt', 'LongTermDebtAndCapitalLeaseObligations'],
  },
  {
    label: 'Stockholders equity',
    tags: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
  },
  {
    label: 'Cash & equivalents',
    tags: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'],
  },
]

const ANNUAL_YEARS = 5
const RECENT_QUARTERS = 5

const durationDays = (v: FactValue): number | null =>
  v.start ? Math.round((Date.parse(v.end) - Date.parse(v.start)) / 86_400_000) : null

/** One value per (start, end) period; when a period was re-filed, keep the newest filing. */
const dedupe = (values: FactValue[]): FactValue[] => {
  const byPeriod = new Map<string, FactValue>()
  for (const v of values) {
    const key = `${v.start ?? ''}|${v.end}`
    const prev = byPeriod.get(key)
    if (!prev || (v.filed ?? '') > (prev.filed ?? '')) byPeriod.set(key, v)
  }
  return [...byPeriod.values()].sort((a, b) => a.end.localeCompare(b.end))
}

/** Annual = reported on a 10-K; for flow metrics also require a ~full-year duration. */
const isAnnual = (v: FactValue): boolean => {
  if (v.form !== '10-K') return false
  const days = durationDays(v)
  return days === null || (days > 300 && days < 400)
}

/** Quarterly = reported on a 10-Q; for flow metrics require a ~single-quarter duration. */
const isQuarterly = (v: FactValue): boolean => {
  if (v.form !== '10-Q') return false
  const days = durationDays(v)
  return days === null || days < 120
}

const fmtMoney = (v: number): string => {
  const sign = v < 0 ? '-' : ''
  const abs = Math.abs(v)
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`
  return `${sign}$${abs.toLocaleString('en-US')}`
}

const fmtPoint = (v: FactValue): string => `${v.end}: ${fmtMoney(v.val)}`

const pct = (num: number, den: number): string => `${((num / den) * 100).toFixed(1)}%`

/**
 * Blind-trial gate: was this fact actually knowable by `cutoff`? Keyed off
 * `filed` (the SEC filing date), NOT `end` (the reporting-period date) —
 * a FY2022 10-K might cover a period ending 2022-12-31 but wasn't filed (and
 * thus wasn't public) until ~February 2023. Grading it as "known" on
 * 2023-01-01 would be look-ahead bias. Falls back to `end` only for the rare
 * fact with no `filed` field at all. No cutoff = everything known (today).
 */
const knownBy = (v: FactValue, cutoff: string | undefined): boolean => !cutoff || (v.filed ?? v.end) <= cutoff

interface Series {
  tag: string
  annual: FactValue[]
  quarterly: FactValue[]
}

/** Margins, YoY growth and leverage, precomputed so the agents argue from ratios, not arithmetic. */
const derivedLines = (series: Map<string, Series>): string[] => {
  const revenue = series.get('Revenue')
  if (!revenue) return []
  const lines: string[] = []
  for (const kind of ['annual', 'quarterly'] as const) {
    const revs = revenue[kind]
    const rows: string[] = []
    revs.forEach((r, i) => {
      if (!r.val) return
      const at = (label: string) => series.get(label)?.[kind].find((v) => v.end === r.end)?.val
      const parts: string[] = []
      const gp = at('Gross profit')
      if (gp !== undefined) parts.push(`gross margin ${pct(gp, r.val)}`)
      const oi = at('Operating income')
      if (oi !== undefined) parts.push(`operating margin ${pct(oi, r.val)}`)
      const ni = at('Net income')
      if (ni !== undefined) parts.push(`net margin ${pct(ni, r.val)}`)
      const prior =
        kind === 'annual'
          ? i > 0
            ? revs[i - 1]
            : undefined
          : revs.find((v) => {
              const days = (Date.parse(r.end) - Date.parse(v.end)) / 86_400_000
              return days > 330 && days < 400
            })
      if (prior?.val) parts.push(`revenue YoY ${pct(r.val - prior.val, Math.abs(prior.val))}`)
      const debt = at('Long-term debt')
      const equity = at('Stockholders equity')
      if (debt !== undefined && equity) parts.push(`LT-debt/equity ${(debt / equity).toFixed(2)}`)
      if (parts.length) rows.push(`  ${r.end}: ${parts.join(', ')}`)
    })
    if (rows.length) {
      lines.push(kind === 'annual' ? 'Derived ratios — annual:' : 'Derived ratios — recent quarters:', ...rows, '')
    }
  }
  return lines
}

const DAY = 86_400_000

/**
 * Companies retire XBRL tags over the years; a tag can hold only decade-old
 * data. Pick the FRESHEST candidate tag, then drop series that are stale
 * relative to the company's latest filing, and prune old "recent" quarters.
 */
const STALE_SERIES_DAYS = 3 * 365
const STALE_QUARTER_DAYS = 550

/**
 * The two-pass tag selection shared by `buildBrief` and `extractSeries`:
 * pick the freshest candidate tag per metric, then drop stale series/quarters
 * relative to the company-wide "as of" date. Pure refactor — same values
 * `buildBrief` computed inline before, now reusable for the chart exhibit.
 */
const computeSeries = (
  facts: CompanyFacts,
  cutoff?: string,
): { series: Map<string, Series>; missing: string[] } => {
  const gaap = facts.facts['us-gaap'] ?? {}
  const series = new Map<string, Series>()
  const missing: string[] = []

  // Pass 1: for each metric choose the tag with the most recent data point.
  const chosen = new Map<string, { tag: string; values: FactValue[] }>()
  let asof = 0
  for (const metric of METRICS) {
    let best: { tag: string; values: FactValue[]; latest: number } | null = null
    for (const tag of metric.tags) {
      const raw = gaap[tag]?.units?.USD?.filter((v) => knownBy(v, cutoff))
      if (!raw?.length) continue
      const values = dedupe(raw)
      const latest = Date.parse(values[values.length - 1].end)
      if (!best || latest > best.latest) best = { tag, values, latest }
    }
    if (!best) {
      missing.push(metric.label)
      continue
    }
    chosen.set(metric.label, best)
    asof = Math.max(asof, best.latest)
  }

  // Pass 2: filter with the company-wide "as of" date known.
  for (const metric of METRICS) {
    const pick = chosen.get(metric.label)
    if (!pick) continue
    const latest = Date.parse(pick.values[pick.values.length - 1].end)
    if (asof - latest > STALE_SERIES_DAYS * DAY) {
      missing.push(`${metric.label} (last reported ${pick.values[pick.values.length - 1].end})`)
      continue
    }
    const annual = pick.values
      .filter(isAnnual)
      .filter((v) => asof - Date.parse(v.end) <= (ANNUAL_YEARS + 2) * 365 * DAY)
      .slice(-ANNUAL_YEARS)
    const quarterly = pick.values
      .filter(isQuarterly)
      .filter((v) => asof - Date.parse(v.end) <= STALE_QUARTER_DAYS * DAY)
      .slice(-RECENT_QUARTERS)
    if (!annual.length && !quarterly.length) {
      missing.push(metric.label)
      continue
    }
    series.set(metric.label, { tag: pick.tag, annual, quarterly })
  }

  return { series, missing }
}

/** One numeric point on an Exhibit A chart: fiscal-year end + value in USD. */
export interface SeriesPoint {
  period: string
  value: number
}

/** A single chart-ready metric — annual figures only (steadier than quarters for a plate-sized plot). */
export interface ChartSeries {
  label: string
  points: SeriesPoint[]
}

/** Curated subset of METRICS worth plotting on the antique Exhibit A chart. */
const CHART_METRICS = ['Revenue', 'Net income', 'Operating cash flow']

/**
 * Numeric annual series for the Exhibit A chart — no text formatting, no
 * agent-facing prose, just `{ period, value }` pairs the frontend can plot
 * as a pure-SVG line. Reuses the exact same tag-selection/staleness logic as
 * `buildBrief`, so the chart and the evidence brief the agents read from can
 * never silently disagree.
 */
export const extractSeries = (facts: CompanyFacts, cutoff?: string): ChartSeries[] => {
  const { series } = computeSeries(facts, cutoff)
  return CHART_METRICS.flatMap((label) => {
    const s = series.get(label)
    if (!s || s.annual.length < 2) return []
    return [{ label, points: s.annual.map((v) => ({ period: v.end, value: v.val })) }]
  })
}

/** Every headline metric `forensics.ts` needs for its ratios — wider than the three-line Exhibit A chart. */
const FORENSICS_METRICS = [
  'Revenue',
  'Gross profit',
  'Operating income',
  'Net income',
  'Operating cash flow',
  'Interest expense',
  'Total assets',
  'Total liabilities',
  'Long-term debt',
  'Stockholders equity',
  'Cash & equivalents',
]

/**
 * Same annual-series extraction as `extractSeries`, but exposing every
 * balance-sheet/income-statement line the deterministic forensic scorer
 * needs (not just the three chart metrics). No two-point floor — a single
 * annual figure is still useful for a snapshot ratio.
 */
export const extractForensicsSeries = (facts: CompanyFacts, cutoff?: string): ChartSeries[] => {
  const { series } = computeSeries(facts, cutoff)
  return FORENSICS_METRICS.flatMap((label) => {
    const s = series.get(label)
    if (!s || !s.annual.length) return []
    return [{ label, points: s.annual.map((v) => ({ period: v.end, value: v.val })) }]
  })
}

/**
 * "The Reveal" exhibit: the annual points that were filed AFTER the cutoff —
 * i.e. what actually happened next, hidden from both the jury and the agents
 * during a blind trial. Same tag-selection logic as `extractSeries` so the
 * two halves of the chart (known / revealed) always splice onto one series.
 */
export const extractFutureSeries = (facts: CompanyFacts, cutoff: string): ChartSeries[] => {
  const { series: known } = computeSeries(facts, cutoff) // what was knowable at the cutoff
  const { series: full } = computeSeries(facts) // no cutoff = everything ever filed
  return CHART_METRICS.flatMap((label) => {
    const s = full.get(label)
    if (!s) return []
    // "Future" is decided by the reporting PERIOD (`end`), not the filing date
    // (`filed`): a later 10-K restates the prior fiscal year as a comparative
    // column, so its `filed` is after the cutoff even though the period was
    // already known — filtering on `filed` would re-surface that known year as
    // the first "revealed" point. ISO date strings compare safely as strings.
    const lastKnownEnd = known.get(label)?.annual.at(-1)?.end
    const future =
      lastKnownEnd === undefined
        ? s.annual.filter((v) => (v.filed ?? v.end) > cutoff) // no data at cutoff: keep legacy filed-based behaviour
        : s.annual.filter((v) => v.end > lastKnownEnd)
    if (!future.length) return []
    return [{ label, points: future.map((v) => ({ period: v.end, value: v.val })) }]
  })
}

/** One metric's "what the jury knew" vs. "what actually happened next" — pure arithmetic, no model call. */
export interface RealityDelta {
  label: string
  cutoffPeriod: string | null
  cutoffValue: number | null
  latestPeriod: string | null
  latestValue: number | null
  changePct: number | null
}

export interface RealityReport {
  cutoff: string
  deltas: RealityDelta[]
}

/**
 * "The Reveal", quantified: for each headline metric, the last annual figure
 * the tribunal was actually allowed to see (as of `cutoff`) versus the last
 * annual figure filed since — real-world ground truth the agents never
 * touched. Purely deterministic (no LLM), so it can be trusted as the
 * arbiter of a bet's outcome.
 */
export const buildRealityReport = (facts: CompanyFacts, cutoff: string): RealityReport => {
  const { series: known } = computeSeries(facts, cutoff)
  const { series: full } = computeSeries(facts)
  const deltas: RealityDelta[] = CHART_METRICS.map((label) => {
    const cutoffPoint = known.get(label)?.annual.at(-1) ?? null
    const latestPoint = full.get(label)?.annual.at(-1) ?? null
    const cutoffValue = cutoffPoint?.val ?? null
    const latestValue = latestPoint?.val ?? null
    const changePct =
      cutoffValue !== null && latestValue !== null && cutoffValue !== 0
        ? ((latestValue - cutoffValue) / Math.abs(cutoffValue)) * 100
        : null
    return {
      label,
      cutoffPeriod: cutoffPoint?.end ?? null,
      cutoffValue,
      latestPeriod: latestPoint?.end ?? null,
      latestValue,
      changePct,
    }
  })
  return { cutoff, deltas }
}

/** Render companyfacts into a compact, LLM-friendly brief. */
export const buildBrief = (company: Company, facts: CompanyFacts, cutoff?: string): string => {
  const { series, missing } = computeSeries(facts, cutoff)

  const lines: string[] = [
    `Company: ${facts.entityName || company.name} (ticker ${company.ticker}, CIK ${company.cik10})`,
    'Source: SEC EDGAR XBRL companyfacts — figures exactly as filed in 10-K / 10-Q reports. All values in USD.',
    ...(cutoff
      ? [
          `BLIND TRIAL: this tribunal is sealed at ${cutoff}. Every figure below was actually filed with the` +
            ' SEC on or before that date — nothing filed after it is included, even if it exists in the historical' +
            ' record. Argue only from what was knowable at the time; do not speculate about what came later.',
        ]
      : []),
    '',
  ]
  const asof = Math.max(
    ...[...series.values()].flatMap((s) =>
      [s.annual.at(-1)?.end, s.quarterly.at(-1)?.end].filter((d): d is string => !!d).map((d) => Date.parse(d)),
    ),
  )
  for (const metric of METRICS) {
    const s = series.get(metric.label)
    if (!s) continue
    const latestEnd = [s.annual.at(-1)?.end, s.quarterly.at(-1)?.end]
      .filter((d): d is string => !!d)
      .sort()
      .at(-1)
    const stale = latestEnd && asof - Date.parse(latestEnd) > 400 * DAY ? ` — STALE: not reported since ${latestEnd}` : ''
    lines.push(`${metric.label} [us-gaap:${s.tag}]${stale}:`)
    if (s.annual.length) lines.push(`  Annual (10-K, FY end): ${s.annual.map(fmtPoint).join(' | ')}`)
    if (s.quarterly.length) lines.push(`  Recent quarters (10-Q, period end): ${s.quarterly.map(fmtPoint).join(' | ')}`)
    lines.push('')
  }
  lines.push(...derivedLines(series))
  if (missing.length) lines.push(`Not reported under standard tags: ${missing.join(', ')}.`)
  return lines.join('\n').trim()
}
