import { Router } from 'express';
import { prisma } from '../config/database';
import { ah } from '../utils/asyncHandler';
import { requireAuth, requireAdmin, AuthedRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { assetUpsertSchema, riskRuleSchema, reviewWithdrawalSchema, broadcastSchema } from '../schemas/admin';
import { adjustSchema } from '../schemas/wallet';
import { getRiskRules } from '../risk/riskEngine';
import { demoProvider, getProvider } from '../services/marketService';
import { audit } from '../services/auditService';
import { notify } from '../services/notificationService';
import { emitToUser } from '../websocket/socketServer';
import { parsePage, pageMeta } from '../utils/pagination';

const r = Router();
r.use(requireAuth, requireAdmin);

// Overview metrics
r.get('/overview', ah(async (_req, res) => {
  const [users, activeUsers, accounts, openPositions, trades, deposits, withdrawals, auditCount, openOptions, settledOptions] = await Promise.all([
    prisma.user.count(), prisma.user.count({ where: { status: 'ACTIVE' } }),
    prisma.account.count(), prisma.position.count({ where: { status: 'OPEN' } }),
    prisma.trade.findMany({ select: { realizedPnl: true, fee: true, quantity: true, entryPrice: true } }),
    prisma.deposit.aggregate({ _sum: { amount: true }, where: { status: 'COMPLETED' } }),
    prisma.withdrawal.aggregate({ _sum: { amount: true }, where: { status: 'COMPLETED' } }),
    prisma.auditLog.count(),
    prisma.binaryOption.count({ where: { status: 'OPEN' } }),
    prisma.binaryOption.findMany({ where: { status: { not: 'OPEN' } }, select: { stake: true, profit: true, status: true } }),
  ]);
  const optTurnover = settledOptions.reduce((a, o) => a + Number(o.stake), 0);
  const optClientPnl = settledOptions.reduce((a, o) => a + Number(o.profit ?? 0), 0);
  const optWins = settledOptions.filter((o) => o.status === 'WON').length;
  const volume = trades.reduce((a, t) => a + Number(t.quantity) * Number(t.entryPrice), 0);
  const fees = trades.reduce((a, t) => a + Number(t.fee), 0);
  const pnl = trades.reduce((a, t) => a + Number(t.realizedPnl), 0);
  res.json({ success: true, data: { users, activeUsers, accounts, openPositions: openPositions + openOptions, openOptions, settledOptions: settledOptions.length, optionTurnover: optTurnover, optionClientPnl: optClientPnl, houseEdge: -optClientPnl, optionWinRate: settledOptions.length ? (optWins / settledOptions.length) * 100 : 0, closedTrades: trades.length + settledOptions.length, volume: volume + optTurnover, fees, netPnl: pnl + optClientPnl, deposits: Number(deposits._sum.amount ?? 0), withdrawals: Number(withdrawals._sum.amount ?? 0), auditLogs: auditCount }, error: null });
}));

// Users
r.get('/users', ah(async (req, res) => {
  const { page, pageSize } = parsePage(req.query as Record<string, unknown>);
  const search = (req.query.search as string) || '';
  const where = search ? { OR: [{ email: { contains: search, mode: 'insensitive' as const } }, { firstName: { contains: search, mode: 'insensitive' as const } }] } : {};
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true, createdAt: true, _count: { select: { accounts: true } } } }),
  ]);
  res.json({ success: true, data: { items: rows, ...pageMeta(total, { page, pageSize }) }, error: null });
}));

r.get('/users/:id', ah(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, include: { accounts: true } });
  if (!user) { res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'User not found' } }); return; }
  const { passwordHash: _ph, ...safe } = user;
  res.json({ success: true, data: safe, error: null });
}));

r.post('/users/:id/suspend', ah(async (req: AuthedRequest, res) => {
  await prisma.user.update({ where: { id: req.params.id }, data: { status: 'SUSPENDED' } });
  await audit({ actorId: req.userId, action: 'USER_SUSPEND', entityType: 'User', entityId: req.params.id });
  res.json({ success: true, data: { ok: true }, error: null });
}));
r.post('/users/:id/activate', ah(async (req: AuthedRequest, res) => {
  await prisma.user.update({ where: { id: req.params.id }, data: { status: 'ACTIVE' } });
  await audit({ actorId: req.userId, action: 'USER_ACTIVATE', entityType: 'User', entityId: req.params.id });
  res.json({ success: true, data: { ok: true }, error: null });
}));

