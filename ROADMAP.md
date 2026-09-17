# SEC Tribunal — Roadmap przebudowy UI (stan na 18.09.2026)

> Plik sterujący pracą nad projektem przed deadlinem **20.09**.
> Produkcja: https://sec-tribunal-tzn4-mu.vercel.app/ (auto-deploy z `main`).
> Zasada pracy: każdy etap kończy się `npm run typecheck` + `npm run build`,
> commitem i pushem — repo zawsze w działającym stanie.

## ✅ Zrobione

- **Naprawa produkcji** (`f6491dc`, `da01b23`): lazy API key + `withErrorHandling`
  na 5 routach; `OPENROUTER_MODEL` z `||` zamiast `??` (pusta zmienna w Vercel
  psuła wywołania — "A model is required"). Pełny trial zweryfikowany
  end-to-end na produkcji (TSLA, score 58, ~150 s łącznie).
- **Etap 1 — Design system** (`d8a5696`): paleta fintech (granat `#0a0e1a`,
  cyjan `#38bdf8` → indygo, role: czerwień/szmaragd/fiolet), fonty Inter +
  JetBrains Mono przez `next/font/google`, przebudowa `globals.css`, własny
  renderer Markdownu (`app/components/markdown.tsx`, zero zależności) podpięty
  w courtroom i dossier. Zweryfikowane na produkcji.

- **Etap 2a — Awatary + ława agentów** (`20d6371`):
  `agent-avatars.tsx` (4 awatary SVG: miecz/tarcza/młotek/dokument),
  `agent-bench.tsx` (stany idle/thinking/speaking/done, pulsujące ringi,
  skaczące kropki, rotujące statusy co 4 s), podpięte w `page.tsx`,
  stany przełączane między wywołaniami API.

## 🔜 Do zrobienia (kolejność)

### Etap 2b — Stepper + auto-scroll (życzenie użytkownika!)
- Stepper 5 faz: Evidence → Prosecution → Defense → Rebuttal → Verdict,
  wypełniająca się linia, aktywny krok pulsuje.
- Auto-scroll podążający za typewriterem (smooth), scroll do nowej mowy
  i do werdyktu; **wyłącza się, gdy user ręcznie scrolluje w górę**, wraca
  gdy user zjedzie na dół; dyskretny przycisk "↓ live" gdy odscrollowany.

### Etap 2c — Polish sali rozpraw
- Przycisk "pomiń animację" (skip typewriter).
- Małe awatary przy mowach w transkrypcie; spójność na `/dossier/[ticker]`
  i `/compare`.

### Etap 3 — Dramaturgia werdyktu
- Gauge z animowanym odliczaniem 0→score (rAF), pieczątki
  SUSTAINED/DISMISSED/PARTIAL wbijane sekwencyjnie (animacja stemplowania),
  wiersze tabeli zarzutów wjeżdżają kolejno.

### Etap 4 — Streaming odpowiedzi agentów (jedyny etap dotykający API)
- Routy `prosecutor`/`defense`/`rebuttal` streamują SSE/ReadableStream
  z OpenRoutera do klienta; tekst pisze się w tempie generacji modelu.
- Judge zostaje non-streaming (structured JSON). Fallback do trybu obecnego.
- Pełny test produkcyjny przed przejściem dalej.

### Etap 5 — Wykresy Exhibit A
- `/api/evidence` dodatkowo zwraca ustrukturyzowane serie (dane już liczone
  w `src/sec/facts.ts` — revenue, net income, marże, debt/equity).
- Panel "EXHIBIT A" z mini-wykresami SVG (własne, bez bibliotek): słupki
  roczne + sparkline kwartalne, monospace, kolory wg trendu.

### Etap 6 — Finał przed submission (20.09)
- OG image werdyktu (`ImageResponse`, `/dossier/[ticker]/opengraph-image`).
- Merge `README_TRIBUNAL.md` → `README.md`, GIF demo, link do przykładowego
  werdyktu.
- Opcjonalny A/B test modelu: fable-5 (obecny, zweryfikowany) vs sonnet-5 —
  lokalnie przez `OPENROUTER_MODEL`, porównać czas etapów + jakość + parsowanie
  werdyktu Zod. Zmiana tylko przez env var w Vercel, bez zmian w kodzie.

## 📌 Odłożone na później (decyzja użytkownika)
- Gamifikacja: predykcja score przed werdyktem ("Beat the Judge"),
  momentum bar prokurator↔obrona, docket ostatnich rozpraw (localStorage).

## Notatki techniczne
- Czysty CSS (bez Tailwinda), zero nowych zależności npm; `next/font/google`.
- Czasy etapów na produkcji (fable-5): evidence ~1.5 s, prosecutor ~21 s,
  defense ~54 s, rebuttal ~41 s, judge ~32 s; `maxDuration=300` ustawione.
- Uwaga na Windows/PowerShell: JSON z polskimi/unicode znakami w curl słać
  jako UTF-8 bajty (Invoke-RestMethod z `[Text.Encoding]::UTF8.GetBytes`).
- W Vercel dashboard warto usunąć/ustawić `OPENROUTER_MODEL` (obecnie pusty
  string — kod ma safety net przez `||`, ale porządek nie zaszkodzi).
