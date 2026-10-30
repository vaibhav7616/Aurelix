// Aurelix base data — shared by `prisma db seed` (dev) and `node dist/bootstrap/seedCli.js` (prod).
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const ASSETS = [
  { symbol: 'BTC/USD', name: 'Bitcoin / US Dollar', category: 'CRYPTO' as const, basePrice: 67432.5, volatility: 0.0035, spread: 0.0004, feeBps: 10, minOrder: 1, maxOrder: 100000, sortOrder: 1, payoutPct: 85 },
  { symbol: 'ETH/USD', name: 'Ethereum / US Dollar', category: 'CRYPTO' as const, basePrice: 3521.8, volatility: 0.003, spread: 0.0004, feeBps: 10, minOrder: 1, maxOrder: 100000, sortOrder: 2, payoutPct: 82 },
  { symbol: 'EUR/USD', name: 'Euro / US Dollar', category: 'FOREX' as const, basePrice: 1.0862, volatility: 0.0006, spread: 0.0002, feeBps: 5, minOrder: 1, maxOrder: 100000, sortOrder: 3, payoutPct: 80 },
  { symbol: 'GBP/USD', name: 'British Pound / US Dollar', category: 'FOREX' as const, basePrice: 1.2731, volatility: 0.0007, spread: 0.0002, feeBps: 5, minOrder: 1, maxOrder: 100000, sortOrder: 4, payoutPct: 78 },
  { symbol: 'USD/JPY', name: 'US Dollar / Japanese Yen', category: 'FOREX' as const, basePrice: 155.42, volatility: 0.0008, spread: 0.0002, feeBps: 5, minOrder: 1, maxOrder: 100000, sortOrder: 5, payoutPct: 75 },
  { symbol: 'EUR/CHF', name: 'Euro / Swiss Franc', category: 'FOREX' as const, basePrice: 0.9408, volatility: 0.0005, spread: 0.0002, feeBps: 5, minOrder: 1, maxOrder: 100000, sortOrder: 7, payoutPct: 60 },
  { symbol: 'XAU/USD', name: 'Gold / US Dollar', category: 'METALS' as const, basePrice: 2384.6, volatility: 0.0012, spread: 0.0003, feeBps: 8, minOrder: 1, maxOrder: 100000, sortOrder: 6, payoutPct: 84 },
];

/**
 * Idempotent base data. Runs on every boot; never overwrites what an admin changed.
 *   development: assets, risk rules, a demo user and an admin with default credentials
 *   production : assets, risk rules, and an admin ONLY when SEED_ADMIN_EMAIL + a strong
 *                SEED_ADMIN_PASSWORD are set — never a demo user or a default password
 */
export async function runSeed(prisma: PrismaClient, isProd = process.env.NODE_ENV === 'production'): Promise<void> {
  console.log(`[seed] seeding Aurelix base data (${isProd ? 'production' : 'development'})...`)

  for (const a of ASSETS) {
    // create-only: never overwrite payout %, enabled flag etc. that an admin changed (seed runs on every boot)
    await prisma.asset.upsert({ where: { symbol: a.symbol }, update: {}, create: { ...a, enabled: true } });
  }

  await prisma.riskRule.upsert({
    where: { key: 'global' },
    update: {},
    create: { key: 'global', maxOrderAmount: 50000, minOrderAmount: 1, maxPositionAmount: 100000, maxOpenPositions: 20, maxDailyLoss: 0, maxTotalLoss: 0, tradingEnabled: true },
  });

  await prisma.systemSetting.upsert({ where: { key: 'platform.name' }, update: {}, create: { key: 'platform.name', value: 'Aurelix' } });
  await prisma.systemSetting.upsert({ where: { key: 'platform.env' }, update: {}, create: { key: 'platform.env', value: isProd ? 'production' : 'demo' } });

  const demoEmail = process.env.SEED_DEMO_EMAIL ?? 'demo@example.com';
  const demoPass = process.env.SEED_DEMO_PASSWORD ?? 'Demo123!';
  const demoUser = process.env.SEED_DEMO_USERNAME ?? 'demo';
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@aurelix.trade';
  const adminPass = process.env.SEED_ADMIN_PASSWORD ?? 'admin123';
  const adminUser = process.env.SEED_ADMIN_USERNAME ?? 'admin';
  const starting = parseInt(process.env.DEMO_STARTING_BALANCE ?? '10000', 10);

  const ensureUser = async (email: string, username: string, password: string, firstName: string, lastName: string, role: 'USER' | 'ADMIN', prevPasswords: string[] = []) => {
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: { email, username: username.toLowerCase(), passwordHash: await bcrypt.hash(password, 12), firstName, lastName, role, status: 'ACTIVE', emailVerified: true },
      });
    } else {
      // backfill username on older rows; migrate password ONLY if it still matches a previous seed default
      const patch: { username?: string; passwordHash?: string } = {};
      if (!user.username) patch.username = username.toLowerCase();
      for (const prev of prevPasswords) {
        if (await bcrypt.compare(prev, user.passwordHash)) { patch.passwordHash = await bcrypt.hash(password, 12); break; }
      }
      if (Object.keys(patch).length) user = await prisma.user.update({ where: { id: user.id }, data: patch });
    }
    const existing = await prisma.account.findFirst({ where: { userId: user.id } });
    if (!existing) {
      const acct = await prisma.account.create({
        data: { userId: user.id, accountNumber: `AX-DEMO-${Math.floor(Math.random() * 1e6)}`, accountType: 'DEMO', currency: 'USD', balance: starting, status: 'ACTIVE' },
      });
      await prisma.walletTransaction.create({ data: { accountId: acct.id, type: 'DEPOSIT', amount: starting, balanceAfter: starting, memo: 'Demo starting balance (simulated)' } });
    }
    const hasLive = await prisma.account.findFirst({ where: { userId: user.id, accountType: 'LIVE' } });
    if (!hasLive) {
      await prisma.account.create({
        data: { userId: user.id, accountNumber: `AX-REAL-${Math.floor(Math.random() * 1e6)}`, accountType: 'LIVE', currency: 'USD', balance: 0.00, status: 'ACTIVE' },
      });
    }
    return user;
  };

  if (isProd) {
    const email = process.env.SEED_ADMIN_EMAIL;
    const pass = process.env.SEED_ADMIN_PASSWORD;
    if (email && pass && pass.length >= 12) {
      await ensureUser(email, adminUser, pass, 'Platform', 'Admin', 'ADMIN');
      console.log('[seed] done. admin:', email);
    } else {
      console.log('[seed] done. no admin created (set SEED_ADMIN_EMAIL and a 12+ char SEED_ADMIN_PASSWORD to create one)');
    }
    return;
  }
  await ensureUser(demoEmail, demoUser, demoPass, 'Demo', 'Trader', 'USER');
  await ensureUser(adminEmail, adminUser, adminPass, 'Platform', 'Admin', 'ADMIN', ['Admin123!']);

  console.log('[seed] done. demo:', `${demoUser} / ${demoEmail}`, '| admin:', `${adminUser} / ${adminEmail}`);
}
