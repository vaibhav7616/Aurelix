// MarketService — owns provider lifecycle, tick fan-out, candle reads.
import { env } from '../config/env';
import { DemoMarketProvider } from '../market/DemoMarketProvider';
import { RealMarketProvider } from '../market/RealMarketProvider';
import { MarketDataProvider, Tick } from '../market/MarketDataProvider';
import { onMarketTick } from '../trading/slTpMonitor';
import { onPendingTick } from '../trading/pendingEngine';
import { broadcastTick, emitCandle } from '../websocket/socketServer';

let provider: MarketDataProvider | null = null;

// SL/TP checks hit the DB — run them at most this often per symbol, not on every quote.
const SLTP_MIN_INTERVAL_MS = 500;
const lastSlTp = new Map<string, number>();

export function getProvider(): MarketDataProvider {
  if (!provider) {
    provider = env.MARKET_PROVIDER === 'demo' ? new DemoMarketProvider(env.DEMO_TICK_INTERVAL_MS) : new RealMarketProvider(env.DEMO_TICK_INTERVAL_MS);
    provider.onTick((t: Tick) => {
      broadcastTick(t);
      onPendingTick(t); // in-memory pending-trade triggers (execution by price)
      const now = Date.now();
      if (now - (lastSlTp.get(t.symbol) ?? 0) >= SLTP_MIN_INTERVAL_MS) {
        lastSlTp.set(t.symbol, now);
        void onMarketTick(t).catch(() => undefined);
      }
      // option expiry is handled by the dedicated settlement loop (optionsEngine) — not per tick
    });
    if (provider instanceof DemoMarketProvider) {
      // flat payload: { ...candle, event } — what the terminal's socket client expects
      provider.onCandle((c, event) => emitCandle(c.symbol, { ...c, event }));
    }
  }
  return provider;
}

export async function startMarket(): Promise<void> {
  await getProvider().start();
}
export async function stopMarket(): Promise<void> {
  if (provider) await provider.stop();
}
export function demoProvider(): DemoMarketProvider | null {
  const p = getProvider();
  return p instanceof DemoMarketProvider ? p : null;
}
export function realProvider(): RealMarketProvider | null {
  const p = getProvider();
  return p instanceof RealMarketProvider ? p : null;
}
