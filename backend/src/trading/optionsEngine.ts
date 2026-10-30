// OptionsEngine — fixed-time (binary) options, Quotex-style.
//
//   open   : stake is debited immediately (ledger TRADE txn), entry price = live mid.
//   expiry : server compares close price to entry price:
//              UP   wins if close > entry · DOWN wins if close < entry · equal = TIE
//            WON  → credit stake + stake × payoutPct%   (profit = +payout)
//            TIE  → credit stake back                   (profit = 0)
//            LOST → nothing credited                    (profit = −stake)
//
// Everything money-related happens inside a DB transaction and is idempotent.
// The frontend never decides an outcome — it only renders what the server settled.
import { prisma } from '../config/database';
import { Err } from '../utils/errors';
import { getRiskRules, evaluateRisk } from '../risk/riskEngine';
import { getProvider } from '../services/marketService';
import { emitToUser } from '../websocket/socketServer';
import { notify } from '../services/notificationService';
import { audit } from '../services/auditService';
import { randomUUID } from 'crypto';
import { env } from '../config/env';
import { utcDayStart } from '../utils/time';
import { effectivePayoutPct, getPayoutRules } from './payout';

export const OPTION_DURATIONS_SEC = [5, 10, 15, 30, 60, 120, 180, 300, 600, 900, 1800, 3600] as const;
export const MIN_DURATION_SEC = 5;
export const MAX_DURATION_SEC = 4 * 3600;
/** "Time" mode (fixed clock expiry): expiry must be a whole minute at least this far away (Quotex cut-off). */
export const FIXED_TIME_MIN_LEAD_SEC = 30;

export type Direction = 'UP' | 'DOWN';
export type Outcome = 'WON' | 'LOST' | 'TIE';

export interface OpenOptionInput {
  userId: string;
  accountId: string;
  symbol: string;
  direction: Direction;
  stake: number;
  /** "Timer" mode: trade runs for durationSec from the moment it opens */
  durationSec?: number;
  /** "Time" mode: trade expires at this wall-clock instant (epoch ms, whole minute) */
  expiresAt?: number;
  /** set by the pending-trade engine: the stake was reserved by this pending order */
  fromPendingId?: string;
  idempotencyKey?: string;
  ip?: string;
  userAgent?: string;
}

/** Pure settlement math — unit-tested, shared by settle loop and previews. */
export function settleOutcome(direction: Direction, entryPrice: number, closePrice: number): Outcome {
  if (closePrice === entryPrice) return 'TIE';
  const up = closePrice > entryPrice;
  return (direction === 'UP') === up ? 'WON' : 'LOST';
}

/** Net profit for a settled option: +payout on win, 0 on tie, −stake on loss. */
export function optionProfit(outcome: Outcome, stake: number, payoutPct: number): number {
  if (outcome === 'WON') return round2(stake * (payoutPct / 100));
  if (outcome === 'TIE') return 0;
  return -round2(stake);
}

