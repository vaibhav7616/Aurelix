// In-memory + JSON-persisted Prisma mock for Aurelix demo platform
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

export class Decimal {
  private val: number;
  constructor(v: number | string | Decimal) {
    if (v instanceof Decimal) this.val = v.val;
    else if (typeof v === 'number') this.val = v;
    else if (typeof v === 'string') this.val = parseFloat(v) || 0;
    else this.val = 0;
  }
  toNumber(): number { return this.val; }
  toString(): string { return String(this.val); }
  toFixed(d?: number): string { return this.val.toFixed(d); }
  valueOf(): number { return this.val; }
  plus(n: any): Decimal { return new Decimal(this.val + (new Decimal(n).val)); }
  minus(n: any): Decimal { return new Decimal(this.val - (new Decimal(n).val)); }
  mul(n: any): Decimal { return new Decimal(this.val * (new Decimal(n).val)); }
  div(n: any): Decimal { return new Decimal(this.val / (new Decimal(n).val)); }
  eq(n: any): boolean { return this.val === (new Decimal(n).val); }
  gt(n: any): boolean { return this.val > (new Decimal(n).val); }
  gte(n: any): boolean { return this.val >= (new Decimal(n).val); }
  lt(n: any): boolean { return this.val < (new Decimal(n).val); }
  lte(n: any): boolean { return this.val <= (new Decimal(n).val); }
}

export enum TxnType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  TRADE = 'TRADE',
  FEE = 'FEE',
  REFUND = 'REFUND',
  ADJUSTMENT = 'ADJUSTMENT',
}

export namespace Prisma {
  export type InputJsonValue = any;
  export type Decimal = any;
}

