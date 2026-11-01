// Affiliate programme rules. Defaults implement the programme's published structure; every value
// can be changed by an admin in System settings → "affiliate.config" (JSON), no deploy needed.
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export interface Level { level: number; minDeposits: number; revsharePct: number; turnoverPct: number; subPct: number }
export interface AffiliateConfig {
  /** levels by the number of deposits made by the affiliate's traders in a calendar month */
  levels: Level[];
  /** turnover commission per trader can never exceed this % of that trader's total deposits */
  turnoverCapPctOfDeposits: number;
  /** a sub-affiliate can earn its parent at most this much in total (USD) */
  subAffiliateCapUsd: number;
  /** active traders needed before commission can be withdrawn */
  minActiveTraders: number;
  /** smallest affiliate payout (USD) */
  minPayout: number;
  /** weekly payout day, UTC (0 = Sunday … 4 = Thursday); the period ends 00:00 UTC that day */
  payoutWeekday: number;
  /** longest time commission may be held for review (days) */
  maxHoldDays: number;
  /** an Active Trader made a first deposit and at least this many settled live trades */
  activeTrader: { minTrades: number };
  /** CPA: paid once per Unique Active Client meeting these rules; rate by country (or "default") */
  cpa: { minFtd: number; minTrades: number; minVolume: number; withinDays: number; rates: Record<string, number> };
  /** countries that cannot join the programme */
  blockedCountries: string[];
  /** countries whose residents cannot use the Revenue Share model */
  revshareBlockedCountries: string[];
  /** how long a link click is remembered before registration (days) */
  attributionDays: number;
  /** no commission accrues while the partner has brought no new Active Trader for this many days */
  inactivityDays: number;
  /** true: a partner is approved the moment they apply (tools open instantly); false: an admin reviews every application */
  autoApprove: boolean;
}

/** Territories that cannot join the programme (agreement default; adjust for your own licensing). */
const PROGRAMME_BLOCKED = ['GI', 'IM', 'GG', 'JE', 'AU', 'CA', 'US', 'JP', 'AT', 'BE', 'BG', 'HR', 'CY', 'LI', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IS', 'IT', 'IL', 'LV', 'LT', 'LU', 'MT', 'NL', 'NO', 'NZ', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'CH', 'IR', 'GB', 'LB', 'ZW', 'MU', 'CI', 'IQ', 'PR', 'YE', 'SO', 'CG', 'LY', 'SD', 'ET', 'LR', 'SY', 'MM', 'CF', 'ER', 'KP', 'ML', 'VU', 'VC'];
/** Residents of these countries cannot use the Revenue Share model (agreement default). */
const REVSHARE_BLOCKED = ['DZ', 'BH', 'BD', 'EG', 'ID', 'IN', 'IR', 'IQ', 'IL', 'JO', 'KW', 'LB', 'LY', 'MA', 'OM', 'PS', 'PK', 'QA', 'SA', 'SY', 'TN', 'TR', 'AE', 'YE'];

export const AFFILIATE_KEY = 'affiliate.config';

export const DEFAULT_AFFILIATE: AffiliateConfig = {
  levels: [
    { level: 1, minDeposits: 0, revsharePct: 50, turnoverPct: 2, subPct: 2 },
    { level: 2, minDeposits: 15, revsharePct: 55, turnoverPct: 2.5, subPct: 3 },
    { level: 3, minDeposits: 50, revsharePct: 60, turnoverPct: 3, subPct: 4 },
    { level: 4, minDeposits: 100, revsharePct: 65, turnoverPct: 3.5, subPct: 5 },
    { level: 5, minDeposits: 200, revsharePct: 70, turnoverPct: 4, subPct: 6 },
    { level: 6, minDeposits: 400, revsharePct: 75, turnoverPct: 4.5, subPct: 7 },
    { level: 7, minDeposits: 700, revsharePct: 80, turnoverPct: 5, subPct: 8 },
  ],
  turnoverCapPctOfDeposits: 50,
  subAffiliateCapUsd: 300_000,
  minActiveTraders: 10,
  minPayout: 10,
  payoutWeekday: 4,
  maxHoldDays: 180,
  activeTrader: { minTrades: 1 },
  // CPA is off until the business sets rates (e.g. {"default":30,"IN":25})
  cpa: { minFtd: 10, minTrades: 10, minVolume: 100, withinDays: 30, rates: {} },
  blockedCountries: PROGRAMME_BLOCKED,
  revshareBlockedCountries: REVSHARE_BLOCKED,
  attributionDays: 30,
  inactivityDays: 90,
  autoApprove: true,
};

const n = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : d);
const codes = (v: unknown, d: string[]) => (Array.isArray(v) ? v.filter((c) => typeof c === 'string' && /^[A-Z]{2}$/.test(c.toUpperCase())).map((c) => c.toUpperCase()) : d);

