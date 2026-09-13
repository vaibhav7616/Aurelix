import { Router } from 'express';
import { prisma } from '../config/database';
import { ah } from '../utils/asyncHandler';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { withdrawalSchema } from '../schemas/wallet';
import { notify } from '../services/notificationService';
import { audit } from '../services/auditService';

const r = Router();
r.use(requireAuth);

r.get('/', ah(async (req: AuthedRequest, res) => {
  const rows = await prisma.withdrawal.findMany({ where: { userId: req.userId! }, orderBy: { createdAt: 'desc' }, take: 50 });
  res.json({ success: true, data: rows, error: null });
}));

r.post('/', validateBody(withdrawalSchema), ah(async (req: AuthedRequest, res) => {
  const { accountId, amount, method, details } = req.body as { accountId: string; amount: number; method: string; details?: Record<string, unknown> };
  const acct = await prisma.account.findFirst({ where: { id: accountId, userId: req.userId! } });
  if (!acct) { res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Account not found' } }); return; }
  const available = Number(acct.balance) - Number(acct.lockedBalance);
  if (amount > available) { res.status(422).json({ success: false, data: null, error: { code: 'INSUFFICIENT_BALANCE', message: 'Insufficient available balance' } }); return; }
  // Lock funds immediately, release/apply on admin decision
  const w = await prisma.$transaction(async (tx) => {
    await tx.account.update({ where: { id: acct.id }, data: { lockedBalance: Number(acct.lockedBalance) + amount } });
    return tx.withdrawal.create({ data: { userId: req.userId!, accountId: acct.id, amount, method, details: (details ?? {}) as never, status: 'REQUESTED' } });
  });
  await notify({ userId: req.userId!, type: 'WITHDRAWAL', title: 'Withdrawal requested', message: `${amount} under review (demo)` });
  await audit({ actorId: req.userId, action: 'WITHDRAWAL_REQUEST', entityType: 'Withdrawal', entityId: w.id, metadata: { amount } });
  res.status(201).json({ success: true, data: w, error: null });
}));

export default r;
