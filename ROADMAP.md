# SEC Tribunal — Roadmap (stan na 19.09.2026, deadline 20.09)

> Plik sterujący pracą. Produkcja: https://sec-tribunal-tzn4-mu.vercel.app/
> (auto-deploy z `main`). Zasada: każdy etap = edycja → `npm run typecheck` +
> `npm run build` → commit → push → weryfikacja produkcji → stop.
> Jeśli sesja się urwie: nowa sesja czyta ten plik i robi PIERWSZY
> nieodhaczony etap z sekcji "Do zrobienia".

## ✅ Zrobione

- **Naprawa produkcji** (`f6491dc`, `da01b23`): lazy API key + `withErrorHandling`
  na 5 routach; `OPENROUTER_MODEL` z `||` zamiast `??`. Pełny trial
  zweryfikowany end-to-end na produkcji (TSLA, score 58, ~150 s).
- **Etap 1 — Design system** (`d8a5696`): paleta fintech (granat/cyjan, role:
  czerwień/szmaragd/fiolet), Inter + JetBrains Mono, własny renderer Markdownu
  (`app/components/markdown.tsx`, zero zależności).
- **Etap 2a — Ława agentów** (`20d6371`): `agent-avatars.tsx` (4 awatary SVG),
  `agent-bench.tsx` (idle/thinking/speaking/done, pulsujące ringi, rotujące
  statusy co 4 s), stany przełączane w `page.tsx` między wywołaniami API.

## 🔜 Do zrobienia (w tej kolejności)

### Etap 2b — Stepper + auto-scroll
1. Nowy `app/components/trial-progress.tsx`: stepper 5 faz
   Evidence → Prosecution → Defense → Rebuttal → Verdict; kroki complete
   (✓, wypełnione), active (pulsujący), pending (przygaszone); linia łącząca.
   Stan `phase` trzymany w `page.tsx`, ustawiany przy każdym wywołaniu API,
   po werdykcie `done`.
2. Auto-scroll w `page.tsx`: ref `followRef` (czy user jest przy dole strony,
   próg ~160 px, aktualizowany listenerem `scroll`); `Typewriter` dostaje
   `onTick` → gdy follow, `window.scrollTo(bottom)` (instant, nie smooth —
   tick co 12 ms). Scroll też przy nowej mowie i werdykcie. Gdy user
   odscrolluje w górę → follow off; powrót na dół → follow on. Pływający
   przycisk "↓ Live" widoczny gdy !follow && rozprawa trwa.
3. CSS: `.stepper`, `.step`, `.live-btn`. Typecheck/build → commit → push.

### Pakiet 1 — Exhibit: kronika zdarzeń 8-K (docket)
1. `src/sec/edgar.ts`: dodać `fetchSubmissions(cik10)` →
   `https://data.sec.gov/submissions/CIK{cik10}.json` (ten sam User-Agent);
   typ `Submissions` z `filings.recent` (równoległe tablice: `form`,
   `filingDate`, `items`, `accessionNumber`, `primaryDocument`).
2. Nowy `src/sec/events.ts`: `buildDocket(subs)` — filtruje 8-K z ostatnich
   ~18 mies. (max 14 szt.), mapuje kody itemów na etykiety + severity:
   czerwone: 4.02 (non-reliance/restatement!), 1.03 (bankructwo), 2.04
   (przyspieszenie długu), 2.06 (odpisy), 3.01 (delisting), 4.01 (zmiana
   audytora); bursztynowe: 2.05 (restrukturyzacja), 5.02 (odejścia
   z zarządu), 2.03 (nowy dług); info: 1.01, 2.01, 2.02, 5.03, 5.07, 7.01,
   8.01. Zliczyć też NT 10-K/NT 10-Q (spóźnione raporty) w oknie.
   `renderDocket()` → zwięzły blok tekstu dla agentów.
3. `/api/evidence`: fetch submissions w try/catch (docket nullable), dokleić
   `renderDocket` do `brief` (sekcja "RECENT MATERIAL EVENTS — 8-K DOCKET"),
   zwrócić też ustrukturyzowany `docket` dla UI.
4. Prompty (`agents.ts`): wzmianka, że Exhibit A może zawierać docket 8-K
   (odejścia zarządu, restatementy, odpisy) — używać jako dowodów.
