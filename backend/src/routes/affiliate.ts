// Aurelix Affiliate Center API (signed-in partners).
import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { ah } from '../utils/asyncHandler';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { Err } from '../utils/errors';
import { audit } from '../services/auditService';
import { getAffiliateConfig, levelFor, cpaRate } from '../affiliate/config';
import { balances, eligibility, currentLevel, depositsBetween, monthStart, newCode, lastPeriodEnd, checkAffiliatePayment, traderNo } from '../affiliate/service';
import { assertSafeUrl, testPostback, POSTBACK_EVENTS, MACROS } from '../affiliate/postbacks';
import { telegramStatus } from '../affiliate/telegram';

const r = Router();
r.use(requireAuth);
const round2 = (n: number) => Math.round(n * 100) / 100;
const mask = (s: string) => (s.length <= 3 ? `${s.slice(0, 1)}***` : `${s.slice(0, 2)}***${s.slice(-1)}`);
type AffReq = AuthedRequest & { aff?: Awaited<ReturnType<typeof prisma.affiliate.findUniqueOrThrow>> };

async function loadAff(req: AffReq) {
  const aff = await prisma.affiliate.findUnique({ where: { userId: req.userId! } });
  if (!aff) throw Err.notFound('You have not joined the affiliate programme');
  req.aff = aff;
  return aff;
}
/** Partner features need an approved affiliate. */
const approved = (req: AffReq, _res: Response, next: NextFunction) => {
  loadAff(req).then((a) => (a.status === 'APPROVED' ? next() : next(Err.forbidden('Your affiliate account is not approved')))).catch(next);
};

// ── account ──────────────────────────────────────────────────────────────────────────

r.get('/me', ah(async (req: AffReq, res) => {
  const cfg = await getAffiliateConfig();
  const aff = await prisma.affiliate.findUnique({ where: { userId: req.userId! } });
  if (!aff) { res.json({ success: true, data: { affiliate: null }, error: null }); return; }
  const now = new Date();
  const [level, thisMonth, elig] = await Promise.all([
    currentLevel(aff.id, cfg),
    depositsBetween(aff.id, monthStart(now), monthStart(now, 1)),
    eligibility(aff, cfg),
  ]);
  const next = cfg.levels.find((l) => l.level === level.level + 1);
  res.json({
    success: true,
    data: {
      affiliate: { id: aff.id, status: aff.status, verified: aff.verified, country: aff.country, trafficSources: aff.trafficSources, payoutMethod: aff.payoutMethod, payoutDetails: aff.payoutDetails, subCode: aff.subCode, note: aff.status === 'REJECTED' || aff.status === 'BLOCKED' ? aff.note : null, createdAt: aff.createdAt },
      level, nextLevel: next ?? null,
      depositsThisMonth: thisMonth, projectedLevel: levelFor(cfg.levels, thisMonth),
      balance: elig.available, held: elig.held, activeTraders: elig.activeTraderCount, payoutChecks: elig.checks, payoutEligible: elig.eligible,
      minActiveTraders: cfg.minActiveTraders, minPayout: cfg.minPayout,
      nextPayoutAt: new Date(lastPeriodEnd(cfg.payoutWeekday).getTime() + 7 * 86_400_000).toISOString(),
    },
    error: null,
  });
}));

const applySchema = z.object({
  country: z.string().trim().length(2).regex(/^[A-Za-z]{2}$/),
  trafficSources: z.string().trim().min(10).max(2000),
  acceptTerms: z.literal(true),
  subRef: z.string().trim().max(16).regex(/^[A-Za-z0-9]*$/).optional(),
});
r.post('/apply', validateBody(applySchema), ah(async (req: AuthedRequest, res) => {
  const { country, trafficSources, subRef } = req.body as z.infer<typeof applySchema>;
  const cfg = await getAffiliateConfig();
  if (cfg.blockedCountries.includes(country.toUpperCase())) throw Err.validation('The affiliate programme is not available in your country');
  if (await prisma.affiliate.findUnique({ where: { userId: req.userId! } })) throw Err.conflict('You already applied');
  const parent = subRef ? await prisma.affiliate.findUnique({ where: { subCode: subRef.toUpperCase() } }) : null;
  let subCode = newCode();
  while (await prisma.affiliate.findUnique({ where: { subCode } })) subCode = newCode();
  const aff = await prisma.affiliate.create({
    data: { userId: req.userId!, country: country.toUpperCase(), trafficSources, subCode, parentId: parent && parent.status === 'APPROVED' && parent.userId !== req.userId ? parent.id : null },
  });
  await audit({ actorId: req.userId, action: 'AFFILIATE_APPLY', entityType: 'Affiliate', entityId: aff.id, ipAddress: req.ip });
  res.status(201).json({ success: true, data: { id: aff.id, status: aff.status }, error: null });
}));

