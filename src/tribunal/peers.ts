/**
 * Pick an industry peer so the Defense can argue from real competitor data
 * (fetched from the same companyfacts endpoint — no new SEC APIs).
 * Known pairs come from a small dictionary; otherwise one cheap model call
 * names the closest US-listed competitor and we resolve it like any ticker.
 */
import { resolveTicker, type Company } from '../sec/edgar.js'
import { askForPeerTicker } from './agents.js'

const PEERS: Record<string, string> = {
  INTC: 'AMD',
  AMD: 'NVDA',
  NVDA: 'AMD',
  TSLA: 'GM',
  GM: 'F',
  F: 'GM',
  AAPL: 'MSFT',
  MSFT: 'GOOGL',
  GOOGL: 'MSFT',
  AMZN: 'WMT',
  WMT: 'TGT',
  META: 'GOOGL',
  NFLX: 'DIS',
  DIS: 'NFLX',
  JPM: 'BAC',
  BAC: 'JPM',
  GS: 'MS',
  MS: 'GS',
  XOM: 'CVX',
  CVX: 'XOM',
  KO: 'PEP',
  PEP: 'KO',
  BA: 'LMT',
  NKE: 'LULU',
  PFE: 'MRK',
  MRK: 'PFE',
  T: 'VZ',
  VZ: 'T',
}

export const findPeer = async (company: Company): Promise<Company | null> => {
  const fromDict = PEERS[company.ticker]
  if (fromDict) return resolveTicker(fromDict)
  try {
    const suggested = await askForPeerTicker(company.name, company.ticker)
    if (!suggested || suggested === company.ticker) return null
    return await resolveTicker(suggested)
  } catch {
    return null // a missing peer must never sink the trial
  }
}
