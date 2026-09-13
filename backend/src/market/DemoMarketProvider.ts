// DemoMarketProvider — fixed-time-trade style market feed (Quotex-like behaviour).
// CLEARLY SIMULATED. Never presented as real brokerage prices.
//
// Behaviour this provider guarantees (the terminal, the ticket and the settlement
// engine all rely on it):
//   • quotes update several times per second (default 250 ms) — the live candle
//     visibly "breathes" like on Quotex instead of stepping once a second;
//   • one price series feeds ALL timeframes: 5s · 10s · 15s · 30s · 1m · 5m · 15m ·
//     30m · 1h · 4h · 1d — every candle is a strict [open, close) time bucket that
//     is aligned to the wall clock (a 1m candle always starts at :00);
//   • candle open == previous candle close (no gaps between candles);
//   • the finished candle and the newly opened one are pushed to subscribers
//     (`onCandle`) the instant a bucket closes — clients never have to guess when a
//     candle rolls;
//   • price dynamics are a mean-reverting random walk with volatility clustering,
//     momentum bursts and a hard price band around the asset's base price so the
//     chart looks like a real FX/crypto tape and can never run off to zero/∞;
//   • every quote is rounded to the instrument's pip size (5 decimals for FX,
//     3 for JPY pairs, 2 for crypto/metals) — exactly like a broker feed, which
//     also makes ties genuinely possible (Quotex refunds on a tie).
import { Candle, MarketDataProvider, Tick, orderCandles } from './MarketDataProvider';
import { prisma } from '../config/database';
import { cacheGet, cacheSet } from '../config/redis';

interface AssetState {
  symbol: string;
  price: number;         // current mid (already rounded to pip)
  raw: number;           // un-rounded internal price (drives the walk)
  base: number;          // anchor for mean reversion / bands
  open24h: number;
  volatility: number;    // per-1s sigma (relative), from Asset.volatility
  spread: number;
  enabled: boolean;
  pip: number;           // price precision step
  // dynamics
  vol: number;           // current instantaneous volatility multiplier (clustering)
  momentum: number;      // short-lived directional bias
  candles: Map<string, Candle[]>; // timeframe -> candles
}

export const TIMEFRAMES: Record<string, number> = {
  '5s': 5_000, '10s': 10_000, '15s': 15_000, '30s': 30_000,
  '1m': 60_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000,
  '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000,
};
export const TIMEFRAME_KEYS = Object.keys(TIMEFRAMES);
export function timeframeMs(tf: string): number | null {
  return TIMEFRAMES[tf] ?? null;
}

/** Instrument pip / display precision (broker convention). */
export function pipFor(symbol: string, price: number): number {
  if (/JPY/.test(symbol)) return 0.001;
  if (price >= 1000) return 0.01;
  if (price >= 10) return 0.001;
  return 0.00001;
}
function roundTo(v: number, step: number): number {
  const d = Math.max(0, Math.round(-Math.log10(step)));
  return Number((Math.round(v / step) * step).toFixed(d));
}

/**
 * Asset.volatility → per-second relative sigma. Calibrated so a 1-minute candle on
 * EUR/CHF (vol 0.0005) spans ≈10–25 pips and BTC/USD (vol 0.0035) ≈ $60–150, i.e.
 * the pace of a real broker feed (≈0.3 % daily sigma FX, ≈2.5 % crypto).
 */
const SIGMA_PER_SEC = 0.03;
/** Mean-reversion rate toward Asset.basePrice (per second). Half-life ≈ 1 day — keeps the tape in a realistic band without a visible "pull". */
const KAPPA_PER_SEC = 0.000008;
const HISTORY_BARS = 240;           // bars seeded per timeframe on boot
const MAX_BARS = 1500;              // kept in memory per timeframe
const CANDLE_CACHE_TTL = 60 * 60 * 6;

export type CandleListener = (c: Candle, event: 'update' | 'close' | 'open') => void;

export class DemoMarketProvider implements MarketDataProvider {
  readonly name = 'demo';
  readonly isDemo = true;
  private states = new Map<string, AssetState>();
  private timer: NodeJS.Timeout | null = null;
  private listeners: Array<(t: Tick) => void> = [];
  private candleListeners: CandleListener[] = [];
  private intervalMs: number;
  private lastTickAt = 0;

