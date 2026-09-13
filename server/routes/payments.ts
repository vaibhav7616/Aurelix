import { Router } from 'express';
import { prisma } from '../config/database';
import { ah } from '../utils/asyncHandler';
import { requireAuth, AuthedRequest } from '../middleware/auth';

const r = Router();
r.use(requireAuth);

r.get('/', ah(async (req: AuthedRequest, res) => {
  const deps = await prisma.deposit.findMany({ where: { userId: req.userId! }, orderBy: { createdAt: 'desc' }, take: 50 });
  res.json({ success: true, data: deps, error: null });
}));

export default r;
