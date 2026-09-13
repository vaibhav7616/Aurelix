import { Router } from 'express';
import { prisma } from '../config/database';
import { ah } from '../utils/asyncHandler';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { parsePage, pageMeta } from '../utils/pagination';

const r = Router();
r.use(requireAuth);

r.get('/', ah(async (req: AuthedRequest, res) => {
  const { page, pageSize } = parsePage(req.query as Record<string, unknown>);
  const unreadOnly = req.query.unread === 'true';
  const where = { userId: req.userId!, ...(unreadOnly ? { read: false } : {}) };
  const [total, unread, rows] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: req.userId!, read: false } }),
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  res.json({ success: true, data: { items: rows, unread, ...pageMeta(total, { page, pageSize }) }, error: null });
}));

r.post('/:id/read', ah(async (req: AuthedRequest, res) => {
  await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.userId! }, data: { read: true } });
  res.json({ success: true, data: { ok: true }, error: null });
}));

r.post('/read-all', ah(async (req: AuthedRequest, res) => {
  await prisma.notification.updateMany({ where: { userId: req.userId!, read: false }, data: { read: true } });
  res.json({ success: true, data: { ok: true }, error: null });
}));

export default r;
