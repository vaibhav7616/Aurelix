// Affiliate engine: attribution, levels, commission accrual, balances, eligibility and weekly payouts.
//
// Commission rules (all values from affiliate.config):
//  • Model and share % are fixed per trader at registration (affiliate's level that month).
//  • Levels come from the number of deposits made by the affiliate's traders in the previous
//    calendar month (re-evaluated on the 1st).
//  • REVSHARE: share % of the platform's result on the trader's settled live trades; losing months
//    for the platform reduce the balance. TURNOVER: share % of settled live volume, capped per
//    trader at turnoverCapPctOfDeposits % of that trader's deposits. CPA: one fixed amount per
//    Unique Active Client (first deposit ≥ minimum + activity within the window).
//  • Bonus money is excluded: commission is computed on the deposit-funded share of each trade.
//  • Sub-affiliate: the parent earns its level's sub % of every commission of the child, up to the cap.
//  • Suspicious referrals (shared IP with the affiliate, own account…) accrue as HELD until reviewed.
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { audit } from '../services/auditService';
import { getAffiliateConfig, levelFor, cpaRate, type AffiliateConfig, type Level } from './config';

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;
const round2 = (x: number) => Math.round(x * 100) / 100;

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newCode(len = 8): string {
  return [...randomBytes(len)].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
export function hashIp(ip: string | undefined): string | null {
  return ip ? createHash('sha256').update(`aff:${ip}`).digest('hex').slice(0, 32) : null;
}

// ── levels ────────────────────────────────────────────────────────────────────────────

export function monthStart(d = new Date(), offset = 0): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1));
}

