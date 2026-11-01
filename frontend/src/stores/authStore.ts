import { create } from 'zustand';
import { get, post, isRemembered, hasSession, setSession, clearSession, refreshAccess } from '../lib/api';

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
    const cleanId = identifier.trim();
    const payload: Record<string, string> = {
      identifier: cleanId,
      password,
    };
    if (cleanId.includes('@')) {
      payload.email = cleanId;
    } else {
      payload.username = cleanId;
    }
    const data = await post<{ accessToken: string; user: User }>('/api/v1/auth/login', { ...payload, remember });
    setSession(data.accessToken, remember); // the refresh token arrives as an HttpOnly cookie
    set({ user: data.user, remember, ready: true });
  },
  register: async (input) => {
    await post('/api/v1/auth/register', input);
  },
  logout: async () => {
    try { await post('/api/v1/auth/logout', {}); } catch { /* ignore */ }
    clearSession();
    set({ user: null });
  },
  bootstrap: async () => {
    if (!hasSession()) { set({ ready: true }); return; }
    try {
      await refreshAccess(); // silent sign-in from the session cookie
      const me = await get<any>('/api/v1/auth/me').catch(() => get<any>('/api/v1/users/me'));
      const u = me?.user ?? me;
      if (u?.id) set({ user: u });
    } catch { clearSession(); }
    set({ ready: true });
  },
}));
