import { Router } from 'express';
import { prisma } from '../config/database';
import { ah } from '../utils/asyncHandler';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { withdrawalSchema } from '../schemas/wallet';
import { notify } from '../services/notificationService';
import { audit } from '../services/auditService';
import { emitToUser } from '../websocket/socketServer';

const r = Router();
r.use(requireAuth);

r.get('/', ah(async (req: AuthedRequest, res) => {
  const rows = await prisma.withdrawal.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ success: true, data: rows, error: null });
}));

r.post('/', validateBody(withdrawalSchema), ah(async (req: AuthedRequest, res) => {
  const { accountId, amount, method, details } = req.body as {
    accountId: string;
    amount: number;
    method: string;
    details?: Record<string, unknown>;
  };

  const parsedAmount = parseFloat(String(amount));
  if (!Number.isFinite(parsedAmount) || parsedAmount < 10) {
    res.status(400).json({ success: false, data: null, error: { code: 'MIN_WITHDRAWAL', message: 'Minimum withdrawal amount is $10.00' } });
    return;
  }

  const acct = await prisma.account.findFirst({ where: { id: accountId, userId: req.userId! } });
  if (!acct) {
    res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Account not found' } });
    return;
  }

  if (acct.accountType !== 'LIVE') {
    res.status(422).json({ success: false, data: null, error: { code: 'LIVE_ONLY', message: 'Only live account funds can be withdrawn' } });
    return;
  }

  // Lock funds immediately, release/apply on admin decision. The account row is locked so two
  // parallel requests (or a trade opening at the same time) can never reserve more than is there.
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Account" WHERE id = ${acct.id} FOR UPDATE`;
    const fresh = await tx.account.findUniqueOrThrow({ where: { id: acct.id } });
    const available = Number(fresh.balance) - Number(fresh.lockedBalance);
    if (parsedAmount > available) return { available };
    const locked = await tx.account.update({ where: { id: acct.id }, data: { lockedBalance: { increment: parsedAmount } } });
    const created = await tx.withdrawal.create({
      data: {
        userId: req.userId!,
        accountId: acct.id,
        amount: parsedAmount,
        currency: 'USD',
        method: method || 'bank',
        details: (details ?? {}) as never,
        status: 'REQUESTED',
      },
    });
    return { w: created, updatedLocked: Number(locked.lockedBalance), balance: Number(locked.balance) };
  });
  if (!('w' in result) || !result.w) {
    res.status(422).json({
      success: false,
      data: null,
      error: { code: 'INSUFFICIENT_BALANCE', message: `Insufficient available balance (Available: $${(result.available ?? 0).toFixed(2)})` },
    });
    return;
  }
  const { w, updatedLocked } = result as { w: NonNullable<typeof result.w>; updatedLocked: number };

  emitToUser(req.userId!, 'balance:updated', {
    accountId: acct.id,
    balance: result.balance,
    lockedBalance: updatedLocked,
  });

  await notify({
    userId: req.userId!,
    type: 'WITHDRAWAL',
    title: 'Withdrawal Requested',
    message: `$${parsedAmount.toFixed(2)} payout requested via ${method.toUpperCase()}. Under security review.`,
  });

  await audit({
    actorId: req.userId,
    action: 'WITHDRAWAL_REQUEST',
    entityType: 'Withdrawal',
    entityId: w.id,
    metadata: { amount: parsedAmount, method, details },
  });

  res.status(201).json({ success: true, data: w, error: null });
}));

// User cancels pending withdrawal: releases locked funds back to available balance
r.post('/:id/cancel', ah(async (req: AuthedRequest, res) => {
  const w = await prisma.withdrawal.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!w) {
    res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Withdrawal not found' } });
    return;
  }
  if (w.status !== 'REQUESTED' && w.status !== 'UNDER_REVIEW') {
    res.status(400).json({
      success: false,
      data: null,
      error: { code: 'CANNOT_CANCEL', message: `Withdrawal cannot be cancelled because it is already ${w.status}` },
    });
    return;
  }

  const done = await prisma.$transaction(async (tx) => {
    // conditional: if an admin moved it on meanwhile, nothing is released
    const claimed = await tx.withdrawal.updateMany({
      where: { id: w.id, status: { in: ['REQUESTED', 'UNDER_REVIEW'] } },
      data: { status: 'REJECTED', reviewNote: 'Cancelled by user' },
    });
    if (!claimed.count) return null;
    const ac = await tx.account.update({ where: { id: w.accountId }, data: { lockedBalance: { decrement: Number(w.amount) } } });
    const uw = await tx.withdrawal.findUniqueOrThrow({ where: { id: w.id } });
    return { updatedAcct: ac, updatedWithdrawal: uw };
  });
  if (!done) {
    res.status(409).json({ success: false, data: null, error: { code: 'CANNOT_CANCEL', message: 'Withdrawal is already being processed' } });
    return;
  }
  const { updatedAcct, updatedWithdrawal } = done;

  emitToUser(req.userId!, 'balance:updated', {
    accountId: w.accountId,
    balance: Number(updatedAcct.balance),
    lockedBalance: Number(updatedAcct.lockedBalance),
  });

  await notify({
    userId: req.userId!,
    type: 'WITHDRAWAL',
    title: 'Withdrawal Cancelled',
    message: `$${Number(w.amount).toFixed(2)} released back to your available balance.`,
  });

  res.json({ success: true, data: updatedWithdrawal, error: null });
}));

export default r;
