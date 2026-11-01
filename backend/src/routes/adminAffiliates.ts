// Admin: affiliate approval & verification, fraud holds, adjustments, payouts and support tickets.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { ah } from '../utils/asyncHandler';
import { requireAuth, requireAdmin, AuthedRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { Err } from '../utils/errors';
import { audit } from '../services/auditService';
import { balances, activeTraders, notifyTelegram } from '../affiliate/service';
import { ensureDefaultLinks } from './affiliate';

const r = Router();
r.use(requireAuth, requireAdmin);
const round2 = (n: number) => Math.round(n * 100) / 100;

r.get('/', ah(async (_req, res) => {
  const affs = await prisma.affiliate.findMany({ orderBy: { createdAt: 'desc' }, take: 300 });
  const users = new Map((await prisma.user.findMany({ where: { id: { in: affs.map((a) => a.userId) } }, select: { id: true, email: true } })).map((u) => [u.id, u.email]));
  const refs = await prisma.affiliateReferral.groupBy({ by: ['affiliateId', 'status'], _count: { _all: true } });
  const rows = await Promise.all(affs.map(async (a) => ({
    ...a, email: users.get(a.userId) ?? '—',
    ...(await balances(a.id)), activeTraders: await activeTraders(a.id),
    referrals: refs.filter((x) => x.affiliateId === a.id).reduce((s, x) => s + x._count._all, 0),
    suspicious: refs.find((x) => x.affiliateId === a.id && x.status === 'SUSPICIOUS')?._count._all ?? 0,
  })));
  res.json({ success: true, data: rows, error: null });
}));

r.post('/:id/status', validateBody(z.object({ status: z.enum(['APPROVED', 'REJECTED', 'BLOCKED', 'PENDING']), note: z.string().max(500).optional() })), ah(async (req: AuthedRequest, res) => {
  const { status, note } = req.body as { status: 'APPROVED' | 'REJECTED' | 'BLOCKED' | 'PENDING'; note?: string };
  const a = await prisma.affiliate.update({ where: { id: req.params.id }, data: { status, note: note ?? null, ...(status === 'APPROVED' ? { approvedAt: new Date() } : {}) } }).catch(() => null);
  if (!a) throw Err.notFound('Affiliate not found');
  if (status === 'APPROVED') await ensureDefaultLinks(a).catch(() => undefined);
  await audit({ actorId: req.userId, action: `AFFILIATE_${status}`, entityType: 'Affiliate', entityId: a.id, metadata: { note } });
  void notifyTelegram(a.id, `Aurelix Affiliate Center: your account status is now ${status.toLowerCase()}.`);
  res.json({ success: true, data: a, error: null });
}));

r.post('/:id/verify', validateBody(z.object({ verified: z.boolean() })), ah(async (req: AuthedRequest, res) => {
  const a = await prisma.affiliate.update({ where: { id: req.params.id }, data: { verified: (req.body as { verified: boolean }).verified } }).catch(() => null);
  if (!a) throw Err.notFound('Affiliate not found');
  await audit({ actorId: req.userId, action: 'AFFILIATE_VERIFY', entityType: 'Affiliate', entityId: a.id, metadata: { verified: a.verified } });
  res.json({ success: true, data: a, error: null });
}));

r.get('/:id/referrals', ah(async (req, res) => {
  const refs = await prisma.affiliateReferral.findMany({ where: { affiliateId: req.params.id }, orderBy: { registeredAt: 'desc' }, take: 300 });
  const users = new Map((await prisma.user.findMany({ where: { id: { in: refs.map((x) => x.userId) } }, select: { id: true, email: true } })).map((u) => [u.id, u.email]));
  const held = await prisma.affiliateLedger.groupBy({ by: ['referralId'], where: { referralId: { in: refs.map((x) => x.id) }, status: 'HELD' }, _sum: { amount: true } });
  res.json({ success: true, data: refs.map((x) => ({ ...x, email: users.get(x.userId), sharePct: Number(x.sharePct), depositTotal: Number(x.depositTotal), held: round2(Number(held.find((h) => h.referralId === x.id)?._sum.amount ?? 0)) })), error: null });
}));

/** Fraud review of one referral: release its held commission, or cancel it (and reject the referral). */
r.post('/referrals/:rid/review', validateBody(z.object({ action: z.enum(['release', 'cancel']), note: z.string().max(500).optional() })), ah(async (req: AuthedRequest, res) => {
  const { action, note } = req.body as { action: 'release' | 'cancel'; note?: string };
  const ref = await prisma.affiliateReferral.findUnique({ where: { id: req.params.rid } });
  if (!ref) throw Err.notFound('Referral not found');
  const out = await prisma.$transaction(async (tx) => {
    const rows = await tx.affiliateLedger.findMany({ where: { referralId: ref.id, status: action === 'release' ? 'HELD' : { in: ['HELD', 'ACCRUED'] } }, select: { uniqueKey: true } });
    const keys = rows.map((x) => x.uniqueKey);
    const subKeys = keys.map((k) => `sub:${k}`);
    const to = action === 'release' ? 'ACCRUED' : 'CANCELLED';
    const n = await tx.affiliateLedger.updateMany({ where: { uniqueKey: { in: [...keys, ...subKeys] }, status: action === 'release' ? 'HELD' : { in: ['HELD', 'ACCRUED'] } }, data: { status: to } });
    await tx.affiliateReferral.update({ where: { id: ref.id }, data: { status: action === 'release' ? 'ACTIVE' : 'REJECTED' } });
    return n.count;
  });
  await audit({ actorId: req.userId, action: `AFFILIATE_REFERRAL_${action.toUpperCase()}`, entityType: 'AffiliateReferral', entityId: ref.id, metadata: { rows: out, note } });
  res.json({ success: true, data: { updated: out }, error: null });
}));

r.post('/:id/adjust', validateBody(z.object({ amount: z.number().refine((v) => v !== 0 && Math.abs(v) <= 1e6), note: z.string().trim().min(5).max(500) })), ah(async (req: AuthedRequest, res) => {
  const { amount, note } = req.body as { amount: number; note: string };
  const a = await prisma.affiliate.findUnique({ where: { id: req.params.id } });
  if (!a) throw Err.notFound('Affiliate not found');
  const row = await prisma.affiliateLedger.create({ data: { affiliateId: a.id, type: 'ADJUSTMENT', amount: round2(amount), uniqueKey: `adj:${Date.now()}:${Math.random().toString(36).slice(2)}`, note: `${note} (by admin)` } });
  await audit({ actorId: req.userId, action: 'AFFILIATE_ADJUST', entityType: 'Affiliate', entityId: a.id, metadata: { amount, note } });
  res.json({ success: true, data: row, error: null });
}));

r.get('/payouts', ah(async (req, res) => {
  const status = req.query.status as string | undefined;
  const rows = await prisma.affiliatePayout.findMany({ where: status ? { status } : {}, orderBy: { createdAt: 'desc' }, take: 200 });
  const affs = await prisma.affiliate.findMany({ where: { id: { in: rows.map((p) => p.affiliateId) } }, select: { id: true, userId: true } });
  const emails = new Map((await prisma.user.findMany({ where: { id: { in: affs.map((a) => a.userId) } }, select: { id: true, email: true } })).map((u) => [u.id, u.email]));
  res.json({ success: true, data: rows.map((p) => ({ ...p, amount: Number(p.amount), email: emails.get(affs.find((a) => a.id === p.affiliateId)?.userId ?? '') ?? '—' })), error: null });
}));

/** Mark a payout as paid (sent outside the platform) or reject it (the amount returns to the balance). */
r.post('/payouts/:pid', validateBody(z.object({ action: z.enum(['paid', 'reject']), note: z.string().max(500).optional() })), ah(async (req: AuthedRequest, res) => {
  const { action, note } = req.body as { action: 'paid' | 'reject'; note?: string };
  const p = await prisma.affiliatePayout.findUnique({ where: { id: req.params.pid } });
  if (!p) throw Err.notFound('Payout not found');
  const done = await prisma.$transaction(async (tx) => {
    const n = await tx.affiliatePayout.updateMany({ where: { id: p.id, status: 'REQUESTED' }, data: { status: action === 'paid' ? 'PAID' : 'REJECTED', note: note ?? null, processedAt: new Date() } });
    if (!n.count) return false;
    if (action === 'reject') await tx.affiliateLedger.create({ data: { affiliateId: p.affiliateId, type: 'PAYOUT_REVERSAL', amount: Number(p.amount), uniqueKey: `payout-reversal:${p.id}`, refId: p.id, note: note ?? 'Payout rejected — amount returned to balance' } });
    return true;
  });
  if (!done) throw Err.conflict('Only requested payouts can be processed');
  await audit({ actorId: req.userId, action: `AFFILIATE_PAYOUT_${action.toUpperCase()}`, entityType: 'AffiliatePayout', entityId: p.id, metadata: { amount: Number(p.amount), note } });
  void notifyTelegram(p.affiliateId, action === 'paid' ? `Aurelix Affiliate Center: payout of $${Number(p.amount).toFixed(2)} was sent.` : `Aurelix Affiliate Center: payout of $${Number(p.amount).toFixed(2)} was rejected and returned to your balance.`);
  res.json({ success: true, data: { ok: true }, error: null });
}));

r.get('/tickets/all', ah(async (_req, res) => {
  const tickets = await prisma.affiliateTicket.findMany({ orderBy: { updatedAt: 'desc' }, take: 200 });
  res.json({ success: true, data: tickets, error: null });
}));
r.get('/tickets/:tid', ah(async (req, res) => {
  const t = await prisma.affiliateTicket.findUnique({ where: { id: req.params.tid } });
  if (!t) throw Err.notFound('Ticket not found');
  res.json({ success: true, data: { ticket: t, messages: await prisma.affiliateTicketMessage.findMany({ where: { ticketId: t.id }, orderBy: { createdAt: 'asc' } }) }, error: null });
}));
r.post('/tickets/:tid/reply', validateBody(z.object({ body: z.string().trim().min(1).max(5000) })), ah(async (req: AuthedRequest, res) => {
  const t = await prisma.affiliateTicket.findUnique({ where: { id: req.params.tid } });
  if (!t) throw Err.notFound('Ticket not found');
  await prisma.affiliateTicketMessage.create({ data: { ticketId: t.id, fromAdmin: true, body: (req.body as { body: string }).body } });
  await prisma.affiliateTicket.update({ where: { id: t.id }, data: { status: 'ANSWERED' } });
  void notifyTelegram(t.affiliateId, `Aurelix Affiliate Center: support replied to "${t.subject}".`);
  res.json({ success: true, data: { ok: true }, error: null });
}));

export default r;
