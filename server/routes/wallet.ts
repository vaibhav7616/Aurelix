import { Router } from 'express';
import { prisma } from '../config/database';
import { ah } from '../utils/asyncHandler';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { depositSchema } from '../schemas/wallet';
import { getPaymentProvider } from '../payments';
import { parsePage, pageMeta } from '../utils/pagination';
import { emitToUser } from '../websocket/socketServer';
import { notify } from '../services/notificationService';
import { audit } from '../services/auditService';

const r = Router();
r.use(requireAuth);

r.get('/:accountId', ah(async (req: AuthedRequest, res) => {
  const acct = await prisma.account.findFirst({ where: { id: req.params.accountId, userId: req.userId! } });
  if (!acct) { res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Account not found' } }); return; }
  res.json({ success: true, data: { balance: Number(acct.balance), locked: Number(acct.lockedBalance), available: Number(acct.balance) - Number(acct.lockedBalance), currency: acct.currency }, error: null });
}));

r.get('/:accountId/transactions', ah(async (req: AuthedRequest, res) => {
  const acct = await prisma.account.findFirst({ where: { id: req.params.accountId, userId: req.userId! } });
  if (!acct) { res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Account not found' } }); return; }
  const { page, pageSize } = parsePage(req.query as Record<string, unknown>);
  const type = req.query.type as string | undefined;
  const where = { accountId: acct.id, ...(type ? { type: type as never } : {}) };
  const [total, rows] = await Promise.all([
    prisma.walletTransaction.count({ where }),
    prisma.walletTransaction.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  res.json({ success: true, data: { items: rows, ...pageMeta(total, { page, pageSize }) }, error: null });
}));

// Demo deposit — simulated funds via payment abstraction
r.post('/deposit', validateBody(depositSchema), ah(async (req: AuthedRequest, res) => {
  const { accountId, amount, currency } = req.body as { accountId: string; amount: number; currency: string };
  const acct = await prisma.account.findFirst({ where: { id: accountId, userId: req.userId! } });
  if (!acct) { res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Account not found' } }); return; }
  const provider = getPaymentProvider();
  const pay = await provider.createPayment({ userId: req.userId!, accountId, amount, currency });
  const out = await prisma.$transaction(async (tx) => {
    const fresh = await tx.account.findUnique({ where: { id: acct.id } });
    if (!fresh) throw new Error('Account missing');
    const newBal = Number(fresh.balance) + amount;
    await tx.account.update({ where: { id: acct.id }, data: { balance: newBal } });
    await tx.walletTransaction.create({ data: { accountId: acct.id, type: 'DEPOSIT', amount, balanceAfter: newBal, reference: pay.providerRef, memo: `Demo deposit (simulated, ${provider.name})` } });
    const dep = await tx.deposit.create({ data: { userId: req.userId!, accountId: acct.id, amount, currency, provider: provider.name, providerRef: pay.providerRef, status: 'COMPLETED' } });
    return { newBal, dep };
  });
  emitToUser(req.userId!, 'balance:updated', { accountId: acct.id, balance: out.newBal });
  await notify({ userId: req.userId!, type: 'DEPOSIT', title: 'Deposit completed (demo)', message: `+${amount} ${currency} (simulated)` });
  await audit({ actorId: req.userId, action: 'DEPOSIT', entityType: 'Deposit', entityId: out.dep.id, metadata: { amount, provider: provider.name } });
  res.status(201).json({ success: true, data: { balance: out.newBal, providerRef: pay.providerRef, simulated: true }, error: null });
}));

export default r;
