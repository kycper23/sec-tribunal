/**
 * Unit tests for the deterministic forensic scorer (runForensics) and the
 * judge's anchoring guard (stripForensicsBlock). Pure arithmetic on synthetic
 * ChartSeries — zero network, no new dependencies. Run via `npm test`
 * (tsx --test, node:test runner).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ChartSeries } from './facts.js'
import { runForensics, renderForensics } from './forensics.js'
import { stripForensicsBlock } from '../tribunal/agents.js'

/** Synthetic series builder — annual points, oldest first, like facts.ts produces. */
const series = (label: string, values: [string, number][]): ChartSeries => ({
  label,
  points: values.map(([period, value]) => ({ period, value })),
})

// Rising revenue (+16.7% YoY), 19% net margin, OCF > NI (ratio 1.25),
// LT-debt/equity 0.10, positive OCF with sub-2-year debt payback, growing cash.
const HEALTHY: ChartSeries[] = [
  series('Revenue', [['2022-12-31', 800], ['2023-12-31', 900], ['2024-12-31', 1050]]),
  series('Net income', [['2022-12-31', 120], ['2023-12-31', 160], ['2024-12-31', 200]]),
  series('Operating cash flow', [['2022-12-31', 150], ['2023-12-31', 200], ['2024-12-31', 250]]),
  series('Long-term debt', [['2024-12-31', 100]]),
  series('Stockholders equity', [['2024-12-31', 1000]]),
  series('Cash & equivalents', [['2023-12-31', 250], ['2024-12-31', 300]]),
]

// Falling revenue (-22% YoY, below 2-years-ago), net loss, negative OCF,
// negative stockholders equity, shrinking cash.
const TROUBLED: ChartSeries[] = [
  series('Revenue', [['2022-12-31', 1000], ['2023-12-31', 900], ['2024-12-31', 700]]),
  series('Net income', [['2023-12-31', -50], ['2024-12-31', -100]]),
  series('Operating cash flow', [['2024-12-31', -80]]),
  series('Long-term debt', [['2024-12-31', 500]]),
  series('Stockholders equity', [['2024-12-31', -50]]),
  series('Cash & equivalents', [['2023-12-31', 60], ['2024-12-31', 20]]),
]

const sub = (result: ReturnType<typeof runForensics>, label: string) => {
  const s = result.subScores.find((x) => x.label === label)
  assert.ok(s, `missing sub-score: ${label}`)
  return s
}

test('runForensics: healthy company scores above 70 with no flags', () => {
  const res = runForensics(HEALTHY)
  assert.ok(res.total > 70, `expected total > 70, got ${res.total}`)
  assert.equal(res.flags.length, 0)
  assert.equal(res.subScores.length, 5)
})

test('runForensics: troubled company scores below 40 with red flags', () => {
  const res = runForensics(TROUBLED)
  assert.ok(res.total < 40, `expected total < 40, got ${res.total}`)
  assert.ok(res.flags.some((f) => f.severity === 'red'))
  const labels = res.flags.map((f) => f.label)
  assert.ok(labels.includes('Net loss'))
  assert.ok(labels.includes('Negative operating cash flow'))
})

test('runForensics: empty series set degrades to 50/100, five neutral sub-scores, zero flags', () => {
  const res = runForensics([])
  assert.equal(res.total, 50)
  assert.equal(res.subScores.length, 5)
  for (const s of res.subScores) {
    assert.equal(s.score, 10, `${s.label} should be neutral 10/20, got ${s.score}`)
  }
  assert.deepEqual(res.flags, [])
})

test('runForensics: SIC 6021 (bank) scores Leverage and Liquidity neutral with financial-institution notes', () => {
  // TROUBLED data would normally tank Leverage (negative equity) and
  // Liquidity (negative OCF) — the financial-SIC override must win.
  const res = runForensics(TROUBLED, '6021')
  const leverage = sub(res, 'Leverage')
  const liquidity = sub(res, 'Liquidity')
  assert.equal(leverage.score, 10)
  assert.equal(liquidity.score, 10)
  assert.match(leverage.note, /financial institutions/)
  assert.match(liquidity.note, /financial institutions/)
  // The override also suppresses leverage/liquidity flags for banks.
  assert.ok(!res.flags.some((f) => f.label === 'Negative stockholders equity'))
  assert.ok(!res.flags.some((f) => f.label === 'Negative operating cash flow'))
})

test('runForensics: interest expense from a different period than operating income — coverage skipped, Leverage floored at 10', () => {
  // High LT-debt/equity (5.0) would score 4/20; low interest expense from a
  // MISMATCHED period must NOT produce a (great) coverage ratio — instead
  // coverage is skipped and the score is floored at neutral 10.
  const mismatched: ChartSeries[] = [
    series('Long-term debt', [['2024-12-31', 500]]),
    series('Stockholders equity', [['2024-12-31', 100]]),
    series('Operating income', [['2024-12-31', 300]]),
    series('Interest expense', [['2023-12-31', 10]]),
  ]
  const res = runForensics(mismatched)
  const leverage = sub(res, 'Leverage')
  assert.ok(leverage.score >= 10, `expected Leverage >= 10, got ${leverage.score}`)
  assert.match(leverage.note, /coverage not computed/)
  assert.ok(!/Interest coverage \d/.test(leverage.note), 'coverage ratio must not be computed across periods')
  assert.ok(!res.flags.some((f) => f.label === 'Weak interest coverage'))
})

// ---------------------------------------------------------------------------
// stripForensicsBlock — the judge's anchoring guard
// ---------------------------------------------------------------------------

test('stripForensicsBlock: removes sub-scores, total and Flags; keeps Derived ratios and the 8-K docket', () => {
  const forensicBlock = renderForensics(runForensics(TROUBLED))
  const brief = [
    'RAW FILED FIGURES:',
    '- Revenue FY2024: $700',
    '',
    'DERIVED RATIOS:',
    '- Derived ratios: net margin -14.3%',
    '',
    forensicBlock,
    '',
    'RECENT MATERIAL EVENTS — 8-K DOCKET:',
    '- 2024-11-01 Item 5.02 CFO departure',
  ].join('\n')

  const stripped = stripForensicsBlock(brief)
  assert.ok(!stripped.includes('DETERMINISTIC FORENSIC SCORE'))
  assert.ok(!stripped.includes('/20'))
  assert.ok(!/Total: \d+\/100/.test(stripped))
  assert.ok(!stripped.includes('Flags:'))
  assert.ok(!stripped.includes('[RED]'))
  assert.ok(stripped.includes('Derived ratios'))
  assert.ok(stripped.includes('RECENT MATERIAL EVENTS — 8-K DOCKET:'))
  assert.ok(stripped.includes('CFO departure'))
})

test('stripForensicsBlock: removes a Flags section that closes the brief (cut runs to end of string)', () => {
  const forensicBlock = renderForensics(runForensics(TROUBLED))
  assert.ok(forensicBlock.includes('Flags:'), 'precondition: troubled company must raise flags')
  const brief = `DERIVED RATIOS:\n- Derived ratios: OCF/NI 0.8\n\n${forensicBlock}`
  const stripped = stripForensicsBlock(brief)
  assert.ok(!stripped.includes('DETERMINISTIC FORENSIC SCORE'))
  assert.ok(!stripped.includes('Flags:'))
  assert.ok(stripped.includes('Derived ratios'))
})

test('stripForensicsBlock: passthrough when no forensic block is present', () => {
  const brief = 'RAW FILED FIGURES:\n- Revenue FY2024: $700\n\nDerived ratios: net margin -14.3%'
  assert.equal(stripForensicsBlock(brief), brief)
})