const payoutSchema = z.object({
  method: z.enum(['bank', 'upi', 'crypto']),
  details: z.record(z.string().trim().max(200)).refine((d) => Object.keys(d).length > 0 && Object.keys(d).length <= 8, 'Enter your payout details'),
});
r.put('/payout-details', validateBody(payoutSchema), ah(async (req: AffReq, res) => {
  const aff = await loadAff(req);
  const { method, details } = req.body as z.infer<typeof payoutSchema>;
  await prisma.affiliate.update({ where: { id: aff.id }, data: { payoutMethod: method, payoutDetails: details } });
  void checkAffiliatePayment(aff.id, details);
  await audit({ actorId: req.userId, action: 'AFFILIATE_PAYOUT_DETAILS', entityType: 'Affiliate', entityId: aff.id, ipAddress: req.ip });
  res.json({ success: true, data: { ok: true }, error: null });
}));

r.get('/payouts', ah(async (req: AffReq, res) => {
  const aff = await loadAff(req);
  const rows = await prisma.affiliatePayout.findMany({ where: { affiliateId: aff.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  res.json({ success: true, data: rows.map((p) => ({ ...p, amount: Number(p.amount) })), error: null });
}));

// ── dashboard & statistics ───────────────────────────────────────────────────────────

interface DayRow { day: string; clicks: number; registrations: number; ftd: number; ftdSum: number; deposits: number; depositSum: number; commission: number }

async function dailyStats(affiliateId: string, from: Date, to: Date, linkId?: string, subId?: string): Promise<DayRow[]> {
  const linkF = linkId ? Prisma.sql`AND l.id = ${linkId}` : Prisma.empty;
  const subF = subId ? Prisma.sql`AND c."subId" = ${subId}` : Prisma.empty;
  const refLink = linkId ? Prisma.sql`AND r."linkId" = ${linkId}` : Prisma.empty;
  const refSub = subId ? Prisma.sql`AND r."subId" = ${subId}` : Prisma.empty;
  const [clicks, regs, ftds, deps, comm] = await Promise.all([
    prisma.$queryRaw<Array<{ day: Date; n: bigint }>>`SELECT date_trunc('day', c."createdAt") AS day, count(*)::bigint AS n FROM "AffiliateClick" c JOIN "AffiliateLink" l ON l.id = c."linkId" WHERE l."affiliateId" = ${affiliateId} AND c."createdAt" >= ${from} AND c."createdAt" < ${to} ${linkF} ${subF} GROUP BY 1`,
    prisma.$queryRaw<Array<{ day: Date; n: bigint }>>`SELECT date_trunc('day', r."registeredAt") AS day, count(*)::bigint AS n FROM "AffiliateReferral" r WHERE r."affiliateId" = ${affiliateId} AND r."registeredAt" >= ${from} AND r."registeredAt" < ${to} ${refLink} ${refSub} GROUP BY 1`,
    prisma.$queryRaw<Array<{ day: Date; n: bigint; s: number }>>`SELECT date_trunc('day', r."ftdAt") AS day, count(*)::bigint AS n, coalesce(sum(r."ftdAmount"),0)::float AS s FROM "AffiliateReferral" r WHERE r."affiliateId" = ${affiliateId} AND r."ftdAt" >= ${from} AND r."ftdAt" < ${to} ${refLink} ${refSub} GROUP BY 1`,
    prisma.$queryRaw<Array<{ day: Date; n: bigint; s: number }>>`SELECT date_trunc('day', d."updatedAt") AS day, count(*)::bigint AS n, coalesce(sum(d.amount),0)::float AS s FROM "Deposit" d JOIN "AffiliateReferral" r ON r."userId" = d."userId" WHERE r."affiliateId" = ${affiliateId} AND d.status = 'COMPLETED' AND d."updatedAt" >= ${from} AND d."updatedAt" < ${to} ${refLink} ${refSub} GROUP BY 1`,
    prisma.$queryRaw<Array<{ day: Date; s: number }>>`SELECT date_trunc('day', g."createdAt") AS day, coalesce(sum(g.amount),0)::float AS s FROM "AffiliateLedger" g LEFT JOIN "AffiliateReferral" r ON r.id = g."referralId" WHERE g."affiliateId" = ${affiliateId} AND g.status = 'ACCRUED' AND g.type NOT IN ('PAYOUT','PAYOUT_REVERSAL') AND g."createdAt" >= ${from} AND g."createdAt" < ${to} ${refLink} ${refSub} GROUP BY 1`,
  ]);
  const days = new Map<string, DayRow>();
  const row = (d: Date) => {
    const k = d.toISOString().slice(0, 10);
    if (!days.has(k)) days.set(k, { day: k, clicks: 0, registrations: 0, ftd: 0, ftdSum: 0, deposits: 0, depositSum: 0, commission: 0 });
    return days.get(k)!;
  };
  for (let t = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())); t < to; t = new Date(t.getTime() + 86_400_000)) row(t);
  for (const c of clicks) row(c.day).clicks = Number(c.n);
  for (const c of regs) row(c.day).registrations = Number(c.n);
  for (const c of ftds) { row(c.day).ftd = Number(c.n); row(c.day).ftdSum = round2(c.s); }
  for (const c of deps) { row(c.day).deposits = Number(c.n); row(c.day).depositSum = round2(c.s); }
  for (const c of comm) row(c.day).commission = round2(c.s);
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
}

function range(q: Record<string, unknown>, defDays: number) {
  const to = q.to ? new Date(`${String(q.to)}T00:00:00Z`) : new Date();
  const toEnd = q.to ? new Date(to.getTime() + 86_400_000) : new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() + 1));
  const from = q.from ? new Date(`${String(q.from)}T00:00:00Z`) : new Date(toEnd.getTime() - defDays * 86_400_000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(toEnd.getTime()) || toEnd <= from) throw Err.validation('Invalid date range');
  if (toEnd.getTime() - from.getTime() > 400 * 86_400_000) throw Err.validation('Date range is limited to 400 days');
  return { from, to: toEnd };
}

