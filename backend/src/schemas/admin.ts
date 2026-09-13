import { z } from 'zod';
export const assetUpsertSchema = z.object({
  symbol: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  category: z.enum(['CRYPTO', 'FOREX', 'METALS', 'INDICES']),
  enabled: z.boolean().optional(),
  basePrice: z.number().positive().optional(),
  volatility: z.number().positive().max(1).optional(),
  spread: z.number().min(0).max(0.1).optional(),
  feeBps: z.number().int().min(0).max(1000).optional(),
  payoutPct: z.number().int().min(1).max(100).optional(),
  minOrder: z.number().positive().optional(),
  maxOrder: z.number().positive().optional(),
});
export const riskRuleSchema = z.object({
  maxOrderAmount: z.number().positive(),
  minOrderAmount: z.number().positive(),
  maxPositionAmount: z.number().positive(),
  maxOpenPositions: z.number().int().positive(),
  maxDailyLoss: z.number().positive(),
  maxTotalLoss: z.number().positive(),
  tradingEnabled: z.boolean(),
});
export const reviewWithdrawalSchema = z.object({
  action: z.enum(['approve', 'reject', 'process', 'complete']),
  note: z.string().max(500).optional(),
});
export const broadcastSchema = z.object({
  title: z.string().min(3).max(120),
  message: z.string().min(3).max(500),
});
