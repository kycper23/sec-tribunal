/**
 * Tribunal backtest — measure how often the tribunal's blind verdict matched
 * what actually happened next, versus the clerk's zero-cost deterministic
 * score, and what the tribunal's accuracy costs in CREDIT (USD via $ORBIO).
 *
 *   pnpm backtest TSLA AAPL INTC --cutoff=2022-06-30 --out=backtest.json
 *
 * For each ticker it replays the exact same trial pipeline as
 * `src/tribunal/run.ts`, but sealed at `--cutoff` (blind trial: every exhibit
 * is redacted to what was actually filed with the SEC by that date), then
 * breaks the seal and grades both the tribunal and the clerk against the
 * first annual revenue figure filed AFTER the cutoff. Results are appended
 * to the output JSON after every ticker, so an interruption never loses work.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fetchCompanyFacts, fetchSubmissions, resolveTicker } from '../sec/edgar.js'
import { buildDocket, renderDocket } from '../sec/events.js'
import { buildBrief, buildRealityReport, extractForensicsSeries, extractFutureSeries } from '../sec/facts.js'
import { renderForensics, runForensics } from '../sec/forensics.js'
import { runDefense, runJudge, runProsecutor, runProsecutorRebuttal, sumUsage } from './agents.js'
import { findPeer } from './peers.js'

type Direction = 'rise' | 'fall'

interface BacktestRow {
  ticker: string
  cutoff: string
  clerkScore: number
  tribunalScore: number
  clerkDirection: Direction
  tribunalDirection: Direction
  actualDirection: Direction
  tribunalCorrect: boolean
  clerkCorrect: boolean
  costUsd: number
  models: Record<string, string>
}

interface BacktestError {
  ticker: string
  error: string
}

type BacktestEntry = BacktestRow | BacktestError

/**
 * Score → direction, shared by both graders so the comparison is fair:
 * a Financial Health Score of 60+ is read as "the company is healthy enough
 * that revenue should keep rising", below 60 as "revenue will fall".
 * The clerk's mapping is fixed by the task spec (>= 60 → rise); the tribunal
 * uses the SAME threshold on the judge's `verdict.score` — we deliberately do
 * NOT parse `verdict.recommendation` (free-form prose, model-dependent
 * wording) because a deterministic numeric rule keeps the backtest
 * reproducible and unbiased across models.
 */
const directionFromScore = (score: number): Direction => (score >= 60 ? 'rise' : 'fall')

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const CUTOFF_RE = /^\d{4}-\d{2}-\d{2}$/

const parseArgs = (argv: string[]): { tickers: string[]; cutoff: string; out: string } => {
  const tickers: string[] = []
  let cutoff = ''
  let out = ''
  for (const arg of argv) {
    if (arg.startsWith('--cutoff=')) cutoff = arg.slice('--cutoff='.length).trim()
    else if (arg.startsWith('--out=')) out = arg.slice('--out='.length).trim()
    else tickers.push(arg.trim().toUpperCase())
  }
  return { tickers: tickers.filter(Boolean), cutoff, out }
}

/** Rewrite the whole output file after every ticker — cheap, atomic enough, interruption-safe. */
const appendResult = async (path: string, entry: BacktestEntry): Promise<void> => {
  let existing: BacktestEntry[] = []
  try {
    const raw = await readFile(path, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) existing = parsed as BacktestEntry[]
  } catch {
    // Missing or malformed file — start a fresh array.
  }
  existing.push(entry)
  await writeFile(path, JSON.stringify(existing, null, 2), 'utf8')
}

/**
 * One blind trial, mirroring `runTribunal` in src/tribunal/run.ts step for
 * step — the only difference is that `cutoff` is threaded into every
 * evidence-building call (brief, docket, forensics, peer brief), exactly as
 * app/api/evidence/route.ts does for web blind trials.
 */
