export interface RawCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  openTime: number;
  closeTime?: number;
  symbol?: string;
  timeframe?: string;
}

export function normalizeCandles(candles: RawCandle[] = []): RawCandle[] {
  if (!candles || !candles.length) return [];
  return candles
    .filter(
      (c) =>
        Number.isFinite(c.open) &&
        Number(c.open) > 0 &&
        Number.isFinite(c.close) &&
        Number(c.close) > 0 &&
        Number.isFinite(c.high) &&
        Number(c.high) > 0 &&
        Number.isFinite(c.low) &&
        Number(c.low) > 0
    )
    .map((c) => ({
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: Number(c.volume ?? 1),
      openTime: Number(c.openTime),
      closeTime: c.closeTime ? Number(c.closeTime) : undefined,
      symbol: c.symbol,
      timeframe: c.timeframe,
    }))
    .sort((a, b) => a.openTime - b.openTime);
}
