import { Router, Request, Response } from 'express';
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
import { loginIpLimiter, loginAccountLimiter } from '../middleware/rateLimit';
import { hashToken } from '../utils/tokenHash';

const r = Router();

r.post('/register', loginIpLimiter, validateBody(registerSchema), ah(async (req, res) => {
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
  // Auto-create DEMO trading account ($10,000) and LIVE real account ($0.00) (Quotex parity)
  const acct = await prisma.account.create({
    data: { userId: user.id, accountNumber: accountNumber(), accountType: 'DEMO', currency: 'USD', balance: env.DEMO_STARTING_BALANCE, status: 'ACTIVE' },
  });
  await prisma.walletTransaction.create({
    data: { accountId: acct.id, type: 'DEPOSIT', amount: env.DEMO_STARTING_BALANCE, balanceAfter: env.DEMO_STARTING_BALANCE, memo: 'Demo starting balance (simulated)' },
  });
  await prisma.account.create({
    data: { userId: user.id, accountNumber: accountNumber().replace('DEMO', 'REAL'), accountType: 'LIVE', currency: 'USD', balance: 0.00, status: 'ACTIVE' },
  });
  await audit({ actorId: user.id, action: 'USER_REGISTER', entityType: 'User', entityId: user.id, ipAddress: req.ip, userAgent: req.headers['user-agent'] });
  res.status(201).json({ success: true, data: { id: user.id, email: user.email }, error: null });
}));

// ── refresh-token cookie ────────────────────────────────────────────────────────────────
// HttpOnly: page scripts (and therefore XSS) can never read it. SameSite=Strict + a path limited to
// /api/v1/auth: the browser only sends it to the auth endpoints, never cross-site. Secure whenever
// the request came in over HTTPS (behind the proxy, via `trust proxy`).
const RT_COOKIE = 'ax_rt';
const SESSION_MS = 7 * 86400_000;
/** a second refresh with the same token inside this window is a parallel tab, not theft */
const ROTATION_GRACE_MS = 30_000;
const cookieOpts = (req: Request) => ({ httpOnly: true, sameSite: 'strict' as const, secure: req.secure, path: '/api/v1/auth' });
function setRefreshCookie(req: Request, res: Response, token: string, persistent: boolean) {
  res.cookie(RT_COOKIE, token, { ...cookieOpts(req), ...(persistent ? { maxAge: SESSION_MS } : {}) });
}
function clearRefreshCookie(req: Request, res: Response) {
  res.clearCookie(RT_COOKIE, cookieOpts(req));
}
async function createSession(req: Request, userId: string, persistent: boolean): Promise<string> {
  const token = signRefresh({ sub: userId, sid: randomUUID() });
  await prisma.session.create({
    data: { userId, refreshToken: hashToken(token), persistent, userAgent: String(req.headers['user-agent'] ?? '').slice(0, 255), ipAddress: req.ip ?? null, expiresAt: new Date(Date.now() + SESSION_MS) },
  });
  return token;
}

/** bcrypt hash of a random string: compared against when the user does not exist, so a login
 * attempt takes the same time either way and response timing cannot reveal which accounts exist. */
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeO5gDdZQDOxaBf0AmtF7vI.zVnr0k2Yfq';

/** A user with no trading accounts (e.g. created by the seed) gets the same set as registration. */
async function ensureAccounts(userId: string): Promise<void> {
  const has = await prisma.account.count({ where: { userId } });
  if (has) return;
  const demo = await prisma.account.create({
    data: { userId, accountNumber: accountNumber(), accountType: 'DEMO', currency: 'USD', balance: env.DEMO_STARTING_BALANCE, status: 'ACTIVE' },
  });
  await prisma.walletTransaction.create({
    data: { accountId: demo.id, type: 'DEPOSIT', amount: env.DEMO_STARTING_BALANCE, balanceAfter: env.DEMO_STARTING_BALANCE, memo: 'Demo starting balance (simulated)' },
  });
  // live money only ever arrives through a verified deposit
  await prisma.account.create({
    data: { userId, accountNumber: accountNumber().replace('DEMO', 'REAL'), accountType: 'LIVE', currency: 'USD', balance: 0, status: 'ACTIVE' },
  });
}

