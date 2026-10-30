import { Request, Response, NextFunction } from 'express';

interface RateLimitOptions {
  windowMs: number;
  max: number;
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
      const ip =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.ip ||
        req.socket.remoteAddress ||
        'unknown';
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
  max: 500,
  message: { success: false, data: null, error: { code: 'RATE_LIMITED', message: 'Too many auth attempts' } },
});

export const orderLimiter = createSafeRateLimiter({
  windowMs: 10_000,
  max: 200,
  message: { success: false, data: null, error: { code: 'RATE_LIMITED', message: 'Order rate limit exceeded' } },
});
