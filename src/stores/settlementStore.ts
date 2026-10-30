import { create } from 'zustand';
import { soundService } from '../lib/sound';

export interface SettlementCard {
  id: string;
  symbol: string;
  direction: 'UP' | 'DOWN';
  status: 'WON' | 'LOST' | 'TIE';
  stake: number;
  profit: number;
  payoutPct: number;
  entryPrice: number;
  closePrice: number;
  durationSec?: number;
  timestamp: number;
}

interface SettlementStore {
  settlements: SettlementCard[];
  pushSettlement: (card: Omit<SettlementCard, 'id' | 'timestamp'> & { id?: string }) => void;
  dismissSettlement: (id: string) => void;
  clearAll: () => void;
}

export const useSettlementStore = create<SettlementStore>((set) => ({
  settlements: [],

  pushSettlement: (item) => {
    const id = item.id || `settle_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const card: SettlementCard = {
      ...item,
      id,
      timestamp: Date.now(),
    };

    // Play victory or loss audio cues
    if (card.status === 'WON') {
      soundService.playTradeWon();
    } else if (card.status === 'LOST') {
      soundService.playTradeLost();
    }

    set((state) => ({
      // Keep up to 3 cards visible at once
      settlements: [card, ...state.settlements.slice(0, 2)],
    }));

    // Auto dismiss after 5.5 seconds
    setTimeout(() => {
      set((state) => ({
        settlements: state.settlements.filter((s) => s.id !== id),
      }));
    }, 5500);
  },

  dismissSettlement: (id) => {
    set((state) => ({
      settlements: state.settlements.filter((s) => s.id !== id),
    }));
  },

  clearAll: () => set({ settlements: [] }),
}));
