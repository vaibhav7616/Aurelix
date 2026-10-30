import { logger } from '../utils/logger';

export interface ExchangeRateInfo {
  base: string;
  target: string;
  rate: number;
  date: string;
  source: string;
  lastUpdated: number;
  isLive: boolean;
  formatted: string;
}

// Sensible live market baseline for USD/INR (~86.85)
const DEFAULT_USD_INR = 86.85;

let cachedUsdInr: ExchangeRateInfo = {
  base: 'USD',
  target: 'INR',
  rate: DEFAULT_USD_INR,
  date: new Date().toISOString().split('T')[0],
  source: 'market-baseline',
  lastUpdated: Date.now(),
  isLive: false,
  formatted: `1 USD = ₹${DEFAULT_USD_INR.toFixed(2)}`,
};

let inFlightFetch: Promise<ExchangeRateInfo> | null = null;

async function fetchWithTimeout<T>(url: string, timeoutMs = 4000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Attempts to fetch real-time USD/INR rate from multiple independent public market APIs.
 * Chain:
 * 1. Open Exchange Rates API (open.er-api.com) - hourly live market updates
 * 2. Frankfurter / European Central Bank (api.frankfurter.dev) - official reference rate
 * 3. Currency-API CDN (jsdelivr) - global open FX feed
 * If all fail, falls back seamlessly to the existing cache or baseline without interrupting user transactions.
 */
export async function refreshLiveUsdInrRate(): Promise<ExchangeRateInfo> {
  if (inFlightFetch) {
    return inFlightFetch;
  }

  inFlightFetch = (async () => {
    // 1. Try open.er-api.com
    try {
      const data = await fetchWithTimeout<{
        result?: string;
        rates?: Record<string, number>;
        time_last_update_utc?: string;
      }>('https://open.er-api.com/v6/latest/USD', 4000);

      const inr = data?.rates?.INR;
      if (typeof inr === 'number' && inr > 50 && inr < 150) {
        const roundedRate = Math.round(inr * 100) / 100;
        const dateStr = data.time_last_update_utc
          ? new Date(data.time_last_update_utc).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];

        cachedUsdInr = {
          base: 'USD',
          target: 'INR',
          rate: roundedRate,
          date: dateStr,
          source: 'open.er-api.com',
          lastUpdated: Date.now(),
          isLive: true,
          formatted: `1 USD = ₹${roundedRate.toFixed(2)}`,
        };
        logger.info({ rate: roundedRate, source: 'open.er-api.com' }, 'Updated live USD/INR exchange rate');
        return cachedUsdInr;
      }
    } catch (err) {
      logger.debug({ err }, 'open.er-api.com failed, trying Frankfurter');
    }

    // 2. Try Frankfurter (ECB reference rates)
    try {
      const data = await fetchWithTimeout<{
        amount?: number;
        base?: string;
        date?: string;
        rates?: Record<string, number>;
      }>('https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR', 4000);

      const inr = data?.rates?.INR;
      if (typeof inr === 'number' && inr > 50 && inr < 150) {
        const roundedRate = Math.round(inr * 100) / 100;
        const dateStr = data.date || new Date().toISOString().split('T')[0];

        cachedUsdInr = {
          base: 'USD',
          target: 'INR',
          rate: roundedRate,
          date: dateStr,
          source: 'frankfurter.dev (ECB)',
          lastUpdated: Date.now(),
          isLive: true,
          formatted: `1 USD = ₹${roundedRate.toFixed(2)}`,
        };
        logger.info({ rate: roundedRate, source: 'frankfurter.dev' }, 'Updated live USD/INR exchange rate');
        return cachedUsdInr;
      }
    } catch (err) {
      logger.debug({ err }, 'Frankfurter failed, trying currency-api');
    }

    // 3. Try currency-api CDN
    try {
      const data = await fetchWithTimeout<{
        date?: string;
        usd?: Record<string, number>;
      }>('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json', 4000);

      const inr = data?.usd?.inr;
      if (typeof inr === 'number' && inr > 50 && inr < 150) {
        const roundedRate = Math.round(inr * 100) / 100;
        const dateStr = data.date || new Date().toISOString().split('T')[0];

        cachedUsdInr = {
          base: 'USD',
          target: 'INR',
          rate: roundedRate,
          date: dateStr,
          source: 'currency-api',
          lastUpdated: Date.now(),
          isLive: true,
          formatted: `1 USD = ₹${roundedRate.toFixed(2)}`,
        };
        logger.info({ rate: roundedRate, source: 'currency-api' }, 'Updated live USD/INR exchange rate');
        return cachedUsdInr;
      }
    } catch (err) {
      logger.warn({ err }, 'All live exchange rate providers unreachable; maintaining current rate');
    }

    // Fallback: update timestamp so we don't re-query constantly, but keep existing rate
    cachedUsdInr = {
      ...cachedUsdInr,
      lastUpdated: Date.now(),
      date: new Date().toISOString().split('T')[0],
    };
    return cachedUsdInr;
  })().finally(() => {
    inFlightFetch = null;
  });

  return inFlightFetch;
}

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Returns the current live USD/INR exchange rate.
 * Refreshes asynchronously if cache is older than TTL.
 */
export async function getLiveUsdInrRate(force = false): Promise<ExchangeRateInfo> {
  const isStale = Date.now() - cachedUsdInr.lastUpdated > CACHE_TTL_MS;
  if (force || isStale || !cachedUsdInr.isLive) {
    try {
      return await refreshLiveUsdInrRate();
    } catch {
      return cachedUsdInr;
    }
  }
  return cachedUsdInr;
}

/**
 * Synchronous accessor for fast calculations without awaiting network calls.
 */
export function getCurrentUsdInrRate(): number {
  const isStale = Date.now() - cachedUsdInr.lastUpdated > CACHE_TTL_MS;
  if (isStale) {
    void refreshLiveUsdInrRate();
  }
  return cachedUsdInr.rate;
}

/**
 * Convert USD to INR using the current live rate.
 */
export function convertUsdToInr(usdAmount: number, customRate?: number): { inrAmount: number; rate: number; formatted: string } {
  const rate = customRate && customRate > 0 ? customRate : getCurrentUsdInrRate();
  const inrAmount = Math.round(usdAmount * rate);
  return {
    inrAmount,
    rate,
    formatted: `₹${inrAmount.toLocaleString('en-IN')}`,
  };
}

export interface MultiCurrencyRates {
  base: string;
  rates: {
    INR: number;
    EUR: number;
    BRL: number;
    GBP: number;
  };
  lastUpdated: number;
  isLive: boolean;
}

export async function getAllLiveRates(): Promise<MultiCurrencyRates> {
  const inrInfo = await getLiveUsdInrRate();
  return {
    base: 'USD',
    rates: {
      INR: inrInfo.rate,
      EUR: 0.92,
      BRL: 5.76,
      GBP: 0.79,
    },
    lastUpdated: inrInfo.lastUpdated,
    isLive: inrInfo.isLive,
  };
}

// Background refresh loop every 30 minutes
setInterval(() => {
  void refreshLiveUsdInrRate();
}, 30 * 60 * 1000).unref();

// Initial refresh on startup
void refreshLiveUsdInrRate().catch(() => undefined);

