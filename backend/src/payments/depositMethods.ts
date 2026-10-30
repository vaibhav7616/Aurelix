// Deposit destinations — where users send money. Read ONLY from environment variables (.env /
// .env.production), never from the database: a compromised admin login must not be able to
// redirect deposits to another account. A method whose details are missing is simply not
// offered. There is no card processor, so card deposits are never available.
//
//   DEPOSIT_UPI_VPA, DEPOSIT_UPI_PAYEE                                → upi_qr
//   DEPOSIT_BANK_NAME, _BENEFICIARY, _ACCOUNT, _IFSC (+ optional _SWIFT) → bank_transfer
//   DEPOSIT_CRYPTO_USDT_TRC20 / _BTC / _ETH                           → crypto_* (address per network)

export type DepositMethod = 'upi_qr' | 'bank_transfer' | 'crypto_usdt_trc20' | 'crypto_btc' | 'crypto_eth';

const ENV_KEYS: Record<string, string> = {
  'deposit.upi.vpa': 'DEPOSIT_UPI_VPA',
  'deposit.upi.payee': 'DEPOSIT_UPI_PAYEE',
  'deposit.bank.name': 'DEPOSIT_BANK_NAME',
  'deposit.bank.beneficiary': 'DEPOSIT_BANK_BENEFICIARY',
  'deposit.bank.account': 'DEPOSIT_BANK_ACCOUNT',
  'deposit.bank.ifsc': 'DEPOSIT_BANK_IFSC',
  'deposit.bank.swift': 'DEPOSIT_BANK_SWIFT',
  'deposit.crypto.usdt_trc20': 'DEPOSIT_CRYPTO_USDT_TRC20',
  'deposit.crypto.btc': 'DEPOSIT_CRYPTO_BTC',
  'deposit.crypto.eth': 'DEPOSIT_CRYPTO_ETH',
};

/** Configured destination details, keyed deposit.<method>.<field>; empty values are left out. */
export function depositSettings(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, name] of Object.entries(ENV_KEYS)) {
    const v = env[name]?.trim();
    if (v) out[key] = v;
  }
  return out;
}

export function availableMethods(s: Record<string, string>): DepositMethod[] {
  const out: DepositMethod[] = [];
  if (s['deposit.upi.vpa'] && s['deposit.upi.payee']) out.push('upi_qr');
  if (s['deposit.bank.name'] && s['deposit.bank.beneficiary'] && s['deposit.bank.account'] && s['deposit.bank.ifsc']) out.push('bank_transfer');
  if (s['deposit.crypto.usdt_trc20']) out.push('crypto_usdt_trc20');
  if (s['deposit.crypto.btc']) out.push('crypto_btc');
  if (s['deposit.crypto.eth']) out.push('crypto_eth');
  return out;
}

/** Older clients send upi / upi_* — they all mean the UPI QR/intent flow. */
export function normalizeMethod(method: string): string {
  return method === 'upi' || method.startsWith('upi_') ? 'upi_qr' : method;
}
