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

  const available = Number(acct.balance) - Number(acct.lockedBalance);
  if (parsedAmount > available) {
    res.status(422).json({
      success: false,
      data: null,
      error: { code: 'INSUFFICIENT_BALANCE', message: `Insufficient available balance (Available: $${available.toFixed(2)})` },
    });
    return;
  }

  // Lock funds immediately, release/apply on admin decision
  const { w, updatedLocked } = await prisma.$transaction(async (tx) => {
    const nextLocked = Number(acct.lockedBalance) + parsedAmount;
    await tx.account.update({
      where: { id: acct.id },
      data: { lockedBalance: nextLocked },
    });
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
    return { w: created, updatedLocked: nextLocked };
  });

  emitToUser(req.userId!, 'balance:updated', {
    accountId: acct.id,
    balance: Number(acct.balance),
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

  const { updatedAcct, updatedWithdrawal } = await prisma.$transaction(async (tx) => {
    const acct = await tx.account.findUnique({ where: { id: w.accountId } });
    if (!acct) throw new Error('Account missing');
    const newLocked = Math.max(0, Number(acct.lockedBalance) - Number(w.amount));
    const ac = await tx.account.update({
      where: { id: acct.id },
      data: { lockedBalance: newLocked },
    });
    const uw = await tx.withdrawal.update({
      where: { id: w.id },
      data: { status: 'REJECTED', reviewNote: 'Cancelled by user' },
    });
    return { updatedAcct: ac, updatedWithdrawal: uw };
  });

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
