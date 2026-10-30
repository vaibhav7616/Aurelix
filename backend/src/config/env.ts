import dotenv from 'dotenv';
dotenv.config();

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  API_PORT: parseInt(process.env.API_PORT ?? '4000', 10),
  DATABASE_URL: req('DATABASE_URL', 'postgresql://aurelix:aurelix_dev_secret@localhost:5432/aurelix?schema=public'),
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  JWT_SECRET: req('JWT_SECRET', 'dev-access-secret-change-me-please-32chars!!'),
  JWT_REFRESH_SECRET: req('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me-please-32chars!'),
  JWT_ACCESS_TTL: process.env.JWT_ACCESS_TTL ?? '15m',
  JWT_REFRESH_TTL: process.env.JWT_REFRESH_TTL ?? '7d',
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10),
  FRONTEND_URL: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  CORS_ORIGINS: (process.env.CORS_ORIGINS ?? `${process.env.FRONTEND_URL ?? 'http://localhost:5173'},http://localhost,http://localhost:80,http://localhost:5173,http://localhost:4000,http://127.0.0.1,http://127.0.0.1:80,http://127.0.0.1:5173,http://127.0.0.1:4000`)
    .split(',').map((s) => s.trim()).filter(Boolean),
  MARKET_PROVIDER: process.env.MARKET_PROVIDER ?? 'demo',
  PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER ?? 'demo',
  DEMO_STARTING_BALANCE: parseInt(process.env.DEMO_STARTING_BALANCE ?? '10000', 10),
  DEMO_TICK_INTERVAL_MS: parseInt(process.env.DEMO_TICK_INTERVAL_MS ?? '40', 10),
  /** a quote older than this is stale: no new trades open on it and settlement won't use it */
  MAX_QUOTE_AGE_MS: parseInt(process.env.MAX_QUOTE_AGE_MS ?? '5000', 10),
  isProd: (process.env.NODE_ENV ?? 'development') === 'production',
};

/** Production must never boot on development defaults — a known JWT secret lets anyone forge logins. */
export function productionConfigErrors(e: NodeJS.ProcessEnv): string[] {
  const errs: string[] = [];
  for (const k of ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'FRONTEND_URL', 'CORS_ORIGINS']) {
    if (!e[k]) errs.push(`${k} must be set`);
  }
  for (const k of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
    const v = e[k] ?? '';
    if (v && (v.length < 32 || /change-me|dev-/i.test(v))) errs.push(`${k} must be a random secret of 32+ characters`);
  }
  if (e.JWT_SECRET && e.JWT_SECRET === e.JWT_REFRESH_SECRET) errs.push('JWT_SECRET and JWT_REFRESH_SECRET must differ');
  if ((e.CORS_ORIGINS ?? '').split(',').some((o) => o.trim() === '*')) errs.push('CORS_ORIGINS must list exact origins, not *');
  if (/aurelix_dev_secret/.test(e.DATABASE_URL ?? '')) errs.push('DATABASE_URL uses the development database password');
  if ((e.MARKET_PROVIDER ?? 'demo') === 'demo') errs.push('MARKET_PROVIDER=demo runs on simulated prices — set MARKET_PROVIDER=real');
  return errs;
}

if (env.isProd) {
  const errs = productionConfigErrors(process.env);
  if (errs.length) {
    // eslint-disable-next-line no-console
    console.error(`[aurelix] refusing to start in production:\n  - ${errs.join('\n  - ')}`);
    process.exit(1);
  }
} else if (env.JWT_SECRET.length < 32 || env.JWT_REFRESH_SECRET.length < 32) {
  // eslint-disable-next-line no-console
  console.warn('[aurelix] WARNING: JWT secrets look short — use 32+ char secrets in production.');
}