r.post('/login', loginIpLimiter, loginAccountLimiter, validateBody(loginSchema), ah(async (req, res) => {
  const body = req.body as { identifier?: string; email?: string; username?: string; password: string; remember?: boolean };
  const id = String(body.identifier ?? body.email ?? body.username ?? '').trim();
  const user = id.includes('@')
    ? await prisma.user.findFirst({ where: { email: { equals: id, mode: 'insensitive' } } })
    : await prisma.user.findFirst({ where: { username: { equals: id, mode: 'insensitive' } } });

  // the password hash is the only thing that can authenticate a user
  const ok = await verifyPassword(body.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    await audit({ action: 'USER_LOGIN_FAILED', entityType: 'User', entityId: user?.id, metadata: { identifier: id.slice(0, 128) }, ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    throw Err.unauthorized('Invalid username or password');
  }
  if (user.status === 'SUSPENDED') throw Err.userSuspended();

  await ensureAccounts(user.id);

  const remember = body.remember !== false;
  setRefreshCookie(req, res, await createSession(req, user.id, remember), remember);
  const accessToken = signAccess({ sub: user.id, email: user.email, role: user.role });
  await audit({ actorId: user.id, action: 'USER_LOGIN', entityType: 'User', entityId: user.id, ipAddress: req.ip, userAgent: req.headers['user-agent'] });

  res.json({
    success: true,
    data: {
      accessToken,
      user: { id: user.id, email: user.email, username: user.username, firstName: user.firstName, lastName: user.lastName, role: user.role },
    },
    error: null,
  });
}));

// Exchange the refresh cookie for a new access token AND a new refresh token (rotation).
// Presenting an already-rotated token again means it was copied: every session of that user ends.
r.post('/refresh', validateBody(refreshSchema), ah(async (req, res) => {
  const token = (req.cookies?.[RT_COOKIE] as string | undefined) ?? (req.body as { refreshToken?: string }).refreshToken;
  const fail = (msg: string) => { clearRefreshCookie(req, res); return Err.unauthorized(msg); };
  if (!token) throw fail('Not signed in');
  let claims;
  try { claims = verifyRefresh(token); } catch { throw fail('Invalid refresh token'); }
  const session = await prisma.session.findUnique({ where: { refreshToken: hashToken(token) } });
  const now = new Date();
  if (!session || session.userId !== claims.sub || session.expiresAt < now) throw fail('Session expired');

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.status === 'SUSPENDED') throw fail('User unavailable');
  const access = () => signAccess({ sub: user.id, email: user.email, role: user.role });

  if (session.revokedAt) {
    if (session.rotatedAt && now.getTime() - session.rotatedAt.getTime() < ROTATION_GRACE_MS) {
      // another tab refreshed a moment ago; the browser already holds the new cookie
      res.json({ success: true, data: { accessToken: access() }, error: null });
      return;
    }
    if (session.rotatedAt) {
      await prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } });
      await audit({ actorId: user.id, action: 'REFRESH_TOKEN_REUSE', entityType: 'User', entityId: user.id, ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    }
    throw fail('Session expired');
  }

  // rotate: retire this token (once — a parallel request loses the race and gets the grace path)
  const claimed = await prisma.session.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: now, rotatedAt: now } });
  if (claimed.count) setRefreshCookie(req, res, await createSession(req, user.id, session.persistent), session.persistent);
  res.json({ success: true, data: { accessToken: access() }, error: null });
}));

r.post('/logout', ah(async (req, res) => {
  const token = (req.cookies?.[RT_COOKIE] as string | undefined) ?? (req.body as { refreshToken?: string } | undefined)?.refreshToken;
  if (token) await prisma.session.updateMany({ where: { refreshToken: hashToken(token) }, data: { revokedAt: new Date() } });
  clearRefreshCookie(req, res);
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
