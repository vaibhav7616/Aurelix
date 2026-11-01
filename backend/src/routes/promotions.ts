// Signed-in promotions data: the user's bonuses and how much of the live balance is withdrawable.
import { Router } from 'express';
import { prisma } from '../config/database';
import { ah } from '../utils/asyncHandler';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { lockedBonus } from '../promotions/bonusService';

const r = Router();
r.use(requireAuth);
const round2 = (n: number) => Math.round(n * 100) / 100;

r.get('/bonuses', ah(async (req: AuthedRequest, res) => {
  const [bonuses, live] = await Promise.all([
    prisma.bonus.findMany({ where: { userId: req.userId! }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.account.findFirst({ where: { userId: req.userId!, accountType: 'LIVE' } }),
  ]);
  const locked = live ? await lockedBonus(prisma, live.id) : 0;
  const available = live ? Number(live.balance) - Number(live.lockedBalance) : 0;
  res.json({
    success: true,
    data: {
      live: live ? { accountId: live.id, balance: Number(live.balance), bonusLocked: locked, withdrawable: round2(Math.max(0, available - locked)) } : null,
      bonuses: bonuses.map((b) => ({
        id: b.id, code: b.code, amount: Number(b.amount), status: b.status,
        turnoverRequired: Number(b.turnoverRequired), turnoverDone: Number(b.turnoverDone),
        createdAt: b.createdAt.toISOString(), closedAt: b.closedAt?.toISOString() ?? null,
      })),
    },
    error: null,
  });
}));

export default r;
