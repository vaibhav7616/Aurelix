// Price-safety rules: stale quotes, settlement price resolution, exposure, UTC day.
import { describe, it, expect } from 'vitest';
import { DemoMarketProvider } from '../src/market/DemoMarketProvider';
import { exceedsExposure, resolveClosePrice } from '../src/trading/optionsEngine';
import { utcDayStart } from '../src/utils/time';
import { env } from '../src/config/env';

type State = { history: Array<[number, number]>; feedAt: number; live: boolean; price: number };
class TestProvider extends DemoMarketProvider {
  state(symbol: string) { return (this as unknown as { states: Map<string, State> }).states.get(symbol)!; }
  record(symbol: string, ts: number) { (this as unknown as { recordPrice(s: State, ts: number): void }).recordPrice(this.state(symbol), ts); }
}

describe('quote freshness', () => {
  it('priceAt returns the quote live at the instant, but not across a stale gap', async () => {
    const p = new TestProvider(1000);
    await p.reloadAssets();
    const s = p.state('EUR/USD');
    const t0 = Date.now();
    s.history = [[t0 - 20_000, 1.1], [t0 - 1_000, 1.2]];
    expect(p.priceAt('EUR/USD', t0 - 500)).toBe(1.2);
    // last quote before this instant is older than MAX_QUOTE_AGE_MS → no price
    expect(p.priceAt('EUR/USD', t0 - 20_000 + env.MAX_QUOTE_AGE_MS + 1)).toBeNull();
  });

  it('a live symbol with a silent feed stops recording quotes and reports its age', async () => {
    const p = new TestProvider(1000);
    await p.reloadAssets();
    const s = p.state('BTC/USD');
    s.live = true;
    s.history = [];
    s.feedAt = Date.now() - env.MAX_QUOTE_AGE_MS - 1000;
    p.record('BTC/USD', Date.now());
    expect(s.history).toHaveLength(0);
    expect(p.quoteAgeMs('BTC/USD')!).toBeGreaterThan(env.MAX_QUOTE_AGE_MS);
  });
});

describe('resolveClosePrice', () => {
  it('refunds (settles at entry) when no trustworthy price exists', async () => {
    const r = await resolveClosePrice('NO/SUCH', new Date(Date.now() - 60_000), 1.2345, new Date());
    expect(r).toEqual({ price: 1.2345, source: 'REFUND' });
  });
});

describe('exceedsExposure', () => {
  it('blocks a trade that pushes the imbalance past the limit', () => {
    expect(exceedsExposure(900, 0, 'UP', 200, 1000)).toBe(true);
  });
  it('always allows a trade that reduces the imbalance', () => {
    expect(exceedsExposure(5000, 0, 'DOWN', 200, 1000)).toBe(false);
  });
  it('allows trades within the limit', () => {
    expect(exceedsExposure(300, 100, 'UP', 500, 1000)).toBe(false);
  });
});

describe('utcDayStart', () => {
  it('is midnight UTC of the same UTC date', () => {
    expect(utcDayStart(new Date('2026-10-31T23:30:00-05:00')).toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });
});
