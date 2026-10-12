// RealMarketProvider — live market data for the fixed-time terminal.
//
//   • Crypto + gold: real exchange prices from Binance (public, no key).
//       - history: Binance klines (1s klines aggregated for 5s/10s/15s/30s, native for 1m+)
//       - live:    <pair>@aggTrade stream (every executed trade) + <pair>@miniTicker (24h open)
//   • Forex: there is no free real-time FX feed, so FX pairs run as OTC markets (like
//     Quotex OTC): the simulated tape of DemoMarketProvider, anchored to the real
//     reference rate (ECB via frankfurter.dev) and re-anchored gently every hour.
//
// Everything else — the candle book for every timeframe, candle open/close events,
// per-asset enable/disable from the admin deck, quote history for settlement — is the
// shared engine in DemoMarketProvider, so the REST history, the socket stream and the
// settlement price always come from ONE series.
//
// If Binance is unreachable a symbol falls back to the simulated tape (tick.demo = true)
// so the platform keeps working; it switches back to live as soon as the feed recovers.
import WebSocket from 'ws';
import { AssetState, DemoMarketProvider, TIMEFRAMES, roundTo } from './DemoMarketProvider';
import { Candle, orderCandles } from './MarketDataProvider';
import { logger } from '../utils/logger';

/** Platform symbol → Binance spot pair (USDT-quoted; PAXG = 1 troy oz of gold). */
const BINANCE_PAIRS: Record<string, string> = {
  'BTC/USD': 'BTCUSDT',
  'ETH/USD': 'ETHUSDT',
  'SOL/USD': 'SOLUSDT',
  'BNB/USD': 'BNBUSDT',
  'XRP/USD': 'XRPUSDT',
  'LTC/USD': 'LTCUSDT',
  'XAU/USD': 'PAXGUSDT',
};

const BINANCE_REST = 'https://api.binance.com';
const BINANCE_WS = 'wss://stream.binance.com:9443/stream';
const FX_REF_URL = 'https://api.frankfurter.dev/v1/latest?base=USD';

const HISTORY_BARS = 240;
const NATIVE_INTERVALS: Record<string, string> = { '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1h', '4h': '4h', '1d': '1d' };
const SUB_MINUTE = ['5s', '10s', '15s', '30s'];
const FEED_STALE_MS = 15_000;      // no WS message for this long → reconnect
const REST_FALLBACK_MS = 2_000;    // poll REST while the WS is down
const FX_REFRESH_MS = 60 * 60_000; // reference-rate refresh

type Kline = [number, string, string, string, string, string, number, ...unknown[]];

