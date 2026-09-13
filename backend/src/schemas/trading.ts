import { z } from 'zod';

export const createOrderSchema = z.object({
  accountId: z.string().min(1),
  symbol: z.string().min(1).max(20),
  side: z.enum(['BUY', 'SELL']),
  amount: z.number().positive().max(10_000_000),
  stopLoss: z.number().positive().optional(),
  takeProfit: z.number().positive().optional(),
});
export const openOptionSchema = z.object({
  accountId: z.string().min(1),
  symbol: z.string().min(1).max(20),
  direction: z.enum(['UP', 'DOWN']),
  stake: z.number().positive().max(10_000_000),
  durationSec: z.number().int().min(5).max(4 * 3600),
});
export const closePositionSchema = z.object({ positionId: z.string().min(1) });
export const updateSLTPSchema = z.object({
  positionId: z.string().min(1),
  stopLoss: z.number().positive().nullable().optional(),
  takeProfit: z.number().positive().nullable().optional(),
});
export const historyQuery = z.object({
  symbol: z.string().optional(),
  side: z.enum(['BUY', 'SELL']).optional(),
  status: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
  profit: z.enum(['win', 'loss']).optional(),
});
