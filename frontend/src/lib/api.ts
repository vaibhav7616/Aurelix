import axios, { AxiosError } from 'axios';
import { API_URL } from './constants';

export interface Envelope<T> { success: boolean; data: T; error: { code: string; message: string; details?: unknown } | null }

// Session model:
//   refresh token → HttpOnly cookie set by the server (scripts can never read it)
//   access token  → memory only (lost on reload; renewed from the cookie)
//   ax_session    → non-secret "a session may exist" flag, so the app knows to try a silent refresh
const K_SESSION = 'ax_session';
const K_M = 'ax_remember'; // '1' | '0', always in localStorage
const LEGACY = ['ax_access', 'ax_refresh'];

const api = axios.create({ baseURL: API_URL, withCredentials: true, timeout: 15000 });

let accessToken: string | null = null;
/** refresh token from the pre-cookie version (localStorage): exchanged once for a cookie, then dropped */
let legacyRefresh: string | null = null;
try {
  legacyRefresh = localStorage.getItem('ax_refresh') ?? sessionStorage.getItem('ax_refresh');
  if (legacyRefresh) localStorage.setItem(K_SESSION, '1');
  for (const k of LEGACY) { localStorage.removeItem(k); sessionStorage.removeItem(k); }
} catch { /* storage unavailable */ }

export function isRemembered(): boolean {
  try {
    return (localStorage.getItem(K_M) ?? '1') === '1';
  } catch {
    return true;
  }
}

/** True when this browser may hold a session cookie (the cookie itself is unreadable by design). */
export function hasSession(): boolean {
  try { return (localStorage.getItem(K_SESSION) ?? sessionStorage.getItem(K_SESSION)) === '1'; } catch { return false; }
}

/** Signed in: keep the access token in memory and remember that a session cookie exists. */
export function setSession(a: string, remember: boolean) {
  accessToken = a;
  try {
    localStorage.setItem(K_M, remember ? '1' : '0');
    (remember ? localStorage : sessionStorage).setItem(K_SESSION, '1');
  } catch { /* ignore */ }
}
export function clearSession() {
  accessToken = null;
  legacyRefresh = null;
  try { localStorage.removeItem(K_SESSION); sessionStorage.removeItem(K_SESSION); } catch { /* ignore */ }
}
export function getAccessToken(): string | null { return accessToken; }

/** New access token from the refresh cookie (the server also rotates the cookie). One request at a time. */
let inflight: Promise<string> | null = null;
export function refreshAccess(): Promise<string> {
  inflight ??= axios
    .post<Envelope<{ accessToken: string }>>(`${API_URL}/api/v1/auth/refresh`, legacyRefresh ? { refreshToken: legacyRefresh } : {}, { withCredentials: true })
    .then(({ data }) => {
      accessToken = data.data.accessToken;
      legacyRefresh = null;
      return accessToken;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

api.interceptors.request.use((cfg) => {
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  return cfg;
});

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const original = err.config as (typeof err.config & { _retried?: boolean }) | undefined;
    const isAuthCall = original?.url?.includes('/api/v1/auth/');
    if (err.response?.status === 401 && original && !original._retried && !isAuthCall && hasSession()) {
      original._retried = true;
      try {
        await refreshAccess();
      } catch {
        clearSession();
        window.location.href = '/login';
        return Promise.reject(err);
      }
      if (original.headers) original.headers.Authorization = `Bearer ${accessToken}`;
      return api(original);
    }
    return Promise.reject(err);
  }
);

export async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await api.get<Envelope<T>>(url, { params });
  if (!data.success) throw new Error(data.error?.message ?? 'Request failed');
  return data.data;
}
export async function post<T>(url: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  const { data } = await api.post<Envelope<T>>(url, body, { headers });
  if (!data.success) throw new Error(data.error?.message ?? 'Request failed');
  return data.data;
}
export async function patch<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await api.patch<Envelope<T>>(url, body);
  if (!data.success) throw new Error(data.error?.message ?? 'Request failed');
  return data.data;
}
export async function put<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await api.put<Envelope<T>>(url, body);
  if (!data.success) throw new Error(data.error?.message ?? 'Request failed');
  return data.data;
}
export async function del<T>(url: string): Promise<T> {
  const { data } = await api.delete<Envelope<T>>(url);
  if (!data.success) throw new Error(data.error?.message ?? 'Request failed');
  return data.data;
}
export function apiError(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const d = e.response?.data as Envelope<null> | undefined;
    if (d?.error?.message) return d.error.message;
    if (typeof e.response?.data === 'string' && e.response.data.length < 150 && !e.response.data.includes('<html')) {
      return e.response.data;
    }
    if (e.response?.status === 401) return 'Invalid username or password';
    if (e.response?.status === 400 || e.response?.status === 422) return 'Invalid login credentials format';
    if (e.response?.status === 500) return 'Server error during authentication. Please retry.';
    return e.message;
  }
  return (e as Error).message ?? 'Something went wrong';
}
export default api;