function bucket(day: string, by: string): string {
  if (by === 'month') return day.slice(0, 7);
  if (by === 'week') {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // Monday
    return d.toISOString().slice(0, 10);
  }
  return day;
}

r.get('/dashboard', approved, ah(async (req: AffReq, res) => {
  const q = req.query as Record<string, unknown>;
  const { from, to } = range(q, 7);
  const by = ['day', 'week', 'month'].includes(String(q.by)) ? String(q.by) : 'day';
  const days = await dailyStats(req.aff!.id, from, to);
  const chart = new Map<string, { period: string; clicks: number; registrations: number; ftd: number }>();
  for (const d of days) {
    const k = bucket(d.day, by);
    const c = chart.get(k) ?? { period: k, clicks: 0, registrations: 0, ftd: 0 };
    c.clicks += d.clicks; c.registrations += d.registrations; c.ftd += d.ftd;
    chart.set(k, c);
  }
  const wd = await prisma.$queryRaw<Array<{ n: bigint; s: number }>>`
    SELECT count(*)::bigint AS n, coalesce(sum(w.amount),0)::float AS s FROM "Withdrawal" w JOIN "AffiliateReferral" r ON r."userId" = w."userId"
    WHERE r."affiliateId" = ${req.aff!.id} AND w.status = 'COMPLETED' AND w."updatedAt" >= ${from} AND w."updatedAt" < ${to}`;
  const allTime = await prisma.affiliateLedger.groupBy({ by: ['type'], where: { affiliateId: req.aff!.id, status: 'ACCRUED', type: { notIn: ['PAYOUT', 'PAYOUT_REVERSAL'] } }, _sum: { amount: true } });
  const at = (t: string) => round2(Number(allTime.find((x) => x.type === t)?._sum.amount ?? 0));
  const sum = (k: keyof DayRow) => round2(days.reduce((a, d) => a + Number(d[k]), 0));
  const byType = await prisma.affiliateLedger.groupBy({ by: ['type'], where: { affiliateId: req.aff!.id, status: 'ACCRUED', createdAt: { gte: from, lt: to }, type: { notIn: ['PAYOUT', 'PAYOUT_REVERSAL'] } }, _sum: { amount: true } });
  res.json({
    success: true,
    data: {
      from: from.toISOString(), to: to.toISOString(), days,
      totals: { clicks: sum('clicks'), registrations: sum('registrations'), ftd: sum('ftd'), ftdSum: sum('ftdSum'), deposits: sum('deposits'), depositSum: sum('depositSum'), commission: sum('commission') },
      commissionByType: Object.fromEntries(byType.map((b) => [b.type, round2(Number(b._sum.amount ?? 0))])),
      withdrawals: { count: Number(wd[0]?.n ?? 0), sum: round2(Number(wd[0]?.s ?? 0)) },
      chart: [...chart.values()].sort((a, b) => a.period.localeCompare(b.period)),
      allTime: { total: round2(allTime.reduce((a, x) => a + Number(x._sum.amount ?? 0), 0)), revenue: at('REVSHARE'), volume: at('TURNOVER'), cpa: at('CPA'), sub: at('SUBAFFILIATE') },
    },
    error: null,
  });
}));

r.get('/stats', approved, ah(async (req: AffReq, res) => {
  const q = req.query as Record<string, string | undefined>;
  const { from, to } = range(q, 30);
  const days = await dailyStats(req.aff!.id, from, to, q.linkId || undefined, q.subId || undefined);
  res.json({ success: true, data: { days }, error: null });
}));

