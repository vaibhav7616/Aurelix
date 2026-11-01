import { describe, it, expect } from 'vitest';
import { parseBonusConfig, DEFAULT_BONUS } from '../src/promotions/config';

describe('bonus config', () => {
  it('defaults to 100× turnover', () => expect(DEFAULT_BONUS.turnoverMultiple).toBe(100));
  it('invalid JSON falls back to defaults; bad offers are dropped', () => {
    expect(parseBonusConfig('{oops')).toEqual(DEFAULT_BONUS);
    const c = parseBonusConfig('{"turnoverMultiple":30,"offers":[{"code":"ok20","bonusPct":20,"minDeposit":10},{"code":"bad","bonusPct":-5,"minDeposit":10}]}');
    expect(c.turnoverMultiple).toBe(30);
    expect(c.offers).toEqual([{ code: 'OK20', bonusPct: 20, minDeposit: 10, title: 'Deposit bonus' }]);
  });
});
