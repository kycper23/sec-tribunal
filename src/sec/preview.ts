/**
 * Dev utility: print the distilled evidence brief for a ticker without
 * spending any model calls.
 *
 *   pnpm brief JPM
 */
import { fetchCompanyFacts, fetchSubmissions, resolveTicker } from './edgar.js'
import { buildDocket, renderDocket } from './events.js'
import { buildBrief } from './facts.js'

const ticker = (process.argv[2] ?? '').trim().toUpperCase()
if (!ticker) {
  console.error('Usage: pnpm brief <TICKER>')
  process.exitCode = 1
} else {
  const company = await resolveTicker(ticker)
  if (!company) {
    console.error(`Unknown ticker "${ticker}"`)
    process.exitCode = 1
  } else {
    const brief = buildBrief(company, await fetchCompanyFacts(company.cik10))
    console.log(brief)
    console.log(`\n--- ${brief.length} chars ---\n`)

    try {
      const docket = buildDocket(await fetchSubmissions(company.cik10))
      console.log(renderDocket(docket))
    } catch (err) {
      console.error(`Docket unavailable: ${err instanceof Error ? err.message : err}`)
    }
  }
}
