// Market data provider abstraction — demo today, external feed later via same interface.
export interface Tick {
  symbol: string;
  bid: number;
  ask: number;
  mid: number;
  spread: number;
  changePct24h: number;
  ts: number;
  demo: boolean;
}

export interface CandleInput {
  symbol: string;
  timeframe: string; // 1m 5m 15m 1h 4h 1d
  openTime: number;
}

export interface MarketDataProvider {
  readonly name: string;
  readonly isDemo: boolean;
  start(): Promise<void>;
  stop(): Promise<void>;
  getTick(symbol: string): Promise<Tick | null>;
  getTicks(symbols: string[]): Promise<Tick[]>;
  getCandles(symbol: string, timeframe: string, limit?: number): Promise<Candle[]>;
  onTick(cb: (tick: Tick) => void): void;
}

/** Guarantee strictly time-ascending, deduped candles (chart libs hard-require this).
 * Defensive: providers should already be ordered, but clock steps / merges / cache
 * quirks must never reach clients as disordered data. */
export function orderCandles(candles: Candle[]): Candle[] {
  if (candles.length < 2) return candles.slice();
  const sorted = candles.slice().sort((a, b) => a.openTime - b.openTime);
  const out: Candle[] = [];
  for (const c of sorted) {
    if (!Number.isFinite(c.openTime)) continue;
    const prev = out[out.length - 1];
    if (prev && prev.openTime === c.openTime) out[out.length - 1] = c;
    else out.push(c);
  }
  return out;
}

export interface Candle {
  symbol: string;
  timeframe: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openTime: number;
  closeTime: number;
}
