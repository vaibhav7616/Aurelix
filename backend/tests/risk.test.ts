import { describe, it, expect } from 'vitest';
import { evaluateRisk, RiskContext } from '../src/risk/riskEngine';

const rules = { maxOrderAmount: 50000, minOrderAmount: 1, maxPositionAmount: 100000, maxOpenPositions: 20, maxDailyLoss: 5000, maxTotalLoss: 20000, tradingEnabled: true };
const base: RiskContext = {
  userId: 'u', accountId: 'a', accountType: 'DEMO', accountStatus: 'ACTIVE',
  availableBalance: 10000, assetEnabled: true, symbol: 'BTC/USD', amount: 100,
  openPositionsCount: 0, todayRealizedPnl: 0, totalRealizedPnl: 0,
};

describe('RiskEngine', () => {
  it('passes a valid order', () => {
    expect(() => evaluateRisk(base, rules)).not.toThrow();
  });
  it('rejects insufficient balance', () => {
    expect(() => evaluateRisk({ ...base, amount: 20000 }, rules)).toThrowError(/INSUFFICIENT/i);
  });
  it('rejects when trading disabled', () => {
    expect(() => evaluateRisk(base, { ...rules, tradingEnabled: false })).toThrowError(/disabled/i);
  });
  it('rejects disabled asset', () => {
    expect(() => evaluateRisk({ ...base, assetEnabled: false }, rules)).toThrowError(/disabled/i);
  });
  it('rejects suspended account', () => {
    expect(() => evaluateRisk({ ...base, accountStatus: 'SUSPENDED' }, rules)).toThrowError(/suspended/i);
  });
  it('rejects live accounts until provider configured', () => {
    expect(() => evaluateRisk({ ...base, accountType: 'LIVE' }, rules)).toThrowError(/Live/i);
  });
  it('rejects oversized orders', () => {
    expect(() => evaluateRisk({ ...base, amount: 999999, availableBalance: 9999999 }, rules)).toThrowError(/maximum/i);
  });
  it('rejects too many open positions', () => {
    expect(() => evaluateRisk({ ...base, openPositionsCount: 20 }, rules)).toThrowError(/open positions/i);
  });
  it('rejects after max daily loss', () => {
    expect(() => evaluateRisk({ ...base, todayRealizedPnl: -6000 }, rules)).toThrowError(/daily loss/i);
  });
  it('rejects invalid amounts', () => {
    expect(() => evaluateRisk({ ...base, amount: 0 }, rules)).toThrowError(/Invalid/i);
  });
});