// Balance adjustment (requires reason + audit)
r.post('/adjust', validateBody(adjustSchema), ah(async (req: AuthedRequest, res) => {
  const { accountId, amount, reason } = req.body as { accountId: string; amount: number; reason: string };
  const out = await prisma.$transaction(async (tx) => {
    const acct = await tx.account.findUnique({ where: { id: accountId } });
    if (!acct) throw new Error('Account not found');
    const newBal = Number(acct.balance) + amount;
    if (newBal < 0) throw new Error('Adjustment would make balance negative');
    await tx.account.update({ where: { id: accountId }, data: { balance: newBal } });
    const txn = await tx.walletTransaction.create({ data: { accountId, type: 'ADJUSTMENT', amount, balanceAfter: newBal, memo: reason, metadata: { adminId: req.userId } as never } });
    return { newBal, txn };
  });
  const acct = await prisma.account.findUnique({ where: { id: accountId } });
  if (acct) emitToUser(acct.userId, 'balance:updated', { accountId, balance: out.newBal });
  await audit({ actorId: req.userId, action: 'BALANCE_ADJUST', entityType: 'Account', entityId: accountId, metadata: { amount, reason } });
  res.json({ success: true, data: out, error: null });
}));

// Assets
r.get('/assets', ah(async (_req, res) => {
  const rows = await prisma.asset.findMany({ orderBy: { sortOrder: 'asc' } });
  res.json({ success: true, data: rows, error: null });
}));
r.put('/assets', validateBody(assetUpsertSchema), ah(async (req: AuthedRequest, res) => {
  const b = req.body as { symbol: string; name: string; category: 'CRYPTO' | 'FOREX' | 'METALS' | 'INDICES'; enabled?: boolean; basePrice?: number; volatility?: number; spread?: number; feeBps?: number; minOrder?: number; maxOrder?: number; payoutPct?: number };
  const row = await prisma.asset.upsert({ where: { symbol: b.symbol }, update: { ...b }, create: { symbol: b.symbol, name: b.name, category: b.category, enabled: b.enabled ?? true, basePrice: b.basePrice ?? 100, volatility: b.volatility ?? 0.002, spread: b.spread ?? 0.0004, feeBps: b.feeBps ?? 10, minOrder: b.minOrder ?? 1, maxOrder: b.maxOrder ?? 100000 } });
  demoProvider()?.setEnabled(row.symbol, row.enabled);
  await demoProvider()?.reloadAssets().catch(() => undefined);
  await audit({ actorId: req.userId, action: 'ASSET_UPSERT', entityType: 'Asset', entityId: row.id, metadata: { symbol: row.symbol } });
  res.json({ success: true, data: row, error: null });
}));

// Risk rules
r.get('/risk', ah(async (_req, res) => {
  res.json({ success: true, data: await getRiskRules(), error: null });
}));
r.put('/risk', validateBody(riskRuleSchema), ah(async (req: AuthedRequest, res) => {
  const b = req.body as { maxOrderAmount: number; minOrderAmount: number; maxPositionAmount: number; maxOpenPositions: number; maxDailyLoss: number; maxTotalLoss: number; tradingEnabled: boolean };
  await prisma.riskRule.upsert({ where: { key: 'global' }, update: { ...b }, create: { key: 'global', ...b } });
  await audit({ actorId: req.userId, action: 'RISK_UPDATE', entityType: 'RiskRule', entityId: 'global', metadata: b as Record<string, unknown> });
  res.json({ success: true, data: await getRiskRules(), error: null });
}));

