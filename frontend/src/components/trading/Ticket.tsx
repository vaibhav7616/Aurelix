import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, apiError } from '../../lib/api';
import { useTerminal, serverNow } from '../../stores/terminalStore';
import { useUI } from '../../stores/uiStore';
import { fmtMoney, fmtPrice } from '../../lib/format';
import { fmtHMS, payoutFor, DURATION_PRESETS, nextFixedExpiry, FIXED_TIME_MIN_LEAD_SEC, type OptionsConfig, type OptionTrade, type PendingTrade, type Direction, type ExpiryMode } from '../../lib/options';
import { getAssetMeta } from '../../lib/assetMeta';
import { soundService } from '../../lib/sound';
import { useSettingsStore } from '../../stores/settingsStore';
import { useSignalsStore } from '../../stores/signalsStore';
import { FieldError } from '../ui/primitives';
import { clsx } from 'clsx';

interface Account { id: string; balance: number; lockedBalance?: number; accountNumber: string; accountType: string }

const MAX_FIXED_AHEAD_MS = 4 * 3600_000;
function fmtClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const STAKE_STEPS = [1, 5, 10, 25, 50, 100];

function nextPreset(cur: number, dir: 1 | -1): number {
  const i = DURATION_PRESETS.findIndex((d) => d >= cur);
  if (dir === 1) {
    if (i === -1) return cur;
    return DURATION_PRESETS[Math.min(DURATION_PRESETS.length - 1, DURATION_PRESETS[i] === cur ? i + 1 : i)];
  }
  if (i === -1) return DURATION_PRESETS[DURATION_PRESETS.length - 1];
  return DURATION_PRESETS[Math.max(0, DURATION_PRESETS[i] === cur ? i - 1 : i - 1)];
}
function stepStake(cur: number, dir: 1 | -1): number {
  const step = cur >= 1000 ? 100 : cur >= 100 ? 10 : cur >= 20 ? 5 : 1;
  return Math.max(1, Math.round((cur + dir * step) * 100) / 100);
}

