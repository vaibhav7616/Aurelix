import { Router } from 'express';
import { prisma } from '../config/database';
import { ah } from '../utils/asyncHandler';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { closePositionSchema, updateSLTPSchema } from '../schemas/trading';
import { closePosition } from '../trading/executionEngine';
import { getProvider } from '../services/marketService';
import { netPnl } from '../services/pnlService';
import { Err } from '../utils/errors';
import { audit } from '../services/auditService';

const r = Router();
r.use(requireAuth);

r.get('/open', ah(async (req: AuthedRequest, res) => {
  const accountId = req.query.accountId as string | undefined;
  const positions = await prisma.position.findMany({
    where: { userId: req.userId!, status: 'OPEN', ...(accountId ? { accountId } : {}) },
    include: { asset: true },
    orderBy: { openedAt: 'desc' },
  });
  // Refresh with live mid for display (backend-computed, never trusted from client)
  const provider = getProvider();
  const out = [];
  for (const p of positions) {
    const t = await provider.getTick(p.asset.symbol).catch(() => null);
    const cur = t?.mid ?? Number(p.currentPrice);
    const { gross, fee, net } = netPnl({ side: p.side as 'BUY' | 'SELL', entryPrice: Number(p.entryPrice), currentPrice: cur, quantity: Number(p.quantity), feeBps: p.asset.feeBps });
    out.push({ ...p, quantity: Number(p.quantity), entryPrice: Number(p.entryPrice), currentPrice: cur, unrealizedPnl: net, grossPnl: gross, fee, symbol: p.asset.symbol });
  }
  res.json({ success: true, data: out, error: null });
}));

r.post('/close', validateBody(closePositionSchema), ah(async (req: AuthedRequest, res) => {
  const result = await closePosition({ userId: req.userId!, positionId: (req.body as { positionId: string }).positionId, ip: req.ip, userAgent: req.headers['user-agent'] });
  res.json({ success: true, data: result, error: null });
}));

r.patch('/sltp', validateBody(updateSLTPSchema), ah(async (req: AuthedRequest, res) => {
  const { positionId, stopLoss, takeProfit } = req.body as { positionId: string; stopLoss?: number | null; takeProfit?: number | null };
  const p = await prisma.position.findFirst({ where: { id: positionId, userId: req.userId!, status: 'OPEN' }, include: { asset: true } });
  if (!p) throw Err.notFound('Open position not found');
  const provider = getProvider();
  const t = await provider.getTick(p.asset.symbol);
  const ref = t?.mid ?? Number(p.currentPrice);
  if (stopLoss != null) {
    if (p.side === 'BUY' && stopLoss >= ref) throw Err.validation('Stop-loss must be below current price for BUY');
    if (p.side === 'SELL' && stopLoss <= ref) throw Err.validation('Stop-loss must be above current price for SELL');
  }
  if (takeProfit != null) {
    if (p.side === 'BUY' && takeProfit <= ref) throw Err.validation('Take-profit must be above current price for BUY');
    if (p.side === 'SELL' && takeProfit >= ref) throw Err.validation('Take-profit must be below current price for SELL');
  }
  const updated = await prisma.position.update({ where: { id: p.id }, data: { stopLoss: stopLoss ?? null, takeProfit: takeProfit ?? null } });
  await audit({ actorId: req.userId, action: 'POSITION_SLTP_UPDATE', entityType: 'Position', entityId: p.id, metadata: { stopLoss, takeProfit } });
  res.json({ success: true, data: updated, error: null });
}));

export default r;
