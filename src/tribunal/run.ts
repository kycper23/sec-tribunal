/**
 * The shared trial orchestrator — used by the CLI today and by the web API
 * routes tomorrow. Emits progress events so any front-end can render the
 * courtroom live.
 */
import { fetchCompanyFacts, resolveTicker, type Company } from '../sec/edgar.js'
import { buildBrief } from '../sec/facts.js'
import { runDefense, runJudge, runProsecutor, runProsecutorRebuttal, type VerdictData } from './agents.js'
import { findPeer } from './peers.js'

export interface TrialProgress {
  stage: 'edgar' | 'prosecutor' | 'defense' | 'rebuttal' | 'verdict'
  message: string
}

export interface TrialResult {
  company: Company
  peer: Company | null
  brief: string
  peerBrief: string | null
  bearCase: string
  defense: string
  rebuttal: string
  verdict: VerdictData
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
  const brief = buildBrief(company, facts)

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
  const bearCase = await runProsecutor(brief)

  onProgress({ stage: 'defense', message: 'Preparing the rebuttal…' })
  const defense = await runDefense(brief, bearCase, peerBrief)

  onProgress({ stage: 'rebuttal', message: 'The prosecution responds…' })
  const rebuttal = await runProsecutorRebuttal(brief, bearCase, defense)

  onProgress({ stage: 'verdict', message: 'The judge is deliberating…' })
  const verdict = await runJudge(bearCase, defense, rebuttal)

  return { company, peer: peerBrief ? peer : null, brief, peerBrief, bearCase, defense, rebuttal, verdict }
}