/** Deposits (approved) made by this affiliate's traders in [from, to). */
export async function depositsBetween(affiliateId: string, from: Date, to: Date, db: Db = prisma): Promise<number> {
  const rows = await db.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*)::bigint AS n FROM "Deposit" d JOIN "AffiliateReferral" r ON r."userId" = d."userId"
    WHERE r."affiliateId" = ${affiliateId} AND d.status = 'COMPLETED' AND d."updatedAt" >= ${from} AND d."updatedAt" < ${to}`;
  return Number(rows[0]?.n ?? 0);
}

/** Level in force this month = from last month's deposit count. */
export async function currentLevel(affiliateId: string, cfg: AffiliateConfig, db: Db = prisma, now = new Date()): Promise<Level> {
  return levelFor(cfg.levels, await depositsBetween(affiliateId, monthStart(now, -1), monthStart(now), db));
}

// ── attribution ───────────────────────────────────────────────────────────────────────

export interface Attribution { aff?: string; promo?: string; sub?: string; clickId?: string }

/** Link a newly registered trader to an affiliate (link code or promo code). Never throws. */
export async function attributeRegistration(userId: string, input: Attribution, ip: string | undefined, deviceId: string | null = null): Promise<void> {
  try {
    if (!input.aff && !input.promo) return;
    const cfg = await getAffiliateConfig();
    const link = input.aff ? await prisma.affiliateLink.findUnique({ where: { code: input.aff.toUpperCase() } }) : null;
    const promo = !link && input.promo ? await prisma.affiliatePromoCode.findUnique({ where: { code: input.promo.toUpperCase() } }) : null;
    const affiliateId = link && !link.archived ? link.affiliateId : promo?.affiliateId;
    const model = link?.model ?? promo?.model;
    if (!affiliateId || !model) return;
    const aff = await prisma.affiliate.findUnique({ where: { id: affiliateId } });
    if (!aff || aff.status !== 'APPROVED') return;

    // fraud checks: the affiliate's own account, or a network the affiliate uses
    const flags: string[] = [];
    if (aff.userId === userId) flags.push('own_account');
    if (ip) {
      const sameIp = await prisma.session.count({ where: { userId: aff.userId, ipAddress: ip, createdAt: { gte: new Date(Date.now() - 90 * 86_400_000) } } });
      if (sameIp) flags.push('same_ip_as_affiliate');
    }
    if (deviceId) {
      // the partner's own browser, or a browser already used by another of the partner's traders
      const sameDevice = await prisma.session.count({ where: { userId: aff.userId, deviceId } });
      if (sameDevice) flags.push('same_device_as_affiliate');
      const traders = await prisma.affiliateReferral.findMany({ where: { affiliateId: aff.id }, select: { userId: true } });
      if (traders.length && (await prisma.session.count({ where: { deviceId, userId: { in: traders.map((t) => t.userId) } } }))) flags.push('device_shared_with_other_trader');
    }
    const lvl = await currentLevel(aff.id, cfg);
    await prisma.affiliateReferral.create({
      data: {
        userId, affiliateId: aff.id, linkId: link?.id ?? null, promoCodeId: promo?.id ?? null, model, level: lvl.level,
        sharePct: model === 'REVSHARE' ? lvl.revsharePct : model === 'TURNOVER' ? lvl.turnoverPct : 0,
        subId: (input.sub ?? link?.subId ?? null)?.slice(0, 64) ?? null, clickId: input.clickId?.slice(0, 128) ?? null,
        status: flags.length ? 'SUSPICIOUS' : 'ACTIVE', flags: flags.join(',') || null,
      },
    });
    if (flags.length) await audit({ action: 'AFFILIATE_REFERRAL_FLAGGED', entityType: 'Affiliate', entityId: aff.id, metadata: { userId, flags } });
    const created = await prisma.affiliateReferral.findUniqueOrThrow({ where: { userId } });
    void emit(aff.id, 'reg', { trader_id: traderNo(userId), click_id: input.clickId ?? '', site_id: input.sub ?? link?.subId ?? '', lid: link ? String(link.num) : '', event_id: `reg-${created.id}` });
  } catch (err) {
    logger.warn({ err: String(err), userId }, 'affiliate attribution failed');
  }
}

// ── deposits ──────────────────────────────────────────────────────────────────────────

/** Inside the deposit-approval transaction: track first deposit and deposit totals. */
export async function onDepositApproved(tx: Tx, dep: { id: string; userId: string; amount: Prisma.Decimal | number }): Promise<void> {
  const ref = await tx.affiliateReferral.findUnique({ where: { userId: dep.userId } });
  if (!ref) return;
  const amount = Number(dep.amount);
  const first = !ref.ftdAt;
  await tx.affiliateReferral.update({
    where: { id: ref.id },
    data: { depositTotal: { increment: amount }, ...(first ? { ftdAt: new Date(), ftdAmount: amount } : {}) },
  });
  const lid = ref.linkId ? (await tx.affiliateLink.findUnique({ where: { id: ref.linkId }, select: { num: true } }))?.num : null;
  const vars = { trader_id: traderNo(dep.userId), click_id: ref.clickId ?? '', site_id: ref.subId ?? '', lid: lid ? String(lid) : '', sumdep: amount.toFixed(2), event_id: `dep-${dep.id}` };
  setImmediate(() => void emit(ref.affiliateId, first ? 'ftd' : 'dep', vars));
}

// ── trades ────────────────────────────────────────────────────────────────────────────

interface SettledTrade { id: string; userId: string; accountId: string; stake: number; profit: number; outcome: 'WON' | 'LOST' | 'TIE' }

/** Inside the settlement transaction of a LIVE trade: accrue the affiliate's commission. */
export async function onTradeSettled(tx: Tx, t: SettledTrade): Promise<void> {
  if (t.outcome === 'TIE') return;
  const ref = await tx.affiliateReferral.findUnique({ where: { userId: t.userId } });
  if (!ref || ref.status === 'REJECTED') return;
  const cfg = await getAffiliateConfig();

  // Active Trader: deposited and traded enough
  if (!ref.activeTraderAt && ref.ftdAt) {
    const trades = await tx.binaryOption.count({ where: { userId: t.userId, status: { in: ['WON', 'LOST', 'TIE'] }, account: { accountType: 'LIVE' } } });
    if (trades >= cfg.activeTrader.minTrades) await tx.affiliateReferral.update({ where: { id: ref.id }, data: { activeTraderAt: new Date() } });
  }

  // only the deposit-funded part of the trade counts (bonus money is excluded)
  const acct = await tx.account.findUniqueOrThrow({ where: { id: t.accountId } });
  const bonus = Number((await tx.bonus.aggregate({ where: { accountId: t.accountId, status: 'ACTIVE' }, _sum: { amount: true } }))._sum.amount ?? 0);
  const free = Math.max(0, Number(acct.balance) - Number(acct.lockedBalance));
  const realShare = free > 0 ? Math.max(0, Math.min(1, (free - bonus) / free)) : bonus > 0 ? 0 : 1;
  const status = ref.status === 'SUSPICIOUS' ? 'HELD' : 'ACCRUED';

  if (ref.model === 'REVSHARE') {
    const amount = round2(-t.profit * realShare * (Number(ref.sharePct) / 100)); // lost → +, won → −
    if (amount) await credit(tx, cfg, ref.affiliateId, 'REVSHARE', amount, `rev:${t.id}`, ref.id, t.id, status);
  } else if (ref.model === 'TURNOVER') {
    const base = round2(t.stake * realShare * (Number(ref.sharePct) / 100));
    const cap = round2((Number(ref.depositTotal) * cfg.turnoverCapPctOfDeposits) / 100 - Number(ref.turnoverCommission));
    const amount = round2(Math.max(0, Math.min(base, cap)));
    if (amount > 0) {
      await tx.affiliateReferral.update({ where: { id: ref.id }, data: { turnoverCommission: { increment: amount } } });
      await credit(tx, cfg, ref.affiliateId, 'TURNOVER', amount, `turn:${t.id}`, ref.id, t.id, status);
    }
  } else if (ref.model === 'CPA' && !ref.cpaAt && ref.ftdAt && Number(ref.ftdAmount ?? 0) >= cfg.cpa.minFtd) {
    const until = new Date(ref.ftdAt.getTime() + cfg.cpa.withinDays * 86_400_000);
    if (new Date() <= until) {
      const agg = await tx.binaryOption.aggregate({ where: { userId: t.userId, status: { in: ['WON', 'LOST'] }, settledAt: { gte: ref.ftdAt }, account: { accountType: 'LIVE' } }, _count: { _all: true }, _sum: { stake: true } });
      const user = await tx.user.findUnique({ where: { id: t.userId }, select: { country: true } });
      const rate = cpaRate(cfg, user?.country);
      if (rate && agg._count._all >= cfg.cpa.minTrades && Number(agg._sum.stake ?? 0) >= cfg.cpa.minVolume) {
        await tx.affiliateReferral.update({ where: { id: ref.id }, data: { cpaAt: new Date() } });
        await credit(tx, cfg, ref.affiliateId, 'CPA', rate, `cpa:${ref.id}`, ref.id, t.id, status);
      }
    }
  }
}

/** True when the partner has brought no new Active Trader within the inactivity window. */
async function inactivePartner(tx: Tx, cfg: AffiliateConfig, affiliateId: string): Promise<boolean> {
  const since = new Date(Date.now() - cfg.inactivityDays * 86_400_000);
  const aff = await tx.affiliate.findUnique({ where: { id: affiliateId }, select: { approvedAt: true } });
  if (!aff?.approvedAt || aff.approvedAt > since) return false; // still inside the first window
  return (await tx.affiliateReferral.count({ where: { affiliateId, activeTraderAt: { gte: since } } })) === 0;
}

/** Write one commission row (idempotent by key) and the parent's sub-affiliate share. */
async function credit(tx: Tx, cfg: AffiliateConfig, affiliateId: string, type: string, amount: number, key: string, referralId: string, refId: string, status: string): Promise<void> {
  const exists = await tx.affiliateLedger.findUnique({ where: { uniqueKey: key } });
  if (exists) return;
  if (await inactivePartner(tx, cfg, affiliateId)) {
    // recorded for the audit trail, but not owed
    await tx.affiliateLedger.create({ data: { affiliateId, type, amount, status: 'CANCELLED', uniqueKey: key, referralId, refId, note: `Not accrued: no new active traders in ${cfg.inactivityDays} days` } });
    return;
  }
  await tx.affiliateLedger.create({ data: { affiliateId, type, amount, status, uniqueKey: key, referralId, refId } });

  const aff = await tx.affiliate.findUnique({ where: { id: affiliateId }, select: { parentId: true } });
  if (!aff?.parentId) return;
  const parent = await tx.affiliate.findUnique({ where: { id: aff.parentId } });
  if (!parent || parent.status !== 'APPROVED') return;
  const pct = (await currentLevel(parent.id, cfg, tx)).subPct;
  let sub = round2((amount * pct) / 100);
  if (sub > 0) {
    // lifetime cap per sub-affiliate
    const earned = Number((await tx.affiliateLedger.aggregate({ where: { affiliateId: parent.id, type: 'SUBAFFILIATE', refId: affiliateId, status: { not: 'CANCELLED' } }, _sum: { amount: true } }))._sum.amount ?? 0);
    sub = round2(Math.min(sub, Math.max(0, cfg.subAffiliateCapUsd - earned)));
  }
  if (sub) await tx.affiliateLedger.create({ data: { affiliateId: parent.id, type: 'SUBAFFILIATE', amount: sub, status, uniqueKey: `sub:${key}`, refId: affiliateId, note: `${pct}% of ${type} from a sub-affiliate` } });
}

// ── shared payment details (fraud) ─────────────────────────────────────────────────────

/** Comparable identifiers in a payout/withdrawal details object (account numbers, UPI IDs, wallets). */
export function paymentKeys(details: unknown): string[] {
  if (!details || typeof details !== 'object') return [];
  const keys = ['upiId', 'accountNumber', 'address', 'walletAddress', 'vpa', 'iban'];
  return Object.entries(details as Record<string, unknown>)
    .filter(([k, v]) => keys.includes(k) && typeof v === 'string' && v.trim().length >= 4)
    .map(([, v]) => String(v).toLowerCase().replace(/\s+/g, ''));
}

/** Put a referral under review: status SUSPICIOUS and its accrued commission (and the parent's share) on hold. */
export async function flagReferral(referralId: string, flag: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const ref = await tx.affiliateReferral.findUnique({ where: { id: referralId } });
    if (!ref || ref.status === 'REJECTED') return;
    const flags = new Set((ref.flags ?? '').split(',').filter(Boolean));
    if (flags.has(flag) && ref.status === 'SUSPICIOUS') return;
    flags.add(flag);
    await tx.affiliateReferral.update({ where: { id: ref.id }, data: { status: 'SUSPICIOUS', flags: [...flags].join(',') } });
    const rows = await tx.affiliateLedger.findMany({ where: { referralId: ref.id, status: 'ACCRUED' }, select: { uniqueKey: true } });
    const keys = rows.map((r) => r.uniqueKey);
    await tx.affiliateLedger.updateMany({ where: { uniqueKey: { in: [...keys, ...keys.map((k) => `sub:${k}`)] }, status: 'ACCRUED' }, data: { status: 'HELD' } });
  });
  await audit({ action: 'AFFILIATE_REFERRAL_FLAGGED', entityType: 'AffiliateReferral', entityId: referralId, metadata: { flag } });
}

/** A referred trader requested a withdrawal: same account/UPI/wallet as their partner → review. */
export async function checkTraderPayment(userId: string, details: unknown): Promise<void> {
  try {
    const ref = await prisma.affiliateReferral.findUnique({ where: { userId } });
    if (!ref) return;
    const aff = await prisma.affiliate.findUnique({ where: { id: ref.affiliateId }, select: { payoutDetails: true } });
    const mine = paymentKeys(details);
    if (mine.some((k) => paymentKeys(aff?.payoutDetails).includes(k))) await flagReferral(ref.id, 'same_payment_details_as_affiliate');
  } catch (err) { logger.warn({ err: String(err) }, 'affiliate payment check failed'); }
}

/** A partner saved payout details: any of their traders already withdrawing to the same place → review. */
export async function checkAffiliatePayment(affiliateId: string, details: unknown): Promise<void> {
  try {
    const keys = paymentKeys(details);
    if (!keys.length) return;
    const refs = await prisma.affiliateReferral.findMany({ where: { affiliateId }, select: { id: true, userId: true } });
    if (!refs.length) return;
    const wds = await prisma.withdrawal.findMany({ where: { userId: { in: refs.map((r) => r.userId) } }, select: { userId: true, details: true } });
    for (const w of wds) {
      if (paymentKeys(w.details).some((k) => keys.includes(k))) {
        const ref = refs.find((r) => r.userId === w.userId);
        if (ref) await flagReferral(ref.id, 'same_payment_details_as_affiliate');
      }
    }
  } catch (err) { logger.warn({ err: String(err) }, 'affiliate payment check failed'); }
}

// ── balances, eligibility, payouts ────────────────────────────────────────────────────

export async function balances(affiliateId: string, db: Db = prisma) {
  const rows = await db.affiliateLedger.groupBy({ by: ['status'], where: { affiliateId }, _sum: { amount: true } });
  const sum = (s: string) => round2(Number(rows.find((r) => r.status === s)?._sum.amount ?? 0));
  return { available: sum('ACCRUED'), held: sum('HELD') };
}

export async function activeTraders(affiliateId: string, db: Db = prisma): Promise<number> {
  return db.affiliateReferral.count({ where: { affiliateId, status: 'ACTIVE', activeTraderAt: { not: null } } });
}

export async function eligibility(aff: { id: string; status: string; verified: boolean; payoutDetails: unknown }, cfg: AffiliateConfig) {
  const [bal, active] = await Promise.all([balances(aff.id), activeTraders(aff.id)]);
  const checks = {
    approved: aff.status === 'APPROVED',
    verified: aff.verified,
    activeTraders: active >= cfg.minActiveTraders,
    minBalance: bal.available >= cfg.minPayout,
    payoutDetails: !!aff.payoutDetails,
  };
  return { ...bal, activeTraderCount: active, checks, eligible: Object.values(checks).every(Boolean) };
}

export function lastPeriodEnd(weekday: number, now = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - weekday + 7) % 7));
  return d;
}

/** Weekly run: every eligible affiliate's available balance becomes a payout request. Safe to re-run. */
export async function runAffiliatePayouts(now = new Date()): Promise<number> {
  const cfg = await getAffiliateConfig();
  const periodEnd = lastPeriodEnd(cfg.payoutWeekday, now);
  const markerKey = 'affiliate.lastPeriod';
  const marker = await prisma.systemSetting.findUnique({ where: { key: markerKey } });
  if (marker && new Date(marker.value) >= periodEnd) return 0;
  const affs = await prisma.affiliate.findMany({ where: { status: 'APPROVED', verified: true } });
  let made = 0;
  for (const a of affs) {
    const e = await eligibility(a, cfg);
    if (!e.eligible) continue;
    await prisma.$transaction(async (tx) => {
      const { available } = await balances(a.id, tx);
      if (available < cfg.minPayout) return;
      const p = await tx.affiliatePayout.create({ data: { affiliateId: a.id, amount: available, periodEnd, method: a.payoutMethod, details: a.payoutDetails ?? undefined } });
      await tx.affiliateLedger.create({ data: { affiliateId: a.id, type: 'PAYOUT', amount: -available, uniqueKey: `payout:${p.id}`, refId: p.id, note: `Weekly payout, period to ${periodEnd.toISOString().slice(0, 10)}` } });
    });
    made++;
    void notifyTelegram(a.id, `Aurelix Affiliate Center: a payout of $${e.available.toFixed(2)} was created and is being processed.`);
  }
  await prisma.systemSetting.upsert({ where: { key: markerKey }, update: { value: periodEnd.toISOString() }, create: { key: markerKey, value: periodEnd.toISOString() } });
  if (made) await audit({ action: 'AFFILIATE_PAYOUT_RUN', entityType: 'Affiliate', metadata: { made, periodEnd: periodEnd.toISOString() } });
  return made;
}

let timer: NodeJS.Timeout | null = null;
export function startAffiliateJobs(): void {
  if (timer) return;
  const tick = () => void runAffiliatePayouts().catch((err) => logger.warn({ err: String(err) }, 'affiliate payout run failed'));
  tick();
  timer = setInterval(tick, 3_600_000);
  timer.unref?.();
}

// ── outbound events (postbacks + telegram), wired in their own modules ──────────────────

type Emitter = (affiliateId: string, event: string, vars: Record<string, string>) => Promise<void>;
let emitter: Emitter = async () => undefined;
let tg: (affiliateId: string, text: string) => Promise<void> = async () => undefined;
export function setEventSinks(e: Emitter, t: (affiliateId: string, text: string) => Promise<void>): void { emitter = e; tg = t; }
const TG_TEXT: Record<string, (v: Record<string, string>) => string> = {
  reg: (v) => `Aurelix Affiliate Center: new trader #${v.trader_id} registered${v.site_id ? ` (sub-ID ${v.site_id})` : ''}.`,
  ftd: (v) => `Aurelix Affiliate Center: first deposit of $${v.sumdep} by trader #${v.trader_id}.`,
};

