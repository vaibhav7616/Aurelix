import { Request, Response, NextFunction } from 'express';

interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** bucket key; defaults to the client IP */
  key?: (req: Request) => string | undefined;
  message?: { success: boolean; data: null; error: { code: string; message: string } };
}

export function createSafeRateLimiter(options: RateLimitOptions) {
  const hits = new Map<string, { count: number; resetTime: number }>();

  // Periodically clean up expired entries
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, val] of hits.entries()) {
      if (now > val.resetTime) hits.delete(key);
    }
  }, 60_000);
  if (timer.unref) timer.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // req.ip honours `trust proxy` (set to our own proxy hops) — never read X-Forwarded-For
      // directly: its first entry is whatever the client sent, so limits could be dodged per request
      const ip = options.key?.(req) ?? req.ip ?? req.socket.remoteAddress ?? 'unknown';
      const now = Date.now();
      const record = hits.get(ip);

      if (!record || now > record.resetTime) {
        hits.set(ip, { count: 1, resetTime: now + options.windowMs });
        return next();
      }

      record.count++;
      if (record.count > options.max) {
        const retryAfter = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
        res.setHeader('Retry-After', retryAfter);
        return res.status(429).json(
          options.message ?? {
            success: false,
            data: null,
            error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down' },
          }
        );
      }

      return next();
    } catch {
      // Always fail open on rate-limiting errors so production traffic is never interrupted
      return next();
    }
  };
}

export const apiLimiter = createSafeRateLimiter({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX ?? '1000', 10),
});

export const authLimiter = createSafeRateLimiter({
  windowMs: 60_000,
  max: 60,
  message: { success: false, data: null, error: { code: 'RATE_LIMITED', message: 'Too many auth attempts' } },
});

const loginMessage = { success: false, data: null, error: { code: 'RATE_LIMITED', message: 'Too many login attempts — wait a few minutes and try again' } };
/** Password guessing: 10 attempts per 5 min from one IP… */
export const loginIpLimiter = createSafeRateLimiter({ windowMs: 5 * 60_000, max: 10, message: loginMessage });
/** …and 10 per 15 min against one account, whatever IPs the attempts come from. */
export const loginAccountLimiter = createSafeRateLimiter({
  windowMs: 15 * 60_000,
  max: 10,
  key: (req) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const id = String(b.identifier ?? b.email ?? b.username ?? '').trim().toLowerCase();
    return id ? `acct:${id}` : undefined;
  },
  message: loginMessage,
});

export const orderLimiter = createSafeRateLimiter({
  windowMs: 10_000,
  max: 200,
  message: { success: false, data: null, error: { code: 'RATE_LIMITED', message: 'Order rate limit exceeded' } },
});
