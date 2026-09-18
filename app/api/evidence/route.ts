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
  extractFutureSeries,
  extractSeries,
  type ChartSeries,
  type RealityReport,
} from '../../../src/sec/facts.js'
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
  const series: ChartSeries[] = extractSeries(companyFacts, cutoff)
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
  })
})
