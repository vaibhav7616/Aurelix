// Fixed-time (binary) options — the primary trading product.
import { Router } from 'express';
import { prisma } from '../config/database';
import { ah } from '../utils/asyncHandler';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { openOptionSchema, pendingOptionSchema } from '../schemas/trading';
import { openOption, listOptions, optionStats, OPTION_DURATIONS_SEC, MIN_DURATION_SEC, MAX_DURATION_SEC, FIXED_TIME_MIN_LEAD_SEC } from '../trading/optionsEngine';
import { createPending, cancelPending, listPending, PENDING_VALIDITY_MS } from '../trading/pendingEngine';
import { parsePage, pageMeta } from '../utils/pagination';
import { orderLimiter } from '../middleware/rateLimit';
import { Err } from '../utils/errors';

const r = Router();
r.use(requireAuth);

// Product config for the ticket (durations, limits, per-asset payout)
r.get('/config', ah(async (_req, res) => {
  const assets = await prisma.asset.findMany({ select: { symbol: true, payoutPct: true, minOrder: true, maxOrder: true, enabled: true }, orderBy: { sortOrder: 'asc' } });
  res.json({
    success: true,
    data: {
      durations: OPTION_DURATIONS_SEC,
      minDurationSec: MIN_DURATION_SEC,
      maxDurationSec: MAX_DURATION_SEC,
      fixedTimeMinLeadSec: FIXED_TIME_MIN_LEAD_SEC,
      pendingValidityMs: PENDING_VALIDITY_MS,
      serverTime: Date.now(),
      assets: assets.map((a) => ({ symbol: a.symbol, payoutPct: a.payoutPct, minStake: Number(a.minOrder), maxStake: Number(a.maxOrder), enabled: a.enabled })),
    },
    error: null,
  });
}));

// Open a trade: stake debited now, settled server-side at expiry
r.post('/', orderLimiter, validateBody(openOptionSchema), ah(async (req: AuthedRequest, res) => {
  const b = req.body as { accountId: string; symbol: string; direction: 'UP' | 'DOWN'; stake: number; durationSec?: number; expiresAt?: number };
  const result = await openOption({
    userId: req.userId!, accountId: b.accountId, symbol: b.symbol, direction: b.direction, stake: b.stake, durationSec: b.durationSec, expiresAt: b.expiresAt,
    idempotencyKey: req.headers['idempotency-key'] as string | undefined,
    ip: req.ip, userAgent: req.headers['user-agent'],
  });
  res.status(result.replayed ? 200 : 201).json({ success: true, data: result, error: null });
}));

// Pending trades (execution by price): stake reserved now, trade opens when the quote reaches targetPrice
r.post('/pending', orderLimiter, validateBody(pendingOptionSchema), ah(async (req: AuthedRequest, res) => {
  const b = req.body as { accountId: string; symbol: string; direction: 'UP' | 'DOWN'; stake: number; durationSec: number; targetPrice: number };
  const out = await createPending({ userId: req.userId!, ...b, ip: req.ip, userAgent: req.headers['user-agent'] });
  res.status(201).json({ success: true, data: out, error: null });
}));
r.get('/pending', ah(async (req: AuthedRequest, res) => {
  const accountId = req.query.accountId as string | undefined;
  const all = String(req.query.all ?? '') === 'true';
  res.json({ success: true, data: await listPending(req.userId!, accountId, !all), error: null });
}));
r.delete('/pending/:id', ah(async (req: AuthedRequest, res) => {
  res.json({ success: true, data: await cancelPending(req.userId!, req.params.id), error: null });
}));

// Open (running) trades
r.get('/open', ah(async (req: AuthedRequest, res) => {
  const accountId = req.query.accountId as string | undefined;
  const { items } = await listOptions({ userId: req.userId!, accountId, status: 'OPEN', page: 1, pageSize: 200 });
  res.json({ success: true, data: items, error: null });
}));

// Settled trade history (paginated)
r.get('/history', ah(async (req: AuthedRequest, res) => {
  const { page, pageSize } = parsePage(req.query as Record<string, unknown>);
  const accountId = req.query.accountId as string | undefined;
  const { items, total } = await listOptions({ userId: req.userId!, accountId, status: 'CLOSED', page, pageSize });
  const result = (req.query.result as string | undefined)?.toUpperCase();
  const filtered = result && ['WON', 'LOST', 'TIE'].includes(result) ? items.filter((o) => o.status === result) : items;
  res.json({ success: true, data: { items: filtered, ...pageMeta(total, { page, pageSize }) }, error: null });
}));

// Per-account option statistics (dashboard)
r.get('/stats', ah(async (req: AuthedRequest, res) => {
  const accountId = req.query.accountId as string | undefined;
  const acct = accountId
    ? await prisma.account.findFirst({ where: { id: accountId, userId: req.userId! } })
    : await prisma.account.findFirst({ where: { userId: req.userId! }, orderBy: { createdAt: 'asc' } });
  if (!acct) throw Err.notFound('Account not found');
  res.json({ success: true, data: { accountId: acct.id, ...(await optionStats(acct.id)) }, error: null });
}));

r.get('/:id', ah(async (req: AuthedRequest, res) => {
  const o = await prisma.binaryOption.findFirst({ where: { id: req.params.id, userId: req.userId! }, include: { asset: true } });
  if (!o) throw Err.notFound('Trade not found');
  res.json({ success: true, data: { ...o, symbol: o.asset.symbol, stake: Number(o.stake), entryPrice: Number(o.entryPrice), closePrice: o.closePrice == null ? null : Number(o.closePrice), profit: o.profit == null ? null : Number(o.profit) }, error: null });
}));

export default r;
