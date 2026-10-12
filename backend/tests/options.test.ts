// Binary option settlement math — pure functions, no DB.
import { describe, it, expect } from 'vitest';
import { settleOutcome, optionProfit, settlementCredit } from '../src/trading/optionsEngine';

describe('settleOutcome', () => {
  it('UP wins when close > entry', () => expect(settleOutcome('UP', 1.0000, 1.0001)).toBe('WON'));
  it('UP loses when close < entry', () => expect(settleOutcome('UP', 1.0000, 0.9999)).toBe('LOST'));
  it('DOWN wins when close < entry', () => expect(settleOutcome('DOWN', 67432.5, 67400)).toBe('WON'));
  it('DOWN loses when close > entry', () => expect(settleOutcome('DOWN', 67432.5, 67500)).toBe('LOST'));
  it('exact same price is a TIE regardless of direction', () => {
    expect(settleOutcome('UP', 0.94071, 0.94071)).toBe('TIE');
    expect(settleOutcome('DOWN', 0.94071, 0.94071)).toBe('TIE');
  });
});

describe('optionProfit / settlementCredit', () => {
  it('WON: profit = stake × payout%, credit = stake + profit', () => {
    expect(optionProfit('WON', 100, 80)).toBe(80);
    expect(settlementCredit('WON', 100, 80)).toBe(180);
    expect(optionProfit('WON', 1, 60)).toBe(0.6);
    expect(settlementCredit('WON', 1, 60)).toBe(1.6); // Quotex: $1 @ 60% → payout $1.60
  });
  it('LOST: profit = −stake, nothing credited (stake was debited at open)', () => {
    expect(optionProfit('LOST', 100, 80)).toBe(-100);
    expect(settlementCredit('LOST', 100, 80)).toBe(0);
  });
  it('TIE: profit 0, stake returned', () => {
    expect(optionProfit('TIE', 250, 85)).toBe(0);
    expect(settlementCredit('TIE', 250, 85)).toBe(250);
  });
  it('rounds to cents', () => {
    expect(optionProfit('WON', 33.33, 77)).toBe(25.66);
    expect(settlementCredit('WON', 33.33, 77)).toBe(58.99);
  });
});

describe('Time mode (fixed clock expiry)', () => {
  it('accepts a whole minute at least 30s ahead and rejects everything else', async () => {
    const { validateFixedExpiry } = await import('../src/trading/optionsEngine');
    const now = Date.UTC(2026, 9, 12, 10, 0, 10); // 10:00:10
    expect(() => validateFixedExpiry(Date.UTC(2026, 9, 12, 10, 1, 0), now)).not.toThrow();      // 50s lead
    expect(() => validateFixedExpiry(Date.UTC(2026, 9, 12, 10, 0, 30), now)).toThrow(/whole minute/);
    expect(() => validateFixedExpiry(Date.UTC(2026, 9, 12, 10, 1, 0), now + 35_000)).toThrow(/closed/); // 25s lead
    expect(() => validateFixedExpiry(Date.UTC(2026, 9, 12, 15, 0, 0), now)).toThrow(/at most/);
  });
});
