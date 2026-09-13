import { create } from 'zustand';
import { get, post, setTokens, isRemembered, getAccessToken } from '../lib/api';

export interface User { id: string; email: string; firstName: string; lastName: string; role: string }

interface AuthState {
  user: User | null;
  ready: boolean;
  remember: boolean;
  login: (identifier: string, password: string, remember?: boolean) => Promise<void>;
  register: (input: { email: string; password: string; firstName: string; lastName: string }) => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  ready: false,
  remember: isRemembered(),
  login: async (identifier, password, remember = true) => {
    const data = await post<{ accessToken: string; refreshToken: string; user: User }>('/api/v1/auth/login', { identifier, password });
    setTokens(data.accessToken, data.refreshToken, remember);
    set({ user: data.user, remember });
  },
  register: async (input) => {
    await post('/api/v1/auth/register', input);
  },
  logout: async () => {
    try {
      const rt = localStorage.getItem('ax_refresh') ?? sessionStorage.getItem('ax_refresh');
      await post('/api/v1/auth/logout', { refreshToken: rt });
    } catch { /* ignore */ }
    setTokens(null, null);
    set({ user: null });
  },
  bootstrap: async () => {
    if (!getAccessToken()) { set({ ready: true }); return; }
    try {
      const me = await get<User>('/api/v1/auth/me');
      set({ user: me });
    } catch { setTokens(null, null); }
    set({ ready: true });
  },
}));
