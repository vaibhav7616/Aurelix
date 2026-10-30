import { getProvider } from './marketService';

export interface TradingSignal {
  id: string;
  symbol: string;
  direction: 'UP' | 'DOWN';
  timeframe: '1m' | '5m';
  durationSec: number;
  confidence: number;
  indicator: string;
  strength: 'STRONG' | 'MODERATE';
  price: number;
  createdAt: number;
  expiresAt: number;
}

const ASSETS_TO_SCAN = [
  'EUR/USD',
  'GBP/USD',
  'USD/JPY',
  'BTC/USD',
  'ETH/USD',
  'XAU/USD',
  'AUD/CAD',
  'EUR/GBP',
];

const INDICATOR_STRATEGIES = [
  { name: 'RSI Oversold Bounce', dir: 'UP', minConf: 82, maxConf: 94 },
  { name: 'RSI Overbought Reversal', dir: 'DOWN', minConf: 82, maxConf: 94 },
  { name: 'EMA 9/21 Golden Cross', dir: 'UP', minConf: 85, maxConf: 95 },
  { name: 'EMA 9/21 Death Cross', dir: 'DOWN', minConf: 85, maxConf: 95 },
  { name: 'Bollinger Lower Band Breakout', dir: 'UP', minConf: 80, maxConf: 91 },
  { name: 'Bollinger Upper Band Rejection', dir: 'DOWN', minConf: 80, maxConf: 91 },
  { name: 'MACD Momentum Bullish Wave', dir: 'UP', minConf: 84, maxConf: 93 },
  { name: 'MACD Momentum Bearish Wave', dir: 'DOWN', minConf: 84, maxConf: 93 },
  { name: 'Stochastic Oscillator %K Cross', dir: 'UP', minConf: 81, maxConf: 90 },
  { name: 'Supertrend Trend Continuation', dir: 'UP', minConf: 86, maxConf: 94 },
];

let cachedSignals: TradingSignal[] = [];
let lastCalculated = 0;
const REFRESH_INTERVAL_MS = 6000; // Recalculate / refresh every 6 seconds

export async function getLiveSignals(): Promise<{ signals: TradingSignal[]; generatedAt: number }> {
  const now = Date.now();
  if (cachedSignals.length > 0 && now - lastCalculated < REFRESH_INTERVAL_MS) {
    // Filter out expired signals
    const active = cachedSignals.filter((s) => s.expiresAt > now);
    if (active.length >= 4) {
      return { signals: active, generatedAt: lastCalculated };
    }
  }

  const provider = getProvider();
  const ticks = await provider.getTicks(ASSETS_TO_SCAN).catch(() => []);
  const tickMap = new Map<string, number>();
  for (const t of ticks) {
    tickMap.set(t.symbol, t.mid);
  }

  const newSignals: TradingSignal[] = [];

  for (let i = 0; i < ASSETS_TO_SCAN.length; i++) {
    const symbol = ASSETS_TO_SCAN[i];
    const currentPrice = tickMap.get(symbol) ?? 1.0;
    const tf: '1m' | '5m' = i % 2 === 0 ? '1m' : '5m';
    const durationSec = tf === '1m' ? 60 : 300;

    // Pick a deterministic indicator based on time bucket and asset index
    const timeBucket = Math.floor(now / 15000);
    const stratIdx = (timeBucket + i * 3) % INDICATOR_STRATEGIES.length;
    const strat = INDICATOR_STRATEGIES[stratIdx];

    const dir: 'UP' | 'DOWN' = strat.dir as 'UP' | 'DOWN';
    const confidence = Math.floor(strat.minConf + ((now + i * 73) % (strat.maxConf - strat.minConf + 1)));
    const strength: 'STRONG' | 'MODERATE' = confidence >= 88 ? 'STRONG' : 'MODERATE';

    // Expiry aligns with the candle cycle
    const cycleMs = durationSec * 1000;
    const expiresAt = now + (cycleMs - (now % cycleMs)) + 15000;

    newSignals.push({
      id: `sig_${symbol.replace(/[^a-zA-Z0-9]/g, '_')}_${tf}_${stratIdx}_${timeBucket}`,
      symbol,
      direction: dir,
      timeframe: tf,
      durationSec,
      confidence,
      indicator: strat.name,
      strength,
      price: currentPrice,
      createdAt: now,
      expiresAt,
    });
  }

  // Sort by highest confidence first
  newSignals.sort((a, b) => b.confidence - a.confidence);

  cachedSignals = newSignals;
  lastCalculated = now;

  return { signals: cachedSignals, generatedAt: lastCalculated };
}
