/**
 * Stage 1: resolve the ticker, fetch companyfacts (plus a peer for the
 * defense), distil the evidence briefs. No model calls except an optional
 * cheap peer lookup — fast.
 */
import { NextResponse } from 'next/server'
import { fetchCompanyFacts, fetchSubmissions, resolveTicker } from '../../../src/sec/edgar.js'
import { buildDocket, renderDocket, type Docket } from '../../../src/sec/events.js'
import {
  buildBrief,
  buildRealityReport,
  extractForensicsSeries,
  extractFutureSeries,
  extractSeries,
  type ChartSeries,
  type RealityReport,
} from '../../../src/sec/facts.js'
import { renderForensics, runForensics, type ForensicsResult } from '../../../src/sec/forensics.js'
import { findPeer } from '../../../src/tribunal/peers.js'
import { asString, jsonError, withErrorHandling } from '../_lib.js'

export const maxDuration = 60

/** YYYY-MM-DD only — anything else is treated as "no cutoff" (live trial). */
const CUTOFF_RE = /^\d{4}-\d{2}-\d{2}$/

export const POST = withErrorHandling(async (req: Request) => {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const ticker = asString(body.ticker).trim().toUpperCase()
  if (!ticker || ticker.length > 10) return jsonError('Provide a ticker, e.g. TSLA.')
  const rawCutoff = asString(body.cutoff).trim()
  const cutoff = CUTOFF_RE.test(rawCutoff) ? rawCutoff : undefined

  const company = await resolveTicker(ticker)
  if (!company) return jsonError(`Unknown ticker "${ticker}" — not found in SEC EDGAR.`, 404)

  const companyFacts = await fetchCompanyFacts(company.cik10)
  let brief = buildBrief(company, companyFacts, cutoff)
  // Some filers (e.g. ADRs on 20-F/IFRS, not 10-K) tag none of the standard
  // us-gaap metrics. Rather than parsing the rendered brief text (fragile —
  // breaks the moment the header format changes), check the same data-driven
  // series the forensic scorer already computes: without Revenue or Net
  // income there's no evidence to try, so bail before the client fires off
  // four paid LLM calls against an empty brief.
  const forensicSeries: ChartSeries[] = extractForensicsSeries(companyFacts, cutoff)
  const hasRevenue = forensicSeries.some((s) => s.label === 'Revenue')
  const hasNetIncome = forensicSeries.some((s) => s.label === 'Net income')
  if (!hasRevenue || !hasNetIncome) {
    return jsonError(
      `No usable us-gaap financial data for ${ticker} — the company likely files 20-F/IFRS rather than 10-K. The tribunal will not convene without evidence.`,
      422,
    )
  }
  const series: ChartSeries[] = extractSeries(companyFacts, cutoff)
  // The clerk's deterministic forensic score — a code-computed, bias-free second
  // opinion alongside the LLM tribunal. Entered into the brief as an exhibit the
  // agents (and the judge in particular) must weigh, plus returned separately
  // for the UI's forensic report panel.
  const forensic: ForensicsResult = runForensics(forensicSeries)
  brief = `${brief}\n\n${renderForensics(forensic)}`
  // "The Reveal" — computed now (cheap, deterministic) but withheld from the
  // client's `speeches`/verdict UI until the user chooses to reveal it later;
  // never fed into the brief, so the agents can't see the future either.
  const reality: RealityReport | null = cutoff ? buildRealityReport(companyFacts, cutoff) : null
  const futureSeries: ChartSeries[] = cutoff ? extractFutureSeries(companyFacts, cutoff) : []

  // The 8-K docket is a bonus exhibit, never load-bearing: a hiccup on this
  // endpoint must not sink the whole trial, so it's fetched best-effort.
  let docket: Docket | null = null
  try {
    docket = buildDocket(await fetchSubmissions(company.cik10), cutoff)
    brief = `${brief}\n\n${renderDocket(docket)}`
  } catch {
    docket = null
  }

  let peer = null
  let peerBrief: string | null = null
  try {
    peer = await findPeer(company)
    if (peer) peerBrief = buildBrief(peer, await fetchCompanyFacts(peer.cik10), cutoff)
  } catch {
    peer = null
    peerBrief = null
  }

  return NextResponse.json({
    company,
    peer: peerBrief ? peer : null,
    brief,
    peerBrief,
    docket,
    series,
    cutoff: cutoff ?? null,
    reality,
    futureSeries,
    forensic,
  })
})
