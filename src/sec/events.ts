/**
 * The 8-K event docket: SEC EDGAR requires companies to disclose "material
 * events" (bankruptcy, restatements, auditor changes, exec departures, new
 * debt, ...) within 4 business days on Form 8-K, tagged with numbered
 * "Item" codes. This turns the raw submissions feed into a triaged,
 * LLM-and-UI-friendly docket so the agents can cite recent red flags the
 * XBRL numbers alone would never show (e.g. a restatement filed last month).
 */
import type { Submissions } from './edgar.js'

export type Severity = 'red' | 'amber' | 'info'

const SEVERITY_RANK: Record<Severity, number> = { info: 0, amber: 1, red: 2 }

/**
 * Item code -> human label + severity. Not exhaustive — every 8-K item code
 * SEC defines could be listed, but these are the ones that actually move a
 * financial-health verdict. Unknown codes fall back to a generic info label
 * rather than being dropped, so the docket never silently hides a filing.
 */
const ITEM_INFO: Record<string, { label: string; severity: Severity }> = {
  '1.01': { label: 'Entry into a material definitive agreement', severity: 'info' },
  '1.02': { label: 'Termination of a material definitive agreement', severity: 'amber' },
  '1.03': { label: 'Bankruptcy or receivership', severity: 'red' },
  '2.01': { label: 'Completion of acquisition or disposition of assets', severity: 'info' },
  '2.02': { label: 'Results of operations and financial condition', severity: 'info' },
  '2.03': { label: 'Creation of a direct financial obligation (new debt)', severity: 'amber' },
  '2.04': { label: 'Triggering event accelerating a financial obligation', severity: 'red' },
  '2.05': { label: 'Costs of exit/disposal activities (restructuring)', severity: 'amber' },
  '2.06': { label: 'Material impairments', severity: 'red' },
  '3.01': { label: 'Notice of delisting / failure to satisfy a listing rule', severity: 'red' },
  '4.01': { label: "Change in registrant's certifying accountant (auditor)", severity: 'red' },
  '4.02': { label: 'Non-reliance on previously issued financials (restatement)', severity: 'red' },
  '5.01': { label: 'Changes in control of registrant', severity: 'amber' },
  '5.02': { label: 'Departure/appointment of directors or officers', severity: 'amber' },
  '5.03': { label: 'Amendments to articles of incorporation or bylaws', severity: 'info' },
  '5.07': { label: 'Submission of matters to a vote of security holders', severity: 'info' },
  '7.01': { label: 'Regulation FD disclosure', severity: 'info' },
  '8.01': { label: 'Other events', severity: 'info' },
  '9.01': { label: 'Financial statements and exhibits', severity: 'info' },
}

const labelFor = (code: string) => ITEM_INFO[code]?.label ?? `Item ${code}`
const severityFor = (code: string): Severity => ITEM_INFO[code]?.severity ?? 'info'

export interface DocketEvent {
  date: string
  form: string
  items: string[]
  labels: string[]
  severity: Severity
  accessionNumber: string
  primaryDocument: string
  url: string
}

export interface Docket {
  events: DocketEvent[]
  lateFilings: number
  counts: { red: number; amber: number; info: number }
}

const DAY = 86_400_000
const WINDOW_DAYS = 550 // ~18 months
const MAX_EVENTS = 14

/**
 * Filter the submissions feed down to a triaged 8-K docket for the last
 * ~18 months. `cutoff` (YYYY-MM-DD) seals a blind trial at a point in the
 * past: the window becomes "the 18 months before cutoff", and any filing
 * dated after cutoff — i.e. not yet public at trial time — is excluded.
 */
export const buildDocket = (subs: Submissions, cutoff?: string): Docket => {
  const recent = subs.filings.recent
  const now = cutoff ? Date.parse(cutoff) : Date.now()
  const cik = String(Number(subs.cik))
  const events: DocketEvent[] = []
  let lateFilings = 0

  for (let i = 0; i < recent.form.length; i++) {
    const filingDate = recent.filingDate[i]
    if (!filingDate || (cutoff && filingDate > cutoff)) continue
    if (now - Date.parse(filingDate) > WINDOW_DAYS * DAY) continue

    const form = recent.form[i]
    if (form === 'NT 10-K' || form === 'NT 10-Q') {
      lateFilings++
      continue
    }
    if (form !== '8-K' && form !== '8-K/A') continue

    const codes = (recent.items[i] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    if (!codes.length) continue

    const severity = codes.reduce<Severity>(
      (worst, c) => (SEVERITY_RANK[severityFor(c)] > SEVERITY_RANK[worst] ? severityFor(c) : worst),
      'info',
    )
    const accessionNumber = recent.accessionNumber[i]
    const primaryDocument = recent.primaryDocument[i]
    events.push({
      date: filingDate,
      form,
      items: codes,
      labels: codes.map(labelFor),
      severity,
      accessionNumber,
      primaryDocument,
      url: `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNumber.replace(/-/g, '')}/${primaryDocument}`,
    })
  }

  // `filings.recent` is newest-first already; cap after collecting so the
  // late-filing tally above still covers the full window.
  const trimmed = events.slice(0, MAX_EVENTS)
  const counts = trimmed.reduce(
    (acc, e) => ({ ...acc, [e.severity]: acc[e.severity] + 1 }),
    { red: 0, amber: 0, info: 0 },
  )
  return { events: trimmed, lateFilings, counts }
}

/** Compact text block for the agents — folded into Exhibit A. */
export const renderDocket = (docket: Docket): string => {
  const lines = ['RECENT MATERIAL EVENTS — 8-K DOCKET (last ~18 months, SEC EDGAR):', '']
  if (!docket.events.length) {
    lines.push('No 8-K material events filed in the last 18 months.')
  } else {
    for (const e of docket.events) {
      lines.push(`- ${e.date} [${e.severity.toUpperCase()}] ${e.labels.join('; ')} (Item ${e.items.join(', ')})`)
    }
    lines.push(
      '',
      `Severity tally: ${docket.counts.red} red flag(s), ${docket.counts.amber} amber flag(s), ${docket.counts.info} routine disclosure(s).`,
    )
  }
  if (docket.lateFilings > 0) {
    lines.push(`Late filings in window: ${docket.lateFilings} (NT 10-K / NT 10-Q — delayed periodic report).`)
  }
  return lines.join('\n').trim()
}
