# SEC Tribunal

Three AI agents — **The Skeptic**, **The Advocate**, and **The Arbiter** — put a US public company on trial. The evidence is real: financial data pulled live from the SEC EDGAR XBRL `companyfacts` API.

Live: **https://sec-tribunal.vercel.app/**

## How a trial runs

1. **Scribe** gathers evidence from SEC EDGAR XBRL companyfacts.
2. **The Skeptic** builds the bear case against the company.
3. **The Advocate** counters with the defense.
4. **The Skeptic** delivers a rebuttal.
5. **The Arbiter** hands down a verdict: a 0–100 score plus a table of charges.

## Features

- **Blind Trial** — the case is sealed to a date in the past. You stake a prophecy (Rise / Fall) before seeing the verdict, then "break the seal" to compare your call against what actually happened.
- **Prophecy Ledger** — your prediction track record, stored in `localStorage`.
- **Prophecy Card** — a shareable PNG card with your trial result.
- **Court Bill** — the real USD cost of running each trial, via the Orbio usage API.
- **8-K Docket** — a timeline of material events pulled from the SEC submissions API, classified by severity.

## Stack

- Next.js + TypeScript
- Orbio Gateway (OpenAI-compatible API)
- Model: `anthropic/claude-fable-5`

## Run locally

```bash
npm install
```

Create `.env.local`:

```bash
OPENROUTER_API_KEY=sk-or-v1-…
OPENROUTER_MODEL=anthropic/claude-fable-5
```

```bash
npm run dev
```

---

Built for Orbio Build Week 2026. Not investment advice.

