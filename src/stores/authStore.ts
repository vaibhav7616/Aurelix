import { create } from 'zustand';
import { get, post, setTokens } from '../lib/api';

export interface User {
  id: string;
  email: string;
  role: 'ADMIN' | 'TRADER' | 'USER' | string;
  firstName?: string;
  lastName?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (identifier: string, password: string, remember?: boolean) => Promise<void>;
  register: (data: { email: string; password: string; firstName?: string; lastName?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  initDemoSession: () => Promise<void>;
}

export const useAuth = create<AuthState>((set, getStore) => ({
  user: null,
  token: localStorage.getItem('ax_access') ?? sessionStorage.getItem('ax_access'),
  isAuthenticated: !!(localStorage.getItem('ax_access') ?? sessionStorage.getItem('ax_access')),
  isLoading: false,

  login: async (identifier, password, remember = true) => {
    const res = await post<{ user: User; accessToken: string; refreshToken?: string }>('/api/v1/auth/login', {
      email: identifier,
      password,
    });
    setTokens(res.accessToken, res.refreshToken, remember);
    set({ user: res.user, token: res.accessToken, isAuthenticated: true });
  },

  register: async (data) => {
    await post('/api/v1/auth/register', data);
  },

  initDemoSession: async () => {
    try {
      const res = await post<{ user: User; accessToken: string; refreshToken?: string }>('/api/v1/auth/demo', {});
      setTokens(res.accessToken, res.refreshToken, true);
      set({ user: res.user, token: res.accessToken, isAuthenticated: true });
    } catch {
      // ignore
    }
  },

  logout: async () => {
    try {
      await post('/api/v1/auth/logout', {});
    } catch {
      // ignore
    } finally {
      setTokens(null, null);
      set({ user: null, token: null, isAuthenticated: false });
    }
  },

  refreshMe: async () => {
    try {
      const res = await get<{ user: User }>('/api/v1/users/me');
      set({ user: res.user, isAuthenticated: true });
    } catch {
      set({ user: null, isAuthenticated: false });
    }
  },
}));
