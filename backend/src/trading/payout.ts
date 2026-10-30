// Payout rules — the % paid on a win, derived from the asset's base payout.
//
// Stored as JSON in SystemSetting "payout.rules" (editable in the admin deck, no deploy):
//   { "duration": [{ "maxSec": 29, "adj": -5 }, { "maxSec": 59, "adj": -2 }], "otcAdj": -3 }
//   duration: the first entry with durationSec <= maxSec applies (very short trades pay less)
//   otcAdj:   added for OTC symbols (price made by the platform, not an outside market)
// Missing/invalid setting → no adjustment. The payout is locked into the trade when it opens.
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export interface PayoutRules {
  duration: Array<{ maxSec: number; adj: number }>;
  otcAdj: number;
}

export const PAYOUT_RULES_KEY = 'payout.rules';
const NO_RULES: PayoutRules = { duration: [], otcAdj: 0 };
const CACHE_MS = 10_000;
let cache: { at: number; rules: PayoutRules } | null = null;

/** Pure: base payout + duration tier + OTC adjustment, clamped to a whole 1–100 %. */
export function effectivePayoutPct(basePct: number, durationSec: number, otc: boolean, rules: PayoutRules): number {
  const tier = rules.duration.find((t) => durationSec <= t.maxSec);
  const pct = basePct + (tier?.adj ?? 0) + (otc ? rules.otcAdj : 0);
  return Math.min(100, Math.max(1, Math.round(pct)));
}

export function parsePayoutRules(raw: string | null | undefined): PayoutRules {
  if (!raw) return NO_RULES;
  try {
    const j = JSON.parse(raw) as Partial<PayoutRules>;
    const duration = (Array.isArray(j.duration) ? j.duration : [])
      .filter((t) => Number.isFinite(t?.maxSec) && Number.isFinite(t?.adj))
      .map((t) => ({ maxSec: Number(t.maxSec), adj: Number(t.adj) }))
      .sort((a, b) => a.maxSec - b.maxSec);
    return { duration, otcAdj: Number.isFinite(j.otcAdj) ? Number(j.otcAdj) : 0 };
  } catch {
    logger.warn({ key: PAYOUT_RULES_KEY }, 'invalid payout rules JSON — no adjustment applied');
    return NO_RULES;
  }
}

export async function getPayoutRules(): Promise<PayoutRules> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rules;
  const row = await prisma.systemSetting.findUnique({ where: { key: PAYOUT_RULES_KEY } }).catch(() => null);
  const rules = parsePayoutRules(row?.value);
  cache = { at: Date.now(), rules };
  return rules;
}
