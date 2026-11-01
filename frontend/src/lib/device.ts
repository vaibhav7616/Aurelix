import { uuid } from './uuid';

const KEY = 'ax_device';
let cached: string | null = null;

/** Random id for this browser (no personal data). Sent as X-Device-Id for fraud checks. */
export function deviceId(): string {
  if (cached) return cached;
  try {
    cached = localStorage.getItem(KEY);
    if (!cached || !/^[A-Za-z0-9-]{16,64}$/.test(cached)) { cached = uuid(); localStorage.setItem(KEY, cached); }
  } catch { cached = cached ?? uuid(); }
  return cached;
}
