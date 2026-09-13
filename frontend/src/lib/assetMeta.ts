export interface AssetInfo {
  flag1: string;
  flag2: string;
  symbol: string;
  name: string;
  category: 'CRYPTO' | 'FOREX' | 'METALS' | 'INDICES';
  defaultPayout: number;
}

export const ASSET_META: Record<string, AssetInfo> = {
  'EUR/CHF': { flag1: '🇪🇺', flag2: '🇨🇭', symbol: 'EUR/CHF', name: 'Euro / Swiss Franc', category: 'FOREX', defaultPayout: 62 },
  'EUR/USD': { flag1: '🇪🇺', flag2: '🇺🇸', symbol: 'EUR/USD', name: 'Euro / US Dollar', category: 'FOREX', defaultPayout: 80 },
  'GBP/USD': { flag1: '🇬🇧', flag2: '🇺🇸', symbol: 'GBP/USD', name: 'British Pound / US Dollar', category: 'FOREX', defaultPayout: 78 },
  'USD/JPY': { flag1: '🇺🇸', flag2: '🇯🇵', symbol: 'USD/JPY', name: 'US Dollar / Japanese Yen', category: 'FOREX', defaultPayout: 75 },
  'BTC/USD': { flag1: '₿', flag2: '🇺🇸', symbol: 'BTC/USD', name: 'Bitcoin / US Dollar', category: 'CRYPTO', defaultPayout: 85 },
  'ETH/USD': { flag1: 'Ξ', flag2: '🇺🇸', symbol: 'ETH/USD', name: 'Ethereum / US Dollar', category: 'CRYPTO', defaultPayout: 82 },
  'XAU/USD': { flag1: '🪙', flag2: '🇺🇸', symbol: 'XAU/USD', name: 'Gold / US Dollar', category: 'METALS', defaultPayout: 84 },
};

export function getAssetMeta(sym: string): AssetInfo {
  return ASSET_META[sym] || {
    flag1: '📈',
    flag2: '',
    symbol: sym,
    name: sym,
    category: 'FOREX',
    defaultPayout: 80,
  };
}
