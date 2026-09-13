export type Direction = 'UP' | 'DOWN';

export interface OptionTrade {
  id: string;
  symbol: string;
  direction: Direction;
  stake: number;
  payoutPct: number;
  strikePrice?: number;
  entryPrice: number;
  closePrice?: number;
  openTime?: number;
  closeTime?: number;
  openedAt: number | string;
  expiresAt: number | string;
  settledAt?: number | string | null;
  durationSec: number;
  status: 'OPEN' | 'WON' | 'LOST' | 'TIE';
  payout?: number;
  pnl?: number;
  profit?: number;
}

export interface OptionsConfig {
  enabled: boolean;
  minDurationSec: number;
  maxDurationSec: number;
  minStake: number;
  maxStake: number;
  assets: Array<{
    symbol: string;
    payoutPct: number;
    enabled: boolean;
    minStake?: number;
    maxStake?: number;
  }>;
}

export const DURATION_PRESETS = [5, 15, 30, 60, 120, 300, 900, 1800, 3600];

export function fmtHMS(sec: number): string {
  if (sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${String(h).padStart(2, '0')}:${String(remM).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function fmtDur(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  return `${Math.floor(sec / 3600)}h`;
}

export function secondsLeft(expiresAt: number | string, now: number = Date.now()): number {
  const exp = typeof expiresAt === 'string' ? new Date(expiresAt).getTime() : expiresAt;
  return Math.max(0, Math.ceil((exp - now) / 1000));
}

export function previewOutcome(
  tradeOrDir: OptionTrade | Direction,
  strikeOrCur?: number,
  curPrice?: number
): 'WON' | 'LOST' | 'TIE' {
  if (typeof tradeOrDir === 'object') {
    const t = tradeOrDir;
    const strike = t.entryPrice ?? t.strikePrice ?? 0;
    const cur = strikeOrCur ?? strike;
    if (cur === strike) return 'TIE';
    if (t.direction === 'UP') return cur > strike ? 'WON' : 'LOST';
    return cur < strike ? 'WON' : 'LOST';
  }

  const dir = tradeOrDir;
  const strike = strikeOrCur ?? 0;
  const cur = curPrice ?? strike;
  if (cur === strike) return 'TIE';
  if (dir === 'UP') return cur > strike ? 'WON' : 'LOST';
  return cur < strike ? 'WON' : 'LOST';
}

export function payoutFor(stake: number, payoutPct: number): number {
  return Math.round(stake * (1 + payoutPct / 100) * 100) / 100;
}
