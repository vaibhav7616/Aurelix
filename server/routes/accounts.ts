import { Router } from 'express';
import { prisma } from '../config/database';
import { ah } from '../utils/asyncHandler';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { env } from '../config/env';
import { accountNumber } from '../trading/executionEngine';
import { audit } from '../services/auditService';
import { netPnl } from '../services/pnlService';
import { getProvider } from '../services/marketService';

import { emitToUser } from '../websocket/socketServer';

const r = Router();
r.use(requireAuth);

// List my accounts with live equity (balance + unrealized)
r.get('/', ah(async (req: AuthedRequest, res) => {
  let accounts = await prisma.account.findMany({ where: { userId: req.userId! }, orderBy: { createdAt: 'asc' } });

  // Quotex standard: ensure every trader has both a DEMO and a LIVE account ready
  const hasDemo = accounts.some((a) => a.accountType === 'DEMO');
  const hasLive = accounts.some((a) => a.accountType === 'LIVE');

  if (!hasDemo) {
    const demo = await prisma.account.create({
      data: {
        userId: req.userId!,
        accountNumber: `AX-DEMO-${Math.floor(100000 + Math.random() * 900000)}`,
        accountType: 'DEMO',
        currency: 'USD',
        balance: env.DEMO_STARTING_BALANCE,
        status: 'ACTIVE',
      },
    });
    await prisma.walletTransaction.create({
      data: { accountId: demo.id, type: 'DEPOSIT', amount: env.DEMO_STARTING_BALANCE, balanceAfter: env.DEMO_STARTING_BALANCE, memo: 'Demo starting balance (simulated)' },
    });
    accounts.push(demo);
  }

  if (!hasLive) {
    const live = await prisma.account.create({
      data: {
        userId: req.userId!,
        accountNumber: `AX-LIVE-${Math.floor(100000 + Math.random() * 900000)}`,
        accountType: 'LIVE',
        currency: 'USD',
        balance: 0,
        status: 'ACTIVE',
      },
    });
    await prisma.walletTransaction.create({
      data: { accountId: live.id, type: 'ADJUSTMENT', amount: 0, balanceAfter: 0, memo: 'Live account opened' },
    });
    accounts.push(live);
  }

  const provider = getProvider();
  const out = [];
  for (const a of accounts) {
    const positions = await prisma.position.findMany({ where: { accountId: a.id, status: 'OPEN' }, include: { asset: true } });
    let unrealized = 0;
    for (const p of positions) {
      const t = await provider.getTick(p.asset.symbol).catch(() => null);
      const cur = t?.mid ?? Number(p.currentPrice);
      unrealized += netPnl({ side: p.side as 'BUY' | 'SELL', entryPrice: Number(p.entryPrice), currentPrice: cur, quantity: Number(p.quantity), feeBps: 0 }).gross;
    }
    const balance = Number(a.balance);
    out.push({ ...a, balance, lockedBalance: Number(a.lockedBalance), unrealizedPnl: unrealized, equity: balance + unrealized, openPositions: positions.length });
  }
  res.json({ success: true, data: out, error: null });
}));

// Create a new account (LIVE or DEMO)
r.post('/', ah(async (req: AuthedRequest, res) => {
  const { accountType = 'LIVE', initialBalance = 0 } = (req.body ?? {}) as { accountType?: string; initialBalance?: number };
  const isLive = accountType === 'LIVE';
  const prefix = isLive ? 'AX-LIVE' : 'AX-DEMO';
  const balance = isLive ? Math.max(0, Number(initialBalance) || 0) : env.DEMO_STARTING_BALANCE;

  const acct = await prisma.account.create({
    data: {
      userId: req.userId!,
      accountNumber: `${prefix}-${Math.floor(100000 + Math.random() * 900000)}`,
      accountType: isLive ? 'LIVE' : 'DEMO',
      currency: 'USD',
      balance,
      status: 'ACTIVE',
    },
  });
  if (balance > 0) {
    await prisma.walletTransaction.create({
      data: {
        accountId: acct.id,
        type: 'DEPOSIT',
        amount: balance,
        balanceAfter: balance,
        memo: isLive ? 'Live account opening deposit' : 'Demo starting balance',
      },
    });
  }
  await audit({ actorId: req.userId, action: 'ACCOUNT_CREATE', entityType: 'Account', entityId: acct.id, metadata: { accountType: acct.accountType } });
  res.status(201).json({ success: true, data: acct, error: null });
}));

// Reset Demo account balance to $10,000 (Quotex signature refresh button)
r.post('/:id/reset-demo', ah(async (req: AuthedRequest, res) => {
  const acct = await prisma.account.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!acct) { res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Account not found' } }); return; }
  const newBal = env.DEMO_STARTING_BALANCE;
  const diff = newBal - Number(acct.balance);
  await prisma.account.update({ where: { id: acct.id }, data: { balance: newBal } });
  await prisma.walletTransaction.create({
    data: {
      accountId: acct.id,
      type: 'DEPOSIT',
      amount: diff,
      balanceAfter: newBal,
      memo: 'Demo balance reload to $10,000',
    },
  });
  emitToUser(req.userId!, 'balance:updated', { accountId: acct.id, balance: newBal });
  res.json({ success: true, data: { id: acct.id, balance: newBal, accountType: acct.accountType }, error: null });
}));

// Dashboard stats — all from backend
r.get('/:id/stats', ah(async (req: AuthedRequest, res) => {
  const acct = await prisma.account.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!acct) { res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Account not found' } }); return; }
  const [settled, open, legacyOpen] = await Promise.all([
    prisma.binaryOption.findMany({ where: { accountId: acct.id, status: { in: ['WON', 'LOST', 'TIE'] } }, select: { profit: true, settledAt: true, status: true } }),
    prisma.binaryOption.findMany({ where: { accountId: acct.id, status: 'OPEN' }, select: { stake: true } }),
    prisma.position.findMany({ where: { accountId: acct.id, status: 'OPEN' }, select: { unrealizedPnl: true } }),
  ]);
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
  const realized = settled.map((t) => ({ v: Number(t.profit ?? 0), d: t.settledAt ?? new Date(0), s: t.status }));
  const totalPnl = realized.reduce((a, b) => a + b.v, 0);
  const todayPnl = realized.filter((t) => t.d >= todayStart).reduce((a, b) => a + b.v, 0);
  const wins = realized.filter((t) => t.s === 'WON').length;
  const losses = realized.filter((t) => t.s === 'LOST').length;
  const inTrade = open.reduce((a, o) => a + Number(o.stake), 0);
  const unrealized = legacyOpen.reduce((a, p) => a + Number(p.unrealizedPnl), 0);
  res.json({
    success: true,
    data: {
      balance: Number(acct.balance), available: Number(acct.balance) - Number(acct.lockedBalance),
      // equity = cash + stakes currently locked in running trades (they return on win/tie)
      equity: Number(acct.balance) + inTrade + unrealized, unrealizedPnl: unrealized, inTrade,
      todayPnl, totalPnl, openPositions: open.length,
      totalTrades: settled.length, wins, losses,
      winRate: settled.length ? (wins / settled.length) * 100 : 0,
    },
    error: null,
  });
}));

export default r;
