// PendingEngine — Quotex "pending trade / execution by price".
//
//   create : validates like a normal trade, reserves the stake in Account.lockedBalance
//            (so it can't be spent twice) and remembers which side of the market the
//            target is on: above the current price → fires when price RISES to it,
//            below → fires when price FALLS to it.
//   trigger: every quote is checked against an in-memory book (no DB work per tick);
//            when the target is reached the server opens a regular fixed-time trade at
//            the market price for the chosen duration (optionsEngine.openOption).
//   cancel / expiry (validUntil) / failed execution: the reserved stake is released.
import { prisma } from '../config/database';
import { Err } from '../utils/errors';
import { logger } from '../utils/logger';
import { Tick } from '../market/MarketDataProvider';
import { getProvider } from '../services/marketService';
import { emitToUser } from '../websocket/socketServer';
import { notify } from '../services/notificationService';
import { audit } from '../services/auditService';
import { getRiskRules, evaluateRisk } from '../risk/riskEngine';
import { openOption, Direction, MIN_DURATION_SEC, MAX_DURATION_SEC } from './optionsEngine';

export const PENDING_VALIDITY_MS = 24 * 3600_000;
export const MAX_PENDING_PER_ACCOUNT = 20;

interface BookEntry { id: string; userId: string; accountId: string; symbol: string; targetPrice: number; triggerAbove: boolean }

/** symbol → active pending orders */
const book = new Map<string, BookEntry[]>();
const inFlight = new Set<string>();

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function addToBook(e: BookEntry) {
  const list = book.get(e.symbol) ?? [];
  list.push(e);
  book.set(e.symbol, list);
}
function removeFromBook(id: string) {
  for (const [sym, list] of book) {
    const next = list.filter((e) => e.id !== id);
    if (next.length !== list.length) {
      if (next.length) book.set(sym, next); else book.delete(sym);
      return;
    }
  }
}

type PendingRow = {
  id: string; direction: string; stake: unknown; durationSec: number; targetPrice: unknown; triggerAbove: boolean;
  status: string; createdAt: Date; validUntil: Date; closedAt: Date | null; optionId: string | null; reason: string | null;
  accountId: string; asset: { symbol: string };
};
export function serializePending(p: PendingRow) {
  return {
    id: p.id,
    symbol: p.asset.symbol,
    direction: p.direction as Direction,
    stake: Number(p.stake),
    durationSec: p.durationSec,
    targetPrice: Number(p.targetPrice),
    triggerAbove: p.triggerAbove,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    validUntil: p.validUntil.toISOString(),
    closedAt: p.closedAt ? p.closedAt.toISOString() : null,
    optionId: p.optionId,
    reason: p.reason,
    accountId: p.accountId,
  };
}

/** Load all active pending orders into the in-memory trigger book (on boot). */
export async function loadPendingBook(): Promise<void> {
  const rows = await prisma.pendingOption.findMany({ where: { status: 'PENDING' }, include: { asset: true } });
  book.clear();
  for (const r of rows) addToBook({ id: r.id, userId: r.userId, accountId: r.accountId, symbol: r.asset.symbol, targetPrice: Number(r.targetPrice), triggerAbove: r.triggerAbove });
  logger.info({ count: rows.length }, 'pending trade book loaded');
}

// ───────────────────────────────────────────────────── create ──

