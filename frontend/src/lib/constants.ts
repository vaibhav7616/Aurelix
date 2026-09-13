export const APP_NAME = 'Aurelix';
export const API_URL = import.meta.env.VITE_API_URL ?? '';
export const WS_URL = import.meta.env.VITE_WS_URL ?? '';
export const TIMEFRAMES = ['5s', '15s', '30s', '1m', '5m', '15m', '30m', '1h', '4h', '1d'] as const;
export const TIMEFRAME_MS: Record<string, number> = {
  '5s': 5_000, '10s': 10_000, '15s': 15_000, '30s': 30_000,
  '1m': 60_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000,
  '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000,
};
/** Clock-aligned bucket start for a timestamp (ms). Candles are strict [open, open+tf) windows. */
export function bucketStart(ts: number, tf: string): number {
  const ms = TIMEFRAME_MS[tf] ?? 60_000;
  return Math.floor(ts / ms) * ms;
}
export const CHART_TYPES = ['candles', 'line', 'area'] as const;
export const DEFAULT_SYMBOLS = ['BTC/USD', 'ETH/USD', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD'];