async function getJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export class RealMarketProvider extends DemoMarketProvider {
  override readonly name = 'real-market-feed';
  override readonly isDemo = false;

  private ws: WebSocket | null = null;
  private wsReconnectTimer: NodeJS.Timeout | null = null;
  private watchdogTimer: NodeJS.Timeout | null = null;
  private fxTimer: NodeJS.Timeout | null = null;
  private lastWsMessageAt = 0;
  private restPolling = false;
  private running = false;
  /** latest real reference rate per OTC FX symbol */
  private fxRef = new Map<string, number>();

  constructor(intervalMs = 200) {
    super(intervalMs);
  }

  private pairOf(symbol: string): string | undefined {
    return BINANCE_PAIRS[symbol];
  }

  override async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.reloadAssets();

    // 1. anchor prices to the real market BEFORE any history is built
    await Promise.allSettled([this.fetchBinancePrices(), this.fetchFxRefs()]);

    // 2. history: real klines for exchange-traded symbols, simulated OTC path for the rest
    await Promise.allSettled([...this.states.values()].map((s) => this.seedSymbol(s)));
    for (const s of this.states.values()) this.seedHistory(s); // anything a kline fetch could not fill

    // 3. live streams + candle/tick loop
    this.connectWs();
    this.watchdogTimer = setInterval(() => this.watchdog(), 1000);
    this.watchdogTimer.unref?.();
    this.fxTimer = setInterval(() => { void this.fetchFxRefs().catch(() => undefined); }, FX_REFRESH_MS);
    this.fxTimer.unref?.();

    this.lastTickAt = Date.now();
    this.timer = setInterval(() => this.tickAll(), this.intervalMs);
    this.timer.unref?.();
    logger.info({ live: [...this.states.values()].filter((s) => s.live).map((s) => s.symbol) }, '[RealMarketProvider] started');
  }

  override async stop(): Promise<void> {
    this.running = false;
    await super.stop();
    for (const t of [this.wsReconnectTimer, this.watchdogTimer, this.fxTimer]) if (t) clearTimeout(t);
    this.wsReconnectTimer = this.watchdogTimer = this.fxTimer = null;
    if (this.ws) {
      try { this.ws.removeAllListeners(); this.ws.close(); } catch { /* noop */ }
      this.ws = null;
    }
  }

  /** Admin reload: keep live flags + real FX anchors (DB basePrice is only a cold-start default). */
  override async reloadAssets(): Promise<void> {
    await super.reloadAssets();
    for (const s of this.states.values()) {
      const ref = this.fxRef.get(s.symbol);
      if (ref) s.base = ref;
      else if (s.live) s.base = s.raw;
    }
  }

  // ───────────────────────────────────────────── history ──

  private async seedSymbol(s: AssetState): Promise<void> {
    const pair = this.pairOf(s.symbol);
    if (!pair || !s.live) return; // OTC: simulated path seeded by seedHistory()
    try {
      const book = new Map<string, Candle[]>();
      // native intervals
      await Promise.all(Object.entries(NATIVE_INTERVALS).map(async ([tf, iv]) => {
        const raw = await getJson<Kline[]>(`${BINANCE_REST}/api/v3/klines?symbol=${pair}&interval=${iv}&limit=${HISTORY_BARS}`);
        book.set(tf, raw.map((k) => this.klineToCandle(s.symbol, tf, k)));
      }));
      // sub-minute: page through 1s klines (1000 per request) and aggregate
      const needSec = HISTORY_BARS * Math.max(...SUB_MINUTE.map((tf) => TIMEFRAMES[tf] / 1000));
      const ones: Kline[] = [];
      let endTime = Date.now();
      while (ones.length < needSec) {
        const page = await getJson<Kline[]>(`${BINANCE_REST}/api/v3/klines?symbol=${pair}&interval=1s&limit=1000&endTime=${endTime}`);
        if (!page.length) break;
        ones.unshift(...page);
        endTime = Number(page[0][0]) - 1;
        if (page.length < 1000) break;
      }
      for (const tf of SUB_MINUTE) book.set(tf, this.aggregate(s.symbol, tf, ones));

      for (const [tf, list] of book) s.candles.set(tf, this.fillGaps(list, tf).slice(-HISTORY_BARS));
      // the live price wins over the kline close of the forming bar
      this.rollCandles(s, Date.now(), true);
      logger.info({ symbol: s.symbol }, '[RealMarketProvider] history loaded from Binance');
    } catch (err) {
      logger.warn({ symbol: s.symbol, err: String(err) }, '[RealMarketProvider] kline history unavailable — using simulated history');
      s.candles = new Map();
    }
  }

  private klineToCandle(symbol: string, timeframe: string, k: Kline): Candle {
    const ms = TIMEFRAMES[timeframe];
    const openTime = Number(k[0]);
    return {
      symbol, timeframe, openTime, closeTime: openTime + ms,
      open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]),
    };
  }

  private aggregate(symbol: string, timeframe: string, ones: Kline[]): Candle[] {
    const ms = TIMEFRAMES[timeframe];
    const out: Candle[] = [];
    for (const k of ones) {
      const bucket = Math.floor(Number(k[0]) / ms) * ms;
      const o = parseFloat(k[1]); const h = parseFloat(k[2]); const l = parseFloat(k[3]); const c = parseFloat(k[4]); const v = parseFloat(k[5]);
      const cur = out[out.length - 1];
      if (!cur || cur.openTime !== bucket) {
        out.push({ symbol, timeframe, openTime: bucket, closeTime: bucket + ms, open: o, high: h, low: l, close: c, volume: v });
      } else {
        if (h > cur.high) cur.high = h;
        if (l < cur.low) cur.low = l;
        cur.close = c;
        cur.volume += v;
      }
    }
    return out;
  }

  /** Binance skips 1s klines with no trades — bridge holes with flat candles so the series is continuous. */
  private fillGaps(list: Candle[], timeframe: string): Candle[] {
    const ms = TIMEFRAMES[timeframe];
    const sorted = orderCandles(list);
    const out: Candle[] = [];
    for (const c of sorted) {
      const prev = out[out.length - 1];
      if (prev) {
        let t = prev.openTime + ms;
        let guard = 0;
        while (t < c.openTime && guard++ < HISTORY_BARS) {
          out.push({ symbol: c.symbol, timeframe, openTime: t, closeTime: t + ms, open: prev.close, high: prev.close, low: prev.close, close: prev.close, volume: 0 });
          t += ms;
        }
      }
      out.push(c);
    }
    return out;
  }

  // ───────────────────────────────────────────── live feed ──

  private applyPrice(s: AssetState, price: number) {
    if (!Number.isFinite(price) || price <= 0) return;
    s.raw = price;
    s.price = roundTo(price, s.pip);
    if (!s.live) {
      s.live = true;
      logger.info({ symbol: s.symbol }, '[RealMarketProvider] live feed active');
      // feed (re)appeared after the symbol ran on simulated history: rebuild history around
      // the real price right away, then replace it with real klines
      if (s.candles.size) {
        s.base = price;
        s.candles = new Map();
        this.seedHistory(s);
        void this.seedSymbol(s);
      }
    }
  }

  private async fetchBinancePrices(): Promise<void> {
    const pairs = [...this.states.values()].map((s) => this.pairOf(s.symbol)).filter(Boolean) as string[];
    if (!pairs.length) return;
    try {
      const rows = await getJson<Array<{ symbol: string; lastPrice: string; openPrice: string }>>(
        `${BINANCE_REST}/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(pairs))}`,
      );
      for (const r of rows) {
        const s = [...this.states.values()].find((x) => this.pairOf(x.symbol) === r.symbol);
        if (!s) continue;
        this.applyPrice(s, parseFloat(r.lastPrice));
        const o = parseFloat(r.openPrice);
        if (o > 0) s.open24h = o;
        s.base = s.raw;
      }
    } catch (err) {
      logger.warn({ err: String(err) }, '[RealMarketProvider] Binance REST unavailable');
    }
  }

  private connectWs() {
    if (!this.running) return;
    const streams = [...this.states.values()]
      .map((s) => this.pairOf(s.symbol))
      .filter(Boolean)
      .flatMap((p) => [`${p!.toLowerCase()}@aggTrade`, `${p!.toLowerCase()}@miniTicker`]);
    if (!streams.length) return;

    const ws = new WebSocket(`${BINANCE_WS}?streams=${streams.join('/')}`);
    this.ws = ws;
    ws.on('open', () => {
      this.lastWsMessageAt = Date.now();
      logger.info('[RealMarketProvider] Binance stream connected');
    });
    ws.on('message', (msg) => {
      this.lastWsMessageAt = Date.now();
      try {
        const { data: d } = JSON.parse(msg.toString()) as { data?: { e: string; s: string; p?: string; c?: string; o?: string } };
        if (!d) return;
        const s = [...this.states.values()].find((x) => this.pairOf(x.symbol) === d.s);
        if (!s) return;
        if (d.e === 'aggTrade' && d.p) this.applyPrice(s, parseFloat(d.p));
        else if (d.e === '24hrMiniTicker' && d.o) {
          const o = parseFloat(d.o);
          if (o > 0) s.open24h = o;
        }
      } catch { /* malformed frame */ }
    });
    ws.on('error', (err) => logger.warn({ err: err.message }, '[RealMarketProvider] Binance stream error'));
    ws.on('close', () => {
      if (this.ws === ws) this.ws = null;
      if (!this.running) return;
      if (this.wsReconnectTimer) clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = setTimeout(() => this.connectWs(), 2000);
    });
  }

  private watchdog() {
    if (!this.running) return;
    const silentFor = Date.now() - this.lastWsMessageAt;
    if (this.ws && this.ws.readyState === WebSocket.OPEN && silentFor > FEED_STALE_MS) {
      logger.warn('[RealMarketProvider] Binance stream silent — reconnecting');
      try { this.ws.terminate(); } catch { /* noop */ }
    }
    // while the stream is down keep prices real via REST
    if (silentFor > REST_FALLBACK_MS && !this.restPolling) {
      this.restPolling = true;
      void this.fetchBinancePrices().finally(() => { this.restPolling = false; });
    }
  }

  // ───────────────────────────────────────────── OTC forex ──

  private async fetchFxRefs(): Promise<void> {
    try {
      const data = await getJson<{ rates: Record<string, number> }>(FX_REF_URL);
      const r = data?.rates ?? {};
      const usdPer = (ccy: string) => (r[ccy] ? 1 / r[ccy] : null); // USD base → XXX/USD
      const refs: Record<string, number | null> = {
        'EUR/USD': usdPer('EUR'),
        'GBP/USD': usdPer('GBP'),
        'AUD/USD': usdPer('AUD'),
        'NZD/USD': usdPer('NZD'),
        'USD/JPY': r.JPY ?? null,
        'USD/CHF': r.CHF ?? null,
        'USD/CAD': r.CAD ?? null,
        'EUR/CHF': r.EUR && r.CHF ? r.CHF / r.EUR : null,
        'EUR/GBP': r.EUR && r.GBP ? r.GBP / r.EUR : null,
      };
      for (const [symbol, ref] of Object.entries(refs)) {
        if (!ref || !Number.isFinite(ref)) continue;
        this.fxRef.set(symbol, ref);
        const s = this.states.get(symbol);
        if (!s || s.live) continue;
        const first = !s.candles.size;
        s.base = ref; // mean reversion pulls the OTC tape toward the real rate — no visible jump
        if (first) {
          s.raw = ref;
          s.price = roundTo(ref, s.pip);
          s.open24h = s.price;
        }
      }
    } catch (err) {
      logger.warn({ err: String(err) }, '[RealMarketProvider] FX reference rates unavailable — using asset base prices');
    }
  }
}
