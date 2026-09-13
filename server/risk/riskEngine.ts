// RiskEngine — pre-trade validation. Rules stored in DB (risk_rules), never hardcoded.
import { prisma } from '../config/database';
import { Err } from '../utils/errors';

export interface RiskContext {
  userId: string;
  accountId: string;
  accountType: string;
  accountStatus: string;
  availableBalance: number;
  assetEnabled: boolean;
  symbol: string;
  amount: number;
  openPositionsCount: number;
  todayRealizedPnl: number;
  totalRealizedPnl: number;
}

export interface RiskRuleSet {
  maxOrderAmount: number;
  minOrderAmount: number;
  maxPositionAmount: number;
  maxOpenPositions: number;
  maxDailyLoss: number;
  maxTotalLoss: number;
  tradingEnabled: boolean;
}

const DEFAULTS: RiskRuleSet = {
  maxOrderAmount: 50_000,
  minOrderAmount: 1,
  maxPositionAmount: 100_000,
  maxOpenPositions: 20,
  maxDailyLoss: 5_000,
  maxTotalLoss: 20_000,
  tradingEnabled: true,
};

export async function getRiskRules(): Promise<RiskRuleSet> {
  try {
    const row = await prisma.riskRule.findFirst({ where: { key: 'global' } });
    if (!row) return DEFAULTS;
    return {
      maxOrderAmount: Number(row.maxOrderAmount),
      minOrderAmount: Number(row.minOrderAmount),
      maxPositionAmount: Number(row.maxPositionAmount),
      maxOpenPositions: row.maxOpenPositions,
      maxDailyLoss: Number(row.maxDailyLoss),
      maxTotalLoss: Number(row.maxTotalLoss),
      tradingEnabled: row.tradingEnabled,
    };
  } catch {
    return DEFAULTS;
  }
}

/** Pure check — easily unit-testable. Throws ApiError on violation. */
export function evaluateRisk(ctx: RiskContext, rules: RiskRuleSet): void {
  if (!rules.tradingEnabled) throw Err.tradingDisabled();
  if (ctx.accountStatus !== 'ACTIVE') throw Err.accountSuspended();
  if (!ctx.assetEnabled) throw Err.assetDisabled();
  if (ctx.accountType === 'LIVE') throw Err.liveDisabled();
  if (!Number.isFinite(ctx.amount) || ctx.amount <= 0) throw Err.invalidAmount();
  if (ctx.amount < rules.minOrderAmount) throw Err.invalidAmount();
  if (ctx.amount > rules.maxOrderAmount) throw Err.maxOrderSize();
  if (ctx.amount > rules.maxPositionAmount) throw Err.maxPositionSize();
  if (ctx.amount > ctx.availableBalance) throw Err.insufficientBalance();
  if (ctx.openPositionsCount >= rules.maxOpenPositions) throw Err.maxOpenPositions();
  if (ctx.todayRealizedPnl <= -rules.maxDailyLoss) throw Err.maxDailyLoss();
  if (ctx.totalRealizedPnl <= -rules.maxTotalLoss) throw Err.maxTotalLoss();
}
