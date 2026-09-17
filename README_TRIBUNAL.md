# ⚖️ SEC Tribunal

**Three AI agents put a US-listed company on trial — using only real SEC EDGAR filings as evidence.**

Enter a ticker (TSLA, INTC, AAPL…). The **Prosecutor** builds a bear case from
the company's actual 10-K/10-Q XBRL figures. The **Defense** fights back —
armed with the same numbers plus a real industry peer's filings for context.
The Prosecutor returns for a **cross-examination rebuttal**. Finally the
**Judge** rules on every charge (SUSTAINED / DISMISSED / PARTIALLY VALID),
assigns a **Financial Health Score (1-100)** and issues an investor
recommendation. The whole debate plays out live in a courtroom UI.

Built for **Orbio Build Week**.

## Data — SEC EDGAR only, two endpoints

| Endpoint | Purpose |
| --- | --- |
| `www.sec.gov/files/company_tickers.json` | ticker → CIK (zero-padded to 10 digits) |
| `data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json` | every figure the company ever filed |

The multi-megabyte companyfacts payload is distilled into a ~4 KB evidence
brief: 12 key us-gaap metrics (with tag fallbacks), last 5 fiscal years of
10-K figures + recent 10-Q quarters, restatement-aware dedup, stale-tag
pruning, and **precomputed ratios** (margins, YoY growth, debt/equity) so the
agents argue from analysis-grade data. The peer exhibit reuses the same
endpoint — no extra APIs, no fragile XML parsing.

## Run it

```bash
npm install --legacy-peer-deps
cp .env.example .env.local        # set OPENROUTER_API_KEY (Orbio key)

# Web courtroom
npm run dev                       # → http://localhost:3000

# CLI (same engine)
npm run tribunal TSLA             # → DOSSIER_TSLA.md
npm run brief INTC                # evidence brief only, no model calls
npm run precompute TSLA INTC AAPL # regenerate demos/<TICKER>.json permalinks
```

**Pages:** `/` — live trial with typewriter debate · `/compare` — two
companies tried in parallel, verdicts side by side · `/dossier/TSLA|INTC|AAPL`
— prerendered demo permalinks (instant, zero model calls).

Model: `OPENROUTER_MODEL` env var, default `anthropic/claude-fable-5`.

## Architecture

```
src/sec/edgar.ts        SEC fetch layer (User-Agent, ticker→CIK, companyfacts)
src/sec/facts.ts        XBRL → compact evidence brief + derived ratios
src/tribunal/agents.ts  Prosecutor / Defense / Rebuttal / Judge (structured output, retry w/ backoff)
src/tribunal/peers.ts   Industry peer lookup (dictionary + model fallback)
src/tribunal/run.ts     Shared trial orchestrator (CLI + web)
src/tribunal/report.ts  Markdown dossier renderer
app/                    Next.js courtroom: staged API routes + live debate UI
```

The web trial runs as five short API calls (`evidence → prosecutor → defense
→ rebuttal → judge`), each within serverless limits — state travels in the
request body, no database.

*Not investment advice.*
