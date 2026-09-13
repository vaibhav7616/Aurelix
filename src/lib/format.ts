export function fmtPrice(price: number | null | undefined, decimals?: number): string {
  if (price === null || price === undefined || Number.isNaN(price)) return '0.00';
  if (decimals !== undefined) return price.toFixed(decimals);
  const abs = Math.abs(price);
  if (abs >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (abs >= 50) return price.toFixed(3);
  if (abs >= 0.05) return price.toFixed(5);
  return price.toFixed(6);
}

export function fmtMoney(amount: number | null | undefined, currency = 'USD'): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '$0.00';
  const prefix = currency === 'USD' ? '$' : `${currency} `;
  return `${prefix}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtPct(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return '+0.00%';
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

export function fmtTime(ts: number | string | Date): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fmtClock(ts: number | Date = Date.now()): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export function clsUpDown(val: number | null | undefined): string {
  if (!val || val === 0) return 'text-slate-400';
  return val > 0 ? 'text-[#0faf59]' : 'text-[#ea4d4d]';
}

export function shortId(id: string, len = 8): string {
  if (!id) return '';
  return id.length > len ? `${id.slice(0, len)}…` : id;
}

export function fmtCompact(val: number | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '0';
  const abs = Math.abs(val);
  if (abs >= 1e9) return `${(val / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(val / 1e3).toFixed(1)}K`;
  return val.toLocaleString('en-US');
}
