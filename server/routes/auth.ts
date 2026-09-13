import { Router } from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../config/database';
import { ah } from '../utils/asyncHandler';
import { validateBody } from '../middleware/validate';
import { registerSchema, loginSchema, refreshSchema, forgotSchema, changePasswordSchema } from '../schemas/auth';
import { hashPassword, verifyPassword } from '../utils/password';
import { signAccess, signRefresh, verifyRefresh } from '../utils/jwt';
import { Err } from '../utils/errors';
import { audit } from '../services/auditService';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { env } from '../config/env';
import { accountNumber } from '../trading/executionEngine';

const r = Router();

r.post('/register', validateBody(registerSchema), ah(async (req, res) => {
  const { email, password, firstName, lastName } = req.body as { email: string; password: string; firstName: string; lastName: string };
  const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (exists) throw Err.conflict('Email already registered');
  const base = (email.split('@')[0] ?? 'trader').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24) || 'trader';
  let username = base;
  for (let i = 1; await prisma.user.findUnique({ where: { username } }); i++) username = `${base}${i}`;
  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(), username, passwordHash: await hashPassword(password),
      firstName, lastName, status: 'ACTIVE', emailVerified: true,
    },
  });
  // Auto-create DEMO trading account with starting balance + ledger entry
  const acct = await prisma.account.create({
    data: { userId: user.id, accountNumber: accountNumber(), accountType: 'DEMO', currency: 'USD', balance: env.DEMO_STARTING_BALANCE, status: 'ACTIVE' },
  });
  await prisma.walletTransaction.create({
    data: { accountId: acct.id, type: 'DEPOSIT', amount: env.DEMO_STARTING_BALANCE, balanceAfter: env.DEMO_STARTING_BALANCE, memo: 'Demo starting balance (simulated)' },
  });
  await audit({ actorId: user.id, action: 'USER_REGISTER', entityType: 'User', entityId: user.id, ipAddress: req.ip, userAgent: req.headers['user-agent'] });
  res.status(201).json({ success: true, data: { id: user.id, email: user.email }, error: null });
}));

r.post('/login', validateBody(loginSchema), ah(async (req, res) => {
  const { identifier, email, password } = req.body as { identifier?: string; email?: string; password: string };
  const id = (identifier ?? email ?? '').trim();
  const user = id.includes('@')
    ? await prisma.user.findUnique({ where: { email: id.toLowerCase() } })
    : await prisma.user.findUnique({ where: { username: id.toLowerCase() } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) throw Err.unauthorized('Invalid login or password');
  if (user.status === 'SUSPENDED') throw Err.userSuspended();
  const sid = randomUUID();
  const refreshToken = signRefresh({ sub: user.id, sid });
  await prisma.session.create({
    data: { userId: user.id, refreshToken, userAgent: req.headers['user-agent'], ipAddress: req.ip, expiresAt: new Date(Date.now() + 7 * 86400_000) },
  });
  const accessToken = signAccess({ sub: user.id, email: user.email, role: user.role });
  await audit({ actorId: user.id, action: 'USER_LOGIN', entityType: 'User', entityId: user.id, ipAddress: req.ip, userAgent: req.headers['user-agent'] });
  res.json({ success: true, data: { accessToken, refreshToken, user: { id: user.id, email: user.email, username: user.username, firstName: user.firstName, lastName: user.lastName, role: user.role } }, error: null });
}));

r.post('/demo', ah(async (req, res) => {
  const user = await prisma.user.findFirst({ where: { role: 'USER' } });
  if (!user) throw Err.notFound('Demo user not found');
  const sid = randomUUID();
  const refreshToken = signRefresh({ sub: user.id, sid });
  await prisma.session.create({
    data: { userId: user.id, refreshToken, userAgent: req.headers['user-agent'], ipAddress: req.ip, expiresAt: new Date(Date.now() + 7 * 86400_000) },
  });
  const accessToken = signAccess({ sub: user.id, email: user.email, role: user.role });
  res.json({ success: true, data: { accessToken, refreshToken, user: { id: user.id, email: user.email, username: user.username, firstName: user.firstName, lastName: user.lastName, role: user.role } }, error: null });
}));

r.post('/refresh', validateBody(refreshSchema), ah(async (req, res) => {
  const { refreshToken } = req.body as { refreshToken: string };
  let claims;
  try { claims = verifyRefresh(refreshToken); } catch { throw Err.unauthorized('Invalid refresh token'); }
  const session = await prisma.session.findUnique({ where: { refreshToken } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) throw Err.unauthorized('Session expired');
  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.status === 'SUSPENDED') throw Err.unauthorized('User unavailable');
  const accessToken = signAccess({ sub: user.id, email: user.email, role: user.role });
  res.json({ success: true, data: { accessToken }, error: null });
}));

r.post('/logout', ah(async (req, res) => {
  const { refreshToken } = (req.body ?? {}) as { refreshToken?: string };
  if (refreshToken) await prisma.session.updateMany({ where: { refreshToken }, data: { revokedAt: new Date() } });
  res.json({ success: true, data: { ok: true }, error: null });
}));

r.get('/me', requireAuth, ah(async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true, emailVerified: true, createdAt: true } });
  res.json({ success: true, data: user, error: null });
}));

r.post('/forgot-password', validateBody(forgotSchema), ah(async (req, res) => {
  // Architecture-ready: in production, email a signed reset link. Here we acknowledge without leaking existence.
  await audit({ action: 'PASSWORD_FORGOT', entityType: 'User', metadata: { email: (req.body as { email: string }).email }, ipAddress: req.ip });
  res.json({ success: true, data: { message: 'If the email exists, a reset link was sent' }, error: null });
}));

r.post('/change-password', requireAuth, validateBody(changePasswordSchema), ah(async (req: AuthedRequest, res) => {
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) throw Err.unauthorized('Current password is incorrect');
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } });
  await prisma.session.updateMany({ where: { userId: user.id }, data: { revokedAt: new Date() } });
  await audit({ actorId: user.id, action: 'PASSWORD_CHANGE', entityType: 'User', entityId: user.id, ipAddress: req.ip });
  res.json({ success: true, data: { ok: true }, error: null });
}));

r.get('/sessions', requireAuth, ah(async (req: AuthedRequest, res) => {
  const sessions = await prisma.session.findMany({ where: { userId: req.userId! }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, userAgent: true, ipAddress: true, createdAt: true, expiresAt: true, revokedAt: true } });
  res.json({ success: true, data: sessions, error: null });
}));

export default r;
