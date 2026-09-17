/**
 * SEC EDGAR data layer. Exactly two endpoints, nothing else:
 *
 *   1. https://www.sec.gov/files/company_tickers.json      (ticker -> CIK)
 *   2. https://data.sec.gov/api/xbrl/companyfacts/CIK*.json (all reported XBRL facts)
 *
 * Every request MUST carry a User-Agent with a real e-mail, or the SEC
 * answers 403. That header lives in one constant so it cannot be forgotten.
 */

const SEC_USER_AGENT = 'CompanyInvestigatorBot kacper@example.com'

const fetchJson = async <T>(url: string): Promise<T> => {
  const res = await fetch(url, { headers: { 'User-Agent': SEC_USER_AGENT } })
  if (!res.ok) throw new Error(`SEC request failed: ${res.status} ${res.statusText} — ${url}`)
  return (await res.json()) as T
}

// --- ticker -> CIK -----------------------------------------------------------

interface TickerEntry {
  cik_str: number
  ticker: string
  title: string
}

export interface Company {
  ticker: string
  cik10: string
  name: string
}

/** The mapping file is static; load it once per process. */
let tickerCache: TickerEntry[] | null = null

export const resolveTicker = async (ticker: string): Promise<Company | null> => {
  if (!tickerCache) {
    const raw = await fetchJson<Record<string, TickerEntry>>('https://www.sec.gov/files/company_tickers.json')
    tickerCache = Object.values(raw)
  }
  // SEC's mapping file uses dashes for share classes (BRK-B), users often type dots (BRK.B).
  const wanted = ticker.trim().toUpperCase().replace(/\./g, '-')
  const match = tickerCache.find((e) => e.ticker.toUpperCase() === wanted)
  if (!match) return null
  return { ticker: wanted, cik10: String(match.cik_str).padStart(10, '0'), name: match.title }
}

// --- companyfacts ------------------------------------------------------------

export interface FactValue {
  start?: string
  end: string
  val: number
  fy?: number
  fp?: string
  form?: string
  filed?: string
  frame?: string
}

export interface CompanyFacts {
  cik: number
  entityName: string
  facts: Record<string, Record<string, { label?: string; units: Record<string, FactValue[]> }>>
}

export const fetchCompanyFacts = (cik10: string): Promise<CompanyFacts> =>
  fetchJson<CompanyFacts>(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10}.json`)
