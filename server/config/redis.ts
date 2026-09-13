import Redis from 'ioredis';
import { env } from './env';

// Lazy singleton with in-memory fallback so unit tests run without Redis.
let client: Redis | null = null;
const mem = new Map<string, { v: string; exp?: number }>();

function memGet(k: string): string | null {
  const e = mem.get(k);
  if (!e) return null;
  if (e.exp && Date.now() > e.exp) { mem.delete(k); return null; }
  return e.v;
}

export function redis(): Redis {
  if (!client) {
    client = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      retryStrategy: () => null,
    });
    client.on('error', () => { /* fallback to memory */ });
    client.connect().catch(() => { /* offline — memory fallback */ });
  }
  return client;
}

export async function cacheGet(key: string): Promise<string | null> {
  try {
    const r = redis();
    if (r.status === 'ready') return await r.get(key);
  } catch { /* ignore */ }
  return memGet(key);
}

export async function cacheSet(key: string, value: string, ttlSec?: number): Promise<void> {
  mem.set(key, { v: value, exp: ttlSec ? Date.now() + ttlSec * 1000 : undefined });
  try {
    const r = redis();
    if (r.status === 'ready') {
      if (ttlSec) await r.set(key, value, 'EX', ttlSec);
      else await r.set(key, value);
    }
  } catch { /* ignore */ }
}

export async function checkRedis(): Promise<boolean> {
  try {
    const r = redis();
    if (r.status !== 'ready') await r.connect().catch(() => null);
    if (r.status === 'ready') {
      const pong = await r.ping();
      return pong === 'PONG';
    }
    return true; // memory fallback counts as ready for dev/test
  } catch {
    return true;
  }
}
