import { create } from 'zustand';

export interface Tick { symbol: string; bid: number; ask: number; mid: number; spread: number; changePct24h: number; ts: number; demo: boolean }

interface TerminalState {
  symbol: string;
  timeframe: string;
  chartType: 'candles' | 'area' | 'line' | 'bars' | 'heiken_ashi';
  accountId: string | null;
  ticks: Record<string, Tick>;
  favorites: string[];
  openTabs: string[];
  soundEnabled: boolean;
  pendingTrade: boolean;
  setSymbol: (s: string) => void;
  setTimeframe: (t: string) => void;
  setChartType: (t: 'candles' | 'area' | 'line' | 'bars' | 'heiken_ashi') => void;
  setAccountId: (id: string | null) => void;
  applyTick: (t: Tick) => void;
  toggleFavorite: (s: string) => void;
  addTab: (s: string) => void;
  closeTab: (s: string) => void;
  toggleSound: () => void;
  setSoundEnabled: (v: boolean) => void;
  setPendingTrade: (v: boolean) => void;
}

export const useTerminal = create<TerminalState>((set) => ({
  symbol: localStorage.getItem('ax_active_sym') ?? 'EUR/USD',
  timeframe: '1m',
  chartType: 'candles',
  accountId: localStorage.getItem('ax_account'),
  ticks: {},
  favorites: JSON.parse(localStorage.getItem('ax_favs') ?? '["EUR/USD","GBP/USD","USD/JPY","BTC/USD"]'),
  openTabs: JSON.parse(localStorage.getItem('ax_tabs') ?? '["EUR/USD","GBP/USD","USD/JPY"]'),
  soundEnabled: localStorage.getItem('ax_sound') !== 'false',
  pendingTrade: false,
  setSymbol: (symbol) => {
    localStorage.setItem('ax_active_sym', symbol);
    set((state) => {
      const tabs = state.openTabs.includes(symbol) ? state.openTabs : [...state.openTabs, symbol];
      localStorage.setItem('ax_tabs', JSON.stringify(tabs));
      return { symbol, openTabs: tabs };
    });
  },
  setTimeframe: (timeframe) => set({ timeframe }),
  setChartType: (chartType) => set({ chartType }),
  setAccountId: (accountId) => {
    if (accountId) localStorage.setItem('ax_account', accountId);
    set({ accountId });
  },
  applyTick: (t) => set((s) => ({ ticks: { ...s.ticks, [t.symbol]: t } })),
  toggleFavorite: (sym) => set((s) => {
    const favs = s.favorites.includes(sym) ? s.favorites.filter((f) => f !== sym) : [...s.favorites, sym];
    localStorage.setItem('ax_favs', JSON.stringify(favs));
    return { favorites: favs };
  }),
  addTab: (sym) => set((s) => {
    if (s.openTabs.includes(sym)) return { symbol: sym };
    const tabs = [...s.openTabs, sym];
    localStorage.setItem('ax_tabs', JSON.stringify(tabs));
    localStorage.setItem('ax_active_sym', sym);
    return { openTabs: tabs, symbol: sym };
  }),
  closeTab: (sym) => set((s) => {
    if (s.openTabs.length <= 1) return s;
    const tabs = s.openTabs.filter((t) => t !== sym);
    localStorage.setItem('ax_tabs', JSON.stringify(tabs));
    const nextSym = s.symbol === sym ? tabs[0] : s.symbol;
    localStorage.setItem('ax_active_sym', nextSym);
    return { openTabs: tabs, symbol: nextSym };
  }),
  toggleSound: () => set((s) => {
    const next = !s.soundEnabled;
    localStorage.setItem('ax_sound', next ? 'true' : 'false');
    return { soundEnabled: next };
  }),
  setSoundEnabled: (v: boolean) => {
    localStorage.setItem('ax_sound', v ? 'true' : 'false');
    set({ soundEnabled: v });
  },
  setPendingTrade: (pendingTrade) => set({ pendingTrade }),
}));
