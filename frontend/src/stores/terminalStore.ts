import { create } from 'zustand';

export interface Tick { symbol: string; bid: number; ask: number; mid: number; spread: number; changePct24h: number; ts: number; demo: boolean }

export interface LiveCandle { symbol: string; timeframe: string; open: number; high: number; low: number; close: number; volume: number; openTime: number; closeTime: number; event: 'open' | 'close' }

interface TerminalState {
  symbol: string;
  timeframe: string;
  /** serverTime - clientTime (ms). Used so candle buckets & countdowns follow the SERVER clock (settlement clock). */
  clockOffset: number;
  /** last candle lifecycle event per symbol|timeframe (the server rolled a candle) */
  candleEvents: Record<string, LiveCandle>;
  /** expiry currently selected in the ticket → chart previews the trade window before you click */
  pendingDurationSec: number;
  setPendingDuration: (sec: number) => void;
  /** feed health: timestamp of the last quote received */
  lastQuoteAt: number;
  chartType: 'candles' | 'line' | 'area';
  accountId: string | null;
  ticks: Record<string, Tick>;
  favorites: string[];
  setSymbol: (s: string) => void;
  setTimeframe: (t: string) => void;
  setChartType: (t: 'candles' | 'line' | 'area') => void;
  setAccountId: (id: string | null) => void;
  applyTick: (t: Tick) => void;
  applyCandleEvent: (c: LiveCandle) => void;
  setClockOffset: (ms: number) => void;
  toggleFavorite: (s: string) => void;
}

/** Current time on the server clock (best effort). */
export function serverNow(): number {
  return Date.now() + useTerminal.getState().clockOffset;
}

export const useTerminal = create<TerminalState>((set) => ({
  symbol: 'BTC/USD',
  timeframe: localStorage.getItem('ax_tf') || '1m',
  clockOffset: 0,
  candleEvents: {},
  pendingDurationSec: Number(localStorage.getItem('ax_opt_dur') ?? 60) || 60,
  setPendingDuration: (pendingDurationSec) => set({ pendingDurationSec }),
  lastQuoteAt: 0,
  chartType: 'candles',
  accountId: localStorage.getItem('ax_account'),
  ticks: {},
  favorites: JSON.parse(localStorage.getItem('ax_favs') ?? '["BTC/USD","ETH/USD"]'),
  setSymbol: (symbol) => set({ symbol }),
  setTimeframe: (timeframe) => { localStorage.setItem('ax_tf', timeframe); set({ timeframe }); },
  setChartType: (chartType) => set({ chartType }),
  setAccountId: (accountId) => {
    if (accountId) localStorage.setItem('ax_account', accountId);
    set({ accountId });
  },
  applyTick: (t) => set((s) => {
    // keep a smoothed server-clock offset from tick timestamps (they are stamped server-side)
    const sample = t.ts - Date.now();
    const off = s.clockOffset === 0 ? sample : s.clockOffset * 0.9 + sample * 0.1;
    return { ticks: { ...s.ticks, [t.symbol]: t }, lastQuoteAt: Date.now(), clockOffset: Math.abs(off - s.clockOffset) > 5 ? off : s.clockOffset };
  }),
  applyCandleEvent: (c) => set((s) => ({ candleEvents: { ...s.candleEvents, [`${c.symbol}|${c.timeframe}`]: c } })),
  setClockOffset: (clockOffset) => set({ clockOffset }),
  toggleFavorite: (sym) => set((s) => {
    const favs = s.favorites.includes(sym) ? s.favorites.filter((f) => f !== sym) : [...s.favorites, sym];
    localStorage.setItem('ax_favs', JSON.stringify(favs));
    return { favorites: favs };
  }),
}));
