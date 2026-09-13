// MarketService — owns provider lifecycle, tick fan-out, candle reads.
import { env } from '../config/env';
import { DemoMarketProvider } from '../market/DemoMarketProvider';
import { ExternalMarketProviderStub } from '../market/ExternalMarketProvider';
import { MarketDataProvider, Tick } from '../market/MarketDataProvider';
import { onMarketTick } from '../trading/slTpMonitor';
import { settleExpired } from '../trading/optionsEngine';
import { broadcastTick, emitCandle } from '../websocket/socketServer';

let provider: MarketDataProvider | null = null;
const lastSlTp = new Map<string, number>();
let lastSettle = 0;

export function getProvider(): MarketDataProvider {
  if (!provider) {
    provider = env.MARKET_PROVIDER === 'external' ? new ExternalMarketProviderStub() : new DemoMarketProvider(env.DEMO_TICK_INTERVAL_MS);
    provider.onTick((t: Tick) => {
      broadcastTick(t);
      // legacy SL/TP monitor: at most once per second per symbol
      const now = Date.now();
      if ((lastSlTp.get(t.symbol) ?? 0) + 1000 <= now) {
        lastSlTp.set(t.symbol, now);
        void onMarketTick(t).catch(() => undefined);
      }
      // expiry settlement: the 250ms loop is authoritative; a tick-driven pass adds immediacy
      // right after a quote lands, throttled so N assets × 4 Hz does not hammer the DB
      if (lastSettle + 200 <= now) {
        lastSettle = now;
        void settleExpired().catch(() => undefined);
      }
    });
    // candle lifecycle (close / open) → clients roll their candle exactly when the server does
    if (provider instanceof DemoMarketProvider) {
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
