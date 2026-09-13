// Shared types + helpers for fixed-time (binary) options.
export type Direction = 'UP' | 'DOWN';
export type OptionStatus = 'OPEN' | 'WON' | 'LOST' | 'TIE';

export interface OptionTrade {
  id: string;
  symbol: string;
  direction: Direction;
  stake: number;
  payoutPct: number;
  entryPrice: number;
  closePrice: number | null;
  profit: number | null;
  durationSec: number;
  openedAt: string;
  expiresAt: string;
  settledAt: string | null;
  status: OptionStatus;
  accountId: string;
}

export interface OptionsConfig {
  durations: number[];
  minDurationSec: number;
  maxDurationSec: number;
  minStake?: number;
  maxStake?: number;
  serverTime: number;
  assets: Array<{ symbol: string; payoutPct: number; minStake: number; maxStake: number; enabled: boolean }>;
}

export const DURATION_PRESETS = [5, 10, 15, 30, 60, 120, 180, 300, 600, 900, 1800, 3600];

/** 00:01:00 style clock for a duration in seconds. */
export function fmtHMS(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** Compact "1m" / "30s" / "1h" label. */
export function fmtDur(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return sec % 60 === 0 ? `${sec / 60}m` : `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return sec % 3600 === 0 ? `${sec / 3600}h` : `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

/** Seconds remaining until an ISO timestamp (never negative). */
export function secondsLeft(expiresAt: string, now = Date.now()): number {
  return Math.max(0, (new Date(expiresAt).getTime() - now) / 1000);
}

/** Live "would this trade win right now?" preview — purely visual, server settles. */
export function previewOutcome(t: OptionTrade, mark: number | undefined): OptionStatus {
  if (t.status !== 'OPEN') return t.status;
  if (mark === undefined) return 'OPEN';
  if (mark === t.entryPrice) return 'TIE';
  return (mark > t.entryPrice) === (t.direction === 'UP') ? 'WON' : 'LOST';
}

export function payoutFor(stake: number, payoutPct: number): number {
  return Math.round(stake * (1 + payoutPct / 100) * 100) / 100;
}
