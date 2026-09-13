import { Router } from 'express';
import { prisma } from '../config/database';
import { ah } from '../utils/asyncHandler';
import { getProvider } from '../services/marketService';

const r = Router();

// Public asset list with live ticks (demo-labelled)
r.get('/', ah(async (_req, res) => {
  const assets = await prisma.asset.findMany({ orderBy: { sortOrder: 'asc' } }).catch(() => []);
  const provider = getProvider();
  const ticks = await provider.getTicks(assets.map((a) => a.symbol)).catch(() => []);
  const bySym = new Map(ticks.map((t) => [t.symbol, t]));
  // Fallback when DB empty (first boot before seed)
  const list = assets.length ? assets : [];
  res.json({
    success: true,
    data: {
      demo: provider.isDemo,
      assets: list.map((a) => ({
        symbol: a.symbol, name: a.name, category: a.category, enabled: a.enabled,
        minOrder: Number(a.minOrder), maxOrder: Number(a.maxOrder), payoutPct: a.payoutPct,
        spread: Number(a.spread), feeBps: a.feeBps, tradingHours: a.tradingHours,
        tick: bySym.get(a.symbol) ?? null,
      })),
    },
    error: null,
  });
}));

export default r;
