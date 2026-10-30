import { create } from 'zustand';

export interface SettingsState {
  isOpen: boolean;
  setOpen: (v: boolean) => void;
  toggleOpen: () => void;

  // 1-Click Trading (instant execution without prompt)
  oneClickTrading: boolean;
  setOneClickTrading: (v: boolean) => void;

  // Sound Preferences
  soundMaster: boolean;
  soundClick: boolean;
  soundWin: boolean;
  soundLoss: boolean;
  setSoundMaster: (v: boolean) => void;
  setSoundClick: (v: boolean) => void;
  setSoundWin: (v: boolean) => void;
  setSoundLoss: (v: boolean) => void;

  // Chart Preferences
  showGrid: boolean;
  autoScroll: boolean;
  setShowGrid: (v: boolean) => void;
  setAutoScroll: (v: boolean) => void;

  // Server calibration & ping latency (ms)
  serverLatency: number;
  setServerLatency: (ms: number) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  isOpen: false,
  setOpen: (isOpen) => set({ isOpen }),
  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),

  oneClickTrading: localStorage.getItem('ax_1click') !== 'false', // Default true for fast binary scalping
  setOneClickTrading: (oneClickTrading) => {
    localStorage.setItem('ax_1click', String(oneClickTrading));
    set({ oneClickTrading });
  },

  soundMaster: localStorage.getItem('ax_sound_master') !== 'false',
  soundClick: localStorage.getItem('ax_sound_click') !== 'false',
  soundWin: localStorage.getItem('ax_sound_win') !== 'false',
  soundLoss: localStorage.getItem('ax_sound_loss') !== 'false',

  setSoundMaster: (soundMaster) => {
    localStorage.setItem('ax_sound_master', String(soundMaster));
    set({ soundMaster });
  },
  setSoundClick: (soundClick) => {
    localStorage.setItem('ax_sound_click', String(soundClick));
    set({ soundClick });
  },
  setSoundWin: (soundWin) => {
    localStorage.setItem('ax_sound_win', String(soundWin));
    set({ soundWin });
  },
  setSoundLoss: (soundLoss) => {
    localStorage.setItem('ax_sound_loss', String(soundLoss));
    set({ soundLoss });
  },

  showGrid: localStorage.getItem('ax_show_grid') !== 'false',
  autoScroll: localStorage.getItem('ax_auto_scroll') !== 'false',
  setShowGrid: (showGrid) => {
    localStorage.setItem('ax_show_grid', String(showGrid));
    set({ showGrid });
  },
  setAutoScroll: (autoScroll) => {
    localStorage.setItem('ax_auto_scroll', String(autoScroll));
    set({ autoScroll });
  },

  serverLatency: 18,
  setServerLatency: (serverLatency) => set({ serverLatency }),
}));
