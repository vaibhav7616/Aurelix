import { describe, it, expect } from 'vitest';
import { productionConfigErrors } from '../src/config/env';
import { availableMethods, normalizeMethod } from '../src/payments/depositMethods';

const good = {
  DATABASE_URL: 'postgresql://aurelix:s3cr3t@postgres:5432/aurelix', JWT_SECRET: 'x'.repeat(40), JWT_REFRESH_SECRET: 'y'.repeat(40),
  FRONTEND_URL: 'https://app.test', CORS_ORIGINS: 'https://app.test', MARKET_PROVIDER: 'real',
};

describe('production config', () => {
  it('accepts a complete config', () => expect(productionConfigErrors(good)).toEqual([]));
  it('rejects dev/short/identical secrets, demo prices and the dev DB password', () => {
    const errs = productionConfigErrors({ ...good, JWT_SECRET: 'dev-access-secret-change-me-please-32chars!!', JWT_REFRESH_SECRET: 'dev-access-secret-change-me-please-32chars!!', MARKET_PROVIDER: 'demo', DATABASE_URL: 'postgresql://a:aurelix_dev_secret@h/d' });
    expect(errs.join('\n')).toMatch(/JWT_SECRET must be a random/);
    expect(errs.join('\n')).toMatch(/must differ/);
    expect(errs.join('\n')).toMatch(/MARKET_PROVIDER/);
    expect(errs.join('\n')).toMatch(/development database password/);
  });
  it('rejects a wildcard CORS origin', () => expect(productionConfigErrors({ ...good, CORS_ORIGINS: 'https://app.test,*' }).join()).toMatch(/not \*/));
  it('requires every secret to be set', () => expect(productionConfigErrors({})).toHaveLength(6));
});

describe('deposit methods', () => {
  it('offers nothing until destinations are configured', () => expect(availableMethods({})).toEqual([]));
  it('offers each method only when its details are complete', () => {
    expect(availableMethods({ 'deposit.upi.vpa': 'a@b' })).toEqual([]);
    expect(availableMethods({ 'deposit.upi.vpa': 'a@b', 'deposit.upi.payee': 'Co', 'deposit.crypto.btc': 'bc1x' })).toEqual(['upi_qr', 'crypto_btc']);
  });
  it('maps legacy UPI method ids', () => expect(normalizeMethod('upi_phonepe')).toBe('upi_qr'));
});

describe('deposit details come from the environment', () => {
  it('reads DEPOSIT_* variables and ignores empty ones', async () => {
    const { depositSettings } = await import('../src/payments/depositMethods');
    const s = depositSettings({ DEPOSIT_UPI_VPA: ' pay@bank ', DEPOSIT_UPI_PAYEE: 'Co', DEPOSIT_CRYPTO_BTC: '' });
    expect(s).toEqual({ 'deposit.upi.vpa': 'pay@bank', 'deposit.upi.payee': 'Co' });
    expect(availableMethods(s)).toEqual(['upi_qr']);
  });
});