export type PrismaClient = any;

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function genId(prefix = 'c'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

interface DBStore {
  users: any[];
  accounts: any[];
  assets: any[];
  binaryOptions: any[];
  marketCandles: any[];
  orders: any[];
  positions: any[];
  trades: any[];
  walletTransactions: any[];
  deposits: any[];
  withdrawals: any[];
  riskRules: any[];
  systemSettings: any[];
  notifications: any[];
  auditLogs: any[];
  idempotencyKeys: any[];
  sessions: any[];
}

function loadInitialStore(): DBStore {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[db] Failed to read db.json, using fresh store', e);
  }

  const demoHash = bcrypt.hashSync('Demo123!', 10);
  const adminHash = bcrypt.hashSync('admin123', 10);

  const demoUser = {
    id: 'usr_demo_1001',
    email: 'demo@example.com',
    username: 'demo',
    passwordHash: demoHash,
    firstName: 'Demo',
    lastName: 'Trader',
    role: 'USER',
    status: 'ACTIVE',
    emailVerified: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const adminUser = {
    id: 'usr_admin_2002',
    email: 'admin@aurelix.trade',
    username: 'admin',
    passwordHash: adminHash,
    firstName: 'Platform',
    lastName: 'Admin',
    role: 'ADMIN',
    status: 'ACTIVE',
    emailVerified: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const demoAccount = {
    id: 'act_demo_1001',
    userId: demoUser.id,
    accountNumber: 'AX-DEMO-882314',
    accountType: 'DEMO',
    currency: 'USD',
    balance: 10000,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const adminAccount = {
    id: 'act_admin_2002',
    userId: adminUser.id,
    accountNumber: 'AX-DEMO-109283',
    accountType: 'DEMO',
    currency: 'USD',
    balance: 50000,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const initialAssets = [
    { id: 'ast_eur', symbol: 'EUR/USD', name: 'EUR/USD (OTC)', category: 'CURRENCIES', basePrice: 1.0862, volatility: 0.0006, spread: 0.0002, feeBps: 0, minOrder: 1, maxOrder: 100000, sortOrder: 1, payoutPct: 93, enabled: true, pipSize: 0.00001, tradingHours: '24x7', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'ast_gbp', symbol: 'GBP/USD', name: 'GBP/USD (OTC)', category: 'CURRENCIES', basePrice: 1.2731, volatility: 0.0007, spread: 0.0002, feeBps: 0, minOrder: 1, maxOrder: 100000, sortOrder: 2, payoutPct: 89, enabled: true, pipSize: 0.00001, tradingHours: '24x7', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'ast_jpy', symbol: 'USD/JPY', name: 'USD/JPY (OTC)', category: 'CURRENCIES', basePrice: 155.42, volatility: 0.0008, spread: 0.0002, feeBps: 0, minOrder: 1, maxOrder: 100000, sortOrder: 3, payoutPct: 91, enabled: true, pipSize: 0.001, tradingHours: '24x7', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'ast_chf', symbol: 'EUR/CHF', name: 'EUR/CHF (OTC)', category: 'CURRENCIES', basePrice: 0.9408, volatility: 0.0005, spread: 0.0002, feeBps: 0, minOrder: 1, maxOrder: 100000, sortOrder: 4, payoutPct: 86, enabled: true, pipSize: 0.00001, tradingHours: '24x7', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'ast_btc', symbol: 'BTC/USD', name: 'BTC/USD (OTC)', category: 'CRYPTO', basePrice: 67432.5, volatility: 0.0035, spread: 0.0004, feeBps: 0, minOrder: 1, maxOrder: 100000, sortOrder: 5, payoutPct: 92, enabled: true, pipSize: 0.01, tradingHours: '24x7', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'ast_eth', symbol: 'ETH/USD', name: 'ETH/USD (OTC)', category: 'CRYPTO', basePrice: 3521.8, volatility: 0.003, spread: 0.0004, feeBps: 0, minOrder: 1, maxOrder: 100000, sortOrder: 6, payoutPct: 88, enabled: true, pipSize: 0.01, tradingHours: '24x7', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'ast_xau', symbol: 'XAU/USD', name: 'XAU/USD (OTC)', category: 'COMMODITIES', basePrice: 2384.6, volatility: 0.0012, spread: 0.0003, feeBps: 0, minOrder: 1, maxOrder: 100000, sortOrder: 7, payoutPct: 94, enabled: true, pipSize: 0.01, tradingHours: '24x7', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ];

  const initialRiskRule = {
    id: 'risk_global',
    key: 'global',
    maxOrderAmount: 50000,
    minOrderAmount: 1,
    maxPositionAmount: 100000,
    maxOpenPositions: 20,
    maxDailyLoss: 5000,
    maxTotalLoss: 20000,
    tradingEnabled: true,
    updatedAt: new Date().toISOString(),
  };

  const initialSettings = [
    { key: 'platform.name', value: 'Aurelix', updatedAt: new Date().toISOString() },
    { key: 'platform.env', value: 'demo', updatedAt: new Date().toISOString() },
  ];

  const initialTx = {
    id: 'tx_demo_init',
    accountId: demoAccount.id,
    type: 'DEPOSIT',
    amount: 10000,
    balanceAfter: 10000,
    memo: 'Demo starting balance (simulated)',
    createdAt: new Date().toISOString(),
  };

  return {
    users: [demoUser, adminUser],
    accounts: [demoAccount, adminAccount],
    assets: initialAssets,
    binaryOptions: [],
    marketCandles: [],
    orders: [],
    positions: [],
    trades: [],
    walletTransactions: [initialTx],
    deposits: [],
    withdrawals: [],
    riskRules: [initialRiskRule],
    systemSettings: initialSettings,
    notifications: [],
    auditLogs: [],
    idempotencyKeys: [],
    sessions: [],
  };
}

let store: DBStore = loadInitialStore();

let saveScheduled = false;
function scheduleSave() {
  if (saveScheduled) return;
  saveScheduled = true;
  setTimeout(() => {
    saveScheduled = false;
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2));
    } catch (e) {
      console.warn('[db] Failed to persist db.json', e);
    }
  }, 1000);
}

function matchFilter(item: any, where: any): boolean {
  if (!where || typeof where !== 'object') return true;
  for (const [k, v] of Object.entries(where)) {
    if (v === undefined) continue;
    const itemVal = item[k];
    if (v === null) {
      if (itemVal !== null) return false;
      continue;
    }
    if (typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      if ('in' in v && Array.isArray((v as any).in)) {
        if (!(v as any).in.includes(itemVal)) return false;
      }
      if ('not' in v) {
        if (itemVal === (v as any).not) return false;
      }
      if ('contains' in v) {
        const needle = String((v as any).contains).toLowerCase();
        const haystack = String(itemVal || '').toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if ('gte' in v) {
        if (new Date(itemVal) < new Date((v as any).gte)) return false;
      }
      if ('lte' in v) {
        if (new Date(itemVal) > new Date((v as any).lte)) return false;
      }
      if ('gt' in v) {
        if (new Date(itemVal) <= new Date((v as any).gt)) return false;
      }
      if ('lt' in v) {
        if (new Date(itemVal) >= new Date((v as any).lt)) return false;
      }
    } else if (v instanceof Date) {
      if (new Date(itemVal).getTime() !== v.getTime()) return false;
    } else {
      if (itemVal !== v) return false;
    }
  }
  return true;
}

function sortItems(items: any[], orderBy: any): any[] {
  if (!orderBy) return items;
  const list = [...items];
  const entries = Array.isArray(orderBy) ? orderBy : [orderBy];
  list.sort((a, b) => {
    for (const ob of entries) {
      for (const [key, dir] of Object.entries(ob)) {
        const valA = a[key];
        const valB = b[key];
        const multiplier = dir === 'desc' ? -1 : 1;
        if (valA < valB) return -1 * multiplier;
        if (valA > valB) return 1 * multiplier;
      }
    }
    return 0;
  });
  return list;
}

function projectItem(item: any, select?: any, include?: any): any {
  if (!item) return item;
  let res = { ...item };

  // Handle relations
  if (include?.asset && res.assetId) {
    res.asset = store.assets.find((a) => a.id === res.assetId);
  }
  if (include?.account && res.accountId) {
    const acct = store.accounts.find((a) => a.id === res.accountId);
    if (acct) {
      res.account = { ...acct };
      if (include.account.include?.user && acct.userId) {
        res.account.user = store.users.find((u) => u.id === acct.userId);
      }
    }
  }
  if (include?.user && res.userId) {
    res.user = store.users.find((u) => u.id === res.userId);
  }
  if (include?.accounts && res.id) {
    res.accounts = store.accounts.filter((a) => a.userId === res.id);
  }

  // Handle _count
  if (select?._count?.select?.accounts) {
    res._count = { accounts: store.accounts.filter((a) => a.userId === res.id).length };
  }

  // Handle field selection
  if (select && typeof select === 'object') {
    const projected: any = {};
    for (const [k, enabled] of Object.entries(select)) {
      if (enabled) projected[k] = res[k];
    }
    return projected;
  }

  return res;
}

function createModel(collectionName: keyof DBStore, idPrefix = 'c') {
  return {
    async findMany(args: any = {}) {
      let items = (store[collectionName] as any[]).filter((item) => matchFilter(item, args.where));
      if (args.orderBy) items = sortItems(items, args.orderBy);
      if (args.skip) items = items.slice(args.skip);
      if (args.take) items = items.slice(0, args.take);
      return items.map((i) => projectItem(i, args.select, args.include));
    },

    async findFirst(args: any = {}) {
      const items = (store[collectionName] as any[]).filter((item) => matchFilter(item, args.where));
      const sorted = args.orderBy ? sortItems(items, args.orderBy) : items;
      return sorted[0] ? projectItem(sorted[0], args.select, args.include) : null;
    },

    async findUnique(args: any = {}) {
      const item = (store[collectionName] as any[]).find((i) => matchFilter(i, args.where));
      return item ? projectItem(item, args.select, args.include) : null;
    },

    async create(args: any) {
      const newItem = {
        id: args.data.id || genId(idPrefix),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...args.data,
      };
      (store[collectionName] as any[]).push(newItem);
      scheduleSave();
      return projectItem(newItem, args.select, args.include);
    },

    async createMany(args: any) {
      const items = Array.isArray(args.data) ? args.data : [args.data];
      for (const d of items) {
        (store[collectionName] as any[]).push({
          id: d.id || genId(idPrefix),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...d,
        });
      }
      scheduleSave();
      return { count: items.length };
    },

    async update(args: any) {
      const idx = (store[collectionName] as any[]).findIndex((i) => matchFilter(i, args.where));
      if (idx === -1) {
        throw new Error(`Record not found for update in ${collectionName}`);
      }
      const existing = (store[collectionName] as any[])[idx];
      const updated = {
        ...existing,
        ...args.data,
        updatedAt: new Date().toISOString(),
      };
      (store[collectionName] as any[])[idx] = updated;
      scheduleSave();
      return projectItem(updated, args.select, args.include);
    },

    async updateMany(args: any) {
      let count = 0;
      for (let i = 0; i < (store[collectionName] as any[]).length; i++) {
        if (matchFilter((store[collectionName] as any[])[i], args.where)) {
          (store[collectionName] as any[])[i] = {
            ...(store[collectionName] as any[])[i],
            ...args.data,
            updatedAt: new Date().toISOString(),
          };
          count++;
        }
      }
      scheduleSave();
      return { count };
    },

    async upsert(args: any) {
      const idx = (store[collectionName] as any[]).findIndex((i) => matchFilter(i, args.where));
      if (idx !== -1) {
        const existing = (store[collectionName] as any[])[idx];
        const updated = {
          ...existing,
          ...args.update,
          updatedAt: new Date().toISOString(),
        };
        (store[collectionName] as any[])[idx] = updated;
        scheduleSave();
        return projectItem(updated, args.select, args.include);
      } else {
        const newItem = {
          id: genId(idPrefix),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...args.create,
        };
        (store[collectionName] as any[]).push(newItem);
        scheduleSave();
        return projectItem(newItem, args.select, args.include);
      }
    },

    async count(args: any = {}) {
      return (store[collectionName] as any[]).filter((item) => matchFilter(item, args.where)).length;
    },

    async delete(args: any) {
      const idx = (store[collectionName] as any[]).findIndex((i) => matchFilter(i, args.where));
      if (idx !== -1) {
        const removed = (store[collectionName] as any[]).splice(idx, 1)[0];
        scheduleSave();
        return removed;
      }
      return null;
    },

    async deleteMany(args: any = {}) {
      const initialLen = (store[collectionName] as any[]).length;
      (store[collectionName] as any[]) = (store[collectionName] as any[]).filter((i) => !matchFilter(i, args.where));
      scheduleSave();
      return { count: initialLen - (store[collectionName] as any[]).length };
    },

    async aggregate(args: any = {}) {
      const items = (store[collectionName] as any[]).filter((item) => matchFilter(item, args.where));
      const _sum: Record<string, number> = {};
      if (args._sum && typeof args._sum === 'object') {
        for (const key of Object.keys(args._sum)) {
          let sum = 0;
          for (const item of items) {
            sum += Number(item[key] || 0);
          }
          _sum[key] = sum;
        }
      }
      return {
        _sum: _sum as any,
      };
    },
  };
}

export const prisma = {
  user: createModel('users', 'usr'),
  account: createModel('accounts', 'act'),
  asset: createModel('assets', 'ast'),
  binaryOption: createModel('binaryOptions', 'opt'),
  marketCandle: createModel('marketCandles', 'cnd'),
  order: createModel('orders', 'ord'),
  position: createModel('positions', 'pos'),
  trade: createModel('trades', 'trd'),
  walletTransaction: createModel('walletTransactions', 'wtx'),
  deposit: createModel('deposits', 'dep'),
  withdrawal: createModel('withdrawals', 'wth'),
  riskRule: createModel('riskRules', 'rsk'),
  systemSetting: createModel('systemSettings', 'set'),
  notification: createModel('notifications', 'ntf'),
  auditLog: createModel('auditLogs', 'aud'),
  idempotencyKey: createModel('idempotencyKeys', 'idm'),
  session: createModel('sessions', 'ses'),

  async $transaction(arg: any) {
    if (typeof arg === 'function') {
      return await arg(prisma);
    }
    if (Array.isArray(arg)) {
      return await Promise.all(arg);
    }
    return arg;
  },

  async $queryRaw(..._args: any[]) {
    return [{ 1: 1 }];
  },

  async $disconnect() {
    return Promise.resolve();
  },
};

export async function checkDatabase(): Promise<boolean> {
  return true;
}
