import { Router } from 'express';
import { prisma } from '../config/database';
import { ah } from '../utils/asyncHandler';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { env } from '../config/env';
import { accountNumber } from '../trading/executionEngine';
import { audit } from '../services/auditService';
import { netPnl } from '../services/pnlService';
import { getProvider } from '../services/marketService';

const r = Router();
r.use(requireAuth);

// List my accounts with live equity (balance + unrealized)
r.get('/', ah(async (req: AuthedRequest, res) => {
  const accounts = await prisma.account.findMany({ where: { userId: req.userId! }, orderBy: { createdAt: 'asc' } });
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

// Create a new DEMO account (LIVE disabled until provider configured)
r.post('/', ah(async (req: AuthedRequest, res) => {
  const { accountType } = (req.body ?? {}) as { accountType?: string };
  if (accountType === 'LIVE') {
    res.status(422).json({ success: false, data: null, error: { code: 'LIVE_TRADING_DISABLED', message: 'Live execution is disabled until a licensed execution provider is configured' } });
    return;
  }
  const acct = await prisma.account.create({
    data: { userId: req.userId!, accountNumber: accountNumber(), accountType: 'DEMO', currency: 'USD', balance: env.DEMO_STARTING_BALANCE, status: 'ACTIVE' },
  });
  await prisma.walletTransaction.create({ data: { accountId: acct.id, type: 'DEPOSIT', amount: env.DEMO_STARTING_BALANCE, balanceAfter: env.DEMO_STARTING_BALANCE, memo: 'Demo starting balance (simulated)' } });
  await audit({ actorId: req.userId, action: 'ACCOUNT_CREATE', entityType: 'Account', entityId: acct.id });
  res.status(201).json({ success: true, data: acct, error: null });
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
