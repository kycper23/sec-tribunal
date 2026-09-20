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

/**
 * Default cache TTL for SEC responses. SEC explicitly asks callers to be
 * polite and avoid hammering their infra — companyfacts/submissions only
 * change when a company files something new, and the ticker map barely
 * changes at all, so re-fetching on every single trial is both slow for the
 * user and unfriendly to SEC. `next.revalidate` plugs into Next.js's Data
 * Cache when this runs inside a route handler; outside Next.js (the tsx
 * CLI scripts under src/tribunal, src/sec/preview.ts) it's simply an unused
 * extra fetch option and has no effect, so this stays safe in both contexts.
 */
const DEFAULT_REVALIDATE_SECONDS = 60 * 60 // 1 hour

const fetchJson = async <T>(url: string, revalidateSeconds: number = DEFAULT_REVALIDATE_SECONDS): Promise<T> => {
  const res = await fetch(url, {
    headers: { 'User-Agent': SEC_USER_AGENT },
    next: { revalidate: revalidateSeconds },
  })
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
    // Rarely changes (new listings/tickers only) — cache far longer than companyfacts.
    const raw = await fetchJson<Record<string, TickerEntry>>(
      'https://www.sec.gov/files/company_tickers.json',
      24 * 60 * 60, // 24 hours
    )
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

/**
 * companyfacts for large filers can weigh 5-6 MB, well past Next.js's Data
 * Cache 2 MB item limit ("items over 2MB can not be cached"), so relying on
 * `next.revalidate` alone means every trial re-fetches from SEC — with a
 * handful of concurrent users that risks 429s. This in-process Map caches
 * the full (pre-cutoff) response per CIK for a short TTL to absorb bursts.
 */
const companyFactsCache = new Map<string, { data: CompanyFacts; expires: number }>()
const COMPANY_FACTS_CACHE_TTL_MS = 15 * 60 * 1000 // 15 minutes

export const fetchCompanyFacts = async (cik10: string): Promise<CompanyFacts> => {
  const cached = companyFactsCache.get(cik10)
  if (cached && cached.expires > Date.now()) return cached.data
  const data = await fetchJson<CompanyFacts>(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10}.json`)
  companyFactsCache.set(cik10, { data, expires: Date.now() + COMPANY_FACTS_CACHE_TTL_MS })
  return data
}

// --- submissions (filing history, incl. 8-K event docket) --------------------

/**
 * `filings.recent` is a set of parallel arrays (same index = same filing),
 * newest first. Older filings live in paginated `filings.files` — out of
 * scope here; the docket only needs the last ~18 months, which `recent`
 * always covers.
 */
export interface SubmissionsRecent {
  form: string[]
  filingDate: string[]
  reportDate: string[]
  items: string[]
  accessionNumber: string[]
  primaryDocument: string[]
}

export interface Submissions {
  cik: string
  name: string
  sic?: string
  sicDescription?: string
  filings: { recent: SubmissionsRecent }
}

export const fetchSubmissions = (cik10: string): Promise<Submissions> =>
  fetchJson<Submissions>(`https://data.sec.gov/submissions/CIK${cik10}.json`)
