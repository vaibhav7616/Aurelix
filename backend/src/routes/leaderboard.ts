import { Router, Request } from 'express';
import { prisma } from '../config/database';
import { ah } from '../utils/asyncHandler';
import { verifyAccess } from '../utils/jwt';

const r = Router();

interface LeaderboardTrader {
  rank: number;
  userId?: string;
  name: string;
  country: string;
  countryCode: string;
  flag: string;
  profit: number;
  tradesCount: number;
  winRate: number;
  favoriteAsset: string;
  isCurrentUser?: boolean;
}

// 50 realistic global traders with authentic country diversity matching Quotex
const BASE_TRADERS: Array<{ name: string; country: string; countryCode: string; flag: string; asset: string }> = [
  { name: 'Alexander_V', country: 'Brazil', countryCode: 'BR', flag: '🇧🇷', asset: 'EUR/USD OTC' },
  { name: 'Aarav_ProTrader', country: 'India', countryCode: 'IN', flag: '🇮🇳', asset: 'USD/INR OTC' },
  { name: 'Lucas_Silva', country: 'Brazil', countryCode: 'BR', flag: '🇧🇷', asset: 'GBP/USD OTC' },
  { name: 'Devendra_FX', country: 'India', countryCode: 'IN', flag: '🇮🇳', asset: 'EUR/USD OTC' },
  { name: 'Nguyen_Van', country: 'Vietnam', countryCode: 'VN', flag: '🇻🇳', asset: 'BTC/USD' },
  { name: 'Zaid_AlMansoor', country: 'UAE', countryCode: 'AE', flag: '🇦🇪', asset: 'XAU/USD' },
  { name: 'Budi_Santoso', country: 'Indonesia', countryCode: 'ID', flag: '🇮🇩', asset: 'USD/JPY OTC' },
  { name: 'Rodrigo_M', country: 'Brazil', countryCode: 'BR', flag: '🇧🇷', asset: 'EUR/GBP OTC' },
  { name: 'Vikram_Options', country: 'India', countryCode: 'IN', flag: '🇮🇳', asset: 'EUR/USD OTC' },
  { name: 'Mateo_Romero', country: 'Mexico', countryCode: 'MX', flag: '🇲🇽', asset: 'USD/MXN OTC' },
  { name: 'Klaus_Weber', country: 'Germany', countryCode: 'DE', flag: '🇩🇪', asset: 'EUR/CHF OTC' },
  { name: 'Oliver_Smith', country: 'United Kingdom', countryCode: 'GB', flag: '🇬🇧', asset: 'GBP/USD OTC' },
  { name: 'Carlos_Binary', country: 'Colombia', countryCode: 'CO', flag: '🇨🇴', asset: 'EUR/USD OTC' },
  { name: 'Somchai_Trade', country: 'Thailand', countryCode: 'TH', flag: '🇹🇭', asset: 'USD/THB OTC' },
  { name: 'Rohit_Scalper', country: 'India', countryCode: 'IN', flag: '🇮🇳', asset: 'BTC/USD' },
  { name: 'Gabriel_Invest', country: 'Brazil', countryCode: 'BR', flag: '🇧🇷', asset: 'XAU/USD' },
  { name: 'Minh_Trader', country: 'Vietnam', countryCode: 'VN', flag: '🇻🇳', asset: 'EUR/USD OTC' },
  { name: 'Tariq_Crypto', country: 'UAE', countryCode: 'AE', flag: '🇦🇪', asset: 'ETH/USD' },
  { name: 'Felipe_OTC', country: 'Brazil', countryCode: 'BR', flag: '🇧🇷', asset: 'USD/CAD OTC' },
  { name: 'Priya_Kapoor', country: 'India', countryCode: 'IN', flag: '🇮🇳', asset: 'EUR/USD OTC' },
  { name: 'Dimas_W', country: 'Indonesia', countryCode: 'ID', flag: '🇮🇩', asset: 'AUD/USD OTC' },
  { name: 'Christian_P', country: 'Philippines', countryCode: 'PH', flag: '🇵🇭', asset: 'EUR/USD OTC' },
  { name: 'Hamdan_Capital', country: 'UAE', countryCode: 'AE', flag: '🇦🇪', asset: 'XAU/USD' },
  { name: 'Santiago_FX', country: 'Argentina', countryCode: 'AR', flag: '🇦🇷', asset: 'EUR/USD OTC' },
  { name: 'Ananya_Trade', country: 'India', countryCode: 'IN', flag: '🇮🇳', asset: 'USD/JPY OTC' },
  { name: 'Tiago_Alves', country: 'Portugal', countryCode: 'PT', flag: '🇵🇹', asset: 'EUR/USD OTC' },
  { name: 'Lukas_Hoffman', country: 'Germany', countryCode: 'DE', flag: '🇩🇪', asset: 'EUR/GBP OTC' },
  { name: 'Rian_Kurniawan', country: 'Indonesia', countryCode: 'ID', flag: '🇮🇩', asset: 'GBP/JPY OTC' },
  { name: 'Hoang_Binary', country: 'Vietnam', countryCode: 'VN', flag: '🇻🇳', asset: 'BTC/USD' },
  { name: 'Aditya_Sharma', country: 'India', countryCode: 'IN', flag: '🇮🇳', asset: 'EUR/USD OTC' },
  { name: 'Bruno_Carvalho', country: 'Brazil', countryCode: 'BR', flag: '🇧🇷', asset: 'USD/CHF OTC' },
  { name: 'Diego_Montes', country: 'Spain', countryCode: 'ES', flag: '🇪🇸', asset: 'EUR/USD OTC' },
  { name: 'Sanjay_Patel', country: 'India', countryCode: 'IN', flag: '🇮🇳', asset: 'GBP/USD OTC' },
  { name: 'Arthur_Pendelton', country: 'South Africa', countryCode: 'ZA', flag: '🇿🇦', asset: 'XAU/USD' },
  { name: 'Nguyen_Duc', country: 'Vietnam', countryCode: 'VN', flag: '🇻🇳', asset: 'EUR/JPY OTC' },
  { name: 'Eko_Prasetyo', country: 'Indonesia', countryCode: 'ID', flag: '🇮🇩', asset: 'EUR/USD OTC' },
  { name: 'Manish_Verma', country: 'India', countryCode: 'IN', flag: '🇮🇳', asset: 'AUD/CAD OTC' },
  { name: 'Gustavo_Lima', country: 'Brazil', countryCode: 'BR', flag: '🇧🇷', asset: 'BTC/USD' },
  { name: 'Thanh_Tung', country: 'Vietnam', countryCode: 'VN', flag: '🇻🇳', asset: 'EUR/USD OTC' },
  { name: 'Karan_Malhotra', country: 'India', countryCode: 'IN', flag: '🇮🇳', asset: 'USD/CAD OTC' },
  { name: 'Leandro_Rossi', country: 'Italy', countryCode: 'IT', flag: '🇮🇹', asset: 'EUR/USD OTC' },
  { name: 'Farhan_Akhtar', country: 'Pakistan', countryCode: 'PK', flag: '🇵🇰', asset: 'GBP/USD OTC' },
  { name: 'Andre_Souza', country: 'Brazil', countryCode: 'BR', flag: '🇧🇷', asset: 'EUR/USD OTC' },
  { name: 'Rajesh_Kumar', country: 'India', countryCode: 'IN', flag: '🇮🇳', asset: 'USD/INR OTC' },
  { name: 'Kenji_Sato', country: 'Japan', countryCode: 'JP', flag: '🇯🇵', asset: 'USD/JPY OTC' },
  { name: 'Vitor_Hugo', country: 'Brazil', countryCode: 'BR', flag: '🇧🇷', asset: 'EUR/USD OTC' },
  { name: 'Arjun_Reddy', country: 'India', countryCode: 'IN', flag: '🇮🇳', asset: 'XAU/USD' },
  { name: 'Hassan_AlSayed', country: 'Egypt', countryCode: 'EG', flag: '🇪🇬', asset: 'EUR/USD OTC' },
  { name: 'Murilo_Santos', country: 'Brazil', countryCode: 'BR', flag: '🇧🇷', asset: 'GBP/JPY OTC' },
  { name: 'Deepak_Yadav', country: 'India', countryCode: 'IN', flag: '🇮🇳', asset: 'EUR/USD OTC' },
];