export async function createPending(input: {
  userId: string; accountId: string; symbol: string; direction: Direction; stake: number; durationSec: number; targetPrice: number;
  ip?: string; userAgent?: string;
}) {
  const stake = round2(input.stake);
  if (!Number.isInteger(input.durationSec) || input.durationSec < MIN_DURATION_SEC || input.durationSec > MAX_DURATION_SEC) {
    throw Err.validation(`Duration must be between ${MIN_DURATION_SEC}s and ${MAX_DURATION_SEC / 3600}h`);
  }
  if (!Number.isFinite(input.targetPrice) || input.targetPrice <= 0) throw Err.validation('Enter a valid target price');

  const [account, asset] = await Promise.all([
    prisma.account.findFirst({ where: { id: input.accountId, userId: input.userId } }),
    prisma.asset.findUnique({ where: { symbol: input.symbol } }),
  ]);
  if (!account) throw Err.notFound('Trading account not found');
  if (!asset) throw Err.notFound('Asset not found');
  const tick = await getProvider().getTick(asset.symbol);
  if (!tick) throw Err.assetDisabled();
  if (input.targetPrice === tick.mid) throw Err.validation('Target equals the current price — open a regular trade instead');
  // a target absurdly far from the market can never fire — reject instead of locking funds for a day
  if (Math.abs(input.targetPrice - tick.mid) / tick.mid > 0.2) throw Err.validation('Target price is too far from the current price');
  if (stake < Number(asset.minOrder) || stake > Number(asset.maxOrder)) throw Err.invalidAmount();

  const activeCount = await prisma.pendingOption.count({ where: { accountId: account.id, status: 'PENDING' } });
  if (activeCount >= MAX_PENDING_PER_ACCOUNT) throw Err.validation(`At most ${MAX_PENDING_PER_ACCOUNT} pending trades at a time`);

  const rules = await getRiskRules();
  evaluateRisk({
    userId: input.userId, accountId: account.id, accountType: account.accountType, accountStatus: account.status,
    availableBalance: Number(account.balance) - Number(account.lockedBalance), assetEnabled: asset.enabled, symbol: asset.symbol,
    amount: stake, openPositionsCount: 0, todayRealizedPnl: 0, totalRealizedPnl: 0,
  }, rules);

  const triggerAbove = input.targetPrice > tick.mid;
  const created = await prisma.$transaction(async (tx) => {
    const fresh = await tx.account.findUniqueOrThrow({ where: { id: account.id } });
    // reserve: lockedBalance += stake, only if the free balance covers it
    const reserved = await tx.account.updateMany({
      where: { id: fresh.id, balance: { gte: stake + Number(fresh.lockedBalance) } },
      data: { lockedBalance: { increment: stake } },
    });
    if (reserved.count !== 1) throw Err.insufficientBalance();
    return tx.pendingOption.create({
      data: {
        userId: input.userId, accountId: fresh.id, assetId: asset.id, direction: input.direction, stake,
        durationSec: input.durationSec, targetPrice: input.targetPrice, triggerAbove,
        validUntil: new Date(Date.now() + PENDING_VALIDITY_MS),
      },
      include: { asset: true },
    });
  });

  addToBook({ id: created.id, userId: input.userId, accountId: account.id, symbol: asset.symbol, targetPrice: input.targetPrice, triggerAbove });
  const out = serializePending(created);
  emitToUser(input.userId, 'pending:updated', out);
  emitToUser(input.userId, 'balance:updated', { accountId: account.id });
  await audit({ actorId: input.userId, action: 'PENDING_CREATE', entityType: 'PendingOption', entityId: created.id, metadata: { symbol: asset.symbol, direction: input.direction, stake, targetPrice: input.targetPrice, durationSec: input.durationSec }, ipAddress: input.ip, userAgent: input.userAgent });
  return out;
}

// ─────────────────────────────────────────── cancel / expire ──

/** Close an active pending order without executing it and release its reserved stake. Idempotent. */
async function closePending(id: string, status: 'CANCELLED' | 'EXPIRED' | 'FAILED', reason: string, userId?: string) {
  const row = await prisma.$transaction(async (tx) => {
    const p = await tx.pendingOption.findUnique({ where: { id } });
    if (!p || (userId && p.userId !== userId)) return null;
    const claimed = await tx.pendingOption.updateMany({ where: { id, status: 'PENDING' }, data: { status, reason, closedAt: new Date() } });
    if (claimed.count !== 1) return null;
    await tx.account.update({ where: { id: p.accountId }, data: { lockedBalance: { decrement: p.stake } } });
    return tx.pendingOption.findUniqueOrThrow({ where: { id }, include: { asset: true } });
  });
  removeFromBook(id);
  if (!row) return null;
  const out = serializePending(row);
  emitToUser(row.userId, 'pending:updated', out);
  emitToUser(row.userId, 'balance:updated', { accountId: row.accountId });
  return out;
}