/** Statistics grouped by link or by country for a date range. */
r.get('/stats/by', approved, ah(async (req: AffReq, res) => {
  const q = req.query as Record<string, string | undefined>;
  const { from, to } = range(q, 30);
  const affId = req.aff!.id;
  if (q.dim === 'links') {
    const links = await prisma.affiliateLink.findMany({ where: { affiliateId: affId }, orderBy: { num: 'desc' } });
    const ids = links.map((l) => l.id);
    const [clicks, regs, ftd, deps, comm] = await Promise.all([
      prisma.affiliateClick.groupBy({ by: ['linkId'], where: { linkId: { in: ids }, createdAt: { gte: from, lt: to } }, _count: { _all: true } }),
      prisma.affiliateReferral.groupBy({ by: ['linkId'], where: { linkId: { in: ids }, registeredAt: { gte: from, lt: to } }, _count: { _all: true } }),
      prisma.affiliateReferral.groupBy({ by: ['linkId'], where: { linkId: { in: ids }, ftdAt: { gte: from, lt: to } }, _count: { _all: true }, _sum: { ftdAmount: true } }),
      prisma.$queryRaw<Array<{ linkId: string; s: number }>>`SELECT r."linkId", coalesce(sum(d.amount),0)::float AS s FROM "Deposit" d JOIN "AffiliateReferral" r ON r."userId" = d."userId" WHERE r."affiliateId" = ${affId} AND d.status = 'COMPLETED' AND d."updatedAt" >= ${from} AND d."updatedAt" < ${to} GROUP BY 1`,
      prisma.$queryRaw<Array<{ linkId: string; s: number }>>`SELECT r."linkId", coalesce(sum(g.amount),0)::float AS s FROM "AffiliateLedger" g JOIN "AffiliateReferral" r ON r.id = g."referralId" WHERE g."affiliateId" = ${affId} AND g.status = 'ACCRUED' AND g."createdAt" >= ${from} AND g."createdAt" < ${to} GROUP BY 1`,
    ]);
    const c = (arr: Array<{ linkId: string | null; _count: { _all: number } }>, id: string) => arr.find((x) => x.linkId === id)?._count._all ?? 0;
    res.json({ success: true, data: links.map((l) => ({ id: l.id, num: l.num, name: l.name, model: l.model, landing: l.landing, clicks: c(clicks, l.id), registrations: c(regs, l.id), ftd: c(ftd, l.id), ftdSum: round2(Number(ftd.find((x) => x.linkId === l.id)?._sum.ftdAmount ?? 0)), depositSum: round2(deps.find((x) => x.linkId === l.id)?.s ?? 0), commission: round2(comm.find((x) => x.linkId === l.id)?.s ?? 0) })), error: null });
    return;
  }
  if (q.dim === 'countries') {
    const [clicks, rows] = await Promise.all([
      prisma.$queryRaw<Array<{ country: string | null; n: bigint }>>`SELECT c.country, count(*)::bigint AS n FROM "AffiliateClick" c JOIN "AffiliateLink" l ON l.id = c."linkId" WHERE l."affiliateId" = ${affId} AND c."createdAt" >= ${from} AND c."createdAt" < ${to} GROUP BY 1`,
      prisma.$queryRaw<Array<{ country: string | null; regs: bigint; ftd: bigint; ftdsum: number }>>`SELECT u.country, count(*) FILTER (WHERE r."registeredAt" >= ${from} AND r."registeredAt" < ${to})::bigint AS regs, count(*) FILTER (WHERE r."ftdAt" >= ${from} AND r."ftdAt" < ${to})::bigint AS ftd, coalesce(sum(r."ftdAmount") FILTER (WHERE r."ftdAt" >= ${from} AND r."ftdAt" < ${to}),0)::float AS ftdsum FROM "AffiliateReferral" r JOIN "User" u ON u.id = r."userId" WHERE r."affiliateId" = ${affId} GROUP BY 1`,
    ]);
    const keys = new Set([...clicks.map((x) => x.country ?? '??'), ...rows.map((x) => x.country ?? '??')]);
    res.json({
      success: true,
      data: [...keys].map((k) => {
        const r0 = rows.find((x) => (x.country ?? '??') === k);
        return { country: k === '??' ? null : k, clicks: Number(clicks.find((x) => (x.country ?? '??') === k)?.n ?? 0), registrations: Number(r0?.regs ?? 0), ftd: Number(r0?.ftd ?? 0), ftdSum: round2(r0?.ftdsum ?? 0) };
      }).filter((x) => x.clicks || x.registrations || x.ftd).sort((a, b) => b.registrations - a.registrations || b.clicks - a.clicks),
      error: null,
    });
    return;
  }
  throw Err.validation('dim must be links or countries');
}));

