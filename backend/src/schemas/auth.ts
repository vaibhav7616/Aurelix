import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
});
export const loginSchema = z.object({
  identifier: z.string().min(1).max(128).optional(),
  username: z.string().min(1).max(128).optional(),
  email: z.string().min(1).max(128).optional(),
  password: z.string().min(1).max(256),
  remember: z.boolean().optional(),
}).refine((d) => (d.identifier?.trim() ?? '') !== '' || (d.email?.trim() ?? '') !== '' || (d.username?.trim() ?? '') !== '', {
  message: 'identifier, username, or email is required',
});
/** the refresh token normally arrives as an HttpOnly cookie; a body token is accepted once to migrate older sessions */
export const refreshSchema = z.object({ refreshToken: z.string().min(1).max(2048).optional() });
export const forgotSchema = z.object({ email: z.string().email() });
export const resetSchema = z.object({ token: z.string().min(1), newPassword: z.string().min(8).max(128) });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(128) });
export type RegisterInput = z.infer<typeof registerSchema>;
