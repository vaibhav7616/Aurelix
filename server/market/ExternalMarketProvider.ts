// Stub for a future licensed external feed. Same interface — swap via MARKET_PROVIDER env.
import { Candle, MarketDataProvider, Tick } from './MarketDataProvider';

export class ExternalMarketProviderStub implements MarketDataProvider {
  readonly name = 'external-stub';
  readonly isDemo = false;
  onTick(_cb: (tick: Tick) => void): void {
    throw new Error('External market provider is not configured. Set MARKET_PROVIDER=demo or connect a licensed feed.');
  }
  async start(): Promise<void> {
    throw new Error('External market provider is not configured.');
  }
  async stop(): Promise<void> { /* noop */ }
  async getTick(_symbol: string): Promise<Tick | null> { return null; }
  async getTicks(_symbols: string[]): Promise<Tick[]> { return []; }
  async getCandles(_symbol: string, _timeframe: string, _limit = 200): Promise<Candle[]> { return []; }
}
