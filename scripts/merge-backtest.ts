/**
 * Merge two backtest runs (multi-model and single-model) into a single
 * data file for the /scoreboard page, with computed summaries.
 *
 * Usage:
 *   pnpm backtest:merge -- --multi=../bt-multi.json --single=../bt-single.json --out=data/backtest-results.json
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Direction = "rise" | "fall";

interface FullEntry {
  ticker: string;
  cutoff: string;
  clerkScore: number;
  tribunalScore: number;
  clerkDirection: Direction;
  tribunalDirection: Direction;
  revenueCallConfidence: 'low' | 'medium' | 'high';
  gap: number;
  chargesFiled: number;
  chargesSustained: number;
  actualDirection: Direction;
  tribunalCorrect: boolean;
  clerkCorrect: boolean;
  costUsd: number;
  commit: string;
  models: Record<string, string>;
}

interface ErrorEntry {
  ticker: string;
  error: string;
}

type Entry = FullEntry | ErrorEntry;

interface Disagreement {
  ticker: string;
  tribunalDirection: Direction;
  clerkDirection: Direction;
  correctSide: "tribunal" | "clerk" | "neither";
}

interface Summary {
  graded: number;
  tribunalCorrect: number;
  clerkCorrect: number;
  alwaysRiseCorrect: number;
  totalCostUsd: number;
  avgCostUsd: number;
  correctPerCredit: number;
  meanGap: number;
  meanAbsGap: number;
  chargesFiled: number;
  chargesSustained: number;
  sustainedRate: number;
  disagreements: Disagreement[];
}

function isFullEntry(entry: Entry): entry is FullEntry {
  return !("error" in entry);
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (const arg of argv) {
    const match = /^--([^=]+)=(.+)$/.exec(arg);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

function loadEntries(path: string): Entry[] {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected a JSON array in ${path}`);
  }
  return parsed as Entry[];
}

function summarize(rows: FullEntry[]): Summary {
  const graded = rows.length;
  const tribunalCorrect = rows.filter((r) => r.tribunalCorrect).length;
  const clerkCorrect = rows.filter((r) => r.clerkCorrect).length;
  const alwaysRiseCorrect = rows.filter(
    (r) => r.actualDirection === "rise",
  ).length;

  const totalCostRaw = rows.reduce((sum, r) => sum + r.costUsd, 0);
  const totalCostUsd = round(totalCostRaw, 4);
  const avgCostUsd = graded > 0 ? round(totalCostRaw / graded, 4) : 0;
  // 1 CREDIT = $1 at list price, so credits spent == totalCostUsd.
  const correctPerCredit =
    totalCostRaw > 0 ? round(tribunalCorrect / totalCostRaw, 2) : 0;

  const meanGap =
    graded > 0 ? round(rows.reduce((s, r) => s + r.gap, 0) / graded, 1) : 0;
  const meanAbsGap =
    graded > 0
      ? round(rows.reduce((s, r) => s + Math.abs(r.gap), 0) / graded, 1)
      : 0;

  const chargesFiled = rows.reduce((s, r) => s + r.chargesFiled, 0);
  const chargesSustained = rows.reduce((s, r) => s + r.chargesSustained, 0);
  const sustainedRate =
    chargesFiled > 0 ? round((chargesSustained / chargesFiled) * 100, 1) : 0;

  const disagreements: Disagreement[] = rows
    .filter((r) => r.tribunalDirection !== r.clerkDirection)
    .map((r) => ({
      ticker: r.ticker,
      tribunalDirection: r.tribunalDirection,
      clerkDirection: r.clerkDirection,
      correctSide: r.tribunalCorrect
        ? "tribunal"
        : r.clerkCorrect
          ? "clerk"
          : "neither",
    }));

  return {
    graded,
    tribunalCorrect,
    clerkCorrect,
    alwaysRiseCorrect,
    totalCostUsd,
    avgCostUsd,
    correctPerCredit,
    meanGap,
    meanAbsGap,
    chargesFiled,
    chargesSustained,
    sustainedRate,
    disagreements,
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const missing = ["multi", "single", "out"].filter((k) => !args[k]);
  if (missing.length > 0) {
    console.error(
      `Missing required argument(s): ${missing.map((k) => `--${k}`).join(", ")}\n` +
        "Usage: tsx scripts/merge-backtest.ts --multi=<path> --single=<path> --out=<path>",
    );
    process.exit(1);
  }

  const multiEntries = loadEntries(resolve(args.multi));
  const singleEntries = loadEntries(resolve(args.single));

  const multiRows = multiEntries.filter(isFullEntry);
  const singleRows = singleEntries.filter(isFullEntry);
  const allRows = [...multiRows, ...singleRows];

  if (allRows.length === 0) {
    console.error("No full (non-error) entries found in either input file.");
    process.exit(1);
  }

  // Common cutoff and commit — taken from entries, with a consistency check.
  const cutoff = allRows[0].cutoff;
  const commit = allRows[0].commit;
  for (const row of allRows) {
    if (row.cutoff !== cutoff) {
      console.warn(
        `Warning: inconsistent cutoff for ${row.ticker}: ${row.cutoff} (expected ${cutoff})`,
      );
    }
    if (row.commit !== commit) {
      console.warn(
        `Warning: inconsistent commit for ${row.ticker}: ${row.commit} (expected ${commit})`,
      );
    }
  }

  // Error entries from both runs, de-duplicated by ticker.
  const excludedByTicker = new Map<
    string,
    { ticker: string; reason: string }
  >();
  for (const entry of [...multiEntries, ...singleEntries]) {
    if (!isFullEntry(entry) && !excludedByTicker.has(entry.ticker)) {
      excludedByTicker.set(entry.ticker, {
        ticker: entry.ticker,
        reason: entry.error,
      });
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    cutoff,
    commit,
    configs: {
      multi: {
        models: multiRows[0]?.models ?? {},
        summary: summarize(multiRows),
        rows: multiRows,
      },
      single: {
        models: singleRows[0]?.models ?? {},
        summary: summarize(singleRows),
        rows: singleRows,
      },
    },
    excluded: [...excludedByTicker.values()],
  };

  const outPath = resolve(args.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n", "utf8");

  console.log(`Wrote ${outPath}`);
  console.log(
    `  multi:  ${multiRows.length} rows, single: ${singleRows.length} rows, excluded: ${excludedByTicker.size}`,
  );
}

main();
