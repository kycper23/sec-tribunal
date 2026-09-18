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
- **Pakiet 0 — Court Bill** (`65d6399`): realny koszt każdej rozprawy z
  Orbio (`usage: {include: true}` → `usage.cost` w USD, tokenized $ORBIO
  credits) — cecha odróżniająca od konkurencji na hackathonie.
  `agents.ts`: `CallUsage`/`sumUsage`, `complete()` zwraca `{content, usage}`,
  wszystkie funkcje agentów (`runProsecutor`/`runDefense`/
  `runProsecutorRebuttal`/`runJudge`) zwracają `{..., usage}`; zero-fallback
  gdy gateway nie odda `usage`. `run.ts`: `TrialResult.usage` (per agent +
  total). 4 API routes zwracają `usage`. UI: `app/components/court-bill.tsx`
  (`CostBadge` przy każdej mowie, `CourtBill` — animowany licznik nad ławą,
  `BillReceipt` — pokwitowanie po werdykcie z najdroższym mówcą 💸),
  `app/trial.ts` (`CallUsage`/`BillEntry`/`sumBill`, `buildDossier` dokleja
  sekcję rachunku), `report.ts` (sekcja "### Court Bill" w dossier .md),
  `index.ts` CLI drukuje `[BILL] ...`. `demos/*.json` zregenerowane z realnym
  `usage` (np. AAPL: 4 wywołania, 36 552 tokenów, $0.8341). Zweryfikowane na
  produkcji: `/dossier/AAPL` pokazuje pokwitowanie z realnymi kwotami.
- **Etap 2b — Stepper + auto-scroll** (`75404aa`): `app/components/trial-progress.tsx`
  — stepper 5 faz Evidence → Prosecution → Defense → Rebuttal → Verdict
  (complete ✓, active pulsujący, pending przygaszony, łącząca linia z fill).
  `page.tsx`: stan `phase`/`phaseDone` ustawiany przy każdym wywołaniu API;
  `followRef`/`follow` (próg 160 px od dołu, listener `scroll`) — `Typewriter`
  dostaje `onTick`, który przy `follow` robi `window.scrollTo(bottom)`; scroll
  też po każdej nowej mowie i po werdykcie. Pływający przycisk "↓ Live" gdy
  `busy && !follow`. CSS: `.stepper`, `.step`, `.live-btn`. Zweryfikowane:
  typecheck/build/lint czyste, lokalny `next start` renderuje `/` i
  `/dossier/AAPL` bez błędów, produkcyjny CSS zawiera `.stepper`/`.live-btn`.
