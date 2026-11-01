import { createHash } from 'crypto';

/**
 * Sessions store only the SHA-256 of the refresh token: a leaked database or backup cannot be
 * replayed as live logins. Refresh tokens are long random JWTs, so a fast hash is enough here
 * (unlike passwords). Matches Postgres `encode(sha256(convert_to(token,'UTF8')),'hex')`.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
