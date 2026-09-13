import { z } from 'zod';
export const depositSchema = z.object({
  accountId: z.string().min(1),
  amount: z.number().positive().max(10_000_000),
  currency: z.string().default('USD'),
});
export const withdrawalSchema = z.object({
  accountId: z.string().min(1),
  amount: z.number().positive().max(10_000_000),
  method: z.string().default('bank'),
  details: z.record(z.unknown()).optional(),
});
export const adjustSchema = z.object({
  accountId: z.string().min(1),
  amount: z.number(),
  reason: z.string().min(5).max(500),
});
