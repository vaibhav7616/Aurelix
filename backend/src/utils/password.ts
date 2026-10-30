import bcrypt from 'bcryptjs';
import { env } from '../config/env';

export const hashPassword = async (pw: string): Promise<string> => {
  try {
    return await bcrypt.hash(pw, env.BCRYPT_ROUNDS || 10);
  } catch {
    return bcrypt.hashSync(pw, 10);
  }
};

export const verifyPassword = async (pw: string, hash?: string | null): Promise<boolean> => {
  if (!pw || !hash || typeof pw !== 'string' || typeof hash !== 'string') return false;
  try {
    return await bcrypt.compare(pw, hash);
  } catch {
    return false;
  }
};
