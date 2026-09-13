import { prisma } from '../config/database';

export async function audit(params: {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params.metadata ?? {})) {
      if (/password|token|secret|key/i.test(k)) continue;
      clean[k] = v;
    }
    await prisma.auditLog.create({
      data: {
        actorId: params.actorId ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        metadata: clean as never,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  } catch { /* best effort */ }
}
