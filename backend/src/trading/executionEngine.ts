// ExecutionEngine — authoritative order execution with full txn safety + idempotency.
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../config/database';
import { Err } from '../utils/errors';
import { getRiskRules, evaluateRisk } from '../risk/riskEngine';
import { feeFor } from '../services/pnlService';
import { getProvider } from '../services/marketService';
import { emitToUser } from '../websocket/socketServer';
import { notify } from '../services/notificationService';
import { audit } from '../services/auditService';
import { randomUUID } from 'crypto';

export interface ExecuteOrderInput {
  userId: string;
  accountId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  amount: number;
  stopLoss?: number;
  takeProfit?: number;
  idempotencyKey?: string;
  ip?: string;
  userAgent?: string;
}

function accountNumber(): string {
  return `AX-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1e6).toString().padStart(6, '0')}`;
}
export { accountNumber };

export async function executeOrder(input: ExecuteOrderInput) {
  const provider = getProvider();
  const key = input.idempotencyKey?.trim();

  // Idempotency: return stored response if replayed
  if (key) {
    const existing = await prisma.idempotencyKey.findUnique({ where: { key } }).catch(() => null);
    if (existing?.response) return { ...(existing.response as object), replayed: true };
    // order with same key already created but response not stored yet
    const dup = await prisma.order.findUnique({ where: { idempotencyKey: key } }).catch(() => null);
    if (dup) return { orderId: dup.id, replayed: true };
  }

  const [account, asset] = await Promise.all([
    prisma.account.findFirst({ where: { id: input.accountId, userId: input.userId } }),
    prisma.asset.findUnique({ where: { symbol: input.symbol } }),
  ]);
  if (!account) throw Err.notFound('Trading account not found');
  if (!asset) throw Err.notFound('Asset not found');

  const tick = await provider.getTick(input.symbol);
  if (!tick) throw Err.assetDisabled();
  const execPrice = input.side === 'BUY' ? tick.ask : tick.bid;

  // Gather risk context
  const [openCount, todayTrades, totalTrades] = await Promise.all([
    prisma.position.count({ where: { accountId: account.id, status: 'OPEN' } }),
    prisma.trade.findMany({ where: { accountId: account.id, closedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } }, select: { realizedPnl: true } }),
    prisma.trade.findMany({ where: { accountId: account.id }, select: { realizedPnl: true } }),
  ]);
  const sum = (rows: Array<{ realizedPnl: Decimal }>) => rows.reduce((a, r) => a + Number(r.realizedPnl), 0);
  const rules = await getRiskRules();

  evaluateRisk(
    {
      userId: input.userId,
      accountId: account.id,
      accountType: account.accountType,
      accountStatus: account.status,
      availableBalance: Number(account.balance) - Number(account.lockedBalance),
      assetEnabled: asset.enabled,
      symbol: asset.symbol,
      amount: input.amount,
      openPositionsCount: openCount,
      todayRealizedPnl: sum(todayTrades),
      totalRealizedPnl: sum(totalTrades),
    },
    rules
  );

  if (input.amount < Number(asset.minOrder) || input.amount > Number(asset.maxOrder)) throw Err.invalidAmount();

  // SL/TP sanity vs execution price
  if (input.stopLoss != null) {
    if (input.side === 'BUY' && input.stopLoss >= execPrice) throw Err.validation('Stop-loss must be below entry for BUY');
    if (input.side === 'SELL' && input.stopLoss <= execPrice) throw Err.validation('Stop-loss must be above entry for SELL');
  }
  if (input.takeProfit != null) {
    if (input.side === 'BUY' && input.takeProfit <= execPrice) throw Err.validation('Take-profit must be above entry for BUY');
    if (input.side === 'SELL' && input.takeProfit >= execPrice) throw Err.validation('Take-profit must be below entry for SELL');
  }

  const fee = feeFor(input.amount, asset.feeBps);
  const quantity = input.amount / execPrice;

  // Atomic: order + position + ledger(open fee debit 0? we charge fee at close; record open txn 0) + balance unchanged until close ( unrealized )
  // We lock the notional? For DEMO simplicity: margin-free, balance changes only on realized P/L; but validate sufficiency above.
  const orderId = randomUUID();
  const positionId = randomUUID();

  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        id: orderId,
        userId: input.userId,
        accountId: account.id,
        assetId: asset.id,
        side: input.side,
        amount: input.amount,
        quantity,
        entryPrice: execPrice,
        stopLoss: input.stopLoss ?? null,
        takeProfit: input.takeProfit ?? null,
        status: 'OPEN',
        idempotencyKey: key || null,
      },
    });
    const position = await tx.position.create({
      data: {
        id: positionId,
        userId: input.userId,
        accountId: account.id,
        assetId: asset.id,
        orderId: order.id,
        side: input.side,
        quantity,
        entryPrice: execPrice,
        currentPrice: execPrice,
        stopLoss: input.stopLoss ?? null,
        takeProfit: input.takeProfit ?? null,
        unrealizedPnl: -fee, // open fee reflected immediately
        status: 'OPEN',
      },
    });
    if (key) {
      await tx.idempotencyKey.upsert({
        where: { key },
        update: {},
        create: { key, userId: input.userId, route: 'POST /api/v1/orders', expiresAt: new Date(Date.now() + 24 * 3600_000) },
      });
    }
    return { order, position, fee };
  });

  if (key) {
    await prisma.idempotencyKey.update({ where: { key }, data: { response: { orderId, positionId, entryPrice: execPrice } as never } }).catch(() => undefined);
  }

  emitToUser(input.userId, 'order:created', { id: orderId, symbol: asset.symbol, side: input.side, amount: input.amount, entryPrice: execPrice });
  emitToUser(input.userId, 'position:opened', { id: positionId, symbol: asset.symbol, side: input.side, quantity, entryPrice: execPrice });
  await notify({ userId: input.userId, type: 'ORDER', title: `${input.side} ${asset.symbol} opened`, message: `${input.amount} @ ${execPrice}`, metadata: { orderId } });
  await audit({ actorId: input.userId, action: 'ORDER_OPEN', entityType: 'Order', entityId: orderId, metadata: { symbol: asset.symbol, side: input.side, amount: input.amount, entry: execPrice }, ipAddress: input.ip, userAgent: input.userAgent });

  return { orderId, positionId, entryPrice: execPrice, quantity, fee, replayed: false };
}