export function Ticket() {
  const { symbol, ticks, accountId, pendingTrade, setPendingTrade } = useTerminal();
  const push = useUI((s) => s.push);
  const qc = useQueryClient();
  const [durationSec, setDurationSec] = useState<number>(() => Number(localStorage.getItem('ax_opt_dur') ?? 60));
  const [stake, setStake] = useState<number>(() => Number(localStorage.getItem('ax_opt_stake') ?? 1));
  const [stakeInput, setStakeInput] = useState<string | null>(null);
  const [showTimePresets, setShowTimePresets] = useState(false);
  const [showStakePresets, setShowStakePresets] = useState(false);
  const [targetPrice, setTargetPrice] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<Direction | null>(null);
  const [confirmDir, setConfirmDir] = useState<Direction | null>(null);

  const oneClickTrading = useSettingsStore((s) => s.oneClickTrading);
  const armedSignal = useSignalsStore((s) => s.armedSignal);
  const armSignal = useSignalsStore((s) => s.armSignal);

  // Expiry mode (Quotex "SWITCH TIME"): TIMER = duration from open, TIME = fixed clock minute
  const [mode, setMode] = useState<ExpiryMode>(() => (localStorage.getItem('ax_opt_mode') === 'TIME' ? 'TIME' : 'TIMER'));
  const [fixedExpiry, setFixedExpiry] = useState<number>(() => nextFixedExpiry(serverNow()));
  useEffect(() => { localStorage.setItem('ax_opt_mode', mode); }, [mode]);
  // purchases for a minute close FIXED_TIME_MIN_LEAD_SEC before it — roll forward like Quotex does
  useEffect(() => {
    if (mode !== 'TIME') return;
    const t = setInterval(() => {
      const min = nextFixedExpiry(serverNow(), cfg?.fixedTimeMinLeadSec ?? FIXED_TIME_MIN_LEAD_SEC);
      setFixedExpiry((cur) => (cur < min ? min : cur));
    }, 500);
    return () => clearInterval(t);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { localStorage.setItem('ax_opt_dur', String(durationSec)); }, [durationSec]);
  useEffect(() => { localStorage.setItem('ax_opt_stake', String(stake)); }, [stake]);

  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: () => get<Account[]>('/api/v1/accounts') });
  const { data: cfg } = useQuery({ queryKey: ['options-config'], queryFn: () => get<OptionsConfig>('/api/v1/options/config'), refetchInterval: 30000 });
  const account = accounts?.find((a) => a.id === accountId) ?? accounts?.[0];
  const meta = cfg?.assets.find((a) => a.symbol === symbol);
  const assetInfo = getAssetMeta(symbol);
  const tick = ticks[symbol];
  const payoutPct = meta?.payoutPct ?? assetInfo.defaultPayout ?? 80;
  const payout = useMemo(() => payoutFor(stake, payoutPct), [stake, payoutPct]);

  const open = useMutation({
    mutationFn: (direction: Direction) =>
      post<OptionTrade & { balance: number }>(
        '/api/v1/options',
        { accountId: account?.id, symbol, direction, stake, ...(mode === 'TIME' ? { expiresAt: fixedExpiry } : { durationSec }) },
        { 'Idempotency-Key': crypto.randomUUID() },
      ),
    onSuccess: (o) => {
      soundService.playTradePlaced();
      setErr(null);
      setFlash(o.direction);
      setTimeout(() => setFlash(null), 500);
      push('ok', `${o.direction === 'UP' ? '▲ Up' : '▼ Down'} ${o.symbol} · ${fmtMoney(o.stake)} · expires in ${fmtHMS(o.durationSec)}`);
      // Optimistically push into open options cache for immediate on-chart rendering
      qc.setQueryData<OptionTrade[]>(['options', 'open'], (prev) => {
        const arr = prev ? [...prev] : [];
        if (!arr.some((x) => x.id === o.id)) {
          arr.unshift(o);
        }
        return arr;
      });
      ['options', 'accounts', 'stats', 'wallet', 'option-stats'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e) => {
      soundService.playTradeLost();
      const m = apiError(e);
      setErr(m);
      push('err', m);
    },
  });

  const placePending = useMutation({
    mutationFn: (direction: Direction) =>
      post<PendingTrade>('/api/v1/options/pending', { accountId: account?.id, symbol, direction, stake, durationSec, targetPrice: Number(targetPrice) }),
    onSuccess: (p) => {
      soundService.playTradePlaced();
      setErr(null);
      push('ok', `Pending ${p.direction === 'UP' ? '▲ Up' : '▼ Down'} ${p.symbol} · ${fmtMoney(p.stake)} · opens when price ${p.triggerAbove ? 'rises to' : 'falls to'} ${fmtPrice(p.targetPrice)}`);
      ['pending', 'accounts'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e) => {
      const m = apiError(e);
      setErr(m);
      push('err', m);
    },
  });

  const submit = (direction: Direction) => {
    if (!oneClickTrading && !confirmDir) {
      setConfirmDir(direction);
      return;
    }
    setConfirmDir(null);
    if (!pendingTrade) {
      open.mutate(direction);
      if (armedSignal && armedSignal.symbol === symbol) {
        armSignal(null);
      }
      return;
    }
    if (mode === 'TIME') { setErr('Pending trades use Timer mode — press SWITCH TIME'); return; }
    const tp = Number(targetPrice);
    if (!targetPrice || !Number.isFinite(tp) || tp <= 0) { setErr('Enter the target price for the pending trade'); return; }
    placePending.mutate(direction);
  };

  const shiftFixed = (dir: 1 | -1) => setFixedExpiry((cur) => {
    const now = serverNow();
    const min = nextFixedExpiry(now, cfg?.fixedTimeMinLeadSec ?? FIXED_TIME_MIN_LEAD_SEC);
    return Math.min(now + MAX_FIXED_AHEAD_MS, Math.max(min, cur + dir * 60_000));
  });
  const handleMinusTime = () => { soundService.playClick(); if (mode === 'TIME') shiftFixed(-1); else setDurationSec((d) => nextPreset(d, -1)); };
  const handlePlusTime = () => { soundService.playClick(); if (mode === 'TIME') shiftFixed(1); else setDurationSec((d) => nextPreset(d, 1)); };
  const handleMinusStake = () => { soundService.playClick(); setStake((s) => stepStake(s, -1)); };
  const handlePlusStake = () => { soundService.playClick(); setStake((s) => stepStake(s, 1)); };

  const minS = meta?.minStake ?? cfg?.minStake ?? 1;
  const maxS = meta?.maxStake ?? cfg?.maxStake ?? 50000;
  const available = (account?.balance ?? 0) - (account?.lockedBalance ?? 0); // pending trades reserve their stake
  const invalid = !account || (meta && !meta.enabled) || stake <= 0 || stake < minS || stake > maxS || stake > available;
  const busy = open.isPending || placePending.isPending;

  const isArmedUp = armedSignal?.symbol === symbol && armedSignal?.direction === 'UP';
  const isArmedDown = armedSignal?.symbol === symbol && armedSignal?.direction === 'DOWN';

  return (
    <div className="flex flex-col h-full min-h-0 bg-base-900 border-l border-line select-none">
      {/* Quotex header: pair + payout */}
      <div className="px-4 py-3 border-b border-line">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base leading-none shrink-0">{assetInfo.flag1}{assetInfo.flag2}</span>
            <span className="text-[15px] font-extrabold tracking-tight truncate text-white">{symbol}</span>
          </div>
          <span className="ax-num text-[16px] font-black text-[#eab308] bg-[#eab308]/10 px-2 py-0.5 rounded">{payoutPct}%</span>
        </div>
      </div>

      {/* Armed Algorithmic Signal Indicator Banner */}
      {armedSignal && armedSignal.symbol === symbol && (
        <div className="mx-4 mt-2.5 p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs animate-in fade-in">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base leading-none">⚡</span>
            <div className="min-w-0">
              <div className="font-black text-emerald-400 flex items-center gap-1 text-[11px] leading-tight">
                <span>SIGNAL: {armedSignal.direction === 'UP' ? 'CALL ▲' : 'PUT ▼'}</span>
              </div>
              <div className="text-[10px] text-slate-400 truncate">{armedSignal.indicator}</div>
            </div>
          </div>
          <button
            onClick={() => armSignal(null)}
            className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 text-slate-400 hover:text-white flex items-center justify-center text-xs shrink-0"
            title="Dismiss signal"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {/* PENDING TRADE switch (Quotex feature) */}
        <div className="flex items-center justify-between px-1 py-1">
          <span className="text-[11px] font-bold text-fog uppercase tracking-wider">Pending trade</span>
          <button
            onClick={() => { soundService.playClick(); setPendingTrade(!pendingTrade); }}
            className={clsx('w-9 h-5 rounded-full transition-colors relative', pendingTrade ? 'bg-[#007aff]' : 'bg-base-700')}
          >
            <span className={clsx('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform', pendingTrade ? 'left-4.5' : 'left-0.5')} />
          </button>
        </div>

        {pendingTrade && (
          <div className="bg-base-800/90 border border-line rounded-lg p-2.5 space-y-2">
            <div className="text-[10px] text-mute font-semibold uppercase">Execution by Price</div>
            <div className="flex items-center gap-2">
              <input
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                placeholder={tick ? `Target: ${fmtPrice(tick.mid)}` : 'Target price'}
                className="ax-input !h-7 !text-xs"
              />
            </div>
          </div>
        )}

        {/* TIME STEPPER (Quotex signature style) */}
        <div className="bg-base-800/80 border border-line rounded-lg px-3 py-2.5">
          <div className="flex items-center justify-between text-[11px] text-mute font-medium mb-1.5">
            <span>{mode === 'TIME' ? 'Time' : 'Timer'}</span>
            <button onClick={() => { soundService.playClick(); setShowTimePresets(false); setMode((m) => (m === 'TIME' ? 'TIMER' : 'TIME')); }} className="text-[10px] text-[#007aff] hover:underline font-semibold">
              SWITCH TIME
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={handleMinusTime}
              className="w-8 h-8 rounded bg-base-700 hover:bg-base-600 text-white font-bold text-lg flex items-center justify-center transition shrink-0 active:scale-95"
            >
              −
            </button>
            <div
              onClick={() => { if (mode === 'TIMER') setShowTimePresets(!showTimePresets); }}
              className={clsx('flex-1 text-center font-mono text-[17px] font-extrabold tracking-tight text-white', mode === 'TIMER' && 'cursor-pointer')}
            >
              {mode === 'TIME' ? fmtClock(fixedExpiry) : fmtHMS(durationSec)}
            </div>
            <button
              onClick={handlePlusTime}
              className="w-8 h-8 rounded bg-base-700 hover:bg-base-600 text-white font-bold text-lg flex items-center justify-center transition shrink-0 active:scale-95"
            >
              +
            </button>
          </div>
          {/* Quick Expiry Presets */}
          {mode === 'TIMER' && (
            <div className="grid grid-cols-6 gap-1 mt-2.5 pt-2 border-t border-line">
              {[5, 15, 30, 60, 120, 300].map((d) => (
                <button
                  key={d}
                  onClick={() => { soundService.playClick(); setDurationSec(d); }}
                  className={clsx('h-6 rounded text-[10px] font-bold transition font-mono', durationSec === d ? 'bg-[#007aff] text-white shadow-sm' : 'bg-base-700/80 text-fog hover:text-white hover:bg-base-700')}
                >
                  {d < 60 ? `${d}s` : `${d / 60}m`}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* INVESTMENT STEPPER (Quotex signature style) */}
        <div className="bg-base-800/80 border border-line rounded-lg px-3 py-2.5">
          <div className="flex items-center justify-between text-[11px] text-mute font-medium mb-1.5">
            <span>Investment</span>
            <button onClick={() => setShowStakePresets(!showStakePresets)} className="text-[10px] text-[#007aff] hover:underline font-semibold">
              SWITCH
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={handleMinusStake}
              className="w-8 h-8 rounded bg-base-700 hover:bg-base-600 text-white font-bold text-lg flex items-center justify-center transition shrink-0 active:scale-95"
            >
              −
            </button>
            <div className="flex-1 text-center font-mono text-[17px] font-extrabold tracking-tight text-white">
              {stakeInput !== null ? (
                <input
                  value={stakeInput}
                  autoFocus
                  onChange={(e) => setStakeInput(e.target.value.replace(/[^0-9.]/g, ''))}
                  onBlur={() => {
                    const v = parseFloat(stakeInput);
                    if (Number.isFinite(v) && v > 0) setStake(Math.round(v * 100) / 100);
                    setStakeInput(null);
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  className="w-20 bg-transparent text-center outline-none border-b border-[#007aff]"
                />
              ) : (
                <span onClick={() => setStakeInput(String(stake))} className="cursor-pointer hover:text-accent-300">
                  {stake} $
                </span>
              )}
            </div>
            <button
              onClick={handlePlusStake}
              className="w-8 h-8 rounded bg-base-700 hover:bg-base-600 text-white font-bold text-lg flex items-center justify-center transition shrink-0 active:scale-95"
            >
              +
            </button>
          </div>

          {/* Quotex Multipliers & Quick Action Chips */}
          <div className="grid grid-cols-4 gap-1 mt-2.5 pt-2 border-t border-line">
            <button
              onClick={() => { soundService.playClick(); setStake((s) => Math.max(minS, Math.round((s / 2) * 100) / 100)); }}
              title="Half Stake (1/2)"
              className="h-6 rounded bg-base-700/80 hover:bg-base-700 text-fog hover:text-white text-[11px] font-bold font-mono transition active:scale-95"
            >
              ½
            </button>
            <button
              onClick={() => { soundService.playClick(); setStake((s) => Math.min(available > 0 ? available : maxS, Math.round(s * 2 * 100) / 100)); }}
              title="Double Stake (2x)"
              className="h-6 rounded bg-base-700/80 hover:bg-base-700 text-fog hover:text-white text-[11px] font-bold font-mono transition active:scale-95"
            >
              2×
            </button>
            <button
              onClick={() => { soundService.playClick(); setStake(minS); }}
              title="Minimum Stake"
              className="h-6 rounded bg-base-700/80 hover:bg-base-700 text-fog hover:text-white text-[10px] font-bold uppercase transition active:scale-95"
            >
              Min
            </button>
            <button
              onClick={() => { soundService.playClick(); setStake(Math.min(maxS, Math.max(minS, Math.floor(available)))); }}
              title="All-in / Max Available"
              className="h-6 rounded bg-base-700/80 hover:bg-base-700 text-amber-400 hover:text-amber-300 text-[10px] font-bold uppercase transition active:scale-95"
            >
              Max
            </button>
          </div>

          {/* Quick Stake Direct Selection Chips */}
          <div className="grid grid-cols-6 gap-1 mt-1.5">
            {STAKE_STEPS.map((v) => (
              <button
                key={v}
                onClick={() => { soundService.playClick(); setStake(v); }}
                className={clsx('h-6 rounded text-[10px] font-bold transition font-mono active:scale-95', stake === v ? 'bg-[#007aff] text-white shadow-sm' : 'bg-base-700/60 text-fog hover:text-white hover:bg-base-700')}
              >
                ${v}
              </button>
            ))}
          </div>
        </div>

        {/* PAYOUT DOTTED LINE (Exact Quotex format) */}
        <div className="flex items-center justify-between text-xs px-1 py-1">
          <span className="text-mute font-medium">Payout</span>
          <div className="flex-1 mx-2 border-b border-dotted border-line" />
          <span className="font-mono text-[15px] font-bold text-white">{payout.toFixed(2)} $</span>
        </div>

        <FieldError message={err} />
      </div>

      {/* FOOTER: UP / DOWN BUTTONS (Quotex signature bold buttons) */}
      <div className="shrink-0 px-4 pt-2.5 pb-4 border-t border-line space-y-2.5 bg-base-900">
        {/* 1-Click Disabled Confirmation Card */}
        {confirmDir && (
          <div className="p-3 rounded-xl bg-base-800 border border-amber-400/40 space-y-2 animate-in fade-in">
            <div className="text-xs font-bold text-amber-300 flex items-center justify-between">
              <span>Confirm {confirmDir === 'UP' ? 'CALL ▲' : 'PUT ▼'} Trade?</span>
              <span className="text-white font-mono font-bold">{fmtMoney(stake)}</span>
            </div>
            <div className="text-[10px] text-slate-300 flex justify-between font-mono">
              <span>{symbol}</span>
              <span>Expiry: {mode === 'TIME' ? fmtClock(fixedExpiry) : `${fmtHMS(durationSec)}`}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => setConfirmDir(null)}
                className="py-1.5 rounded-lg bg-white/10 text-slate-300 text-xs font-bold hover:bg-white/20 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => submit(confirmDir)}
                className="py-1.5 rounded-lg bg-[#00c076] text-slate-950 text-xs font-black hover:bg-[#00d684] transition"
              >
                Confirm Trade
              </button>
            </div>
          </div>
        )}

        <div className="grid gap-2.5">
          {/* UP BUTTON: Green Quotex button with UP and Arrow */}
          <button
            onClick={() => submit('UP')}
            disabled={busy || !!invalid}
            className={clsx(
              'w-full h-12 rounded-lg bg-[#00c076] hover:bg-[#00d684] active:scale-[0.98] text-white font-black text-[15px] flex items-center justify-between px-5 transition shadow-lg',
              flash === 'UP' && 'brightness-125',
              isArmedUp && 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-base-900 animate-pulse'
            )}
          >
            <span>Up</span>
            <div className="w-7 h-7 rounded-full bg-black/20 flex items-center justify-center text-sm font-black">
              ↑
            </div>
          </button>

          {/* DOWN BUTTON: Red Quotex button with DOWN and Arrow */}
          <button
            onClick={() => submit('DOWN')}
            disabled={busy || !!invalid}
            className={clsx(
              'w-full h-12 rounded-lg bg-[#ff5447] hover:bg-[#ff685c] active:scale-[0.98] text-white font-black text-[15px] flex items-center justify-between px-5 transition shadow-lg',
              flash === 'DOWN' && 'brightness-125',
              isArmedDown && 'ring-2 ring-rose-400 ring-offset-2 ring-offset-base-900 animate-pulse'
            )}
          >
            <span>Down</span>
            <div className="w-7 h-7 rounded-full bg-black/20 flex items-center justify-center text-sm font-black">
              ↓
            </div>
          </button>
        </div>

        {invalid && account && stake > available && (
          <div className="text-[10px] text-[#ff5447] text-center font-medium">
            Investment exceeds available balance ({fmtMoney(available)}).
            {account.accountType === 'LIVE' && (
              <a href="/wallet" className="block text-[#00c076] underline font-bold mt-1">
                + Deposit funds to trade live
              </a>
            )}
          </div>
        )}
        {invalid && meta && !meta.enabled && (
          <div className="text-[10px] text-[#ff5447] text-center font-medium">{symbol} is currently halted.</div>
        )}

        <div className="flex items-center justify-between text-[11px] px-1 text-mute">
          <span>{account?.accountType === 'LIVE' ? 'Live Balance' : 'Demo Balance'}</span>
          <span className={clsx('font-mono font-bold', account?.accountType === 'LIVE' ? 'text-[#00c076]' : 'text-accent-300')}>
            {account ? fmtMoney(account.balance) : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

