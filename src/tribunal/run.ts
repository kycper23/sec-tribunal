/**
 * The shared trial orchestrator — used by the CLI today and by the web API
 * routes tomorrow. Emits progress events so any front-end can render the
 * courtroom live.
 */
import { fetchCompanyFacts, fetchSubmissions, resolveTicker, type Company } from '../sec/edgar.js'
import { buildDocket, renderDocket, type Docket } from '../sec/events.js'
import { buildBrief, extractForensicsSeries } from '../sec/facts.js'
import { renderForensics, runForensics, type ForensicsResult } from '../sec/forensics.js'
import {
  runDefense,
  runJudge,
  runProsecutor,
  runProsecutorRebuttal,
  sumUsage,
  type CallUsage,
  type VerdictData,
} from './agents.js'
import { findPeer } from './peers.js'

export interface TrialProgress {
  stage: 'edgar' | 'prosecutor' | 'defense' | 'rebuttal' | 'verdict'
  message: string
}

/** The Court Bill — real cost of the trial, fueled by tokenized $ORBIO credits. */
export interface TrialUsage {
  prosecutor: CallUsage
  defense: CallUsage
  rebuttal: CallUsage
  judge: CallUsage
  total: CallUsage
}

export interface TrialResult {
  company: Company
  peer: Company | null
  brief: string
  peerBrief: string | null
  docket: Docket | null
  forensic: ForensicsResult
  bearCase: string
  defense: string
  rebuttal: string
  verdict: VerdictData
  usage: TrialUsage
}

export class UnknownTickerError extends Error {
  constructor(ticker: string) {
    super(`Unknown ticker "${ticker}" — not found in SEC company_tickers.json.`)
    this.name = 'UnknownTickerError'
  }
}

export const runTribunal = async (
  ticker: string,
  onProgress: (p: TrialProgress) => void = () => {},
): Promise<TrialResult> => {
  onProgress({ stage: 'edgar', message: `Resolving ticker ${ticker}…` })
  const company = await resolveTicker(ticker)
  if (!company) throw new UnknownTickerError(ticker)

  onProgress({ stage: 'edgar', message: `${company.name} → CIK ${company.cik10}. Fetching companyfacts…` })
  const facts = await fetchCompanyFacts(company.cik10)
  let brief = buildBrief(company, facts)

  // The clerk's deterministic forensic score — a code-computed, bias-free second
  // opinion entered into the brief as an exhibit the agents (and the judge in
  // particular) must weigh against their own reading of the evidence.
  const forensic: ForensicsResult = runForensics(extractForensicsSeries(facts))
  brief = `${brief}\n\n${renderForensics(forensic)}`
  onProgress({ stage: 'edgar', message: `Clerk's forensic score: ${forensic.total}/100.` })

  let docket: Docket | null = null
  try {
    docket = buildDocket(await fetchSubmissions(company.cik10))
    brief = `${brief}\n\n${renderDocket(docket)}`
    onProgress({ stage: 'edgar', message: `Filings docket ready: ${docket.events.length} 8-K event(s) in window.` })
  } catch {
    docket = null
    onProgress({ stage: 'edgar', message: 'Filings docket unavailable; proceeding without it.' })
  }

  onProgress({ stage: 'edgar', message: 'Looking up an industry peer for the defense…' })
  const peer = await findPeer(company)
  let peerBrief: string | null = null
  if (peer) {
    try {
      peerBrief = buildBrief(peer, await fetchCompanyFacts(peer.cik10))
      onProgress({ stage: 'edgar', message: `Peer exhibit ready: ${peer.name} (${peer.ticker}).` })
    } catch {
      onProgress({ stage: 'edgar', message: 'Peer data unavailable; proceeding without it.' })
    }
  }
  onProgress({ stage: 'edgar', message: `Evidence brief prepared (${brief.length} chars).` })

  onProgress({ stage: 'prosecutor', message: 'Building the bear case…' })
  const { bearCase, usage: prosecutorUsage } = await runProsecutor(brief)

  onProgress({ stage: 'defense', message: 'Preparing the rebuttal…' })
  const { defense, usage: defenseUsage } = await runDefense(brief, bearCase, peerBrief)

  onProgress({ stage: 'rebuttal', message: 'The prosecution responds…' })
  const { rebuttal, usage: rebuttalUsage } = await runProsecutorRebuttal(brief, bearCase, defense)

  onProgress({ stage: 'verdict', message: 'The judge is deliberating…' })
  const { verdict, usage: judgeUsage } = await runJudge(bearCase, defense, rebuttal, forensic)

  const usage: TrialUsage = {
    prosecutor: prosecutorUsage,
    defense: defenseUsage,
    rebuttal: rebuttalUsage,
    judge: judgeUsage,
    total: sumUsage([prosecutorUsage, defenseUsage, rebuttalUsage, judgeUsage]),
  }

  return {
    company,
    peer: peerBrief ? peer : null,
    brief,
    peerBrief,
    docket,
    forensic,
    bearCase,
    defense,
    rebuttal,
    verdict,
    usage,
  }
}
