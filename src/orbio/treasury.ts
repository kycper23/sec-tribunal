/**
 * Orbio Treasury — żywe saldo klucza + limity darmowych rozpraw.
 *
 * UWAGA (świadomy kompromis na potrzeby hackathonu, opisany w README):
 * cały stan (cache salda, licznik dzienny, rate limit per IP) trzymany jest
 * w pamięci procesu. Na Vercelu oznacza to, że liczniki są PER INSTANCJA
 * serverless — nie są współdzielone między instancjami ani nie przeżywają
 * cold startów. Dla publicznego demo to wystarczające zabezpieczenie budżetu.
 */

const OPENROUTER_BASE_URL =
  process.env.OPENROUTER_BASE_URL ?? "https://api.orbio.so/api/v1";

/**
 * Poniżej tej rezerwy (USD) darmowe rozprawy są wyłączane, aby demo
 * nigdy nie padło w połowie rozprawy podczas oceniania — zostawiamy
 * bufor na dokończenie już trwających przebiegów.
 */
export const RESERVE_USD = 10;

/**
 * Zmierzona średnia koszt jednej rozprawy (USD) z rzeczywistych przebiegów.
 */
export const AVERAGE_TRIAL_USD = 0.22;

/** Maksymalna liczba darmowych rozpraw na dobę (reset o 00:00 UTC). */
export const DAILY_LIMIT = 100;

/** Maksymalna liczba rozpraw na godzinę z jednego IP. */
const IP_HOURLY_LIMIT = 5;
const HOUR_MS = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// 1. Saldo klucza — cache w pamięci procesu, TTL 60 s.
// ---------------------------------------------------------------------------

const BALANCE_TTL_MS = 60 * 1000;

let balanceCache: { availableUsd: number; fetchedAt: number } | null = null;

/**
 * Pobiera dostępne saldo klucza Orbio (USD).
 * NIGDY nie rzuca — przy błędzie sieci/parsowania zwraca null.
 */
export async function getBalance(): Promise<{ availableUsd: number } | null> {
  const now = Date.now();
  if (balanceCache && now - balanceCache.fetchedAt < BALANCE_TTL_MS) {
    return { availableUsd: balanceCache.availableUsd };
  }

  try {
    const res = await fetch(`${OPENROUTER_BASE_URL}/key`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
    });
    if (!res.ok) return null;

    const data: unknown = await res.json();
    // Uwaga: `available` i `used` w odpowiedzi API to STRINGI.
    const available = (data as { balance?: { available?: string } })?.balance
      ?.available;
    const availableUsd = Number.parseFloat(String(available));
    if (!Number.isFinite(availableUsd)) return null;

    balanceCache = { availableUsd, fetchedAt: now };
    return { availableUsd };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 2. Licznik dziennych rozpraw — reset o 00:00 UTC.
// ---------------------------------------------------------------------------

let dailyCount = 0;
let dailyKey = currentUtcDayKey();

function currentUtcDayKey(): string {
  // np. "2026-09-21" — zmiana klucza o 00:00 UTC resetuje licznik.
  return new Date().toISOString().slice(0, 10);
}

function rolloverDailyIfNeeded(): void {
  const key = currentUtcDayKey();
  if (key !== dailyKey) {
    dailyKey = key;
    dailyCount = 0;
  }
}

/** Ile darmowych rozpraw pozostało dzisiaj (doba UTC). */
export function trialsLeftToday(): number {
  rolloverDailyIfNeeded();
  return Math.max(0, DAILY_LIMIT - dailyCount);
}

/** Odnotowuje rozpoczęcie rozprawy w liczniku dziennym. */
export function recordTrial(): void {
  rolloverDailyIfNeeded();
  dailyCount += 1;
}

// ---------------------------------------------------------------------------
// 3. Rate limit per IP — maks. 5 rozpraw na godzinę.
// ---------------------------------------------------------------------------

const ipHits = new Map<string, number[]>();

/** Usuwa timestampy starsze niż godzina; puste wpisy kasuje z mapy. */
function pruneIp(ip: string, now: number): number[] {
  const fresh = (ipHits.get(ip) ?? []).filter((ts) => now - ts < HOUR_MS);
  if (fresh.length === 0) {
    ipHits.delete(ip);
  } else {
    ipHits.set(ip, fresh);
  }
  return fresh;
}

/** Czy dany IP mieści się w limicie 5 rozpraw na godzinę. */
export function ipAllowed(ip: string): boolean {
  return pruneIp(ip, Date.now()).length < IP_HOURLY_LIMIT;
}

/** Odnotowuje rozprawę dla danego IP. */
export function recordIp(ip: string): void {
  const now = Date.now();
  const fresh = pruneIp(ip, now);
  fresh.push(now);
  ipHits.set(ip, fresh);
}

// ---------------------------------------------------------------------------
// 4. Bramka wejściowa + status skarbca.
// ---------------------------------------------------------------------------

/**
 * Sprawdza po kolei: rate limit per IP, limit dzienny, saldo powyżej
 * RESERVE_USD. Gdy getBalance() zwróci null (awaria odczytu salda),
 * NIE blokujemy — awaria po naszej stronie nie może karać użytkownika.
 */
export async function canConveneNow(
  ip: string
): Promise<
  { ok: true } | { ok: false; reason: "rate-limit" | "daily-limit" | "treasury-empty" }
> {
  if (!ipAllowed(ip)) {
    return { ok: false, reason: "rate-limit" };
  }
  if (trialsLeftToday() <= 0) {
    return { ok: false, reason: "daily-limit" };
  }
  const balance = await getBalance();
  if (balance !== null && balance.availableUsd <= RESERVE_USD) {
    return { ok: false, reason: "treasury-empty" };
  }
  return { ok: true };
}

/** Status skarbca do wyświetlenia w UI publicznego demo. */
export async function treasuryStatus(): Promise<{
  availableUsd: number | null;
  trialsLeft: number;
  perTrialUsd: number;
}> {
  const balance = await getBalance();
  return {
    availableUsd: balance?.availableUsd ?? null,
    trialsLeft: trialsLeftToday(),
    perTrialUsd: AVERAGE_TRIAL_USD,
  };
}
