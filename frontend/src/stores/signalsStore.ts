import { create } from 'zustand';

export interface TradingSignalItem {
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

export type SignalFilter = 'ALL' | '1m' | '5m' | 'CURRENCIES' | 'CRYPTO';

interface SignalsState {
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  toggleOpen: () => void;
  filter: SignalFilter;
  setFilter: (filter: SignalFilter) => void;
  armedSignal: { symbol: string; direction: 'UP' | 'DOWN'; durationSec: number; indicator: string } | null;
  armSignal: (s: { symbol: string; direction: 'UP' | 'DOWN'; durationSec: number; indicator: string } | null) => void;
}

export const useSignalsStore = create<SignalsState>((set) => ({
  isOpen: false,
  setOpen: (isOpen) => set({ isOpen }),
  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
  filter: 'ALL',
  setFilter: (filter) => set({ filter }),
  armedSignal: null,
  armSignal: (armedSignal) => set({ armedSignal }),
}));
