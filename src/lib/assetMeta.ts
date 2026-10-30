export interface AssetInfo {
  flag1: string;
  flag2: string;
  symbol: string;
  name: string;
  otcName: string;
  category: 'CURRENCIES' | 'CRYPTO' | 'COMMODITIES' | 'INDICES';
  defaultPayout: number;
  isOtc: boolean;
}

export const ASSET_META: Record<string, AssetInfo> = {
  'EUR/USD': { flag1: '🇪🇺', flag2: '🇺🇸', symbol: 'EUR/USD', name: 'Euro / US Dollar', otcName: 'EUR/USD (OTC)', category: 'CURRENCIES', defaultPayout: 93, isOtc: true },
  'GBP/USD': { flag1: '🇬🇧', flag2: '🇺🇸', symbol: 'GBP/USD', name: 'British Pound / US Dollar', otcName: 'GBP/USD (OTC)', category: 'CURRENCIES', defaultPayout: 89, isOtc: true },
  'USD/JPY': { flag1: '🇺🇸', flag2: '🇯🇵', symbol: 'USD/JPY', name: 'US Dollar / Japanese Yen', otcName: 'USD/JPY (OTC)', category: 'CURRENCIES', defaultPayout: 91, isOtc: true },
  'EUR/CHF': { flag1: '🇪🇺', flag2: '🇨🇭', symbol: 'EUR/CHF', name: 'Euro / Swiss Franc', otcName: 'EUR/CHF (OTC)', category: 'CURRENCIES', defaultPayout: 86, isOtc: true },
  'BTC/USD': { flag1: '₿', flag2: '🇺🇸', symbol: 'BTC/USD', name: 'Bitcoin / US Dollar', otcName: 'BTC/USD (OTC)', category: 'CRYPTO', defaultPayout: 92, isOtc: true },
  'ETH/USD': { flag1: 'Ξ', flag2: '🇺🇸', symbol: 'ETH/USD', name: 'Ethereum / US Dollar', otcName: 'ETH/USD (OTC)', category: 'CRYPTO', defaultPayout: 88, isOtc: true },
  'SOL/USD': { flag1: '◎', flag2: '🇺🇸', symbol: 'SOL/USD', name: 'Solana / US Dollar', otcName: 'SOL/USD (OTC)', category: 'CRYPTO', defaultPayout: 87, isOtc: true },
  'XAU/USD': { flag1: '🪙', flag2: '🇺🇸', symbol: 'XAU/USD', name: 'Gold / US Dollar', otcName: 'XAU/USD (OTC)', category: 'COMMODITIES', defaultPayout: 94, isOtc: true },
  'XAG/USD': { flag1: '⚪', flag2: '🇺🇸', symbol: 'XAG/USD', name: 'Silver / US Dollar', otcName: 'XAG/USD (OTC)', category: 'COMMODITIES', defaultPayout: 90, isOtc: true },
  'AUD/USD': { flag1: '🇦🇺', flag2: '🇺🇸', symbol: 'AUD/USD', name: 'Australian Dollar / US Dollar', otcName: 'AUD/USD (OTC)', category: 'CURRENCIES', defaultPayout: 87, isOtc: true },
  'USD/CAD': { flag1: '🇺🇸', flag2: '🇨🇦', symbol: 'USD/CAD', name: 'US Dollar / Canadian Dollar', otcName: 'USD/CAD (OTC)', category: 'CURRENCIES', defaultPayout: 88, isOtc: true },
  'USD/CHF': { flag1: '🇺🇸', flag2: '🇨🇭', symbol: 'USD/CHF', name: 'US Dollar / Swiss Franc', otcName: 'USD/CHF (OTC)', category: 'CURRENCIES', defaultPayout: 85, isOtc: true },
  'EUR/GBP': { flag1: '🇪🇺', flag2: '🇬🇧', symbol: 'EUR/GBP', name: 'Euro / British Pound', otcName: 'EUR/GBP (OTC)', category: 'CURRENCIES', defaultPayout: 86, isOtc: true },
  'EUR/JPY': { flag1: '🇪🇺', flag2: '🇯🇵', symbol: 'EUR/JPY', name: 'Euro / Japanese Yen', otcName: 'EUR/JPY (OTC)', category: 'CURRENCIES', defaultPayout: 89, isOtc: true },
  'GBP/JPY': { flag1: '🇬🇧', flag2: '🇯🇵', symbol: 'GBP/JPY', name: 'British Pound / Japanese Yen', otcName: 'GBP/JPY (OTC)', category: 'CURRENCIES', defaultPayout: 91, isOtc: true },
};

export function getAssetMeta(sym: string): AssetInfo {
  const cleanSym = sym.replace(/\s*\(OTC\)/i, '').trim();
  return ASSET_META[cleanSym] || ASSET_META[sym] || {
    flag1: '📈',
    flag2: '',
    symbol: sym,
    name: sym,
    otcName: `${sym} (OTC)`,
    category: 'CURRENCIES',
    defaultPayout: 88,
    isOtc: true,
  };
}
