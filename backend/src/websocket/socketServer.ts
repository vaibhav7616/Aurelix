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
      if (!token) return next(new Error('UNAUTHORIZED'));
      const claims = verifyAccess(token);
      const user = await prisma.user.findUnique({ where: { id: claims.sub }, select: { id: true, status: true } });
      if (!user || user.status === 'SUSPENDED') return next(new Error('UNAUTHORIZED'));
      socket.userId = user.id;
      next();
    } catch (e) {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket: AuthedSocket) => {
    const uid = socket.userId!;
    void socket.join(`user:${uid}`);
    logger.debug({ uid }, 'socket connected');

    socket.on('market:subscribe', (symbols: string[]) => {
      if (!Array.isArray(symbols)) return;
      for (const s of symbols.slice(0, 30)) {
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

export function broadcastTick(tick: Tick): void {
  try { io?.to(`asset:${tick.symbol}`).emit('market:tick', tick); } catch { /* ignore */ }
}

export function emitCandle(symbol: string, candle: unknown): void {
  try { io?.to(`asset:${symbol}`).emit('market:candle', candle); } catch { /* ignore */ }
}
