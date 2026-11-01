// Promotion rules. Defaults follow a common deposit-bonus structure; every number can be changed by an
// admin in System settings (JSON) without a deploy:
//   bonus.config    {"turnoverMultiple":100,"offers":[{"code":"WELCOME50","bonusPct":50,"minDeposit":15,"title":"…"}]}
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export interface BonusOffer { code: string; bonusPct: number; minDeposit: number; title: string }
export interface BonusConfig { turnoverMultiple: number; offers: BonusOffer[] }
export const BONUS_KEY = 'bonus.config';

export const DEFAULT_BONUS: BonusConfig = {
  turnoverMultiple: 100,
  offers: [
    { code: 'WELCOME50', bonusPct: 50, minDeposit: 15, title: 'Welcome bonus' },
    { code: 'BONUS30', bonusPct: 30, minDeposit: 10, title: 'Deposit booster' },
    { code: 'VIP100', bonusPct: 100, minDeposit: 100, title: 'VIP match' },
  ],
};
const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);

export function parseBonusConfig(raw: string | null | undefined): BonusConfig {
  if (!raw) return DEFAULT_BONUS;
  try {
    const j = JSON.parse(raw) as Partial<BonusConfig>;
    const offers = (Array.isArray(j.offers) ? j.offers : [])
      .filter((o) => typeof o?.code === 'string' && num(o.bonusPct, 1, 200) !== null && num(o.minDeposit, 1, 1e7) !== null)
      .map((o) => ({ code: o.code.trim().toUpperCase(), bonusPct: Math.round(o.bonusPct), minDeposit: o.minDeposit, title: String(o.title ?? 'Deposit bonus').slice(0, 60) }));
    return { turnoverMultiple: num(j.turnoverMultiple, 1, 1000) ?? DEFAULT_BONUS.turnoverMultiple, offers: Array.isArray(j.offers) ? offers : DEFAULT_BONUS.offers };
  } catch {
    logger.warn({ key: BONUS_KEY }, 'invalid bonus config JSON — using defaults');
    return DEFAULT_BONUS;
  }
}

let cache: { at: number; bonus: BonusConfig } | null = null;
export async function getPromoConfig(): Promise<{ bonus: BonusConfig }> {
  if (cache && Date.now() - cache.at < 10_000) return cache;
  const row = await prisma.systemSetting.findUnique({ where: { key: BONUS_KEY } }).catch(() => null);
  cache = { at: Date.now(), bonus: parseBonusConfig(row?.value) };
  return cache;
}
