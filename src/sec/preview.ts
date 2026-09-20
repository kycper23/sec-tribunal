/**
 * Dev utility: print the distilled evidence brief for a ticker without
 * spending any model calls.
 *
 *   pnpm brief JPM
 */
import { fetchCompanyFacts, fetchSubmissions, resolveTicker } from './edgar.js'
import { buildDocket, renderDocket } from './events.js'
import { buildBrief, extractForensicsSeries } from './facts.js'
import { renderForensics, runForensics } from './forensics.js'

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

    let submissions: Awaited<ReturnType<typeof fetchSubmissions>> | undefined
    try {
      submissions = await fetchSubmissions(company.cik10)
      const docket = buildDocket(submissions)
      console.log(renderDocket(docket))
    } catch (err) {
      console.error(`Docket unavailable: ${err instanceof Error ? err.message : err}`)
    }

    const forensics = runForensics(
      extractForensicsSeries(await fetchCompanyFacts(company.cik10)),
      submissions?.sic,
    )
    console.log(`\n${renderForensics(forensics)}`)
  }
}