export async function cancelPending(userId: string, id: string) {
  const out = await closePending(id, 'CANCELLED', 'Cancelled by user', userId);
  if (!out) throw Err.notFound('Pending trade not found or already closed');
  await audit({ actorId: userId, action: 'PENDING_CANCEL', entityType: 'PendingOption', entityId: id });
  return out;
}

export async function expirePending(now = new Date()): Promise<number> {
  const due = await prisma.pendingOption.findMany({ where: { status: 'PENDING', validUntil: { lte: now } }, select: { id: true, userId: true }, take: 200 });
  let n = 0;
  for (const p of due) {
    const out = await closePending(p.id, 'EXPIRED', 'Target price was not reached in time').catch(() => null);
    if (out) {
      n++;
      await notify({ userId: p.userId, type: 'TRADE', title: 'Pending trade expired', message: `${out.direction} ${out.symbol} @ ${out.targetPrice} — stake released`, metadata: { pendingId: p.id } }).catch(() => undefined);
    }
  }
  return n;
}

// ─────────────────────────────────────────────────── trigger ──

/** Called for every quote. Pure in-memory check; execution is async and runs once per order. */
export function onPendingTick(t: Tick): void {
  const list = book.get(t.symbol);
  if (!list?.length) return;
  for (const e of list) {
    if (inFlight.has(e.id)) continue;
    const hit = e.triggerAbove ? t.mid >= e.targetPrice : t.mid <= e.targetPrice;
    if (!hit) continue;
    inFlight.add(e.id);
    void executePending(e).finally(() => inFlight.delete(e.id));
  }
}

async function executePending(e: BookEntry): Promise<void> {
  const p = await prisma.pendingOption.findUnique({ where: { id: e.id }, include: { asset: true } });
  if (!p || p.status !== 'PENDING') { removeFromBook(e.id); return; }
  try {
    const opt = await openOption({
      userId: p.userId, accountId: p.accountId, symbol: p.asset.symbol, direction: p.direction as Direction,
      stake: Number(p.stake), durationSec: p.durationSec, fromPendingId: p.id,
    });
    removeFromBook(e.id);
    const row = await prisma.pendingOption.findUniqueOrThrow({ where: { id: p.id }, include: { asset: true } });
    emitToUser(p.userId, 'pending:updated', serializePending(row));
    await notify({ userId: p.userId, type: 'TRADE', title: 'Pending trade opened', message: `${opt.direction} ${opt.symbol} · entry ${opt.entryPrice} · ${opt.durationSec}s`, metadata: { pendingId: p.id, optionId: opt.id } }).catch(() => undefined);
  } catch (err) {
    // risk rule / halted asset / balance at execution time → give the stake back, tell the user
    const msg = err instanceof Error ? err.message : 'Execution failed';
    logger.warn({ pendingId: p.id, err: msg }, 'pending trade execution failed');
    const out = await closePending(p.id, 'FAILED', msg).catch(() => null);
    if (out) await notify({ userId: p.userId, type: 'TRADE', title: 'Pending trade not opened', message: `${out.direction} ${out.symbol}: ${msg} — stake released`, metadata: { pendingId: p.id } }).catch(() => undefined);
  }
}

export async function listPending(userId: string, accountId?: string, active = true) {
  const rows = await prisma.pendingOption.findMany({
    where: { userId, ...(accountId ? { accountId } : {}), ...(active ? { status: 'PENDING' as const } : {}) },
    include: { asset: true }, orderBy: { createdAt: 'desc' }, take: active ? 100 : 50,
  });
  return rows.map(serializePending);
}

let expiryLoop: NodeJS.Timeout | null = null;
export async function startPendingEngine(): Promise<void> {
  await loadPendingBook();
  if (expiryLoop) return;
  expiryLoop = setInterval(() => { void expirePending().catch(() => undefined); }, 5000);
  expiryLoop.unref?.();
}
export function stopPendingEngine(): void {
  if (expiryLoop) clearInterval(expiryLoop);
  expiryLoop = null;
}
