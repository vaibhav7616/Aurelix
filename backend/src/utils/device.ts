import type { Request } from 'express';

/** Random per-browser id sent by the web app (X-Device-Id); null when absent or malformed. */
export function deviceIdOf(req: Request): string | null {
  const v = String(req.headers['x-device-id'] ?? '');
  return /^[A-Za-z0-9-]{16,64}$/.test(v) ? v : null;
}
