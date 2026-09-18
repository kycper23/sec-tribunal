/**
 * Stage 1: resolve the ticker, fetch companyfacts (plus a peer for the
 * defense), distil the evidence briefs. No model calls except an optional
 * cheap peer lookup — fast.
 */
import { NextResponse } from 'next/server'
import { fetchCompanyFacts, fetchSubmissions, resolveTicker } from '../../../src/sec/edgar.js'
import { buildDocket, renderDocket, type Docket } from '../../../src/sec/events.js'
import { buildBrief } from '../../../src/sec/facts.js'
import { findPeer } from '../../../src/tribunal/peers.js'
import { asString, jsonError, withErrorHandling } from '../_lib.js'

export const maxDuration = 60

export const POST = withErrorHandling(async (req: Request) => {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const ticker = asString(body.ticker).trim().toUpperCase()
  if (!ticker || ticker.length > 10) return jsonError('Provide a ticker, e.g. TSLA.')

  const company = await resolveTicker(ticker)
  if (!company) return jsonError(`Unknown ticker "${ticker}" — not found in SEC EDGAR.`, 404)

  let brief = buildBrief(company, await fetchCompanyFacts(company.cik10))

  // The 8-K docket is a bonus exhibit, never load-bearing: a hiccup on this
  // endpoint must not sink the whole trial, so it's fetched best-effort.
  let docket: Docket | null = null
  try {
    docket = buildDocket(await fetchSubmissions(company.cik10))
    brief = `${brief}\n\n${renderDocket(docket)}`
  } catch {
    docket = null
  }

  let peer = null
  let peerBrief: string | null = null
  try {
    peer = await findPeer(company)
    if (peer) peerBrief = buildBrief(peer, await fetchCompanyFacts(peer.cik10))
  } catch {
    peer = null
    peerBrief = null
  }

  return NextResponse.json({ company, peer: peerBrief ? peer : null, brief, peerBrief, docket })
})
