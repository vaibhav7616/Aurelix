import { Router } from 'express';
import { prisma } from '../config/database';
import { ah } from '../utils/asyncHandler';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { z } from 'zod';
import { validateBody } from '../middleware/validate';

const r = Router();
r.use(requireAuth);

r.get('/profile', ah(async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true, emailVerified: true, createdAt: true } });
  res.json({ success: true, data: user, error: null });
}));

r.patch('/profile', validateBody(z.object({ firstName: z.string().min(1).max(80).optional(), lastName: z.string().min(1).max(80).optional() })), ah(async (req: AuthedRequest, res) => {
  const user = await prisma.user.update({ where: { id: req.userId! }, data: req.body, select: { id: true, email: true, firstName: true, lastName: true } });
  res.json({ success: true, data: user, error: null });
}));

export default r;