/** The affiliate's traders (masked) with their activity and commission. */
r.get('/traders', approved, ah(async (req: AffReq, res) => {
  const refs = await prisma.affiliateReferral.findMany({ where: { affiliateId: req.aff!.id }, orderBy: { registeredAt: 'desc' }, take: 200 });
  const comm = await prisma.affiliateLedger.groupBy({ by: ['referralId'], where: { affiliateId: req.aff!.id, referralId: { in: refs.map((x) => x.id) } }, _sum: { amount: true } });
  const links = new Map((await prisma.affiliateLink.findMany({ where: { affiliateId: req.aff!.id }, select: { id: true, name: true } })).map((l) => [l.id, l.name]));
  res.json({
    success: true,
    data: refs.map((x) => ({
      id: x.id, trader: `#${traderNo(x.userId)}`, model: x.model, level: x.level, sharePct: Number(x.sharePct),
      link: x.linkId ? links.get(x.linkId) ?? '—' : 'Promo code', linkId: x.linkId, subId: x.subId, registeredAt: x.registeredAt,
      ftdAt: x.ftdAt, ftdAmount: x.ftdAmount ? Number(x.ftdAmount) : null, depositTotal: Number(x.depositTotal),
      active: !!x.activeTraderAt, status: x.status, commission: round2(Number(comm.find((c) => c.referralId === x.id)?._sum.amount ?? 0)),
    })),
    error: null,
  });
}));

// ── links ────────────────────────────────────────────────────────────────────────────

const LANDINGS = ['/', '/register', '/markets', '/promotions'];
const linkSchema = z.object({
  name: z.string().trim().min(1).max(60),
  model: z.enum(['REVSHARE', 'TURNOVER', 'CPA']),
  subId: z.string().trim().max(64).regex(/^[A-Za-z0-9_.-]*$/).optional(),
  landing: z.enum(LANDINGS as [string, ...string[]]).default('/'),
});

async function assertModelAllowed(aff: { country: string | null }, model: string) {
  const cfg = await getAffiliateConfig();
  if (model === 'REVSHARE' && aff.country && cfg.revshareBlockedCountries.includes(aff.country)) throw Err.validation('Revenue Share is not available for residents of your country');
  if (model === 'CPA' && !cpaRate(cfg, null) && !Object.keys(cfg.cpa.rates).length) throw Err.validation('CPA is not available at the moment');
}

/** Every partner gets a ready set of links (per available model) the first time they open Links. */
export async function ensureDefaultLinks(aff: { id: string; country: string | null }): Promise<void> {
  if (await prisma.affiliateLink.count({ where: { affiliateId: aff.id } })) return;
  const cfg = await getAffiliateConfig();
  const models: Array<'REVSHARE' | 'TURNOVER'> = ['TURNOVER'];
  if (!(aff.country && cfg.revshareBlockedCountries.includes(aff.country))) models.unshift('REVSHARE');
  for (const model of models) {
    for (const [name, landing] of [['Main page', '/'], ['Register link', '/register'], ['Markets page', '/markets']] as const) {
      let code = newCode(8);
      while (await prisma.affiliateLink.findUnique({ where: { code } })) code = newCode(8);
      await prisma.affiliateLink.create({ data: { affiliateId: aff.id, code, name, model, landing } });
    }
  }
}

r.get('/links', approved, ah(async (req: AffReq, res) => {
  await ensureDefaultLinks(req.aff!);
  const links = await prisma.affiliateLink.findMany({ where: { affiliateId: req.aff!.id }, orderBy: { num: 'desc' } });
  const ids = links.map((l) => l.id);
  const [clicks, regs, ftds] = await Promise.all([
    prisma.affiliateClick.groupBy({ by: ['linkId'], where: { linkId: { in: ids } }, _count: { _all: true } }),
    prisma.affiliateReferral.groupBy({ by: ['linkId'], where: { linkId: { in: ids } }, _count: { _all: true } }),
    prisma.affiliateReferral.groupBy({ by: ['linkId'], where: { linkId: { in: ids }, ftdAt: { not: null } }, _count: { _all: true } }),
  ]);
  const c = (arr: Array<{ linkId: string | null; _count: { _all: number } }>, id: string) => arr.find((x) => x.linkId === id)?._count._all ?? 0;
  res.json({ success: true, data: links.map((l) => ({ ...l, clicks: c(clicks, l.id), registrations: c(regs, l.id), ftd: c(ftds, l.id) })), error: null });
}));

