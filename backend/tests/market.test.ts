// Candle engine invariants — what the Quotex-style terminal relies on.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DemoMarketProvider, TIMEFRAMES, TIMEFRAME_KEYS, pipFor } from '../src/market/DemoMarketProvider';
import type { Candle } from '../src/market/MarketDataProvider';

describe('DemoMarketProvider candles', () => {
  const provider = new DemoMarketProvider(60_000); // manual stepping via testSetPrice
  beforeAll(async () => { await provider.start(); });
  afterAll(async () => { await provider.stop(); });

  it('offers second-level timeframes like a fixed-time-trade terminal', () => {
    expect(TIMEFRAME_KEYS).toEqual(['5s', '10s', '15s', '30s', '1m', '5m', '15m', '30m', '1h', '4h', '1d']);
    expect(provider.getTimeframes()).toEqual(TIMEFRAME_KEYS);
  });

  it('seeds history for every timeframe with clock-aligned, gap-free, strictly ascending buckets', async () => {
    for (const tf of TIMEFRAME_KEYS) {
      const ms = TIMEFRAMES[tf];
      const candles = await provider.getCandles('EUR/USD', tf, 240);
      expect(candles.length).toBeGreaterThan(50);
      for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        expect(c.openTime % ms).toBe(0);                 // aligned to the wall clock
        expect(c.closeTime).toBe(c.openTime + ms);
        expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close));
        expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close));
        if (i > 0) {
          expect(c.openTime).toBe(candles[i - 1].openTime + ms); // no holes
          expect(c.open).toBe(candles[i - 1].close);             // no gaps
        }
      }
      // the last candle is the live bucket
      expect(candles[candles.length - 1].openTime).toBe(Math.floor(Date.now() / ms) * ms);
    }
  });

  it('keeps all timeframes consistent: every tf ends at the same live price', async () => {
    const tick = await provider.getTick('EUR/USD');
    for (const tf of TIMEFRAME_KEYS) {
      const candles = await provider.getCandles('EUR/USD', tf, 5);
      expect(candles[candles.length - 1].close).toBe(tick!.mid);
    }
  });

  it('rounds quotes to the instrument pip', async () => {
    expect(pipFor('EUR/USD', 1.08)).toBe(0.00001);
    expect(pipFor('USD/JPY', 155)).toBe(0.001);
    expect(pipFor('BTC/USD', 67000)).toBe(0.01);
    expect(pipFor('XAU/USD', 2384)).toBe(0.01);
    const t = await provider.getTick('EUR/USD');
    expect(Number(t!.mid.toFixed(5))).toBe(t!.mid);
    const b = await provider.getTick('BTC/USD');
    expect(Number(b!.mid.toFixed(2))).toBe(b!.mid);
  });

  it('updates the live candle of every timeframe on a price move', async () => {
    const before = await provider.getCandles('BTC/USD', '5s', 1);
    const px = before[0].high + 50;
    provider.testSetPrice('BTC/USD', px);
    for (const tf of TIMEFRAME_KEYS) {
      const [c] = (await provider.getCandles('BTC/USD', tf, 1));
      expect(c.close).toBe(px);
      expect(c.high).toBeGreaterThanOrEqual(px);
    }
  });

  it('emits close/open lifecycle events when a bucket rolls and opens the new candle at the previous close', async () => {
    const events: Array<{ c: Candle; e: string }> = [];
    provider.onCandle((c, e) => { if (c.symbol === 'ETH/USD' && c.timeframe === '5s') events.push({ c, e }); });
    // wait for a 5s boundary to pass, then poke the price so rollCandles runs
    const ms = 5000;
    const untilNext = ms - (Date.now() % ms) + 30;
    await new Promise((r) => setTimeout(r, untilNext));
    const last = (await provider.getCandles('ETH/USD', '5s', 1))[0];
    provider.testSetPrice('ETH/USD', last.close * 1.001);
    const closeEv = [...events].reverse().find((x) => x.e === 'close');
    const openEv = [...events].reverse().find((x) => x.e === 'open');
    expect(closeEv).toBeTruthy();
    expect(openEv).toBeTruthy();
    expect(openEv!.c.openTime).toBe(closeEv!.c.openTime + ms);
    expect(openEv!.c.open).toBe(closeEv!.c.close);
  }, 10_000);
});
