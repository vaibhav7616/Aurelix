import { describe, it, expect } from 'vitest';
import { effectivePayoutPct, parsePayoutRules } from '../src/trading/payout';

const rules = parsePayoutRules('{"duration":[{"maxSec":59,"adj":-2},{"maxSec":29,"adj":-5}],"otcAdj":-3}');

describe('payout rules', () => {
  it('no rules → base payout', () => expect(effectivePayoutPct(82, 10, true, parsePayoutRules(undefined))).toBe(82));
  it('applies the tightest matching duration tier', () => {
    expect(effectivePayoutPct(82, 15, false, rules)).toBe(77);
    expect(effectivePayoutPct(82, 45, false, rules)).toBe(80);
    expect(effectivePayoutPct(82, 300, false, rules)).toBe(82);
  });
  it('adds the OTC adjustment', () => expect(effectivePayoutPct(82, 300, true, rules)).toBe(79));
  it('clamps to 1–100', () => expect(effectivePayoutPct(3, 10, true, rules)).toBe(1));
  it('invalid JSON → no adjustment', () => expect(parsePayoutRules('{oops')).toEqual({ duration: [], otcAdj: 0 }));
});
