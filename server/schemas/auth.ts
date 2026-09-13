import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
});
export const loginSchema = z.object({
  identifier: z.string().min(1).max(128).optional(),
  email: z.string().email().optional(),
  password: z.string().min(1),
}).refine((d) => (d.identifier?.trim() ?? '') !== '' || (d.email?.trim() ?? '') !== '', {
  message: 'identifier or email is required',
});
export const refreshSchema = z.object({ refreshToken: z.string().min(1) });
export const forgotSchema = z.object({ email: z.string().email() });
export const resetSchema = z.object({ token: z.string().min(1), newPassword: z.string().min(8).max(128) });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(128) });
export type RegisterInput = z.infer<typeof registerSchema>;