r.post('/links', approved, validateBody(linkSchema), ah(async (req: AffReq, res) => {
  const b = req.body as z.infer<typeof linkSchema>;
  await assertModelAllowed(req.aff!, b.model);
  if ((await prisma.affiliateLink.count({ where: { affiliateId: req.aff!.id } })) >= 100) throw Err.validation('Link limit reached (100)');
  let code = newCode(8);
  while (await prisma.affiliateLink.findUnique({ where: { code } })) code = newCode(8);
  const link = await prisma.affiliateLink.create({ data: { affiliateId: req.aff!.id, code, name: b.name, model: b.model, subId: b.subId || null, landing: b.landing } });
  res.status(201).json({ success: true, data: link, error: null });
}));

r.patch('/links/:id', approved, validateBody(z.object({ name: z.string().trim().min(1).max(60).optional(), archived: z.boolean().optional() })), ah(async (req: AffReq, res) => {
  const n = await prisma.affiliateLink.updateMany({ where: { id: req.params.id, affiliateId: req.aff!.id }, data: req.body as { name?: string; archived?: boolean } });
  if (!n.count) throw Err.notFound('Link not found');
  res.json({ success: true, data: { ok: true }, error: null });
}));

// ── promo codes ──────────────────────────────────────────────────────────────────────

r.get('/promocodes', approved, ah(async (req: AffReq, res) => {
  const codes = await prisma.affiliatePromoCode.findMany({ where: { affiliateId: req.aff!.id }, orderBy: { createdAt: 'desc' } });
  const uses = await prisma.affiliateReferral.groupBy({ by: ['promoCodeId'], where: { promoCodeId: { in: codes.map((c) => c.id) } }, _count: { _all: true } });
  res.json({ success: true, data: codes.map((c) => ({ ...c, registrations: uses.find((u) => u.promoCodeId === c.id)?._count._all ?? 0 })), error: null });
}));

r.post('/promocodes', approved, validateBody(z.object({ code: z.string().trim().min(4).max(16).regex(/^[A-Za-z0-9]+$/, 'Letters and digits only'), model: z.enum(['REVSHARE', 'TURNOVER', 'CPA']) })), ah(async (req: AffReq, res) => {
  const { code, model } = req.body as { code: string; model: 'REVSHARE' | 'TURNOVER' | 'CPA' };
  await assertModelAllowed(req.aff!, model);
  if ((await prisma.affiliatePromoCode.count({ where: { affiliateId: req.aff!.id } })) >= 20) throw Err.validation('Promo code limit reached (20)');
  const up = code.toUpperCase();
  // never collide with deposit-bonus codes or other partners' codes
  const { getPromoConfig } = await import('../promotions/config');
  if ((await getPromoConfig()).bonus.offers.some((o) => o.code === up)) throw Err.conflict('This code is reserved');
  try {
    const row = await prisma.affiliatePromoCode.create({ data: { affiliateId: req.aff!.id, code: up, model } });
    res.status(201).json({ success: true, data: row, error: null });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') throw Err.conflict('This code is already taken');
    throw e;
  }
}));

r.delete('/promocodes/:id', approved, ah(async (req: AffReq, res) => {
  const n = await prisma.affiliatePromoCode.deleteMany({ where: { id: req.params.id, affiliateId: req.aff!.id } });
  if (!n.count) throw Err.notFound('Promo code not found');
  res.json({ success: true, data: { ok: true }, error: null });
}));

// ── postbacks ────────────────────────────────────────────────────────────────────────

r.get('/postbacks', approved, ah(async (req: AffReq, res) => {
  const hooks = await prisma.affiliatePostback.findMany({ where: { affiliateId: req.aff!.id }, orderBy: { createdAt: 'desc' } });
  const logs = await prisma.affiliatePostbackLog.findMany({ where: { postbackId: { in: hooks.map((h) => h.id) } }, orderBy: { createdAt: 'desc' }, take: 50 });
  res.json({ success: true, data: { events: POSTBACK_EVENTS, macros: MACROS, postbacks: hooks, logs }, error: null });
}));

const pbSchema = z.object({
  url: z.string().trim().min(10).max(1000),
  method: z.enum(['GET', 'POST']).default('GET'),
  events: z.array(z.enum(POSTBACK_EVENTS)).min(1),
  statusMap: z.record(z.string().trim().min(1).max(40)).optional(),
});
const cleanMap = (m?: Record<string, string>) => (m ? Object.fromEntries(Object.entries(m).filter(([k]) => (POSTBACK_EVENTS as readonly string[]).includes(k))) : undefined);

r.post('/postbacks', approved, validateBody(pbSchema), ah(async (req: AffReq, res) => {
  const b = req.body as z.infer<typeof pbSchema>;
  try { await assertSafeUrl(b.url); } catch (e) { throw Err.validation((e as Error).message); }
  if ((await prisma.affiliatePostback.count({ where: { affiliateId: req.aff!.id } })) >= 20) throw Err.validation('Postback limit reached (20)');
  const row = await prisma.affiliatePostback.create({ data: { affiliateId: req.aff!.id, url: b.url, method: b.method, events: b.events, statusMap: cleanMap(b.statusMap) } });
  res.status(201).json({ success: true, data: row, error: null });
}));

