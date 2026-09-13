import bcrypt from 'bcryptjs';
import { env } from '../config/env';
export const hashPassword = (pw: string) => bcrypt.hash(pw, env.BCRYPT_ROUNDS);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);
