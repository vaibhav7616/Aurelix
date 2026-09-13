import { Router } from 'express';
import { ah } from '../utils/asyncHandler';
import { getProvider } from '../services/marketService';
import { prisma } from '../config/database';
import { orderCandles } from '../market/MarketDataProvider';
import { TIMEFRAME_KEYS, timeframeMs } from '../market/DemoMarketProvider';

const r = Router();

// Feed status for top bars / ops consoles (provider identity, symbols, server time)
r.get('/status', ah(async (_req, res) => {
  const provider = getProvider();
  const { demoProvider } = await import('../services/marketService');
  const symbols = demoProvider()?.getSymbols() ?? [];
  const ticks = await provider.getTicks(symbols).catch(() => []);
  res.json({
    success: true,
    data: {
      provider: provider.name,
      demo: provider.isDemo,
      symbols,
      serverTime: Date.now(),
      tickCount: ticks.length,
      ticks: ticks.map((t) => ({ symbol: t.symbol, mid: t.mid, ts: t.ts })),
    },
    error: null,
  });
}));

r.get('/tick/:symbol', ah(async (req, res) => {
  const t = await getProvider().getTick(req.params.symbol);
  if (!t) { res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'No tick for symbol' } }); return; }
  res.json({ success: true, data: t, error: null });
}));

// 24h instrument statistics computed from recent candles + live quote (demo data)
r.get('/stats', ah(async (req, res) => {
  const symbol = String(req.query.symbol ?? 'BTC/USD');
  const provider = getProvider();
  const [tick, candles] = await Promise.all([
    provider.getTick(symbol).catch(() => null),
    provider.getCandles(symbol, '5m', 300).catch(() => []),
  ]);
  const cutoff = Date.now() - 24 * 3600_000;
  const day = candles.filter((c) => c.openTime >= cutoff);
  const pool = day.length ? day : candles;
  const high = pool.length ? Math.max(...pool.map((c) => c.high)) : (tick?.mid ?? 0);
  const low = pool.length ? Math.min(...pool.map((c) => c.low)) : (tick?.mid ?? 0);
  const volume = pool.reduce((a, c) => a + (c.volume ?? 0), 0);
  res.json({
    success: true,
    data: {
      symbol,
      demo: provider.isDemo,
      bid: tick?.bid ?? null,
      ask: tick?.ask ?? null,
      mid: tick?.mid ?? null,
      spread: tick?.spread ?? null,
      changePct24h: tick?.changePct24h ?? 0,
      high24h: high,
      low24h: low,
      volume24h: volume,
      ts: Date.now(),
    },
    error: null,
  });
}));

r.get('/ticks', ah(async (req, res) => {
  const symbols = String(req.query.symbols ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const list = symbols.length ? symbols : ['BTC/USD', 'ETH/USD', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD'];
  const ticks = await getProvider().getTicks(list);
  res.json({ success: true, data: { demo: getProvider().isDemo, ticks }, error: null });
}));

r.get('/timeframes', (_req, res) => {
  res.json({ success: true, data: { timeframes: TIMEFRAME_KEYS.map((tf) => ({ key: tf, ms: timeframeMs(tf) })), serverTime: Date.now() }, error: null });
});

r.get('/candles', ah(async (req, res) => {
  const symbol = String(req.query.symbol ?? 'BTC/USD');
  const timeframe = String(req.query.timeframe ?? '1m');
  if (!timeframeMs(timeframe)) { res.status(400).json({ success: false, data: null, error: { code: 'VALIDATION_ERROR', message: `Unknown timeframe. Use one of ${TIMEFRAME_KEYS.join(', ')}` } }); return; }
  const limit = Math.min(1000, Math.max(10, parseInt(String(req.query.limit ?? '200'), 10) || 200));
  let candles = await getProvider().getCandles(symbol, timeframe, limit);
  if (!candles.length) {
    // fallback to persisted 1m
    const rows = await prisma.marketCandle.findMany({ where: { symbol, timeframe }, orderBy: { openTime: 'desc' }, take: limit }).catch(() => []);
    candles = orderCandles(rows.reverse().map((c) => ({ symbol: c.symbol, timeframe: c.timeframe, open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close), volume: Number(c.volume), openTime: c.openTime.getTime(), closeTime: c.closeTime.getTime() })));
  }
  res.json({ success: true, data: { demo: getProvider().isDemo, timeframe, timeframeMs: timeframeMs(timeframe), serverTime: Date.now(), candles }, error: null });
}));

export default r;
