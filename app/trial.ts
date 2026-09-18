/** Shared client-side types and helpers for the courtroom page. */

export interface Company {
  ticker: string
  cik10: string
  name: string
}

export interface Charge {
  charge: string
  rebuttal: string
  status: 'SUSTAINED' | 'DISMISSED' | 'PARTIALLY VALID'
}

export interface Verdict {
  summary: string
  charges: Charge[]
  score: number
  recommendation: string
}

/** The Court Bill — real cost of one model call, straight from Orbio's usage data. */
export interface CallUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cachedTokens: number
  cost: number
}

export interface Speech {
  role: 'clerk' | 'prosecutor' | 'defense' | 'judge'
  title: string
  text: string
  done: boolean
  usage?: CallUsage
}

export interface BillEntry {
  label: string
  usage: CallUsage
}

export const sumBill = (entries: BillEntry[]): CallUsage =>
  entries.reduce(
    (acc, e) => ({
      promptTokens: acc.promptTokens + e.usage.promptTokens,
      completionTokens: acc.completionTokens + e.usage.completionTokens,
      totalTokens: acc.totalTokens + e.usage.totalTokens,
      cachedTokens: acc.cachedTokens + e.usage.cachedTokens,
      cost: acc.cost + e.usage.cost,
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedTokens: 0, cost: 0 },
  )

export const post = async <T,>(path: string, body: unknown): Promise<T> => {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as T & { error?: string }
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`)
  return data
}

export const scoreColor = (score: number) => (score < 40 ? '#f87171' : score < 65 ? '#fbbf24' : '#34d399')

export const buildDossier = (
  company: Company,
  bearCase: string,
  defense: string,
  rebuttal: string,
  verdict: Verdict,
  bill?: BillEntry[],
): string =>
  [
    `# SEC Tribunal Dossier: ${company.name} (${company.ticker})`,
    '',
    '## The Prosecution (Bear Case)',
    '',
    bearCase,
    '',
    '## The Defense',
    '',
    defense,
    '',
    "## The Prosecution's Rebuttal",
    '',
    rebuttal,
    '',
    '## The Verdict',
    '',
    verdict.summary,
    '',
    '| Charge | Rebuttal | Status |',
    '| --- | --- | --- |',
    ...verdict.charges.map(
      (c) => `| ${c.charge.replace(/\|/g, '\\|')} | ${c.rebuttal.replace(/\|/g, '\\|')} | **${c.status}** |`,
    ),
    '',
    `### Financial Health Score: ${Math.round(verdict.score)}/100`,
    '',
    '### Recommendation',
    '',
    verdict.recommendation,
    '',
    ...(bill && bill.length
      ? [
          '### Court Bill',
          '',
          '| Agent | Tokens | Cost |',
          '| --- | --- | --- |',
          ...bill.map((e) => `| ${e.label} | ${e.usage.totalTokens.toLocaleString('en-US')} | $${e.usage.cost.toFixed(4)} |`),
          `| **Total** | **${sumBill(bill).totalTokens.toLocaleString('en-US')}** | **$${sumBill(bill).cost.toFixed(4)}** |`,
          '',
          '*Fueled by tokenized $ORBIO credits — see [orbio.so](https://orbio.so).*',
          '',
        ]
      : []),
  ].join('\n')
