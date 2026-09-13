import axios, { AxiosError } from 'axios';
import { API_URL } from './constants';

export interface Envelope<T> { success: boolean; data: T; error: { code: string; message: string; details?: unknown } | null }

const K_A = 'ax_access';
const K_R = 'ax_refresh';
const K_M = 'ax_remember'; // '1' | '0', always in localStorage

const api = axios.create({ baseURL: API_URL, withCredentials: false, timeout: 15000 });

let accessToken: string | null = null;
let refreshToken: string | null = null;

function chosenStore(): Storage {
  try {
    return localStorage.getItem(K_M) === '0' ? sessionStorage : localStorage;
  } catch {
    return localStorage;
  }
}
function readInitial(): void {
  try {
    accessToken = localStorage.getItem(K_A) ?? sessionStorage.getItem(K_A);
    refreshToken = localStorage.getItem(K_R) ?? sessionStorage.getItem(K_R);
  } catch { /* private mode */ }
}
readInitial();

export function isRemembered(): boolean {
  try {
    return (localStorage.getItem(K_M) ?? '1') === '1';
  } catch {
    return true;
  }
}

/** Persist tokens. `remember=false` keeps the session to this tab only (sessionStorage). */
export function setTokens(a: string | null, r?: string | null, remember?: boolean) {
  accessToken = a;
  if (r !== undefined) refreshToken = r;
  try {
    if (remember !== undefined) localStorage.setItem(K_M, remember ? '1' : '0');
    const store = chosenStore();
    const other = store === localStorage ? sessionStorage : localStorage;
    if (a) store.setItem(K_A, a);
    else { store.removeItem(K_A); other.removeItem(K_A); }
    if (r) store.setItem(K_R, r);
    else if (r === null) { store.removeItem(K_R); other.removeItem(K_R); }
  } catch { /* ignore */ }
}
export function getAccessToken(): string | null { return accessToken; }

api.interceptors.request.use((cfg) => {
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  return cfg;
});

let refreshing = false;
let queue: Array<() => void> = [];
api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const original = err.config as (typeof err.config & { _retried?: boolean }) | undefined;
    if (err.response?.status === 401 && original && !original._retried && refreshToken) {
      original._retried = true;
      if (refreshing) await new Promise<void>((resolve) => queue.push(resolve));
      else {
        refreshing = true;
        try {
          const { data } = await axios.post<Envelope<{ accessToken: string }>>(`${API_URL}/api/v1/auth/refresh`, { refreshToken });
          setTokens(data.data.accessToken);
        } catch {
          setTokens(null, null);
          window.location.href = '/login';
          return Promise.reject(err);
        } finally {
          refreshing = false;
          queue.forEach((fn) => fn());
          queue = [];
        }
      }
      if (accessToken && original.headers) original.headers.Authorization = `Bearer ${accessToken}`;
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
export function apiError(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const d = e.response?.data as Envelope<null> | undefined;
    return d?.error?.message ?? e.message;
  }
  return (e as Error).message ?? 'Something went wrong';
}
export default api;
