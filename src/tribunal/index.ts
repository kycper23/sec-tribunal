/**
 * SEC Tribunal — three agents debate the financial health of a US-listed
 * company using only SEC EDGAR companyfacts data.
 *
 *   pnpm tribunal TSLA
 */
import { renderDossier, saveDossier } from './report.js'
import { runTribunal, UnknownTickerError, type TrialProgress } from './run.js'

const STAGE_LABEL: Record<TrialProgress['stage'], string> = {
  edgar: '[EDGAR]',
  prosecutor: '[PROSECUTOR]',
  defense: '[DEFENSE]',
  rebuttal: '[REBUTTAL]',
  verdict: '[VERDICT]',
}

async function main(): Promise<void> {
  const ticker = (process.argv[2] ?? '').trim().toUpperCase()
  if (!ticker) {
    console.error('Usage: pnpm tribunal <TICKER>   e.g. pnpm tribunal TSLA')
    process.exitCode = 1
    return
  }

  try {
    const trial = await runTribunal(ticker, (p) => console.log(`${STAGE_LABEL[p.stage]} ${p.message}`))
    console.log(`\n[PROSECUTOR]\n${trial.bearCase}\n`)
    console.log(`[DEFENSE]\n${trial.defense}\n`)
    console.log(`[REBUTTAL]\n${trial.rebuttal}\n`)
    console.log(`[VERDICT] Financial Health Score: ${Math.round(trial.verdict.score)}/100`)
    for (const c of trial.verdict.charges) console.log(`[VERDICT] ${c.status}: ${c.charge}`)

    const { total } = trial.usage
    console.log(
      `[BILL] 4 calls · ${total.totalTokens.toLocaleString('en-US')} tokens · $${total.cost.toFixed(4)} (tokenized $ORBIO credits)`,
    )

    const path = await saveDossier(trial.company.ticker, renderDossier(trial))
    console.log(`\n[VERDICT] Dossier saved to ${path}`)
  } catch (err) {
    if (err instanceof UnknownTickerError) {
      console.error(`[EDGAR] ${err.message}`)
      process.exitCode = 1
      return
    }
    throw err
  }
}

await main()
