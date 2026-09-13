import { create } from 'zustand';

export interface Toast {
  id: string;
  type: 'ok' | 'err' | 'info' | 'warn';
  message: string;
}

interface UIState {
  toasts: Toast[];
  theme: 'dark' | 'light';
  push: (type: 'ok' | 'err' | 'info' | 'warn', message: string) => void;
  dismiss: (id: string) => void;
  setTheme: (t: 'dark' | 'light') => void;
}

export const useUI = create<UIState>((set) => ({
  toasts: [],
  theme: 'dark',

  push: (type, message) => {
    const id = Math.random().toString(36).slice(2, 9);
    set((state) => ({ toasts: [...state.toasts, { id, type, message }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },

  dismiss: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },

  setTheme: (theme) => set({ theme }),
}));
