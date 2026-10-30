import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AccessClaims { sub: string; email: string; role: string; type: 'access' }
export interface RefreshClaims { sub: string; sid: string; type: 'refresh' }

const DEFAULT_SECRET = 'dev-access-secret-change-me-please-32chars!!';
const DEFAULT_REFRESH = 'dev-refresh-secret-change-me-please-32chars!';

export function signAccess(payload: Omit<AccessClaims, 'type'>): string {
  const secret = env.JWT_SECRET || DEFAULT_SECRET;
  try {
    return jwt.sign({ ...payload, type: 'access' }, secret, { expiresIn: env.JWT_ACCESS_TTL || '2h' } as jwt.SignOptions);
  } catch {
    return jwt.sign({ ...payload, type: 'access' }, secret, { expiresIn: 7200 } as jwt.SignOptions);
  }
}
export function signRefresh(payload: Omit<RefreshClaims, 'type'>): string {
  const secret = env.JWT_REFRESH_SECRET || DEFAULT_REFRESH;
  try {
    return jwt.sign({ ...payload, type: 'refresh' }, secret, { expiresIn: env.JWT_REFRESH_TTL || '7d' } as jwt.SignOptions);
  } catch {
    return jwt.sign({ ...payload, type: 'refresh' }, secret, { expiresIn: 604800 } as jwt.SignOptions);
  }
}
export function verifyAccess(token: string): AccessClaims {
  return jwt.verify(token, env.JWT_SECRET) as AccessClaims;
}
export function verifyRefresh(token: string): RefreshClaims {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshClaims;
}
