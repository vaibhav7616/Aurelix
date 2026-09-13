// Integration test for the full demo trading lifecycle.
// Requires DATABASE_URL (postgres). Skipped gracefully when DB is unavailable.
import { describe, it, expect, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { DemoMarketProvider } from '../src/market/DemoMarketProvider';
import { grossPnl, exceedsSlTp } from '../src/services/pnlService';

const prisma = new PrismaClient();
let dbOk = false;
beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch { dbOk = false; }
});

describe('Trading lifecycle (demo engine)', () => {
  it('1-16: register→trade→SL/TP→ledger→history', async () => {
    if (!dbOk) {
      console.warn('SKIP: postgres unavailable — run with docker compose for full integration');
      return;
    }
    const email = `it_${Date.now()}@aurelix.test`;
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash('Password123!', 10), firstName: 'IT', lastName: 'Test', status: 'ACTIVE', emailVerified: true },
    });
    // 3-4: demo account with starting balance
    const account = await prisma.account.create({
      data: { userId: user.id, accountNumber: `AX-IT-${Date.now()}`, accountType: 'DEMO', balance: 10000, status: 'ACTIVE' },
    });
    // ensure asset
    let asset = await prisma.asset.findUnique({ where: { symbol: 'BTC/USD' } });
    if (!asset) {
      asset = await prisma.asset.create({ data: { symbol: 'BTC/USD', name: 'Bitcoin', category: 'CRYPTO', basePrice: 67000, volatility: 0.003, spread: 0.0004, feeBps: 10, minOrder: 1, maxOrder: 100000 } });
    }
    // 5: simulate BUY position math
    const provider = new DemoMarketProvider(60_000);
    await provider.start();
    const tick = await provider.getTick('BTC/USD');
    expect(tick).toBeTruthy();
    const entry = tick!.ask;
    const amount = 1000;
    const qty = amount / entry;

    const order = await prisma.order.create({
      data: { userId: user.id, accountId: account.id, assetId: asset.id, side: 'BUY', amount, quantity: qty, entryPrice: entry, stopLoss: entry * 0.95, takeProfit: entry * 1.1, status: 'OPEN' },
    });
    const position = await prisma.position.create({
      data: { userId: user.id, accountId: account.id, assetId: asset.id, orderId: order.id, side: 'BUY', quantity: qty, entryPrice: entry, currentPrice: entry, stopLoss: entry * 0.95, takeProfit: entry * 1.1, status: 'OPEN' },
    });

    // 6-7: price up → positive pnl
    const up = entry * 1.05;
    expect(grossPnl({ side: 'BUY', entryPrice: entry, currentPrice: up, quantity: qty })).toBeGreaterThan(0);
    // 8-9: price down → negative pnl
    const down = entry * 0.97;
    expect(grossPnl({ side: 'BUY', entryPrice: entry, currentPrice: down, quantity: qty })).toBeLessThan(0);
    // 10: SL trigger logic
    expect(exceedsSlTp({ side: 'BUY', currentPrice: entry * 0.94, stopLoss: entry * 0.95, takeProfit: entry * 1.1 })).toBe('SL');
    // 13: TP trigger logic
    expect(exceedsSlTp({ side: 'BUY', currentPrice: entry * 1.11, stopLoss: entry * 0.95, takeProfit: entry * 1.1 })).toBe('TP');

    // 11/14/15: close with ledger entries
    const exit = up;
    const realized = (exit - entry) * qty;
    await prisma.$transaction(async (tx) => {
      await tx.position.update({ where: { id: position.id }, data: { status: 'CLOSED', closedAt: new Date() } });
      await tx.order.update({ where: { id: order.id }, data: { status: 'CLOSED' } });
      await tx.trade.create({
        data: { userId: user.id, accountId: account.id, assetId: asset!.id, positionId: position.id, orderId: order.id, side: 'BUY', quantity: qty, entryPrice: entry, exitPrice: exit, realizedPnl: realized, openedAt: new Date(), closeReason: 'MANUAL' },
      });
      const acct = await tx.account.findUnique({ where: { id: account.id } });
      const newBal = Number(acct!.balance) + realized;
      await tx.account.update({ where: { id: account.id }, data: { balance: newBal } });
      await tx.walletTransaction.create({ data: { accountId: account.id, type: 'TRADE', amount: realized, balanceAfter: newBal, reference: position.id } });
    });

    // 16: history + ledger readable
    const trades = await prisma.trade.findMany({ where: { accountId: account.id } });
    expect(trades.length).toBe(1);
    const ledger = await prisma.walletTransaction.findMany({ where: { accountId: account.id } });
    expect(ledger.length).toBeGreaterThanOrEqual(1);

    await provider.stop();
    // cleanup
    await prisma.walletTransaction.deleteMany({ where: { accountId: account.id } });
    await prisma.trade.deleteMany({ where: { accountId: account.id } });
    await prisma.position.deleteMany({ where: { accountId: account.id } });
    await prisma.order.deleteMany({ where: { accountId: account.id } });
    await prisma.account.delete({ where: { id: account.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }, 30000);
});
