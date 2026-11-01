// Public, read-only data for the website (no login). Everything here is real platform data:
// nothing is generated, nothing identifies a user, and responses are cached for a few seconds
// so anonymous traffic cannot load the database.
import { Router } from 'express';
import { prisma } from '../config/database';
import { ah } from '../utils/asyncHandler';
import { getProvider } from '../services/marketService';
import { env } from '../config/env';
import { getPromoConfig } from '../promotions/config';
import { hashIp } from '../affiliate/service';
import { getAffiliateConfig } from '../affiliate/config';

const r = Router();

function cached<T>(ttlMs: number, load: () => Promise<T>): () => Promise<T> {
  let at = 0;
  let value: T | null = null;
  let inflight: Promise<T> | null = null;
  return async () => {
    if (value !== null && Date.now() - at < ttlMs) return value;
    inflight ??= load().then((v) => { value = v; at = Date.now(); return v; }).finally(() => { inflight = null; });
    return inflight;
  };
}

/** Last settled LIVE trades — market, direction, length and result only (no names, no amounts). */
const recentTrades = cached(5_000, async () => {
  const rows = await prisma.binaryOption.findMany({
    where: { status: { in: ['WON', 'LOST', 'TIE'] }, account: { accountType: 'LIVE' } },
    orderBy: { settledAt: 'desc' },
    take: 20,
    select: { id: true, direction: true, durationSec: true, payoutPct: true, status: true, settledAt: true, asset: { select: { symbol: true } } },
  });
  return rows.map((o) => ({
    id: o.id.slice(0, 8),
    symbol: o.asset.symbol,
    direction: o.direction,
    durationSec: o.durationSec,
    payoutPct: o.payoutPct,
    result: o.status,
    settledAt: o.settledAt?.toISOString() ?? null,
  }));
});

r.get('/recent-trades', ah(async (_req, res) => {
  res.json({ success: true, data: { trades: await recentTrades() }, error: null });
}));

/** Platform status: per-market quote freshness and whether settlement is keeping up. */
const status = cached(3_000, async () => {
  const provider = getProvider();
  const assets = await prisma.asset.findMany({ select: { symbol: true, name: true, enabled: true }, orderBy: { sortOrder: 'asc' } });
  const now = Date.now();
  const markets = assets.map((a) => {
    const age = provider.quoteAgeMs?.(a.symbol) ?? null;
    const state = !a.enabled ? 'closed' : age == null ? 'no-data' : age <= env.MAX_QUOTE_AGE_MS ? 'live' : 'delayed';
    return { symbol: a.symbol, name: a.name, state, otc: provider.isOtc?.(a.symbol) ?? true, quoteAgeMs: age };
  });
  // trades past expiry by more than 10s that are still open = settlement falling behind
  const [overdue, last] = await Promise.all([
    prisma.binaryOption.count({ where: { status: 'OPEN', expiresAt: { lt: new Date(now - 10_000) } } }),
    prisma.binaryOption.findFirst({ where: { settledAt: { not: null } }, orderBy: { settledAt: 'desc' }, select: { settledAt: true } }),
  ]);
  return {
    checkedAt: new Date(now).toISOString(),
    markets,
    settlement: { state: overdue === 0 ? 'ok' : 'delayed', overdueTrades: overdue, lastSettledAt: last?.settledAt?.toISOString() ?? null },
    overall: overdue > 0 || markets.some((m) => m.state === 'delayed' || m.state === 'no-data') ? 'degraded' : 'operational',
  };
});

r.get('/status', ah(async (_req, res) => {
  res.json({ success: true, data: await status(), error: null });
}));

/** Support channels — configured in the server .env (CONTACT_*); unset channels are not shown. */
r.get('/contact', (_req, res) => {
  const v = (k: string) => process.env[k]?.trim() || null;
  res.json({
    success: true,
    data: {
      email: v('CONTACT_EMAIL'),
      whatsapp: v('CONTACT_WHATSAPP'),   // international number, digits only, e.g. 919876543210
      telegram: v('CONTACT_TELEGRAM'),   // username without @
      hours: v('CONTACT_HOURS'),         // e.g. "Mon–Sat, 9:00–21:00 IST"
    },
    error: null,
  });
});

/** Tracking-link click: record it (once per network per hour) and return where to send the visitor. */
r.post('/aff-click', ah(async (req, res) => {
  const b = (req.body ?? {}) as { code?: string; lid?: string | number; sub?: string; clickId?: string };
  const code = String(b.code ?? '').toUpperCase();
  const lid = Number(b.lid);
  const byCode = /^[A-Z0-9]{4,16}$/.test(code);
  if (!byCode && !(Number.isInteger(lid) && lid > 0)) { res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Unknown link' } }); return; }
  const link = byCode ? await prisma.affiliateLink.findUnique({ where: { code } }) : await prisma.affiliateLink.findUnique({ where: { num: lid } });
  const aff = link && !link.archived ? await prisma.affiliate.findUnique({ where: { id: link.affiliateId }, select: { status: true } }) : null;
  if (!link || aff?.status !== 'APPROVED') { res.json({ success: true, data: { valid: false, landing: '/' }, error: null }); return; }
  const ipHash = hashIp(req.ip);
  const recent = ipHash ? await prisma.affiliateClick.count({ where: { linkId: link.id, ipHash, createdAt: { gte: new Date(Date.now() - 3_600_000) } } }) : 0;
  const hdr = String(req.headers['cf-ipcountry'] ?? req.headers['x-country-code'] ?? '').toUpperCase();
  const country = /^[A-Z]{2}$/.test(hdr) && hdr !== 'XX' ? hdr : null;
  if (!recent) await prisma.affiliateClick.create({ data: { linkId: link.id, ipHash, country, subId: (b.sub ?? link.subId ?? null)?.slice(0, 64) ?? null, clickId: b.clickId?.slice(0, 128) ?? null } });
  res.json({ success: true, data: { valid: true, landing: link.landing, code: link.code, sub: b.sub ?? link.subId ?? null }, error: null });
}));

/** Affiliate programme terms for the public site (same config the server applies). */
r.get('/affiliate-programs', ah(async (_req, res) => {
  const cfg = await getAffiliateConfig();
  res.json({ success: true, data: { levels: cfg.levels, turnoverCapPctOfDeposits: cfg.turnoverCapPctOfDeposits, subAffiliateCapUsd: cfg.subAffiliateCapUsd, minActiveTraders: cfg.minActiveTraders, minPayout: cfg.minPayout, payoutWeekday: cfg.payoutWeekday, cpaAvailable: Object.keys(cfg.cpa.rates).length > 0 }, error: null });
}));

/** Promotion terms for the public Promotions page (same config the server enforces). */
r.get('/promotions', ah(async (_req, res) => {
  const { bonus } = await getPromoConfig();
  res.json({ success: true, data: { bonus }, error: null });
}));

export default r;
