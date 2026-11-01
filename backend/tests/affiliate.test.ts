import { describe, it, expect } from 'vitest';
import { DEFAULT_AFFILIATE, levelFor, cpaRate, parseAffiliateConfig } from '../src/affiliate/config';
import { fillMacros, assertSafeUrl } from '../src/affiliate/postbacks';
import { lastPeriodEnd, monthStart } from '../src/affiliate/service';

const L = DEFAULT_AFFILIATE.levels;

describe('affiliate levels (deposits per month)', () => {
  it('7 levels: 50–80% RevShare, 2–5% Turnover, 2–8% sub-affiliate', () => {
    expect(L.map((l) => l.revsharePct)).toEqual([50, 55, 60, 65, 70, 75, 80]);
    expect(L.map((l) => l.turnoverPct)).toEqual([2, 2.5, 3, 3.5, 4, 4.5, 5]);
    expect(L.map((l) => l.subPct)).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });
  it('thresholds 0-14 / 15-49 / 50-99 / 100-199 / 200-399 / 400-699 / 700+', () => {
    const at = [0, 14, 15, 49, 50, 99, 100, 199, 200, 399, 400, 699, 700, 5000].map((d) => levelFor(L, d).level);
    expect(at).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7]);
  });
  it('payout rules: 10 active traders, Thursday, 50% turnover cap, $300k sub cap, 180-day hold', () => {
    expect(DEFAULT_AFFILIATE.minActiveTraders).toBe(10);
    expect(DEFAULT_AFFILIATE.payoutWeekday).toBe(4);
    expect(DEFAULT_AFFILIATE.turnoverCapPctOfDeposits).toBe(50);
    expect(DEFAULT_AFFILIATE.subAffiliateCapUsd).toBe(300_000);
    expect(DEFAULT_AFFILIATE.maxHoldDays).toBe(180);
  });
});

describe('affiliate config', () => {
  it('CPA is off until rates are set; country rate beats default', () => {
    expect(cpaRate(DEFAULT_AFFILIATE, 'IN')).toBeNull();
    const c = parseAffiliateConfig('{"cpa":{"rates":{"default":30,"in":25}}}');
    expect(cpaRate(c, 'IN')).toBe(25);
    expect(cpaRate(c, 'BR')).toBe(30);
  });
  it('invalid JSON falls back to defaults', () => expect(parseAffiliateConfig('{nope')).toEqual(DEFAULT_AFFILIATE));
});

describe('postbacks', () => {
  it('fills and URL-encodes macros, leaves unknown ones', () => {
    expect(fillMacros('https://t.example/pb?c={click_id}&a={amount}&x={nope}', { click_id: 'a b&c', amount: '10.00' }))
      .toBe('https://t.example/pb?c=a%20b%26c&a=10.00&x={nope}');
  });
  it('refuses internal targets (SSRF)', async () => {
    for (const u of ['http://127.0.0.1/x', 'http://10.0.0.5/x', 'http://169.254.169.254/latest', 'http://192.168.1.1/', 'http://[::1]/', 'ftp://example.com/', 'https://user:pw@example.com/', 'http://8.8.8.8:22/']) {
      await expect(assertSafeUrl(u)).rejects.toThrow();
    }
    await expect(assertSafeUrl('https://8.8.8.8/pb')).resolves.toBeTruthy();
  });
});

describe('periods', () => {
  it('weekly period ends 00:00 UTC on Thursday; months start on the 1st', () => {
    expect(lastPeriodEnd(4, new Date('2026-11-01T10:00:00Z')).toISOString()).toBe('2026-10-29T00:00:00.000Z');
    expect(monthStart(new Date('2026-11-17T10:00:00Z'), -1).toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });
});

describe('agreement restrictions & fraud keys', () => {
  it('default country lists follow the agreement (64 blocked, 24 without RevShare incl. India)', async () => {
    const { DEFAULT_AFFILIATE: d } = await import('../src/affiliate/config');
    expect(d.blockedCountries).toHaveLength(64);
    expect(d.blockedCountries).toContain('US');
    expect(d.revshareBlockedCountries).toHaveLength(24);
    expect(d.revshareBlockedCountries).toContain('IN');
    expect(d.inactivityDays).toBe(90);
  });
  it('payment identifiers are normalised for comparison', async () => {
    const { paymentKeys } = await import('../src/affiliate/service');
    expect(paymentKeys({ upiId: ' Shared@UPI ', holderName: 'X' })).toEqual(['shared@upi']);
    expect(paymentKeys({ accountNumber: '1234 5678 9012' })).toEqual(['123456789012']);
    expect(paymentKeys(null)).toEqual([]);
  });
});