r.patch('/postbacks/:id', approved, validateBody(pbSchema.partial().extend({ active: z.boolean().optional() })), ah(async (req: AffReq, res) => {
  const b = req.body as Partial<z.infer<typeof pbSchema>> & { active?: boolean };
  if (b.url) { try { await assertSafeUrl(b.url); } catch (e) { throw Err.validation((e as Error).message); } }
  const n = await prisma.affiliatePostback.updateMany({
    where: { id: req.params.id, affiliateId: req.aff!.id },
    data: { ...(b.url ? { url: b.url } : {}), ...(b.method ? { method: b.method } : {}), ...(b.events ? { events: b.events } : {}), ...(b.statusMap ? { statusMap: cleanMap(b.statusMap) } : {}), ...(b.active !== undefined ? { active: b.active } : {}) },
  });
  if (!n.count) throw Err.notFound('Postback not found');
  res.json({ success: true, data: { ok: true }, error: null });
}));

r.delete('/postbacks/:id', approved, ah(async (req: AffReq, res) => {
  const n = await prisma.affiliatePostback.deleteMany({ where: { id: req.params.id, affiliateId: req.aff!.id } });
  if (!n.count) throw Err.notFound('Postback not found');
  res.json({ success: true, data: { ok: true }, error: null });
}));

r.post('/postbacks/:id/test', approved, ah(async (req: AffReq, res) => {
  const hook = await prisma.affiliatePostback.findFirst({ where: { id: req.params.id, affiliateId: req.aff!.id } });
  if (!hook) throw Err.notFound('Postback not found');
  res.json({ success: true, data: await testPostback(hook), error: null });
}));

// ── top 10 ───────────────────────────────────────────────────────────────────────────

r.get('/top', approved, ah(async (req: AffReq, res) => {
  const from = monthStart();
  const rows = await prisma.affiliateLedger.groupBy({ by: ['affiliateId'], where: { status: 'ACCRUED', createdAt: { gte: from }, type: { notIn: ['PAYOUT', 'PAYOUT_REVERSAL', 'ADJUSTMENT'] } }, _sum: { amount: true } });
  const ranked = rows.map((x) => ({ id: x.affiliateId, amount: round2(Number(x._sum.amount ?? 0)) })).filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount);
  const top = ranked.slice(0, 10);
  const users = await prisma.affiliate.findMany({ where: { id: { in: top.map((t) => t.id) } }, select: { id: true, country: true, userId: true } });
  const names = new Map((await prisma.user.findMany({ where: { id: { in: users.map((u) => u.userId) } }, select: { id: true, username: true, firstName: true } })).map((u) => [u.id, u.username || u.firstName]));
  const myRank = ranked.findIndex((x) => x.id === req.aff!.id) + 1;
  res.json({
    success: true,
    data: {
      month: from.toISOString().slice(0, 7),
      top: top.map((t, i) => {
        const u = users.find((x) => x.id === t.id);
        const name = names.get(u?.userId ?? '') ?? 'partner';
        return { rank: i + 1, name: t.id === req.aff!.id ? `${name} (You)` : mask(name), country: u?.country ?? null, commission: t.amount, me: t.id === req.aff!.id };
      }),
      me: { rank: myRank || null, commission: ranked.find((x) => x.id === req.aff!.id)?.amount ?? 0 },
    },
    error: null,
  });
}));

// ── telegram ─────────────────────────────────────────────────────────────────────────

r.get('/telegram', approved, ah(async (req: AffReq, res) => {
  const st = telegramStatus();
  res.json({ success: true, data: { configured: st.configured, botUsername: st.botUsername, linked: !!req.aff!.telegramChatId, code: req.aff!.telegramCode }, error: null });
}));
r.post('/telegram/code', approved, ah(async (req: AffReq, res) => {
  let code = newCode(10);
  while (await prisma.affiliate.findUnique({ where: { telegramCode: code } })) code = newCode(10);
  await prisma.affiliate.update({ where: { id: req.aff!.id }, data: { telegramCode: code } });
  res.json({ success: true, data: { code }, error: null });
}));
r.delete('/telegram', approved, ah(async (req: AffReq, res) => {
  await prisma.affiliate.update({ where: { id: req.aff!.id }, data: { telegramChatId: null, telegramCode: null } });
  res.json({ success: true, data: { ok: true }, error: null });
}));

// ── support tickets ──────────────────────────────────────────────────────────────────

