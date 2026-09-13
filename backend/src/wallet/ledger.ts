// Immutable-style wallet ledger helpers. All balance mutations go through here inside a DB txn.
import { Prisma, PrismaClient, TxnType } from '@prisma/client';

export async function appendLedger(
  tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  params: { accountId: string; type: TxnType; amount: number; memo?: string; reference?: string; metadata?: Prisma.InputJsonValue }
): Promise<{ balanceAfter: number }> {
  const account = await tx.account.findUnique({ where: { id: params.accountId } });
  if (!account) throw new Error('Account not found');
  const current = Number(account.balance);
  const next = current + params.amount;
  if (next < -0.009) throw Object.assign(new Error('Insufficient available balance'), { code: 'INSUFFICIENT_BALANCE', status: 422 });
  await tx.account.update({ where: { id: params.accountId }, data: { balance: next } });
  await tx.walletTransaction.create({
    data: {
      accountId: params.accountId,
      type: params.type,
      amount: params.amount,
      balanceAfter: next,
      memo: params.memo,
      reference: params.reference,
      metadata: params.metadata ?? undefined,
    },
  });
  return { balanceAfter: next };
}