export async function closePosition(input: { userId: string; positionId: string; ip?: string; userAgent?: string }) {
  const position = await prisma.position.findFirst({
    where: { id: input.positionId, userId: input.userId, status: 'OPEN' },
    include: { asset: true, account: true },
  });
  if (!position) throw Err.notFound('Open position not found');
  if (position.account.status !== 'ACTIVE') throw Err.accountSuspended();

  const provider = getProvider();
  const tick = await provider.getTick(position.asset.symbol);
  if (!tick) throw Err.assetDisabled();
  const exit = position.side === 'BUY' ? tick.bid : tick.ask;
  const entry = Number(position.entryPrice);
  const qty = Number(position.quantity);
  const gross = position.side === 'BUY' ? (exit - entry) * qty : (entry - exit) * qty;
  const fee = feeFor(exit * qty, position.asset.feeBps);
  const realized = gross - fee;

  const out = await prisma.$transaction(async (tx) => {
    const fresh = await tx.position.findUnique({ where: { id: position.id } });
    if (!fresh || fresh.status !== 'OPEN') throw Err.conflict('Position already closed');
    const acct = await tx.account.findUnique({ where: { id: position.accountId } });
    if (!acct) throw Err.notFound('Account not found');
    const newBal = Number(acct.balance) + realized;
    await tx.account.update({ where: { id: acct.id }, data: { balance: newBal } });
    await tx.walletTransaction.create({
      data: { accountId: acct.id, type: 'TRADE', amount: realized, balanceAfter: newBal, reference: position.id, memo: `Manual close ${position.asset.symbol}` },
    });
    await tx.position.update({ where: { id: position.id }, data: { status: 'CLOSED', closedAt: new Date(), currentPrice: exit, unrealizedPnl: 0 } });
    await tx.order.updateMany({ where: { id: fresh.orderId }, data: { status: 'CLOSED' } });
    const trade = await tx.trade.create({
      data: {
        userId: position.userId, accountId: position.accountId, assetId: position.assetId,
        positionId: position.id, orderId: fresh.orderId, side: position.side, quantity: position.quantity,
        entryPrice: position.entryPrice, exitPrice: exit, realizedPnl: realized, fee,
        openedAt: fresh.openedAt, closeReason: 'MANUAL',
      },
    });
    return { trade, newBal };
  });

  emitToUser(input.userId, 'position:closed', { id: position.id, exitPrice: exit, realizedPnl: realized, reason: 'MANUAL' });
  emitToUser(input.userId, 'balance:updated', { accountId: position.accountId, balance: out.newBal });
  await notify({ userId: input.userId, type: 'TRADE', title: `Position closed ${realized >= 0 ? '+' : ''}${realized.toFixed(2)}`, message: `${position.side} ${position.asset.symbol} @ ${exit}`, metadata: { positionId: position.id } });
  await audit({ actorId: input.userId, action: 'POSITION_CLOSE', entityType: 'Position', entityId: position.id, metadata: { exit, realized }, ipAddress: input.ip, userAgent: input.userAgent });

  return { positionId: position.id, exitPrice: exit, realizedPnl: realized, fee, balance: out.newBal };
}
