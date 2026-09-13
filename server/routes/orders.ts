import { Router } from 'express';
import { prisma } from '../config/database';
import { ah } from '../utils/asyncHandler';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { createOrderSchema, historyQuery } from '../schemas/trading';
import { executeOrder } from '../trading/executionEngine';
import { parsePage, pageMeta } from '../utils/pagination';
import { orderLimiter } from '../middleware/rateLimit';

const r = Router();
r.use(requireAuth);

r.post('/', orderLimiter, validateBody(createOrderSchema), ah(async (req: AuthedRequest, res) => {
  const b = req.body as { accountId: string; symbol: string; side: 'BUY' | 'SELL'; amount: number; stopLoss?: number; takeProfit?: number };
  const result = await executeOrder({
    userId: req.userId!, accountId: b.accountId, symbol: b.symbol, side: b.side,
    amount: b.amount, stopLoss: b.stopLoss, takeProfit: b.takeProfit,
    idempotencyKey: req.headers['idempotency-key'] as string | undefined,
    ip: req.ip, userAgent: req.headers['user-agent'],
  });
  res.status(201).json({ success: true, data: result, error: null });
}));

r.get('/', ah(async (req: AuthedRequest, res) => {
  const q = historyQuery.safeParse(req.query).success ? (req.query as Record<string, string>) : {};
  const { page, pageSize } = parsePage(req.query as Record<string, unknown>);
  const where: Record<string, unknown> = { userId: req.userId! };
  if (q.side) where.side = q.side;
  if (q.status) where.status = q.status;
  const [total, rows] = await Promise.all([
    prisma.order.count({ where: where as never }),
    prisma.order.findMany({ where: where as never, include: { asset: true }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  let filtered = rows;
  if (q.symbol) filtered = filtered.filter((o) => o.asset.symbol === q.symbol);
  res.json({ success: true, data: { items: filtered, ...pageMeta(total, { page, pageSize }) }, error: null });
}));

export default r;
