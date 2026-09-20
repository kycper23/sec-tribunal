/**
 * Żywy cennik Orbio.
 *
 * Pobiera listę modeli z endpointu OpenRouter-compatible i pozwala:
 *  - odczytać ceny per-token dla modelu (getPricing),
 *  - oszacować koszt rozprawy w USD przed jej startem (estimateCost),
 *  - przeliczyć koszt USD na CREDIT po cenie katalogowej (toCredit).
 *
 * Moduł jest DODATKIEM do rozprawy — żadna funkcja tutaj NIGDY nie rzuca
 * wyjątku. Przy awarii sieci / złej odpowiedzi zwracamy null lub 0.
 */

/**
 * Bieżąca stawka Orbio: cena Orbio stanowi tę część ceny katalogowej.
 * UWAGA: to bieżąca stawka Orbio i może się zmienić — aktualizuj tylko tę stałą.
 */
const ORBIO_RATE_OF_LIST_PRICE = 0.225;

/**
 * Stosunek ceny katalogowej do ceny Orbio (list price / Orbio price).
 * Wyliczany ze stawki Orbio, żeby nie dublować magicznych liczb.
 */
export const LIST_PRICE_MULTIPLIER = 1 / ORBIO_RATE_OF_LIST_PRICE;

/** Ceny w USD za 1 token. */
export interface ModelPricing {
  prompt: number;
  completion: number;
}

const DEFAULT_BASE_URL = "https://api.orbio.so/api/v1";

/** TTL cache'a cennika: 1 godzina. */
const PRICING_CACHE_TTL_MS = 60 * 60 * 1000;

type PricingMap = Map<string, ModelPricing>;

interface PricingCache {
  /** Trwające lub zakończone pobieranie — deduplikuje równoległe wywołania. */
  promise: Promise<PricingMap | null>;
  /** Timestamp udanego pobrania; 0 = jeszcze nie zakończono sukcesem. */
  fetchedAt: number;
}

let cache: PricingCache | null = null;

/** Bezpieczny parse ceny-stringa ("0.000002") na liczbę; null gdy nie-liczba. */
function parsePrice(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Buduje mapę model -> ceny z surowej odpowiedzi API. Nigdy nie rzuca. */
function parseModelList(raw: unknown): PricingMap {
  const map: PricingMap = new Map();
  const list = Array.isArray(raw)
    ? raw
    : raw !== null &&
        typeof raw === "object" &&
        Array.isArray((raw as { data?: unknown }).data)
      ? ((raw as { data: unknown[] }).data)
      : [];

  for (const item of list) {
    if (item === null || typeof item !== "object") continue;
    const { id, pricing } = item as {
      id?: unknown;
      pricing?: { prompt?: unknown; completion?: unknown };
    };
    if (typeof id !== "string" || pricing === null || typeof pricing !== "object") {
      continue;
    }
    const prompt = parsePrice(pricing?.prompt);
    const completion = parsePrice(pricing?.completion);
    if (prompt === null || completion === null) continue;
    map.set(id, { prompt, completion });
  }
  return map;
}

/** Jedno pobranie całej listy modeli. Zwraca null przy dowolnej awarii. */
async function fetchPricingMap(): Promise<PricingMap | null> {
  try {
    const baseUrl = (process.env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL).replace(
      /\/+$/,
      "",
    );
    const res = await fetch(`${baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ""}`,
      },
    });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    return parseModelList(body);
  } catch {
    // Awaria sieci / JSON — cennik jest dodatkiem, nie wywalamy rozprawy.
    return null;
  }
}

/**
 * Zwraca (z cache'em w pamięci procesu, TTL 1 h) mapę cen wszystkich modeli.
 * Cała lista jest pobierana raz na proces, nie per model. Nieudane pobranie
 * nie zatruwa cache'a — następne wywołanie spróbuje ponownie.
 */
async function getPricingMap(): Promise<PricingMap | null> {
  const now = Date.now();
  if (cache !== null && (cache.fetchedAt === 0 || now - cache.fetchedAt < PRICING_CACHE_TTL_MS)) {
    // fetchedAt === 0 oznacza fetch w toku — podpinamy się pod niego.
    const map = await cache.promise;
    if (map !== null) return map;
    // Poprzednia próba zawiodła — pozwól na retry poniżej.
    if (cache.fetchedAt === 0) cache = null;
  }

  const entry: PricingCache = { fetchedAt: 0, promise: Promise.resolve(null) };
  entry.promise = fetchPricingMap().then((map) => {
    if (map !== null) {
      entry.fetchedAt = Date.now();
    } else if (cache === entry) {
      // Awaria — zwolnij slot, żeby kolejne wywołanie mogło ponowić fetch.
      cache = null;
    }
    return map;
  });
  cache = entry;
  return entry.promise;
}

/**
 * Ceny per-token (USD) dla modelu, albo null (nieznany model / awaria sieci).
 * Nigdy nie rzuca.
 */
export async function getPricing(
  model: string,
): Promise<{ prompt: number; completion: number } | null> {
  try {
    const map = await getPricingMap();
    return map?.get(model) ?? null;
  } catch {
    return null;
  }
}

/**
 * Prognozowany koszt w USD dla podanej liczby tokenów.
 * Przy braku cennika / awarii zwraca 0. Nigdy nie rzuca.
 */
export async function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): Promise<number> {
  try {
    const pricing = await getPricing(model);
    if (pricing === null) return 0;
    const cost =
      pricing.prompt * promptTokens + pricing.completion * completionTokens;
    return Number.isFinite(cost) ? cost : 0;
  } catch {
    return 0;
  }
}

/**
 * Przelicza koszt USD (po cenie Orbio) na CREDIT.
 * 1 CREDIT = 1 USD po cenie katalogowej. Nigdy nie rzuca.
 */
export function toCredit(usd: number): number {
  if (!Number.isFinite(usd)) return 0;
  return usd * LIST_PRICE_MULTIPLIER;
}