- **Pakiet 1 — Exhibit: kronika zdarzeń 8-K (docket)**: `src/sec/edgar.ts`
  dostał `fetchSubmissions(cik10)` → `data.sec.gov/submissions/CIK{cik10}.json`
  (typ `Submissions`, `filings.recent` jako równoległe tablice). Nowy
  `src/sec/events.ts`: `buildDocket(subs)` filtruje 8-K/8-K-A z ostatnich
  ~18 mies. (max 14, najnowsze pierwsze), mapuje kody itemów na etykiety +
  severity (czerwone: 4.02 restatement, 1.03 bankructwo, 2.04 przyspieszenie
  długu, 2.06 odpisy, 3.01 delisting, 4.01 zmiana audytora; bursztynowe: 2.05
  restrukturyzacja, 5.02 odejścia z zarządu, 2.03 nowy dług, 1.02 zerwanie
  umowy, 5.01 zmiana kontroli; info: reszta, nieznany kod → generyczna
  etykieta zamiast zniknięcia), liczy NT 10-K/NT 10-Q jako spóźnione raporty
  w oknie. `renderDocket()` → blok tekstu dla agentów. `/api/evidence` i
  `runTribunal` (`src/tribunal/run.ts`) dociągają submissions w try/catch
  (docket nullable, nigdy nie wywala rozprawy), doklejają `renderDocket` do
  `brief` i zwracają ustrukturyzowany `docket`. `TrialResult.docket` w typie.
  Prompty prosecutora/defense (`agents.ts`) wzmiankują docket 8-K jako dowód.
  UI: `app/components/docket.tsx` (`DocketPanel`) — panel "FILINGS DOCKET"
  pod mową klerka na `/` i `/dossier/[ticker]`: tally red/amber/routine +
  wiersze z datą, formularzem, badge severity, etykietami itemów. CSS:
  `.docket`, `.docket-row`, `.docket-badge` itd. `src/sec/preview.ts`
  (`npm run brief TSLA`) drukuje też docket bez klucza OpenRouter.
  Zweryfikowane: typecheck/build/lint czyste, `npm run brief AAPL/TSLA`
  pokazuje realne 8-K (AAPL: 6 amber/8 info, TSLA: 2 amber/12 info), lokalny
  `next start` → POST `/api/evidence` zwraca pole `docket` z 14 zdarzeniami,
  `/dossier/AAPL` renderuje się (demos/*.json jeszcze bez pola `docket` —
  `DocketPanel` obsługuje `null`/`undefined` bez błędu). Regeneracja
  demos/ z docketem odłożona do sekcji Opcjonalne (wymaga klucza OpenRouter).

## 🔜 Do zrobienia (w tej kolejności)

### Etap 4 — Redesign: "rada mędrców / ilustrowana księga" — ZROBIONE
Commity: `0bebac2` (plan), `cdd3c9b` (1/5 fundament), `7d117de` (2/5
postaci), `687ddf1` (3/5 etykiety+emoji), `a00408a` (4/5 gramatyka księgi),
5/5 werdykt-pieczęć — poniżej. Zweryfikowane: typecheck/build/lint czyste,
lokalny `next start` renderuje `/`, `/compare`, `/dossier/AAPL` (seal,
stampy, drop caps, Scribe w HTML). Werdykt-pieczęć: `Gauge` w `seal` (SVG
double ring + textPath circumtext, `useId` dla unikalnych id na /compare),
stampy z deterministyczną rotacją `((i*47)%5)-2`.
Wyłącznie warstwa prezentacyjna. Nietykalne: nazwy funkcji agentów, schema
Zod, system prompty, API routes, `src/sec/`, demos/*.json. Zakaz sygnatur
"AI template": granat+neon, gradienty, glow, glassmorphism, radius 12–16px,
lucide, emoji. Czytelność danych > motyw.
Paleta (jasny pergamin): bg `#EDE4D0`, panel `#F6EFDF`, ink `#2A241B`, muted
`#6E6250`, bordery `#C9BCA2`/`#8A7A5E`, mosiądz `#7C5F18`, rama `#3B3428`;
role: Skeptic `#A13C2C`, Advocate `#3E6B4F`, Arbiter `#433D63`, Scribe
`#6B5B45`; semantyka danych red/amber/green = `#A13C2C`/`#A87718`/`#3E6B4F`.
Fonty (next/font/google): Spectral (tekst), Cormorant Garamond 600/700
(nagłówki, caps), IBM Plex Mono (liczby/XBRL); Inter/JetBrains out.
Border-radius 0 (max 2px badge). 5 commitów, każdy: typecheck + build →
commit → push → weryfikacja produkcji:
1. **Fundament**: `layout.tsx` (fonty), pełny sweep `globals.css` (`:root`,
   tekstura papieru feTurbulence data-URI, likwidacja gradientów/glow/
   radiusów i hardcodów pod dark theme — m.in. `.md strong` `#f1f5f9`,
   `#051324` na przyciskach), `scoreColor()` w `app/trial.ts`.
2. **Postaci**: `agent-avatars.tsx` — 4 sylwetki sztychowe w kapturach (bez
   twarzy; animowany rekwizyt, nie postać: pióro Scribe'a, waga Arbitra
   wyrównująca się przy done, ramię Skeptica, płaszcz Advocate'a) + nowy
   `ROLE_COLOR`; `agent-bench.tsx` medaliony. Stany idle/thinking/speaking/
   done bez zmian logicznych.
3. **Etykiety + czystka emoji**: "The Skeptic — prosecution" itd. (bench,
   `page.tsx`, `dossier/[ticker]/page.tsx`); usunąć 💸 (court-bill
   `::after`), ⏳, ✓ Rested, 🏆 (compare). SUSTAINED/DISMISSED/PARTIAL bez
   zmian treści.
4. **Gramatyka księgi**: masthead jako karta tytułowa (podwójny filet,
   wiersz rejestru w mono), inicjały `::first-letter` w kolorze roli,
   fleurony ❦ między mowami, stopka-kolofon, kursor atramentowy, "↓ Live"
   jako zakładka, rachunek jako paragon (perforacja dashed).
5. **Werdykt-pieczęć**: gauge (conic-gradient zostaje) w grawerowanym
   podwójnym ringu z napisem otokowym SVG textPath, stampy jako odbicia
   tuszu (deterministyczna rotacja z indeksu — SSR-safe), spójność
   `/compare` i `/dossier`; `markdown.tsx` linie tabel. Konsumuje część
   Etapu 3.

### Etap 4b — Wygenerowane ilustracje (frontispiece + portrety mędrców) — ZROBIONE
`src/gen-assets.ts`: one-shot generator (OpenRouter `/api/v1/images`,
`openai/gpt-image-1`) + `sharp` post-processing (crop/resize → JPEG
mozjpeg, stepping quality 85→25 pod budżet bajtowy). 4 assety w `public/`:
`scene-hero.jpg` (1536×864, ≤250KB) + `sage-skeptic.jpg`/`sage-advocate.jpg`/
`sage-arbiter.jpg` (512×512, ≤100KB każdy, styl bajkowy/storybook zamiast
fotorealizmu). Wpięte w UI: nowy `app/components/hero-plate.tsx`
(`<HeroPlate/>` — oprawiona plansza tytułowa, podpis w mono) nad `masthead`
na `/`, `/compare`, `/dossier/[ticker]`; `agent-avatars.tsx` — `AgentAvatar`
renderuje portret JPG dla prosecutor/defense/judge (Scribe bez portretu →
zostaje przy starej sylwetce SVG), CSS `.bench-portrait-img`/`.hero-plate`
bez gradientów/glow/dużych radiusów (zgodnie z zasadami Etapu 4). Zero
zmian w logice agentów/API/`src/sec/`. Zweryfikowane: typecheck + lint +
build czyste, lokalny `next start` → HTML `/`, `/compare`, `/dossier/AAPL`
zawiera `hero-plate`/`scene-hero.jpg`.

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

### Etap 3 — Dramaturgia werdyktu (częściowo skonsumowane przez Etap 4/5)
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
- **Pakiet 0b — Prompt caching** — sprawdzone w dokumentacji OpenRouter/
  Anthropic i odrzucone: `cache_control: ephemeral` cache'uje CAŁY prefiks
  rozmowy do breakpointu, łącznie z system promptem, który go poprzedza.
  Prosecutor/Defense/Rebuttal/Judge mają każdy INNY system prompt, mimo że
  współdzielą treść Exhibit A/B — więc w ramach jednej rozprawy nie ma
  cache-hitów. Realny zysk istniałby tylko przy retry tego samego wywołania
  albo powtórnym demo tego samego tickera w ciągu 5 min TTL — czyli w
  typowym jednorazowym demo UI pokazywałby "saved $0.00", co wygląda jak
  zepsuta funkcja przed jurorami. Odrzucone dla jakości, nie realizowane.

## Notatki techniczne
- Czysty CSS (bez Tailwinda), zero nowych zależności npm.
- Decyzja modelowa (19.09): zostajemy na fable-5 (zmierzone czasy, koszt
  ~$0.83/rozprawa, stabilny structured output przez Zod). Ewentualny A/B
  sonnet-5 dopiero po Etapie 4 + Pakiecie 2: jedna rozprawa lokalnie z
  `OPENROUTER_MODEL` w `.env.local`, przełączenie na prod tylko przy
  wyraźnie lepszej jakości i bezpiecznych czasach (odwracalne — env var).
- Czasy na produkcji (fable-5): evidence ~1.5 s, prosecutor ~21 s, defense
  ~54 s, rebuttal ~41 s, judge ~32 s; `maxDuration=300`.
- **Przełączenie na sonnet-4.5** (18/19.09, rewizja decyzji powyżej):
  test lokalny (`pnpm tribunal TSLA`, `.env.local` z
  `OPENROUTER_MODEL=anthropic/claude-sonnet-4.5`) — 4 calls, ~166 s total
  (bezpiecznie pod `maxDuration=300`), $0.1889/rozprawa (**taniej** niż
  fable-5), structured output Judge nadal waliduje się przez Zod bez
  błędu, jakość mów wyraźnie lepsza (precyzyjne cytowania Exhibit A,
  spójna numeracja charge'ów w rebuttal/verdict). Fallback w
  `src/tribunal/agents.ts` zmieniony na `anthropic/claude-sonnet-4.5`;
  `OPENROUTER_MODEL` ustawiony też na Vercel (produkcja).
- SEC wymaga User-Agent z e-mailem (`SEC_USER_AGENT` w `edgar.ts`).
- PowerShell: JSON z unicode słać jako bajty UTF-8; curl.exe zamiast aliasu.
- W Vercel `OPENROUTER_MODEL` jest pustym stringiem (kod odporny przez `||`).
