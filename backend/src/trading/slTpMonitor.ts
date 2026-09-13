// Server-side SL/TP monitor — runs on every tick. Frontend hints never close positions.
import { prisma } from '../config/database';
import { Tick } from '../market/MarketDataProvider';
import { exceedsSlTp, netPnl } from '../services/pnlService';
import { emitToUser } from '../websocket/socketServer';
import { notify } from '../services/notificationService';
import { audit } from '../services/auditService';

export async function onMarketTick(tick: Tick): Promise<void> {
  try {
    // Update currentPrice + unrealizedPnl for open positions on this asset (bounded batch)
    const positions = await prisma.position.findMany({
      where: { status: 'OPEN', asset: { symbol: tick.symbol } },
      include: { asset: true, account: true },
      take: 500,
    });
    if (positions.length === 0) return;

    for (const p of positions) {
      const side = p.side as 'BUY' | 'SELL';
      const entry = Number(p.entryPrice);
      const qty = Number(p.quantity);
      const { net } = netPnl({ side, entryPrice: entry, currentPrice: tick.mid, quantity: qty, feeBps: p.asset.feeBps });
      const trigger = exceedsSlTp({
        side,
        currentPrice: tick.mid,
        stopLoss: p.stopLoss != null ? Number(p.stopLoss) : null,
        takeProfit: p.takeProfit != null ? Number(p.takeProfit) : null,
      });

      if (!trigger) {
        await prisma.position.update({ where: { id: p.id }, data: { currentPrice: tick.mid, unrealizedPnl: net } });
        emitToUser(p.userId, 'position:updated', { id: p.id, currentPrice: tick.mid, unrealizedPnl: net });
        continue;
      }

      // Auto-close with ledger + trade record inside a transaction
      await prisma.$transaction(async (tx) => {
        const fresh = await tx.position.findUnique({ where: { id: p.id } });
        if (!fresh || fresh.status !== 'OPEN') return;
        const fee = (Number(tick.mid) * qty * p.asset.feeBps) / 10_000;
        const gross = side === 'BUY' ? (tick.mid - entry) * qty : (entry - tick.mid) * qty;
        const realized = gross - fee;
        const acct = await tx.account.findUnique({ where: { id: p.accountId } });
        if (!acct) return;
        const newBal = Number(acct.balance) + realized;
        await tx.account.update({ where: { id: p.accountId }, data: { balance: newBal } });
        await tx.walletTransaction.create({
          data: { accountId: p.accountId, type: 'TRADE', amount: realized, balanceAfter: newBal, reference: p.id, memo: `Auto-close ${trigger} ${tick.symbol}` },
        });
        if (fee > 0) {
          const afterFee = newBal; // fee already netted; record informational txn of 0? record fee memo
          await tx.walletTransaction.create({
            data: { accountId: p.accountId, type: 'FEE', amount: 0, balanceAfter: afterFee, reference: p.id, memo: `Close fee ${fee.toFixed(2)} included in P/L` },
          });
        }
        await tx.position.update({ where: { id: p.id }, data: { status: 'CLOSED', closedAt: new Date(), currentPrice: tick.mid, unrealizedPnl: 0 } });
        await tx.order.updateMany({ where: { id: fresh.orderId }, data: { status: 'CLOSED' } });
        await tx.trade.create({
          data: {
            userId: p.userId, accountId: p.accountId, assetId: p.assetId, positionId: p.id, orderId: fresh.orderId,
            side: p.side, quantity: p.quantity, entryPrice: p.entryPrice, exitPrice: tick.mid,
            realizedPnl: realized, fee, openedAt: fresh.openedAt, closeReason: trigger,
          },
        });
        emitToUser(p.userId, 'position:closed', { id: p.id, exitPrice: tick.mid, realizedPnl: realized, reason: trigger });
        emitToUser(p.userId, 'balance:updated', { accountId: p.accountId, balance: newBal });
      });

      await notify({
        userId: p.userId,
        type: 'TRADE',
        title: trigger === 'SL' ? 'Stop-loss executed' : 'Take-profit executed',
        message: `${side} ${tick.symbol} auto-closed at ${tick.mid}`,
        metadata: { positionId: p.id, reason: trigger },
      });
      await audit({ action: `POSITION_AUTO_CLOSE_${trigger}`, entityType: 'Position', entityId: p.id, metadata: { symbol: tick.symbol, exit: tick.mid } });
    }
  } catch {
    // never throw from tick path
  }
}