r.get('/tickets', ah(async (req: AffReq, res) => {
  const aff = await loadAff(req);
  res.json({ success: true, data: await prisma.affiliateTicket.findMany({ where: { affiliateId: aff.id }, orderBy: { updatedAt: 'desc' }, take: 50 }), error: null });
}));
r.post('/tickets', validateBody(z.object({ subject: z.string().trim().min(3).max(120), body: z.string().trim().min(5).max(5000) })), ah(async (req: AffReq, res) => {
  const aff = await loadAff(req);
  if ((await prisma.affiliateTicket.count({ where: { affiliateId: aff.id, status: { not: 'CLOSED' } } })) >= 10) throw Err.validation('Too many open tickets — close some first');
  const { subject, body } = req.body as { subject: string; body: string };
  const t = await prisma.affiliateTicket.create({ data: { affiliateId: aff.id, subject } });
  await prisma.affiliateTicketMessage.create({ data: { ticketId: t.id, body } });
  res.status(201).json({ success: true, data: t, error: null });
}));
r.get('/tickets/:id', ah(async (req: AffReq, res) => {
  const aff = await loadAff(req);
  const t = await prisma.affiliateTicket.findFirst({ where: { id: req.params.id, affiliateId: aff.id } });
  if (!t) throw Err.notFound('Ticket not found');
  const messages = await prisma.affiliateTicketMessage.findMany({ where: { ticketId: t.id }, orderBy: { createdAt: 'asc' } });
  res.json({ success: true, data: { ticket: t, messages }, error: null });
}));
r.post('/tickets/:id/messages', validateBody(z.object({ body: z.string().trim().min(1).max(5000) })), ah(async (req: AffReq, res) => {
  const aff = await loadAff(req);
  const t = await prisma.affiliateTicket.findFirst({ where: { id: req.params.id, affiliateId: aff.id } });
  if (!t) throw Err.notFound('Ticket not found');
  if (t.status === 'CLOSED') throw Err.validation('This ticket is closed');
  await prisma.affiliateTicketMessage.create({ data: { ticketId: t.id, body: (req.body as { body: string }).body } });
  await prisma.affiliateTicket.update({ where: { id: t.id }, data: { status: 'OPEN' } });
  res.status(201).json({ success: true, data: { ok: true }, error: null });
}));
r.post('/tickets/:id/close', ah(async (req: AffReq, res) => {
  const aff = await loadAff(req);
  const n = await prisma.affiliateTicket.updateMany({ where: { id: req.params.id, affiliateId: aff.id }, data: { status: 'CLOSED' } });
  if (!n.count) throw Err.notFound('Ticket not found');
  res.json({ success: true, data: { ok: true }, error: null });
}));

// ── programmes & sub-affiliates ──────────────────────────────────────────────────────

r.get('/programs', ah(async (req: AffReq, res) => {
  const cfg = await getAffiliateConfig();
  const aff = await prisma.affiliate.findUnique({ where: { userId: req.userId! }, select: { country: true } });
  res.json({
    success: true,
    data: {
      levels: cfg.levels,
      turnoverCapPctOfDeposits: cfg.turnoverCapPctOfDeposits,
      subAffiliateCapUsd: cfg.subAffiliateCapUsd,
      minActiveTraders: cfg.minActiveTraders, minPayout: cfg.minPayout, payoutWeekday: cfg.payoutWeekday, maxHoldDays: cfg.maxHoldDays,
      activeTraderMinTrades: cfg.activeTrader.minTrades,
      cpa: { available: Object.keys(cfg.cpa.rates).length > 0, minFtd: cfg.cpa.minFtd, withinDays: cfg.cpa.withinDays, rates: cfg.cpa.rates },
      revshareAvailable: !(aff?.country && cfg.revshareBlockedCountries.includes(aff.country)),
    },
    error: null,
  });
}));

r.get('/subaffiliates', approved, ah(async (req: AffReq, res) => {
  const cfg = await getAffiliateConfig();
  const kids = await prisma.affiliate.findMany({ where: { parentId: req.aff!.id }, orderBy: { createdAt: 'desc' } });
  const earned = await prisma.affiliateLedger.groupBy({ by: ['refId'], where: { affiliateId: req.aff!.id, type: 'SUBAFFILIATE', status: { not: 'CANCELLED' } }, _sum: { amount: true } });
  const level = await currentLevel(req.aff!.id, cfg);
  const names = new Map((await prisma.user.findMany({ where: { id: { in: kids.map((k) => k.userId) } }, select: { id: true, username: true, firstName: true } })).map((u) => [u.id, u.username || u.firstName]));
  res.json({
    success: true,
    data: {
      subCode: req.aff!.subCode, subPct: level.subPct, capUsd: cfg.subAffiliateCapUsd,
      subs: kids.map((k) => ({ id: k.id, name: mask(names.get(k.userId) ?? 'partner'), status: k.status, joinedAt: k.createdAt, earned: round2(Number(earned.find((e) => e.refId === k.id)?._sum.amount ?? 0)) })),
    },
    error: null,
  });
}));

export default r;
