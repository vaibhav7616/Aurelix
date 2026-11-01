// Daily leaderboard — built ONLY from real settled trades (UTC day). Nothing is generated.
//
// Ranking: net profit of settled fixed-time trades today, per user, on LIVE accounts only (demo
// results never appear). Only traders with a positive result are ranked. Other traders are shown by a masked handle (usernames are derived from email
// addresses at registration); the viewer sees their own name.
import { Router, Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { ah } from '../utils/asyncHandler';
import { verifyAccess } from '../utils/jwt';
import { utcDayStart } from '../utils/time';

const r = Router();
const TOP_N = 50;

interface LeaderboardTrader {
  rank: number;
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

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "demotrader" → "de***r": recognisable to its owner, not a public copy of an email name. */
export function maskHandle(name: string): string {
  const s = name.trim();
  if (s.length <= 3) return `${s.slice(0, 1)}***`;
  return `${s.slice(0, 2)}***${s.slice(-1)}`;
}

function viewerId(req: Request): string | null {
  const h = req.headers.authorization ?? '';
  if (!h.startsWith('Bearer ')) return null;
  try { return verifyAccess(h.slice(7)).sub; } catch { return null; }
}

r.get('/', ah(async (req: Request, res) => {
  const since = utcDayStart();
  const where: Prisma.BinaryOptionWhereInput = { status: { in: ['WON', 'LOST', 'TIE'] }, settledAt: { gte: since }, account: { accountType: 'LIVE' } };

  const [byUser, byOutcome, byAsset] = await Promise.all([
    prisma.binaryOption.groupBy({ by: ['userId'], where, _sum: { profit: true }, _count: { _all: true } }),
    prisma.binaryOption.groupBy({ by: ['userId', 'status'], where, _count: { _all: true } }),
    prisma.binaryOption.groupBy({ by: ['userId', 'assetId'], where, _count: { _all: true } }),
  ]);

  const assets = new Map((await prisma.asset.findMany({ select: { id: true, symbol: true } })).map((a) => [a.id, a.symbol]));
  const stats = new Map(byUser.map((u) => [u.userId, { profit: round2(Number(u._sum.profit ?? 0)), trades: u._count._all, wins: 0, decided: 0, fav: '', favN: 0 }]));
  for (const o of byOutcome) {
    const s = stats.get(o.userId);
    if (!s) continue;
    if (o.status === 'WON') s.wins += o._count._all;
    if (o.status !== 'TIE') s.decided += o._count._all;
  }
  for (const a of byAsset) {
    const s = stats.get(a.userId);
    if (s && a._count._all > s.favN) { s.favN = a._count._all; s.fav = assets.get(a.assetId) ?? ''; }
  }

  const ranked = [...stats.entries()].filter(([, s]) => s.profit > 0).sort((a, b) => b[1].profit - a[1].profit);
  const me = viewerId(req);
  const top = ranked.slice(0, TOP_N);
  const users = new Map((await prisma.user.findMany({
    where: { id: { in: [...top.map(([id]) => id), ...(me ? [me] : [])] } },
    select: { id: true, username: true, firstName: true },
  })).map((u) => [u.id, u]));
  const handle = (id: string) => { const u = users.get(id); return u?.username || u?.firstName || 'trader'; };

  const topTraders: LeaderboardTrader[] = top.map(([id, s], i) => ({
    rank: i + 1,
    name: id === me ? `${handle(id)} (You)` : maskHandle(handle(id)),
    country: '', countryCode: '', flag: '',
    profit: s.profit,
    tradesCount: s.trades,
    winRate: s.decided ? Math.round((s.wins / s.decided) * 100) : 0,
    favoriteAsset: s.fav,
    ...(id === me ? { isCurrentUser: true } : {}),
  }));

  const mine = me ? stats.get(me) : undefined;
  const myRank = me ? ranked.findIndex(([id]) => id === me) + 1 : 0;
  const nextUtcMidnight = since.getTime() + 86_400_000;

  res.json({
    success: true,
    data: {
      period: 'daily',
      accountType: 'LIVE',
      date: since.toISOString().slice(0, 10),
      resetsInSeconds: Math.max(0, Math.round((nextUtcMidnight - Date.now()) / 1000)),
      totalPaidProfit: round2(ranked.reduce((a, [, s]) => a + s.profit, 0)),
      activeTradersCount: stats.size,
      topTraders,
      currentUser: {
        rank: myRank,
        inTop50: myRank > 0 && myRank <= TOP_N,
        profit: mine?.profit ?? 0,
        tradesCount: mine?.trades ?? 0,
        winRate: mine?.decided ? Math.round((mine.wins / mine.decided) * 100) : 0,
        name: me ? handle(me) : '',
      },
    },
    error: null,
  });
}));

export default r;
