// Deposit bonuses: credited to the live balance when the deposit is approved, then
// locked from withdrawal until settled trading volume reaches amount × turnoverMultiple. Withdrawing
// into locked bonus money first forfeits the bonus. All functions run inside the caller's transaction.
import { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Grant the promo bonus attached to an approved deposit (once — depositId is unique). */
export async function grantDepositBonus(
  tx: Tx,
  dep: { id: string; userId: string; accountId: string; amount: Prisma.Decimal | number; bonusPct: number; promoCode: string | null },
  turnoverMultiple: number,
): Promise<number> {
  if (!dep.bonusPct) return 0;
  const acct = await tx.account.findUnique({ where: { id: dep.accountId }, select: { accountType: true } });
  if (acct?.accountType !== 'LIVE') return 0;
  const amount = round2((Number(dep.amount) * dep.bonusPct) / 100);
  if (amount <= 0) return 0;
  await tx.bonus.create({
    data: { userId: dep.userId, accountId: dep.accountId, depositId: dep.id, code: dep.promoCode, amount, turnoverRequired: round2(amount * turnoverMultiple) },
  });
  const after = await tx.account.update({ where: { id: dep.accountId }, data: { balance: { increment: amount } } });
  await tx.walletTransaction.create({
    data: { accountId: dep.accountId, type: 'BONUS', amount, balanceAfter: Number(after.balance), reference: dep.id, memo: `Deposit bonus ${dep.bonusPct}%${dep.promoCode ? ` (${dep.promoCode})` : ''} — withdrawable after ${turnoverMultiple}× turnover` },
  });
  return amount;
}

/** Sum of bonus money still locked on an account. */
export async function lockedBonus(tx: Tx, accountId: string): Promise<number> {
  const agg = await tx.bonus.aggregate({ where: { accountId, status: 'ACTIVE' }, _sum: { amount: true } });
  return round2(Number(agg._sum.amount ?? 0));
}

/** Count a settled trade's stake toward the oldest active bonuses; completed ones unlock. */
export async function applyTurnover(tx: Tx, accountId: string, stake: number, now = new Date()): Promise<string[]> {
  let left = round2(stake);
  const completed: string[] = [];
  const active = await tx.bonus.findMany({ where: { accountId, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
  for (const b of active) {
    if (left <= 0) break;
    const need = round2(Number(b.turnoverRequired) - Number(b.turnoverDone));
    const add = Math.min(need, left);
    left = round2(left - add);
    const done = round2(Number(b.turnoverDone) + add);
    const finished = done >= Number(b.turnoverRequired);
    await tx.bonus.update({ where: { id: b.id }, data: { turnoverDone: done, ...(finished ? { status: 'COMPLETED', closedAt: now } : {}) } });
    if (finished) completed.push(b.id);
  }
  return completed;
}

/** Forfeit every active bonus on the account: its remaining amount leaves the balance. */
export async function forfeitBonuses(tx: Tx, accountId: string, now = new Date()): Promise<number> {
  const active = await tx.bonus.findMany({ where: { accountId, status: 'ACTIVE' } });
  let removed = 0;
  for (const b of active) {
    const acct = await tx.account.findUniqueOrThrow({ where: { id: accountId } });
    const free = Math.max(0, Number(acct.balance) - Number(acct.lockedBalance));
    const take = round2(Math.min(Number(b.amount), free)); // trading losses may already have used part of it
    await tx.bonus.update({ where: { id: b.id }, data: { status: 'FORFEITED', closedAt: now } });
    if (take > 0) {
      const after = await tx.account.update({ where: { id: accountId }, data: { balance: { decrement: take } } });
      await tx.walletTransaction.create({ data: { accountId, type: 'BONUS', amount: -take, balanceAfter: Number(after.balance), reference: b.id, memo: 'Bonus forfeited — withdrawal before turnover was completed' } });
      removed = round2(removed + take);
    }
  }
  return removed;
}