5. UI: nowy `app/components/docket.tsx` — panel "FILINGS DOCKET" pod mową
   klerka: data, formularz, etykiety itemów kolorowane wg severity.
6. Walidacja: rozszerzyć `src/sec/preview.ts` o wydruk docketu
   (`npm run brief TSLA` — bez klucza OpenRouter). Commit → push →
   weryfikacja: POST produkcyjny /api/evidence ma pole `docket`.

### Pakiet 2 — Raport śledczy klerka (deterministyczny, w kodzie)
1. `src/sec/facts.ts`: wyeksportować `extractSeries(company, facts)`
   (refaktor z `buildBrief`, który dalej działa jak dziś) + typ `Series`.
2. Nowy `src/sec/forensics.ts`: `runForensics(series)` → 5 sub-ocen 0–20
   (suma 0–100) + flagi red/amber:
   - Growth: YoY przychodów (ujemny → nisko; rev < poziomu sprzed 2 lat →
     cap + red flag),
   - Profitability: marża netto poziom + trend (strata → red),
   - Earnings quality: OCF/NI (0.5–0.8 → amber "paper profits"; <0.5 → red),
   - Leverage: LT-debt/equity + interest coverage (op income / interest;
     <2 → red; ujemny equity → red),
   - Liquidity: znak OCF, trend gotówki, cash vs debt.
   Braki danych → neutralne 10/20 z notą. `renderForensics()` → blok tekstu.
3. `/api/evidence`: liczyć raport, dokleić do briefu, zwrócić strukturę.
   `/api/judge` + `runJudge`: opcjonalny parametr `forensic` — sędzia
   dostaje raport jako bezstronny exhibit i nie może go zignorować
   (instrukcja w system prompt); `page.tsx` przekazuje.
4. UI: `app/components/forensic-report.tsx` — panel "CLERK'S FORENSIC
   REPORT": 5 pasków sub-ocen + Clerk Score + lista flag.
5. Walidacja: `npm run brief` drukuje też raport; testy na TSLA/AAPL/INTC
   (sanity: AAPL wysoko, INTC nisko). Commit → push → weryfikacja produkcji.

### Etap 3 — Dramaturgia werdyktu
`verdict-card.tsx`: gauge odlicza 0→score (rAF ~1.5 s), pieczątki
SUSTAINED/DISMISSED/PARTIAL wbijane sekwencyjnie (scale+rotate), wiersze
zarzutów wjeżdżają kolejno. Spójność stylu na `/compare` i `/dossier`.

### Opcjonalne (jeśli zostanie czas przed 20.09)
- **Wykresy Exhibit A**: `/api/evidence` zwraca serie liczbowe (z
  `extractSeries`), mini-wykresy SVG bez bibliotek.
- **Pakiet 3 — Risk Factors z 10-K** (Item 1A, własne słowa spółki):
  pobranie dokumentu przez submissions→primaryDocument; KRUCHE parsowanie —
  twardy fallback "brak exhibitu". Robić tylko po Etapie 3.
- **Regeneracja demos/** (TSLA/AAPL/INTC) z docketem i forensics — wymaga
  klucza OpenRouter i ~3 min/spółkę.
- **Etap 6 — finał**: OG image (`ImageResponse`), merge README, GIF demo,
  A/B fable-5 vs sonnet-5 (tylko env var).

## ❌ Wycięte / odłożone (decyzje)
- **Streaming SSE** — wycięty: duży nakład, ława agentów + rotujące statusy
  już maskują czekanie; priorytet ma substancja analizy.
- **Gamifikacja** (predykcja score, momentum bar, docket localStorage) —
  po hackathonie.

## Notatki techniczne
- Czysty CSS (bez Tailwinda), zero nowych zależności npm.
- Czasy na produkcji (fable-5): evidence ~1.5 s, prosecutor ~21 s, defense
  ~54 s, rebuttal ~41 s, judge ~32 s; `maxDuration=300`.
- SEC wymaga User-Agent z e-mailem (`SEC_USER_AGENT` w `edgar.ts`).
- PowerShell: JSON z unicode słać jako bajty UTF-8; curl.exe zamiast aliasu.
- W Vercel `OPENROUTER_MODEL` jest pustym stringiem (kod odporny przez `||`).
