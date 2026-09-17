/**
 * Precompute demo trials for the /dossier/[ticker] permalinks.
 * Usage: tsx src/tribunal/precompute.ts TSLA INTC AAPL
 * Saves the full TrialResult as demos/<TICKER>.json (bundled into the web app).
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { runTribunal } from './run.js'

const main = async () => {
  const tickers = process.argv.slice(2).map((t) => t.trim().toUpperCase())
  if (tickers.length === 0) {
    console.error('Usage: tsx src/tribunal/precompute.ts TSLA INTC AAPL')
    process.exitCode = 1
    return
  }
  const dir = resolve(process.cwd(), 'demos')
  await mkdir(dir, { recursive: true })
  for (const ticker of tickers) {
    console.log(`\n=== Precomputing ${ticker} ===`)
    const trial = await runTribunal(ticker, (p) => console.log(`[${p.stage}] ${p.message}`))
    const payload = { ...trial, generatedAt: new Date().toISOString().slice(0, 10) }
    const path = resolve(dir, `${ticker}.json`)
    await writeFile(path, JSON.stringify(payload, null, 2), 'utf8')
    console.log(`Saved ${path} (score ${Math.round(trial.verdict.score)}/100)`)
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