/** Simple deterministic pseudo-random number generator for consistent daily scores */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

r.get('/', ah(async (req: Request, res) => {
  // Extract optional user token
  let currentUserId: string | null = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const claims = verifyAccess(authHeader.slice(7));
      currentUserId = claims.sub;
    } catch { /* guest */ }
  }

  // 1. Calculate reset countdown (resets at 00:00:00 UTC)
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const endOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const resetsInSeconds = Math.max(0, Math.floor((endOfDay.getTime() - now.getTime()) / 1000));

  // 2. Fetch real user today's settled binary options from database
  let currentUserStats: {
    profit: number;
    tradesCount: number;
    winCount: number;
    winRate: number;
    name: string;
  } = {
    profit: 0,
    tradesCount: 0,
    winCount: 0,
    winRate: 0,
    name: 'You',
  };

  if (currentUserId) {
    const [userRow, todayOptions] = await Promise.all([
      prisma.user.findUnique({
        where: { id: currentUserId },
        select: { firstName: true, lastName: true, username: true, email: true },
      }),
      prisma.binaryOption.findMany({
        where: {
          userId: currentUserId,
          settledAt: { gte: startOfDay },
          status: { in: ['WON', 'LOST', 'TIE'] },
        },
      }),
    ]);

    if (userRow) {
      currentUserStats.name = userRow.username || `${userRow.firstName} ${userRow.lastName}`.trim() || userRow.email.split('@')[0];
    }

    if (todayOptions.length > 0) {
      let netProfit = 0;
      let wins = 0;
      for (const opt of todayOptions) {
        if (opt.status === 'WON') {
          wins++;
          netProfit += Number(opt.profit ?? 0);
        } else if (opt.status === 'LOST') {
          netProfit -= Number(opt.stake);
        }
      }
      currentUserStats.profit = Math.max(0, netProfit);
      currentUserStats.tradesCount = todayOptions.length;
      currentUserStats.winCount = wins;
      currentUserStats.winRate = Math.round((wins / todayOptions.length) * 100);
    }
  }

  // 3. Generate deterministic daily leaderboard using date as seed
  let seed = 0;
  for (let i = 0; i < dateStr.length; i++) {
    seed = (seed << 5) - seed + dateStr.charCodeAt(i);
    seed |= 0;
  }
  const rand = mulberry32(Math.abs(seed));

  // Generate 50 realistic rankings descending from ~$52,000 down to ~$1,200
  const traders: LeaderboardTrader[] = [];
  let currentProfitAnchor = 52000 + Math.round(rand() * 8000); // #1 champion profit

  for (let i = 0; i < BASE_TRADERS.length; i++) {
    const base = BASE_TRADERS[i];
    // Smooth geometric decay for profit
    const decay = 0.93 - i * 0.0012;
    currentProfitAnchor = Math.max(1200, currentProfitAnchor * decay + (rand() * 300 - 150));
    const profit = Math.round(currentProfitAnchor * 100) / 100;
    const tradesCount = Math.floor(35 + rand() * 65);
    const winRate = Math.round((74 + rand() * 19) * 10) / 10;

    traders.push({
      rank: i + 1,
      name: base.name,
      country: base.country,
      countryCode: base.countryCode,
      flag: base.flag,
      profit,
      tradesCount,
      winRate,
      favoriteAsset: base.asset,
    });
  }

  // 4. If current user has real profit today, merge user dynamically into leaderboard
  let userRank = 0;
  let inTop50 = false;

  if (currentUserId && currentUserStats.profit > 0) {
    const userTrader: LeaderboardTrader = {
      rank: 0,
      userId: currentUserId,
      name: `${currentUserStats.name} (You)`,
      country: 'Your Country',
      countryCode: 'REAL',
      flag: '🌟',
      profit: currentUserStats.profit,
      tradesCount: currentUserStats.tradesCount,
      winRate: currentUserStats.winRate,
      favoriteAsset: 'Live Terminal',
      isCurrentUser: true,
    };

    // Find insertion index
    const insertIdx = traders.findIndex((t) => currentUserStats.profit >= t.profit);
    if (insertIdx !== -1 && insertIdx < 50) {
      traders.splice(insertIdx, 0, userTrader);
      traders.pop(); // keep exact 50
      inTop50 = true;
      userRank = insertIdx + 1;
    } else {
      userRank = 50 + Math.max(1, Math.floor(50 - (currentUserStats.profit / 1200) * 40));
    }
  }

  // Re-assign ranks 1..50
  for (let i = 0; i < traders.length; i++) {
    traders[i].rank = i + 1;
    if (traders[i].isCurrentUser) userRank = i + 1;
  }

  // Total paid out today across the platform
  const totalPaidProfit = traders.reduce((acc, t) => acc + t.profit, 840000);

  res.json({
    success: true,
    data: {
      period: 'day',
      date: dateStr,
      resetsInSeconds,
      totalPaidProfit,
      activeTradersCount: 18450 + Math.floor(rand() * 2500),
      topTraders: traders,
      currentUser: {
        rank: userRank || 84,
        inTop50,
        profit: currentUserStats.profit,
        tradesCount: currentUserStats.tradesCount,
        winRate: currentUserStats.winRate,
        name: currentUserStats.name,
      },
    },
    error: null,
  });
}));

export default r;
