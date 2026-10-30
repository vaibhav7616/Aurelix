export const API_URL = '';
export const WS_URL = '';

export const DEFAULT_SYMBOLS = [
  'EUR/USD',
  'GBP/USD',
  'USD/JPY',
  'BTC/USD',
  'ETH/USD',
  'SOL/USD',
  'XAU/USD',
  'EUR/CHF',
];

export const TIMEFRAMES = ['5s', '15s', '30s', '1m', '2m', '5m', '15m', '1h'] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];
