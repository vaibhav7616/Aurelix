// MarketService — owns provider lifecycle, tick fan-out, candle reads.
import { env } from '../config/env';
import { DemoMarketProvider } from '../market/DemoMarketProvider';
import { ExternalMarketProviderStub } from '../market/ExternalMarketProvider';
import { MarketDataProvider, Tick } from '../market/MarketDataProvider';
import { onMarketTick } from '../trading/slTpMonitor';
import { settleExpired } from '../trading/optionsEngine';
import { broadcastTick, emitCandle } from '../websocket/socketServer';

let provider: MarketDataProvider | null = null;

export function getProvider(): MarketDataProvider {
  if (!provider) {
    provider = env.MARKET_PROVIDER === 'external' ? new ExternalMarketProviderStub() : new DemoMarketProvider(env.DEMO_TICK_INTERVAL_MS);
    provider.onTick((t: Tick) => {
      broadcastTick(t);
      void onMarketTick(t).catch(() => undefined);
      void settleExpired().catch(() => undefined);
    });
    if (provider instanceof DemoMarketProvider) {
      provider.onCandle((c, event) => {
        emitCandle(c.symbol, { candle: c, event });
      });
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
