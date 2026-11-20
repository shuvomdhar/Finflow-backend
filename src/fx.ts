/**
 * Free, key-less USD exchange rates (open.er-api.com, refreshed daily).
 * Cached in memory so PDF generation never hammers the public endpoint.
 */
const RATES_ENDPOINT = 'https://open.er-api.com/v6/latest/USD';
const CACHE_TTL = 1000 * 60 * 60 * 12;

type Rates = Record<string, number>;

let cache: { rates: Rates; fetchedAt: number } | null = null;
let inflight: Promise<Rates | null> | null = null;

async function fetchRates(): Promise<Rates | null> {
  try {
    const response = await fetch(RATES_ENDPOINT, {
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      result?: string;
      rates?: Rates;
    };
    if (payload.result !== 'success' || !payload.rates) return null;
    cache = { rates: payload.rates, fetchedAt: Date.now() };
    return payload.rates;
  } catch {
    // Offline or rate limited: callers fall back to USD.
    return null;
  }
}

export async function getUsdRates(): Promise<Rates | null> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return cache.rates;
  }
  if (!inflight) {
    inflight = fetchRates().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

export async function resolveCurrency(code: string | undefined): Promise<{
  code: string;
  rate: number;
  label: string;
}> {
  const requested = (code ?? 'USD').toUpperCase();
  if (!/^[A-Z]{3}$/.test(requested)) {
    return { code: 'USD', rate: 1, label: '$' };
  }
  if (requested === 'USD') {
    return { code: 'USD', rate: 1, label: '$' };
  }

  const rates = await getUsdRates();
  const rate = rates?.[requested];
  if (!rate) {
    return { code: 'USD', rate: 1, label: '$' };
  }

  // Helvetica in PDFKit only covers WinAnsi glyphs, so ISO codes are clearer
  // (and safer) than rupee/taka symbols in generated statements.
  return { code: requested, rate, label: `${requested} ` };
}