/** Amount credited back to the account at settlement (stake + profit for wins, stake for ties, 0 for losses). */
export function settlementCredit(outcome: Outcome, stake: number, payoutPct: number): number {
  if (outcome === 'WON') return round2(stake + stake * (payoutPct / 100));
  if (outcome === 'TIE') return round2(stake);
  return 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Pure exposure rule: the platform pays winners from losers, so its risk on an asset is the
 * imbalance between open UP and DOWN stake. A trade is refused only if it pushes that
 * imbalance past the limit — trades that reduce it are always allowed.
 */
export function exceedsExposure(upStake: number, downStake: number, direction: Direction, stake: number, limit: number): boolean {
  const net = upStake - downStake;
  const next = direction === 'UP' ? net + stake : net - stake;
  return Math.abs(next) > limit && Math.abs(next) > Math.abs(net);
}

async function checkAssetExposure(assetId: string, symbol: string, direction: Direction, stake: number, limit: number) {
  const rows = await prisma.binaryOption.groupBy({
    by: ['direction'],
    where: { assetId, status: 'OPEN', account: { accountType: 'LIVE' } },
    _sum: { stake: true },
  });
  const sum = (d: Direction) => Number(rows.find((r) => r.direction === d)?._sum.stake ?? 0);
  if (exceedsExposure(sum('UP'), sum('DOWN'), direction, stake, limit)) throw Err.exposureLimit(symbol);
}

function serialize(o: {
  id: string; direction: string; stake: unknown; payoutPct: number; entryPrice: unknown; closePrice: unknown; profit: unknown;
  durationSec: number; openedAt: Date; expiresAt: Date; settledAt: Date | null; status: string; accountId: string;
  closeQuoteAt?: Date | null; settleSource?: string | null;
  asset?: { symbol: string } | null;
}) {
  return {
    id: o.id,
    symbol: o.asset?.symbol ?? null,
    direction: o.direction as Direction,
    stake: Number(o.stake),
    payoutPct: o.payoutPct,
    entryPrice: Number(o.entryPrice),
    closePrice: o.closePrice == null ? null : Number(o.closePrice),
    profit: o.profit == null ? null : Number(o.profit),
    durationSec: o.durationSec,
    openedAt: o.openedAt.toISOString(),
    expiresAt: o.expiresAt.toISOString(),
    settledAt: o.settledAt ? o.settledAt.toISOString() : null,
    closeQuoteAt: o.closeQuoteAt ? o.closeQuoteAt.toISOString() : null,
    settleSource: o.settleSource ?? null,
    status: o.status,
    accountId: o.accountId,
  };
}
export type SerializedOption = ReturnType<typeof serialize>;

// ───────────────────────────────────────────────────────── open ──

export async function openOption(input: OpenOptionInput) {
  const key = input.idempotencyKey?.trim();
  if (key) {
    const existing = await prisma.idempotencyKey.findUnique({ where: { key } }).catch(() => null);
    if (existing?.response) return { ...(existing.response as object), replayed: true } as SerializedOption & { replayed: boolean };
    const dup = await prisma.binaryOption.findUnique({ where: { idempotencyKey: key }, include: { asset: true } }).catch(() => null);
    if (dup) return { ...serialize(dup), replayed: true };
  }

  if (input.expiresAt != null) {
    validateFixedExpiry(input.expiresAt, Date.now());
  } else if (!Number.isInteger(input.durationSec) || input.durationSec! < MIN_DURATION_SEC || input.durationSec! > MAX_DURATION_SEC) {
    throw Err.validation(`Duration must be between ${MIN_DURATION_SEC}s and ${MAX_DURATION_SEC / 3600}h`);
  }
  const stake = round2(input.stake);
  const pendingId = input.fromPendingId;

  const [account, asset] = await Promise.all([
    prisma.account.findFirst({ where: { id: input.accountId, userId: input.userId } }),
    prisma.asset.findUnique({ where: { symbol: input.symbol } }),
  ]);
  if (!account) throw Err.notFound('Trading account not found');
  if (!asset) throw Err.notFound('Asset not found');

  const provider = getProvider();
  const tick = await provider.getTick(asset.symbol);
  if (!tick) throw Err.assetDisabled();
  // never open on a frozen quote: a trader watching the real market would know where it is going
  const age = provider.quoteAgeMs?.(asset.symbol);
  if (age == null || age > env.MAX_QUOTE_AGE_MS) throw Err.quoteStale(asset.symbol);
  const entryPrice = tick.mid;

  // Risk context — open options count as "open positions" for the rule set.
  const dayStart = utcDayStart();
  const [openCount, todayAgg, totalAgg] = await Promise.all([
    prisma.binaryOption.count({ where: { accountId: account.id, status: 'OPEN' } }),
    prisma.binaryOption.aggregate({ _sum: { profit: true }, where: { accountId: account.id, status: { not: 'OPEN' }, settledAt: { gte: dayStart } } }),
    prisma.binaryOption.aggregate({ _sum: { profit: true }, where: { accountId: account.id, status: { not: 'OPEN' } } }),
  ]);
  const rules = await getRiskRules();
  evaluateRisk(
    {
      userId: input.userId,
      accountId: account.id,
      accountType: account.accountType,
      accountStatus: account.status,
      // a pending order already reserved this stake — count it as available for its own execution
      availableBalance: Number(account.balance) - Number(account.lockedBalance) + (pendingId ? stake : 0),
      assetEnabled: asset.enabled,
      symbol: asset.symbol,
      amount: stake,
      openPositionsCount: openCount,
      todayRealizedPnl: Number(todayAgg._sum.profit ?? 0),
      totalRealizedPnl: Number(totalAgg._sum.profit ?? 0),
    },
    rules,
  );
  if (stake < Number(asset.minOrder) || stake > Number(asset.maxOrder)) throw Err.invalidAmount();
  if (account.accountType === 'LIVE' && rules.maxAssetExposure > 0) {
    await checkAssetExposure(asset.id, asset.symbol, input.direction, stake, rules.maxAssetExposure);
  }

  const id = randomUUID();
  const openedAt = new Date();
  let expiresAt: Date;
  let durationSec: number;
  if (input.expiresAt != null) {
    validateFixedExpiry(input.expiresAt, openedAt.getTime()); // re-check: the request may have waited on the DB
    expiresAt = new Date(input.expiresAt);
    durationSec = Math.round((expiresAt.getTime() - openedAt.getTime()) / 1000);
  } else {
    durationSec = input.durationSec!;
    expiresAt = new Date(openedAt.getTime() + durationSec * 1000);
  }
  const payoutPct = effectivePayoutPct(asset.payoutPct, durationSec, provider.isOtc?.(asset.symbol) ?? false, await getPayoutRules());

  const created = await prisma.$transaction(async (tx) => {
    if (pendingId) {
      // claim the pending order exactly once and release its reserved stake; the debit below takes it for real
      const claimed = await tx.pendingOption.updateMany({
        where: { id: pendingId, status: 'PENDING' },
        data: { status: 'EXECUTED', closedAt: openedAt, optionId: id },
      });
      if (claimed.count !== 1) throw Err.validation('Pending trade is no longer active');
      await tx.account.update({ where: { id: account.id }, data: { lockedBalance: { decrement: stake } } });
    }
    // Lock the account row, then re-read: a parallel trade or withdrawal waits, so the stake can
    // never come out of money another request just reserved.
    await tx.$queryRaw`SELECT id FROM "Account" WHERE id = ${account.id} FOR UPDATE`;
    const fresh = await tx.account.findUnique({ where: { id: account.id } });
    if (!fresh) throw Err.notFound('Trading account not found');
    const available = Number(fresh.balance) - Number(fresh.lockedBalance);
    if (stake > available) throw Err.insufficientBalance();
    // conditional atomic debit: fails instead of overdrawing if a parallel request/settlement changed the balance
    const debited = await tx.account.updateMany({
      where: { id: fresh.id, balance: { gte: stake + Number(fresh.lockedBalance) } },
      data: { balance: { decrement: stake } },
    });
    if (debited.count !== 1) throw Err.insufficientBalance();
    const after = await tx.account.findUniqueOrThrow({ where: { id: fresh.id } });
    const newBal = round2(Number(after.balance));

    const opt = await tx.binaryOption.create({
      data: {
        id, userId: input.userId, accountId: fresh.id, assetId: asset.id,
        direction: input.direction, stake, payoutPct,
        entryPrice, durationSec, openedAt, expiresAt,
        status: 'OPEN', idempotencyKey: key || null,
      },
      include: { asset: true },
    });
    await tx.walletTransaction.create({
      data: { accountId: fresh.id, type: 'TRADE', amount: -stake, balanceAfter: newBal, reference: id, memo: `Option ${input.direction} ${asset.symbol} · ${input.expiresAt != null ? `until ${expiresAt.toISOString().slice(11, 16)} UTC` : `${durationSec}s`} stake${pendingId ? ' (pending trade)' : ''}` },
    });
    if (key) {
      await tx.idempotencyKey.upsert({
        where: { key }, update: {},
        create: { key, userId: input.userId, route: 'POST /api/v1/options', expiresAt: new Date(Date.now() + 24 * 3600_000) },
      });
    }
    return { opt, newBal };
  });

  const out = serialize(created.opt);
  if (key) await prisma.idempotencyKey.update({ where: { key }, data: { response: out as never } }).catch(() => undefined);

  emitToUser(input.userId, 'option:opened', out);
  emitToUser(input.userId, 'balance:updated', { accountId: account.id, balance: created.newBal });
  await audit({ actorId: input.userId, action: 'OPTION_OPEN', entityType: 'BinaryOption', entityId: id, metadata: { symbol: asset.symbol, direction: input.direction, stake, durationSec, expiresAt: expiresAt.toISOString(), mode: input.expiresAt != null ? 'TIME' : 'TIMER', pendingId, entryPrice }, ipAddress: input.ip, userAgent: input.userAgent });

  return { ...out, balance: created.newBal, replayed: false };
}

/**
 * "Time" mode rules (Quotex): the trade closes at a whole minute on the clock, purchases for a
 * given minute close FIXED_TIME_MIN_LEAD_SEC before it, and the horizon is capped like Timer mode.
 */
export function validateFixedExpiry(expiresAtMs: number, nowMs: number): void {
  if (!Number.isFinite(expiresAtMs) || expiresAtMs % 60_000 !== 0) throw Err.validation('Expiry time must be a whole minute');
  const lead = (expiresAtMs - nowMs) / 1000;
  if (lead < FIXED_TIME_MIN_LEAD_SEC) throw Err.validation(`Purchases for this expiry are closed — pick a time at least ${FIXED_TIME_MIN_LEAD_SEC}s ahead`);
  if (lead > MAX_DURATION_SEC) throw Err.validation(`Expiry can be at most ${MAX_DURATION_SEC / 3600}h ahead`);
}

// ─────────────────────────────────────────────────────── settle ──

/** Where a settlement price came from — stored on the trade as proof. */
export type SettleSource = 'QUOTE' | 'EXCHANGE' | 'REFUND';
export interface SettleProof { source: SettleSource; quoteAt: Date }

/** Settle one option at `closePrice`. Idempotent: a second call is a no-op. */
export async function settleOption(optionId: string, closePrice: number, now = new Date(), proof?: SettleProof) {
  const result = await prisma.$transaction(async (tx) => {
    const o = await tx.binaryOption.findUnique({ where: { id: optionId }, include: { asset: true } });
    if (!o || o.status !== 'OPEN') return null;
    const stake = Number(o.stake);
    const entry = Number(o.entryPrice);
    const outcome = settleOutcome(o.direction as Direction, entry, closePrice);
    const profit = optionProfit(outcome, stake, o.payoutPct);
    const credit = settlementCredit(outcome, stake, o.payoutPct);

    // Claim the option first with a conditional update: only ONE concurrent settler can flip
    // OPEN → outcome, so the payout can never be credited twice (READ COMMITTED would let two
    // transactions both see status OPEN above).
    const claimed = await tx.binaryOption.updateMany({
      where: { id: o.id, status: 'OPEN' },
      data: { status: outcome, closePrice, profit, settledAt: now, closeQuoteAt: proof?.quoteAt ?? now, settleSource: proof?.source ?? 'QUOTE' },
    });
    if (claimed.count !== 1) return null;

    const acct = credit !== 0
      // atomic increment — never a read-modify-write that could overwrite a concurrent stake debit
      ? await tx.account.update({ where: { id: o.accountId }, data: { balance: { increment: credit } } })
      : await tx.account.findUnique({ where: { id: o.accountId } });
    if (!acct) throw new Error('account missing');
    const newBal = round2(Number(acct.balance));
    if (credit !== 0) {
      await tx.walletTransaction.create({
        data: { accountId: acct.id, type: 'TRADE', amount: credit, balanceAfter: newBal, reference: o.id, memo: `Option ${outcome} ${o.asset.symbol} · ${outcome === 'WON' ? `+${profit.toFixed(2)} payout` : 'stake returned'}` },
      });
    }
    const updated = await tx.binaryOption.findUniqueOrThrow({ where: { id: o.id }, include: { asset: true } });
    return { updated, newBal, outcome, profit, credit };
  });
  if (!result) return null;

  const out = serialize(result.updated);
  emitToUser(result.updated.userId, 'option:settled', out);
  emitToUser(result.updated.userId, 'balance:updated', { accountId: result.updated.accountId, balance: result.newBal });
  await notify({
    userId: result.updated.userId,
    type: 'TRADE',
    title: result.outcome === 'WON' ? `Trade won +$${result.profit.toFixed(2)}` : result.outcome === 'TIE' ? 'Trade tied — stake returned' : `Trade lost −$${Math.abs(result.profit).toFixed(2)}`,
    message: `${result.updated.direction} ${result.updated.asset.symbol} · ${result.updated.durationSec}s · ${Number(result.updated.entryPrice)} → ${closePrice}`,
    metadata: { optionId: result.updated.id, outcome: result.outcome },
  });
  await audit({ action: `OPTION_${result.outcome}`, entityType: 'BinaryOption', entityId: result.updated.id, metadata: { symbol: result.updated.asset.symbol, closePrice, profit: result.profit } });
  return out;
}

/** After an exchange lookup fails on a network error, keep retrying this long before refunding. */
const EXCHANGE_RETRY_MS = 5 * 60_000;

/**
 * The price that decides a trade, in order of preference:
 *   1. QUOTE    — the live quote at the expiry instant (in-memory history)
 *   2. EXCHANGE — the exchange's recorded trade at that instant (live-fed symbols; covers restarts)
 *   3. REFUND   — no trustworthy price exists: settle at entry → TIE, stake returned
 * Returns null when the exchange could not be reached yet — the caller retries on a later pass.
 */
export async function resolveClosePrice(
  symbol: string, expiresAt: Date, entryPrice: number, now: Date, opts: { skipExchange?: boolean } = {},
): Promise<{ price: number; source: SettleSource } | null> {
  const provider = getProvider();
  const ts = expiresAt.getTime();
  const quote = provider.priceAt?.(symbol, ts) ?? null;
  if (quote != null) return { price: quote, source: 'QUOTE' };
  if (provider.historicalPrice) {
    const recent = now.getTime() - ts < EXCHANGE_RETRY_MS;
    if (opts.skipExchange && recent) return null;
    if (!opts.skipExchange) {
      try {
        const p = await provider.historicalPrice(symbol, ts);
        if (p != null) return { price: p, source: 'EXCHANGE' };
      } catch (err) {
        if (recent) throw err;
      }
    }
  }
  return { price: entryPrice, source: 'REFUND' };
}

/** Settle every option whose expiry has passed. Called by the settlement loop. */
export async function settleExpired(now = new Date()): Promise<number> {
  const due = await prisma.binaryOption.findMany({
    where: { status: 'OPEN', expiresAt: { lte: now } },
    include: { asset: true },
    orderBy: { expiresAt: 'asc' },
    take: 200,
  });
  if (!due.length) return 0;
  let n = 0;
  // one failed exchange call per pass is enough — don't stall every other settlement on timeouts
  let exchangeDown = false;
  for (const o of due) {
    let close: Awaited<ReturnType<typeof resolveClosePrice>>;
    try {
      close = await resolveClosePrice(o.asset.symbol, o.expiresAt, Number(o.entryPrice), now, { skipExchange: exchangeDown });
    } catch {
      exchangeDown = true;
      continue; // retried on the next pass
    }
    if (!close) continue;
    const r = await settleOption(o.id, close.price, now, { source: close.source, quoteAt: o.expiresAt }).catch(() => null);
    if (r) n++;
  }
  return n;
}

let loop: NodeJS.Timeout | null = null;
let running = false;
/** Independent 250ms settlement loop — expiry is honoured even if the market feed stalls. */
export function startSettlementLoop(intervalMs = 250): void {
  if (loop) return;
  loop = setInterval(() => {
    if (running) return;
    running = true;
    void settleExpired().catch(() => undefined).finally(() => { running = false; });
  }, intervalMs);
  loop.unref?.();
}
export function stopSettlementLoop(): void {
  if (loop) clearInterval(loop);
  loop = null;
}

// ─────────────────────────────────────────────────────── reads ──

export async function listOptions(params: { userId: string; accountId?: string; status?: 'OPEN' | 'CLOSED'; page: number; pageSize: number }) {
  const where = {
    userId: params.userId,
    ...(params.accountId ? { accountId: params.accountId } : {}),
    ...(params.status === 'OPEN' ? { status: 'OPEN' as const } : params.status === 'CLOSED' ? { status: { not: 'OPEN' as const } } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.binaryOption.count({ where }),
    prisma.binaryOption.findMany({ where, include: { asset: true }, orderBy: { openedAt: 'desc' }, skip: (params.page - 1) * params.pageSize, take: params.pageSize }),
  ]);
  return { total, items: rows.map(serialize) };
}

export async function optionStats(accountId: string) {
  const dayStart = utcDayStart();
  const [open, settled] = await Promise.all([
    prisma.binaryOption.findMany({ where: { accountId, status: 'OPEN' }, select: { stake: true } }),
    prisma.binaryOption.findMany({ where: { accountId, status: { not: 'OPEN' } }, select: { profit: true, status: true, settledAt: true, stake: true } }),
  ]);
  const totalPnl = settled.reduce((a, o) => a + Number(o.profit ?? 0), 0);
  const todayPnl = settled.filter((o) => o.settledAt && o.settledAt >= dayStart).reduce((a, o) => a + Number(o.profit ?? 0), 0);
  const wins = settled.filter((o) => o.status === 'WON').length;
  const losses = settled.filter((o) => o.status === 'LOST').length;
  const ties = settled.filter((o) => o.status === 'TIE').length;
  const decided = wins + losses;
  return {
    openTrades: open.length,
    inTrade: round2(open.reduce((a, o) => a + Number(o.stake), 0)),
    totalTrades: settled.length,
    wins, losses, ties,
    winRate: decided ? (wins / decided) * 100 : 0,
    todayPnl: round2(todayPnl),
    totalPnl: round2(totalPnl),
    turnover: round2(settled.reduce((a, o) => a + Number(o.stake), 0)),
  };
}
