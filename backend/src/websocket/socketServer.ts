// Authenticated Socket.IO server with per-asset rooms + per-user rooms.
import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyAccess } from '../utils/jwt';
import { prisma } from '../config/database';
import { Tick } from '../market/MarketDataProvider';
import { logger } from '../utils/logger';
import { env } from '../config/env';

let io: Server | null = null;

interface AuthedSocket extends Socket {
  userId?: string;
}

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: env.CORS_ORIGINS, credentials: true },
    transports: ['websocket', 'polling'],
  });

  io.use(async (socket: AuthedSocket, next) => {
    try {
      const token = (socket.handshake.auth?.token as string) || (socket.handshake.query?.token as string);
      if (token) {
        try {
          const claims = verifyAccess(token);
          const user = await prisma.user.findUnique({ where: { id: claims.sub }, select: { id: true, status: true } });
          if (user && user.status !== 'SUSPENDED') {
            socket.userId = user.id;
          }
        } catch {
          // Token expired or invalid — allow as guest for market data
        }
      }
      next();
    } catch (e) {
      next();
    }
  });

  io.on('connection', (socket: AuthedSocket) => {
    const uid = socket.userId;
    if (uid) void socket.join(`user:${uid}`);
    logger.debug({ uid }, 'socket connected');

    socket.on('market:subscribe', (symbols: string[]) => {
      if (!Array.isArray(symbols)) return;
      for (const s of symbols.slice(0, 30)) {
        // cap rooms per connection: repeated subscribe calls must not grow server memory without bound
        if (socket.rooms.size >= 40) break;
        if (typeof s === 'string' && /^[A-Z\/]{3,20}$/.test(s)) void socket.join(`asset:${s}`);
      }
    });
    socket.on('market:unsubscribe', (symbols: string[]) => {
      if (!Array.isArray(symbols)) return;
      for (const s of symbols) void socket.leave(`asset:${s}`);
    });
    socket.on('disconnect', () => logger.debug({ uid }, 'socket disconnected'));
  });

  return io;
}

export function getIO(): Server | null {
  return io;
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  try { io?.to(`user:${userId}`).emit(event, payload); } catch { /* ignore */ }
}

// Quote fan-out is throttled per symbol: the feed can move every few ms, clients only need ~10
// updates/s (the chart glides between them). The LATEST quote is always delivered (trailing send).
// Settlement and pending triggers use the provider's own price history, never these broadcasts.
const TICK_BROADCAST_MS = 100;
const lastSentAt = new Map<string, number>();
const pendingTick = new Map<string, Tick>();
const trailing = new Map<string, NodeJS.Timeout>();

function sendTick(tick: Tick): void {
  lastSentAt.set(tick.symbol, Date.now());
  try { io?.to(`asset:${tick.symbol}`).emit('market:tick', tick); } catch { /* ignore */ }
}

export function broadcastTick(tick: Tick): void {
  const since = Date.now() - (lastSentAt.get(tick.symbol) ?? 0);
  if (since >= TICK_BROADCAST_MS && !trailing.has(tick.symbol)) { sendTick(tick); return; }
  pendingTick.set(tick.symbol, tick);
  if (trailing.has(tick.symbol)) return;
  const timer = setTimeout(() => {
    trailing.delete(tick.symbol);
    const t = pendingTick.get(tick.symbol);
    pendingTick.delete(tick.symbol);
    if (t) sendTick(t);
  }, Math.max(0, TICK_BROADCAST_MS - since));
  timer.unref?.();
  trailing.set(tick.symbol, timer);
}

export function emitCandle(symbol: string, candle: unknown): void {
  try { io?.to(`asset:${symbol}`).emit('market:candle', candle); } catch { /* ignore */ }
}
