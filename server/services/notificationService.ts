import { prisma } from '../config/database';
import { emitToUser } from '../websocket/socketServer';

export async function notify(params: {
  userId: string;
  type: 'TRADE' | 'ORDER' | 'DEPOSIT' | 'WITHDRAWAL' | 'SECURITY' | 'SYSTEM';
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const n = await prisma.notification.create({
      data: { userId: params.userId, type: params.type, title: params.title, message: params.message, metadata: (params.metadata ?? {}) as never },
    });
    emitToUser(params.userId, 'notification:new', n);
  } catch { /* ignore */ }
}
