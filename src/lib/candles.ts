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
  const valid = candles
    .filter(
      (c) =>
        c &&
        Number.isFinite(c.open) && Number(c.open) > 0 &&
        Number.isFinite(c.close) && Number(c.close) > 0 &&
        Number.isFinite(c.high) && Number(c.high) > 0 &&
        Number.isFinite(c.low) && Number(c.low) > 0 &&
        Number.isFinite(c.openTime) && Number(c.openTime) > 0
    )
    .sort((a, b) => Number(a.openTime) - Number(b.openTime));

  if (!valid.length) return [];

  // Strictly deduplicate by second timestamp (required by lightweight-charts)
  const deduped: RawCandle[] = [];
  for (const c of valid) {
    const sec = Math.floor(Number(c.openTime) / 1000);
    const prev = deduped[deduped.length - 1];
    if (prev && Math.floor(Number(prev.openTime) / 1000) === sec) {
      prev.high = Math.max(prev.high, Number(c.high));
      prev.low = Math.min(prev.low, Number(c.low));
      prev.close = Number(c.close);
      prev.volume = (prev.volume ?? 1) + Number(c.volume ?? 1);
    } else {
      deduped.push({
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume ?? 1),
        openTime: Number(c.openTime),
        closeTime: c.closeTime ? Number(c.closeTime) : undefined,
        symbol: c.symbol,
        timeframe: c.timeframe,
      });
    }
  }

  return deduped;
}
