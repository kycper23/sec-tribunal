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

export interface Speech {
  role: 'clerk' | 'prosecutor' | 'defense' | 'judge'
  title: string
  text: string
  done: boolean
}

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
  ].join('\n')
