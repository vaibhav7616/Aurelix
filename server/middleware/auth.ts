import { NextFunction, Request, Response } from 'express';
import { verifyAccess } from '../utils/jwt';
import { Err } from '../utils/errors';
import { prisma } from '../config/database';

export interface AuthedRequest extends Request {
  userId?: string;
  userRole?: string;
  userEmail?: string;
}

export async function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  try {
    const h = req.headers.authorization ?? '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : (req.cookies?.accessToken as string | undefined);
    if (!token) throw Err.unauthorized();
    let claims: ReturnType<typeof verifyAccess>;
    try {
      claims = verifyAccess(token);
    } catch (jwtErr: unknown) {
      const name = (jwtErr as { name?: string })?.name;
      if (name === 'TokenExpiredError') {
        throw Err.unauthorized('Token expired');
      }
      throw Err.unauthorized('Invalid token');
    }
    if (claims.type !== 'access') throw Err.unauthorized('Invalid token');
    const user = await prisma.user.findUnique({ where: { id: claims.sub }, select: { id: true, status: true, role: true, email: true } });
    if (!user) throw Err.unauthorized('User not found');
    if (user.status === 'SUSPENDED') throw Err.userSuspended();
    req.userId = user.id;
    req.userRole = user.role;
    req.userEmail = user.email;
    next();
  } catch (e) {
    next(e);
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthedRequest, _res: Response, next: NextFunction) => {
    if (!req.userId) return next(Err.unauthorized());
    if (!roles.includes(req.userRole ?? '')) return next(Err.forbidden('Insufficient permissions'));
    next();
  };
}
export const requireAdmin = requireRole('ADMIN', 'SUPER_ADMIN');