  constructor(intervalMs = 40) {
    this.intervalMs = Math.max(20, intervalMs);
  }

  onTick(cb: (tick: Tick) => void): void {
    this.listeners.push(cb);
  }
  /** Candle lifecycle stream: 'close' when a bucket finishes, 'open' for the new bucket. */
  onCandle(cb: CandleListener): void {
    this.candleListeners.push(cb);
  }

  async start(): Promise<void> {
    await this.reloadAssets();
    for (const s of this.states.values()) this.seedHistory(s);
    if (this.timer) return;
    this.lastTickAt = Date.now();
    this.timer = setInterval(() => this.tickAll(), this.intervalMs);
    this.timer.unref?.();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async reloadAssets(): Promise<void> {
    try {
      const assets = await prisma.asset.findMany();
      for (const a of assets) {
        const prev = this.states.get(a.symbol);
        const base = Number(a.basePrice);
        const pip = pipFor(a.symbol, base);
        this.states.set(a.symbol, {
          symbol: a.symbol,
          price: prev?.price ?? roundTo(base, pip),
          raw: prev?.raw ?? base,
          base,
          open24h: prev?.open24h ?? base,
          volatility: Number(a.volatility),
          spread: Number(a.spread),
          enabled: a.enabled,
          pip,
          vol: prev?.vol ?? 1,
          momentum: prev?.momentum ?? 0,
          candles: prev?.candles ?? new Map(),
        });
      }
    } catch {
      // DB unavailable (unit tests) — use built-in defaults
      if (this.states.size === 0) {
        const defaults: Array<[string, number, number]> = [
          ['BTC/USD', 67432.5, 0.0035],
          ['ETH/USD', 3521.8, 0.003],
          ['EUR/USD', 1.0862, 0.0006],
          ['GBP/USD', 1.2731, 0.0007],
          ['USD/JPY', 155.42, 0.0008],
          ['XAU/USD', 2384.6, 0.0012],
          ['EUR/CHF', 0.9408, 0.0005],
        ];
        for (const [symbol, price, vol] of defaults) {
          const pip = pipFor(symbol, price);
          this.states.set(symbol, { symbol, price: roundTo(price, pip), raw: price, base: price, open24h: price, volatility: vol, spread: 0.0004, enabled: true, pip, vol: 1, momentum: 0, candles: new Map() });
        }
      }
    }
  }

  setEnabled(symbol: string, enabled: boolean) {
    const s = this.states.get(symbol);
    if (s) s.enabled = enabled;
  }

  /** Test hook: force a price (used by integration tests to simulate market moves). */
  testSetPrice(symbol: string, price: number) {
    const s = this.states.get(symbol);
    if (s) {
      s.raw = price;
      s.price = roundTo(price, s.pip);
      this.rollCandles(s, Date.now());
      this.emit(s);
    }
  }

  getSymbols(): string[] {
    return [...this.states.keys()];
  }
  getTimeframes(): string[] {
    return TIMEFRAME_KEYS;
  }

  async getTick(symbol: string): Promise<Tick | null> {
    const s = this.states.get(symbol);
    if (!s || !s.enabled) return null;
    return this.toTick(s);
  }

  async getTicks(symbols: string[]): Promise<Tick[]> {
    const out: Tick[] = [];
    for (const sym of symbols) {
      const t = await this.getTick(sym);
      if (t) out.push(t);
    }
    return out;
  }

  async getCandles(symbol: string, timeframe: string, limit = 200): Promise<Candle[]> {
    const s = this.states.get(symbol);
    if (!s || !TIMEFRAMES[timeframe]) return [];
    const arr = s.candles.get(timeframe);
    if (arr && arr.length) return orderCandles(arr).slice(-limit);
    // cold path (asset added at runtime): try the cache, else seed now
    try {
      const cached = await cacheGet(`ax:candles:${symbol}:${timeframe}`);
      if (cached) return orderCandles(JSON.parse(cached) as Candle[]).slice(-limit);
    } catch { /* ignore */ }
    this.seedHistory(s);
    return orderCandles(s.candles.get(timeframe) ?? []).slice(-limit);
  }

  // ───────────────────────────────────────────── history seeding ──

  /**
   * Seeds every timeframe from ONE simulated price path so all timeframes agree
   * with each other, candles are gap-free, and the last candle of every timeframe
   * ends at the current price.
   *
   * Memory-bounded: the path is generated backwards from "now" in tiers — fine
   * (1 s) steps for the most recent stretch, coarser steps further back — so a
   * 1d chart with 240 bars costs ~thousands of points instead of ~20 million.
   */
  private seedHistory(s: AssetState) {
    const missing = Object.keys(TIMEFRAMES).filter((tf) => !(s.candles.get(tf)?.length));
    if (!missing.length) return;

    const now = Date.now();
    const need = Math.max(...missing.map((tf) => TIMEFRAMES[tf] * HISTORY_BARS));
    // tiers: [stepMs, spanMs] from newest to oldest
    const tiers: Array<[number, number]> = [
      [1_000, 2 * 3_600_000],          // last 2h at 1s  → 7,200 pts
      [15_000, 24 * 3_600_000],        // next 24h at 15s → 5,760 pts
      [300_000, 7 * 86_400_000],       // next 7d at 5m  → 2,016 pts
      [3_600_000, Number.POSITIVE_INFINITY], // beyond at 1h
    ];
    // Build the (time, price) path walking BACKWARDS from the current price.
    const pts: Array<[number, number]> = [];
    let t = now;
    let p = s.raw;
    let vol = 1;
    let mom = 0;
    pts.push([t, p]);
    let tierIdx = 0;
    let tierUsed = 0;
    while (now - t < need && tierIdx < tiers.length) {
      const [stepMs, spanMs] = tiers[tierIdx];
      if (tierUsed >= spanMs) { tierIdx++; tierUsed = 0; continue; }
      const stepSec = stepMs / 1000;
      const sigma = s.volatility * SIGMA_PER_SEC * Math.sqrt(stepSec);
      vol = clamp(vol + (Math.random() - 0.5) * 0.25 + (1 - vol) * 0.05, 0.4, 3.2);
      mom = mom * 0.96 + (Math.random() - 0.5) * 0.35;
      // walking backwards: the EARLIER price is pulled toward the base price (time-symmetric OU process)
      const revert = ((s.base - p) / s.base) * Math.min(0.5, KAPPA_PER_SEC * stepSec);
      const shock = gauss() * sigma * vol + mom * sigma * 0.6 + revert;
      p = clamp(p * Math.exp(shock), s.base * 0.6, s.base * 1.6);
      t -= stepMs;
      tierUsed += stepMs;
      pts.push([t, p]);
    }
    pts.reverse();

    for (const tf of missing) {
      const ms = TIMEFRAMES[tf];
      const candles: Candle[] = [];
      let cur: Candle | null = null;
      // only the part of the path this timeframe needs (bounded work per tf — a 5s chart must
      // not walk 240 days of points)
      const cutoff = Math.floor((now - (HISTORY_BARS + 1) * ms) / ms) * ms;
      let startIdx = 0;
      while (startIdx < pts.length - 1 && pts[startIdx][0] < cutoff) startIdx++;
      for (let i = startIdx; i < pts.length; i++) {
        const [ts, raw] = pts[i];
        const price = roundTo(raw, s.pip);
        const bucket = Math.floor(ts / ms) * ms;
        if (!cur || cur.openTime !== bucket) {
          if (cur) {
            candles.push(cur);
            // bridge skipped buckets (coarse tiers) with flat candles so the series has no holes
            let b = cur.openTime + ms;
            let guard = 0;
            while (b < bucket && guard++ < HISTORY_BARS) {
              candles.push({ symbol: s.symbol, timeframe: tf, open: cur.close, high: cur.close, low: cur.close, close: cur.close, volume: 0, openTime: b, closeTime: b + ms });
              b += ms;
            }
          }
          const open: number = cur ? cur.close : price; // gap-free
          cur = { symbol: s.symbol, timeframe: tf, open, high: Math.max(open, price), low: Math.min(open, price), close: price, volume: 0, openTime: bucket, closeTime: bucket + ms };
        } else {
          if (price > cur.high) cur.high = price;
          if (price < cur.low) cur.low = price;
          cur.close = price;
        }
        cur.volume += 1 + Math.random() * 3;
      }
      if (cur) candles.push(cur);
      s.candles.set(tf, candles.slice(-HISTORY_BARS));
    }
    s.price = roundTo(s.raw, s.pip);
    s.open24h = this.closeAt(s, now - 86_400_000) ?? s.price;
    // make sure the "current" bucket for every tf exists and ends at the live price
    this.rollCandles(s, now, true);
  }

  private closeAt(s: AssetState, ts: number): number | null {
    const arr = s.candles.get('5m') ?? s.candles.get('1m') ?? [];
    let best: Candle | null = null;
    for (const c of arr) { if (c.openTime <= ts) best = c; else break; }
    return best ? best.close : null;
  }

  // ───────────────────────────────────────────── live dynamics ──

  private tickAll() {
    const now = Date.now();
    const dt = Math.min(5, Math.max(0.02, (now - this.lastTickAt) / 1000)); // seconds since last step
    this.lastTickAt = now;
    for (const s of this.states.values()) {
      if (!s.enabled) {
        // halted: keep candles rolling flat so the chart has no holes when it resumes
        this.rollCandles(s, now);
        continue;
      }
      this.step(s, dt);
      this.rollCandles(s, now);
      this.emit(s);
    }
  }

  /** One stochastic step with Quotex-like micro-pip realism. */
  private step(s: AssetState, dt: number) {
    // Evolve momentum smoothly (mean-reverting OU process for gentle swings)
    s.momentum = s.momentum * Math.pow(0.85, dt) + (Math.random() - 0.5) * 0.4 * Math.sqrt(dt);
    s.momentum = clamp(s.momentum, -1.2, 1.2);

    // Mean-reversion pull towards base price if price drifts too far (>1.5%)
    const pctDiff = (s.raw - s.base) / s.base;
    const meanPull = -pctDiff * 0.02 * dt;

    // Determine unit step size in terms of fractional pips (sub-pip precision for ultra-fluid movement)
    let unitStep = s.pip * 0.2;
    if (/BTC/.test(s.symbol)) {
      unitStep = 0.05; // $0.05 micro-steps
    } else if (/ETH/.test(s.symbol)) {
      unitStep = 0.01; // $0.01 micro-steps
    } else if (/XAU/.test(s.symbol)) {
      unitStep = 0.01; // $0.01 micro-steps
    } else if (/JPY/.test(s.symbol)) {
      unitStep = 0.0002; // 0.2 JPY pip
    } else {
      unitStep = 0.000002; // 0.2 FX pip (sub-pipette precision)
    }

    // Organic continuous Brownian walk with gentle momentum
    const r = Math.random();
    let pips = 0;
    if (r > 0.15) {
      // Direction bias from momentum + mean reversion
      const upProb = clamp(0.5 + s.momentum * 0.25 + meanPull * 10, 0.15, 0.85);
      const dir = Math.random() < upProb ? 1 : -1;

      if (r < 0.70) {
        pips = dir * 1;
      } else if (r < 0.92) {
        pips = dir * 2;
      } else {
        pips = dir * 3;
      }
    }

    if (pips !== 0) {
      s.raw = s.raw + pips * unitStep;
      // Soft boundary clamp around base price (within ±5% for FX, ±15% for crypto)
      const maxBand = /BTC|ETH/.test(s.symbol) ? 0.20 : 0.05;
      s.raw = clamp(s.raw, s.base * (1 - maxBand), s.base * (1 + maxBand));
      s.price = roundTo(s.raw, s.pip * 0.1);
    }
  }

  /**
   * Aligns every timeframe's live candle with `now`.
   * If a bucket boundary was crossed: closes the previous candle (emits 'close'),
   * opens the new one at the previous close (emits 'open'). Otherwise updates OHLC.
   * Handles long gaps (process paused) by inserting flat bridging candles so there
   * are never holes in the series.
   */
  private rollCandles(s: AssetState, now: number, silent = false) {
    for (const [tf, ms] of Object.entries(TIMEFRAMES)) {
      const arr = s.candles.get(tf) ?? [];
      const bucket = Math.floor(now / ms) * ms;
      let last = arr[arr.length - 1];
      if (!last) {
        last = { symbol: s.symbol, timeframe: tf, open: s.price, high: s.price, low: s.price, close: s.price, volume: 0, openTime: bucket, closeTime: bucket + ms };
        arr.push(last);
        s.candles.set(tf, arr);
        if (!silent) this.emitCandle(last, 'open');
        continue;
      }
      if (last.openTime === bucket) {
        const changed = last.close !== s.price || s.price > last.high || s.price < last.low;
        last.close = s.price;
        if (s.price > last.high) last.high = s.price;
        if (s.price < last.low) last.low = s.price;
        last.volume += 0.25 + Math.random();
        if (changed && !silent) this.emitCandle(last, 'update');
        continue;
      }
      if (last.openTime > bucket) continue; // clock went backwards — ignore
      // close the finished candle
      if (!silent) this.emitCandle(last, 'close');
      // bridge any skipped buckets with flat candles (max a few hundred to bound memory)
      let t = last.openTime + ms;
      let guard = 0;
      while (t < bucket && guard++ < 400) {
        const flat: Candle = { symbol: s.symbol, timeframe: tf, open: last.close, high: last.close, low: last.close, close: last.close, volume: 0, openTime: t, closeTime: t + ms };
        arr.push(flat);
        last = flat;
        t += ms;
      }
      const open = last.close; // gap-free: new open == previous close
      const fresh: Candle = { symbol: s.symbol, timeframe: tf, open, high: Math.max(open, s.price), low: Math.min(open, s.price), close: s.price, volume: 0.25, openTime: bucket, closeTime: bucket + ms };
      arr.push(fresh);
      if (arr.length > MAX_BARS) arr.splice(0, arr.length - MAX_BARS);
      s.candles.set(tf, arr);
      if (!silent) {
        this.emitCandle(fresh, 'open');
        // persist finished 1m+ candles (best effort, async)
        if (ms >= 60_000) {
          const done = arr[arr.length - 2];
          if (done) void this.persistCandle(done).catch(() => undefined);
        }
        void cacheSet(`ax:candles:${s.symbol}:${tf}`, JSON.stringify(arr.slice(-300)), CANDLE_CACHE_TTL);
      }
    }
    if (!silent) void cacheSet(`ax:tick:${s.symbol}`, JSON.stringify(this.toTick(s)), 30);
  }

  private async persistCandle(c: Candle) {
    try {
      await prisma.marketCandle.upsert({
        where: { symbol_timeframe_openTime: { symbol: c.symbol, timeframe: c.timeframe, openTime: new Date(c.openTime) } },
        update: { high: c.high, low: c.low, close: c.close, volume: c.volume },
        create: { symbol: c.symbol, timeframe: c.timeframe, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume, openTime: new Date(c.openTime), closeTime: new Date(c.closeTime) },
      });
    } catch { /* best effort */ }
  }

  private toTick(s: AssetState): Tick {
    const half = (s.spread * s.price) / 2;
    const mid = s.price;
    return {
      symbol: s.symbol,
      bid: roundTo(mid - half, s.pip * 0.1),
      ask: roundTo(mid + half, s.pip * 0.1),
      mid,
      spread: s.spread,
      changePct24h: s.open24h ? ((mid - s.open24h) / s.open24h) * 100 : 0,
      ts: Date.now(),
      demo: true,
    };
  }

  private emit(s: AssetState) {
    const t = this.toTick(s);
    for (const l of this.listeners) {
      try { l(t); } catch { /* ignore */ }
    }
  }
  private emitCandle(c: Candle, event: 'update' | 'close' | 'open') {
    if (event === 'update') return; // per-tick OHLC is derived client-side from ticks; only lifecycle events go out
    for (const l of this.candleListeners) {
      try { l({ ...c }, event); } catch { /* ignore */ }
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
/** Standard normal via Box–Muller. */
function gauss(): number {
  let u = 0; let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}
