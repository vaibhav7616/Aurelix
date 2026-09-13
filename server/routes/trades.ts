import { Router } from 'express';
import { prisma } from '../config/database';
import { ah } from '../utils/asyncHandler';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { parsePage, pageMeta } from '../utils/pagination';

const r = Router();
r.use(requireAuth);

r.get('/', ah(async (req: AuthedRequest, res) => {
  const { page, pageSize } = parsePage(req.query as Record<string, unknown>);
  const { symbol, side, from, to, profit } = req.query as Record<string, string | undefined>;
  const where: Record<string, unknown> = { userId: req.userId! };
  if (side) where.side = side;
  if (from || to) where.closedAt = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) };
  if (profit === 'win') where.realizedPnl = { gt: 0 };
  if (profit === 'loss') where.realizedPnl = { lte: 0 };
  const [total, rows] = await Promise.all([
    prisma.trade.count({ where: where as never }),
    prisma.trade.findMany({ where: where as never, include: { asset: true }, orderBy: { closedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  const items = (symbol ? rows.filter((t) => t.asset.symbol === symbol) : rows).map((t) => ({ ...t, symbol: t.asset.symbol }));
  res.json({ success: true, data: { items, ...pageMeta(total, { page, pageSize }) }, error: null });
}));

export default r;