export function parseAffiliateConfig(raw: string | null | undefined): AffiliateConfig {
  if (!raw) return DEFAULT_AFFILIATE;
  try {
    const j = JSON.parse(raw) as Partial<AffiliateConfig>;
    const d = DEFAULT_AFFILIATE;
    const levels = Array.isArray(j.levels)
      ? j.levels
          .filter((l) => l && Number.isFinite(l.minDeposits) && Number.isFinite(l.revsharePct) && Number.isFinite(l.turnoverPct) && Number.isFinite(l.subPct))
          .map((l, i) => ({ level: i + 1, minDeposits: Math.max(0, Math.floor(l.minDeposits)), revsharePct: n(l.revsharePct, 0, 100, 0), turnoverPct: n(l.turnoverPct, 0, 100, 0), subPct: n(l.subPct, 0, 100, 0) }))
          .sort((a, b) => a.minDeposits - b.minDeposits)
          .map((l, i) => ({ ...l, level: i + 1 }))
      : d.levels;
    const cpa = (j.cpa ?? {}) as Partial<AffiliateConfig['cpa']>;
    const rates: Record<string, number> = {};
    for (const [k, v] of Object.entries(cpa.rates ?? {})) if (typeof v === 'number' && v >= 0 && v <= 100_000) rates[k === 'default' ? 'default' : k.toUpperCase()] = v;
    return {
      levels: levels.length ? levels : d.levels,
      turnoverCapPctOfDeposits: n(j.turnoverCapPctOfDeposits, 0, 1000, d.turnoverCapPctOfDeposits),
      subAffiliateCapUsd: n(j.subAffiliateCapUsd, 0, 1e9, d.subAffiliateCapUsd),
      minActiveTraders: n(j.minActiveTraders, 0, 1e6, d.minActiveTraders),
      minPayout: n(j.minPayout, 0, 1e7, d.minPayout),
      payoutWeekday: n(j.payoutWeekday, 0, 6, d.payoutWeekday),
      maxHoldDays: n(j.maxHoldDays, 1, 3650, d.maxHoldDays),
      activeTrader: { minTrades: n(j.activeTrader?.minTrades, 1, 1e6, d.activeTrader.minTrades) },
      cpa: { minFtd: n(cpa.minFtd, 0, 1e7, d.cpa.minFtd), minTrades: n(cpa.minTrades, 0, 1e6, d.cpa.minTrades), minVolume: n(cpa.minVolume, 0, 1e9, d.cpa.minVolume), withinDays: n(cpa.withinDays, 1, 3650, d.cpa.withinDays), rates },
      blockedCountries: codes(j.blockedCountries, d.blockedCountries),
      revshareBlockedCountries: codes(j.revshareBlockedCountries, d.revshareBlockedCountries),
      attributionDays: n(j.attributionDays, 1, 365, d.attributionDays),
      inactivityDays: n(j.inactivityDays, 1, 3650, d.inactivityDays),
      autoApprove: typeof j.autoApprove === 'boolean' ? j.autoApprove : d.autoApprove,
    };
  } catch {
    logger.warn({ key: AFFILIATE_KEY }, 'invalid affiliate config JSON — using defaults');
    return DEFAULT_AFFILIATE;
  }
}

let cache: { at: number; cfg: AffiliateConfig } | null = null;
export async function getAffiliateConfig(): Promise<AffiliateConfig> {
  if (cache && Date.now() - cache.at < 10_000) return cache.cfg;
  const row = await prisma.systemSetting.findUnique({ where: { key: AFFILIATE_KEY } }).catch(() => null);
  cache = { at: Date.now(), cfg: parseAffiliateConfig(row?.value) };
  return cache.cfg;
}

/** Highest level whose monthly-deposit threshold is reached. */
export function levelFor(levels: Level[], depositsInMonth: number): Level {
  let cur = levels[0];
  for (const l of levels) if (depositsInMonth >= l.minDeposits) cur = l;
  return cur;
}

/** CPA rate for a country (falls back to "default"); null when CPA is not offered. */
export function cpaRate(cfg: AffiliateConfig, country: string | null | undefined): number | null {
  const r = (country && cfg.cpa.rates[country.toUpperCase()]) ?? cfg.cpa.rates.default;
  return typeof r === 'number' && r > 0 ? r : null;
}