/** Short public trader number used in statistics and postbacks (never the internal id). */
export function traderNo(userId: string): string {
  return userId.slice(-6).toUpperCase();
}

/** A referred trader's withdrawal was paid out → "withdrawal" postback. */
export async function onTraderWithdrawalCompleted(userId: string, withdrawalId: string, amount: number): Promise<void> {
  const ref = await prisma.affiliateReferral.findUnique({ where: { userId } });
  if (!ref) return;
  const lid = ref.linkId ? (await prisma.affiliateLink.findUnique({ where: { id: ref.linkId }, select: { num: true } }))?.num : null;
  await emit(ref.affiliateId, 'withdrawal', { trader_id: traderNo(userId), click_id: ref.clickId ?? '', site_id: ref.subId ?? '', lid: lid ? String(lid) : '', sumdep: amount.toFixed(2), event_id: `wd-${withdrawalId}` });
}
function emit(affiliateId: string, event: string, vars: Record<string, string>): Promise<void> {
  const text = TG_TEXT[event]?.(vars);
  if (text) void tg(affiliateId, text).catch(() => undefined);
  return emitter(affiliateId, event, vars).catch(() => undefined);
}
export function notifyTelegram(affiliateId: string, text: string): Promise<void> { return tg(affiliateId, text).catch(() => undefined); }
