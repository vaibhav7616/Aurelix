import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AccessClaims { sub: string; email: string; role: string; type: 'access' }
export interface RefreshClaims { sub: string; sid: string; type: 'refresh' }

export function signAccess(payload: Omit<AccessClaims, 'type'>): string {
  return jwt.sign({ ...payload, type: 'access' }, env.JWT_SECRET, { expiresIn: env.JWT_ACCESS_TTL } as jwt.SignOptions);
}
export function signRefresh(payload: Omit<RefreshClaims, 'type'>): string {
  return jwt.sign({ ...payload, type: 'refresh' }, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_TTL } as jwt.SignOptions);
}
export function verifyAccess(token: string): AccessClaims {
  return jwt.verify(token, env.JWT_SECRET) as AccessClaims;
}
export function verifyRefresh(token: string): RefreshClaims {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshClaims;
}
