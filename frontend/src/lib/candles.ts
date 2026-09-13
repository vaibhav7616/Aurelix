/** Candle normalization — charting libs require strictly time-ascending data.
 * Sorts ascending by openTime, drops invalid rows, and dedupes (keeps the
 * latest row per bucket) so a provider hiccup can never crash the chart. */
export function normalizeCandles<T extends { openTime: number }>(rows: T[]): T[] {
  if (rows.length < 2) return rows.filter((c) => Number.isFinite(c.openTime));
  const sorted = rows.slice().sort((a, b) => a.openTime - b.openTime);
  const out: T[] = [];
  for (const c of sorted) {
    if (!Number.isFinite(c.openTime)) continue;
    const prev = out[out.length - 1];
    if (prev && prev.openTime === c.openTime) out[out.length - 1] = c;
    else out.push(c);
  }
  return out;
}