// Withdrawals review
r.get('/withdrawals', ah(async (req, res) => {
  const status = req.query.status as string | undefined;
  const rows = await prisma.withdrawal.findMany({ where: status ? { status: status as never } : {}, orderBy: { createdAt: 'desc' }, take: 100, include: { user: { select: { email: true } } } });
  res.json({ success: true, data: rows, error: null });
}));
r.post('/withdrawals/:id/review', validateBody(reviewWithdrawalSchema), ah(async (req: AuthedRequest, res) => {
  const { action, note } = req.body as { action: 'approve' | 'reject' | 'process' | 'complete'; note?: string };
  const w = await prisma.withdrawal.findUnique({ where: { id: req.params.id } });
  if (!w) { res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Withdrawal not found' } }); return; }
  const next = action === 'approve' ? 'APPROVED' : action === 'reject' ? 'REJECTED' : action === 'process' ? 'PROCESSING' : 'COMPLETED';
  await prisma.$transaction(async (tx) => {
    const acct = await tx.account.findUnique({ where: { id: w.accountId } });
    if (!acct) throw new Error('Account missing');
    if (next === 'REJECTED' && w.status !== 'REJECTED' && w.status !== 'COMPLETED') {
      // release lock
      await tx.account.update({ where: { id: acct.id }, data: { lockedBalance: Number(acct.lockedBalance) - Number(w.amount) } });
    }
    if (next === 'COMPLETED' && w.status !== 'COMPLETED') {
      const locked = Number(acct.lockedBalance) - Number(w.amount);
      const bal = Number(acct.balance) - Number(w.amount);
      await tx.account.update({ where: { id: acct.id }, data: { lockedBalance: Math.max(0, locked), balance: bal } });
      await tx.walletTransaction.create({ data: { accountId: acct.id, type: 'WITHDRAWAL', amount: -Number(w.amount), balanceAfter: bal, reference: w.id, memo: 'Withdrawal completed (demo)' } });
    }
    if ((next === 'APPROVED' || next === 'PROCESSING') && w.status === 'REQUESTED') {
      await tx.withdrawal.update({ where: { id: w.id }, data: { status: next as never, reviewedBy: req.userId, reviewNote: note } });
    } else {
      await tx.withdrawal.update({ where: { id: w.id }, data: { status: next as never, reviewedBy: req.userId, reviewNote: note } });
    }
  });
  await notify({ userId: w.userId, type: 'WITHDRAWAL', title: `Withdrawal ${next.toLowerCase()}`, message: `${w.amount} — ${note ?? next}` });
  await audit({ actorId: req.userId, action: `WITHDRAWAL_${next}`, entityType: 'Withdrawal', entityId: w.id, metadata: { note } });
  const updated = await prisma.withdrawal.findUnique({ where: { id: w.id } });
  res.json({ success: true, data: updated, error: null });
}));

// Binary options (platform-wide)
r.get('/options', ah(async (req, res) => {
  const { page, pageSize } = parsePage(req.query as Record<string, unknown>);
  const status = req.query.status as string | undefined;
  const where = status === 'OPEN' ? { status: 'OPEN' as const } : status === 'CLOSED' ? { status: { not: 'OPEN' as const } } : {};
  const [total, rows] = await Promise.all([
    prisma.binaryOption.count({ where }),
    prisma.binaryOption.findMany({ where, orderBy: { openedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { asset: { select: { symbol: true } }, account: { select: { accountNumber: true, user: { select: { email: true } } } } } }),
  ]);
  res.json({ success: true, data: { items: rows.map((o) => ({ ...o, stake: Number(o.stake), entryPrice: Number(o.entryPrice), closePrice: o.closePrice == null ? null : Number(o.closePrice), profit: o.profit == null ? null : Number(o.profit) })), ...pageMeta(total, { page, pageSize }) }, error: null });
}));

// Orders / trades / audit / market controls
r.get('/orders', ah(async (req, res) => {
  const { page, pageSize } = parsePage(req.query as Record<string, unknown>);
  const [total, rows] = await Promise.all([
    prisma.order.count(),
    prisma.order.findMany({ orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { asset: true } }),
  ]);
  res.json({ success: true, data: { items: rows, ...pageMeta(total, { page, pageSize }) }, error: null });
}));
r.get('/trades', ah(async (req, res) => {
  const { page, pageSize } = parsePage(req.query as Record<string, unknown>);
  const [total, rows] = await Promise.all([
    prisma.trade.count(),
    prisma.trade.findMany({ orderBy: { closedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { asset: true } }),
  ]);
  res.json({ success: true, data: { items: rows, ...pageMeta(total, { page, pageSize }) }, error: null });
}));
r.get('/audit', ah(async (req, res) => {
  const { page, pageSize } = parsePage(req.query as Record<string, unknown>);
  const [total, rows] = await Promise.all([
    prisma.auditLog.count(),
    prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  res.json({ success: true, data: { items: rows, ...pageMeta(total, { page, pageSize }) }, error: null });
}));
r.get('/accounts', ah(async (req, res) => {
  const { page, pageSize } = parsePage(req.query as Record<string, unknown>);
  const [total, rows] = await Promise.all([
    prisma.account.count(),
    prisma.account.findMany({
      orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
      include: { user: { select: { email: true } }, _count: { select: { positions: true, trades: true } } },
    }),
  ]);
  res.json({ success: true, data: { items: rows, ...pageMeta(total, { page, pageSize }) }, error: null });
}));

r.get('/positions', ah(async (_req, res) => {
  const rows = await prisma.position.findMany({
    where: { status: 'OPEN' }, orderBy: { openedAt: 'desc' }, take: 200,
    include: { asset: { select: { symbol: true } }, account: { include: { user: { select: { email: true } } } } },
  });
  res.json({ success: true, data: rows, error: null });
}));

r.get('/deposits', ah(async (req, res) => {
  const status = req.query.status as string | undefined;
  const rows = await prisma.deposit.findMany({
    where: status ? { status: status as never } : {}, orderBy: { createdAt: 'desc' }, take: 100,
    include: { user: { select: { email: true } } },
  });
  res.json({ success: true, data: rows, error: null });
}));

r.get('/market', ah(async (_req, res) => {
  const provider = getProvider();
  const symbols = demoProvider()?.getSymbols() ?? [];
  const ticks = await provider.getTicks(symbols).catch(() => []);
  const candleCount = await prisma.marketCandle.count().catch(() => 0);
  const assets = await prisma.asset.findMany({ select: { symbol: true, enabled: true } });
  res.json({
    success: true,
    data: {
      provider: provider.name, demo: provider.isDemo, symbols,
      enabled: assets.filter((a) => a.enabled).length, halted: assets.filter((a) => !a.enabled).length,
      persistedCandles: candleCount, serverTime: Date.now(), ticks,
    },
    error: null,
  });
}));

r.post('/market/reload', ah(async (req: AuthedRequest, res) => {
  await demoProvider()?.reloadAssets().catch(() => undefined);
  await audit({ actorId: req.userId, action: 'MARKET_RELOAD', entityType: 'MarketEngine' });
  res.json({ success: true, data: { ok: true }, error: null });
}));

r.post('/notifications/broadcast', validateBody(broadcastSchema), ah(async (req: AuthedRequest, res) => {
  const { title, message } = req.body as { title: string; message: string };
  const users = await prisma.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true }, take: 5000 });
  if (users.length) {
    await prisma.notification.createMany({
      data: users.map((u) => ({ userId: u.id, type: 'SYSTEM' as const, title, message })),
    });
    for (const u of users.slice(0, 500)) emitToUser(u.id, 'notification:new', { title, message });
  }
  await audit({ actorId: req.userId, action: 'NOTIFICATION_BROADCAST', entityType: 'Notification', metadata: { title, recipients: users.length } });
  res.status(201).json({ success: true, data: { recipients: users.length }, error: null });
}));

r.get('/settings', ah(async (_req, res) => {
  const rows = await prisma.systemSetting.findMany();
  res.json({ success: true, data: Object.fromEntries(rows.map((s) => [s.key, s.value])), error: null });
}));
r.put('/settings', ah(async (req: AuthedRequest, res) => {
  const body = (req.body ?? {}) as Record<string, string>;
  for (const [k, v] of Object.entries(body).slice(0, 50)) {
    if (typeof v !== 'string') continue;
    await prisma.systemSetting.upsert({ where: { key: k }, update: { value: v }, create: { key: k, value: v } });
  }
  await audit({ actorId: req.userId, action: 'SETTINGS_UPDATE', entityType: 'SystemSetting' });
  res.json({ success: true, data: { ok: true }, error: null });
}));

export default r;