const runBlindTrial = async (ticker: string, cutoff: string): Promise<BacktestRow> => {
  const company = await resolveTicker(ticker)
  if (!company) throw new Error(`Unknown ticker "${ticker}" — not found in SEC company_tickers.json.`)

  const facts = await fetchCompanyFacts(company.cik10)
  let brief = buildBrief(company, facts, cutoff)

  // Ground truth first — if there is no revenue on either side of the seal,
  // bail BEFORE spending four paid LLM calls (mirrors the 422 guard in
  // app/api/evidence/route.ts).
  const knownRevenue = buildRealityReport(facts, cutoff).deltas.find((d) => d.label === 'Revenue')
  const lastKnownRevenue = knownRevenue?.cutoffValue ?? null
  if (lastKnownRevenue === null) {
    throw new Error(`No annual revenue on file by ${cutoff} — nothing to seal (would be 422 on the web).`)
  }
  const futureRevenue = extractFutureSeries(facts, cutoff).find((s) => s.label === 'Revenue')?.points[0] ?? null
  if (!futureRevenue) {
    throw new Error(`No annual revenue filed after ${cutoff} — nothing to grade against.`)
  }
  const actualDirection: Direction = futureRevenue.value > lastKnownRevenue ? 'rise' : 'fall'

  // The 8-K docket is a bonus exhibit, never load-bearing.
  let submissions: Awaited<ReturnType<typeof fetchSubmissions>> | undefined
  try {
    submissions = await fetchSubmissions(company.cik10)
    brief = `${brief}\n\n${renderDocket(buildDocket(submissions, cutoff))}`
  } catch {
    // Proceed without the docket.
  }

  // The clerk's deterministic forensic score — the LLM-free control group.
  const forensic = runForensics(extractForensicsSeries(facts, cutoff), submissions?.sic)
  brief = `${brief}\n\n${renderForensics(forensic)}`

  // Peer exhibit for the defense, sealed at the same date.
  const peer = await findPeer(company)
  let peerBrief: string | null = null
  if (peer) {
    try {
      peerBrief = buildBrief(peer, await fetchCompanyFacts(peer.cik10), cutoff)
    } catch {
      // Peer data unavailable — proceed without it.
    }
  }

  const { bearCase, usage: prosecutorUsage } = await runProsecutor(brief)
  const { defense, usage: defenseUsage } = await runDefense(brief, bearCase, peerBrief)
  const { rebuttal, usage: rebuttalUsage } = await runProsecutorRebuttal(brief, bearCase, defense)
  const { verdict, usage: judgeUsage } = await runJudge(bearCase, defense, rebuttal, forensic)

  const total = sumUsage([prosecutorUsage, defenseUsage, rebuttalUsage, judgeUsage])
  const tribunalDirection = directionFromScore(verdict.score)
  const clerkDirection = directionFromScore(forensic.total)

  return {
    ticker: company.ticker,
    cutoff,
    clerkScore: forensic.total,
    tribunalScore: verdict.score,
    clerkDirection,
    tribunalDirection,
    actualDirection,
    tribunalCorrect: tribunalDirection === actualDirection,
    clerkCorrect: clerkDirection === actualDirection,
    costUsd: total.cost,
    // The model that ACTUALLY answered per role (fallbacks included).
    models: {
      prosecutor: prosecutorUsage.model,
      defense: defenseUsage.model,
      rebuttal: rebuttalUsage.model,
      judge: judgeUsage.model,
    },
  }
}

const main = async (): Promise<void> => {
  const { tickers, cutoff, out } = parseArgs(process.argv.slice(2))
  if (!tickers.length || !CUTOFF_RE.test(cutoff) || !out) {
    console.error('Usage: pnpm backtest TSLA AAPL INTC --cutoff=YYYY-MM-DD --out=backtest.json')
    process.exitCode = 1
    return
  }
  const outPath = resolve(process.cwd(), out)

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i]
    try {
      const row = await runBlindTrial(ticker, cutoff)
      await appendResult(outPath, row)
      console.log(
        `[${i + 1}/${tickers.length}] ${ticker} — clerk ${row.clerkScore}/100 (${row.clerkDirection}` +
          `${row.clerkCorrect ? ' OK' : ' MISS'}) · tribunal ${Math.round(row.tribunalScore)}/100 (${row.tribunalDirection}` +
          `${row.tribunalCorrect ? ' OK' : ' MISS'}) · reality ${row.actualDirection} · $${row.costUsd.toFixed(4)}`,
      )
    } catch (err) {
      // NEVER abort the whole run: SEC 4xx (unknown ticker / no data), model
      // failures, network hiccups — all become an { ticker, error } entry.
      const message = err instanceof Error ? err.message : String(err)
      await appendResult(outPath, { ticker, error: message })
      console.log(`[${i + 1}/${tickers.length}] ${ticker} — ERROR: ${message}`)
    }
    // SEC asks for politeness — pause between companyfacts pulls.
    if (i < tickers.length - 1) await sleep(2000)
  }
  console.log(`Done. Results in ${outPath}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
