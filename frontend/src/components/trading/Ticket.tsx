import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, apiError } from '../../lib/api';
import { useTerminal } from '../../stores/terminalStore';
import { useUI } from '../../stores/uiStore';
import { fmtMoney, fmtPrice } from '../../lib/format';
import { fmtHMS, payoutFor, DURATION_PRESETS, type OptionsConfig, type OptionTrade, type Direction } from '../../lib/options';
import { getAssetMeta } from '../../lib/assetMeta';
import { soundService } from '../../lib/sound';
import { FieldError } from '../ui/primitives';
import { clsx } from 'clsx';

interface Account { id: string; balance: number; accountNumber: string; accountType: string }

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
      post<OptionTrade & { balance: number }>('/api/v1/options', { accountId: account?.id, symbol, direction, stake, durationSec }, { 'Idempotency-Key': crypto.randomUUID() }),
    onSuccess: (o) => {
      soundService.playTradePlaced();
      setErr(null);
      setFlash(o.direction);
      setTimeout(() => setFlash(null), 500);
      push('ok', `${o.direction === 'UP' ? '▲ Up' : '▼ Down'} ${o.symbol} · ${fmtMoney(o.stake)} · expires in ${fmtHMS(o.durationSec)}`);
      ['options', 'accounts', 'stats', 'wallet', 'option-stats'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e) => {
      soundService.playTradeLost();
      const m = apiError(e);
      setErr(m);
      push('err', m);
    },
  });

  const handleMinusTime = () => { soundService.playClick(); setDurationSec((d) => nextPreset(d, -1)); };
  const handlePlusTime = () => { soundService.playClick(); setDurationSec((d) => nextPreset(d, 1)); };
  const handleMinusStake = () => { soundService.playClick(); setStake((s) => stepStake(s, -1)); };
  const handlePlusStake = () => { soundService.playClick(); setStake((s) => stepStake(s, 1)); };

  const minS = meta?.minStake ?? cfg?.minStake ?? 1;
  const maxS = meta?.maxStake ?? cfg?.maxStake ?? 50000;
  const invalid = !account || (meta && !meta.enabled) || stake <= 0 || stake < minS || stake > maxS || stake > (account?.balance ?? 0);
  const busy = open.isPending;

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
            <span>Time</span>
            <button onClick={() => setShowTimePresets(!showTimePresets)} className="text-[10px] text-[#007aff] hover:underline font-semibold">
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
            <div className="flex-1 text-center font-mono text-[17px] font-extrabold tracking-tight text-white">
              {fmtHMS(durationSec)}
            </div>
            <button
              onClick={handlePlusTime}
              className="w-8 h-8 rounded bg-base-700 hover:bg-base-600 text-white font-bold text-lg flex items-center justify-center transition shrink-0 active:scale-95"
            >
              +
            </button>
          </div>
          {showTimePresets && (
            <div className="grid grid-cols-6 gap-1 mt-2.5 pt-2 border-t border-line">
              {[5, 15, 30, 60, 300, 900].map((d) => (
                <button
                  key={d}
                  onClick={() => { soundService.playClick(); setDurationSec(d); }}
                  className={clsx('h-6 rounded text-[10px] font-bold transition font-mono', durationSec === d ? 'bg-[#007aff] text-white' : 'bg-base-700 text-fog hover:text-white')}
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
          <div className="grid grid-cols-6 gap-1 mt-2.5 pt-2 border-t border-line">
            {STAKE_STEPS.map((v) => (
              <button
                key={v}
                onClick={() => { soundService.playClick(); setStake(v); }}
                className={clsx('h-6 rounded text-[10px] font-bold transition font-mono', stake === v ? 'bg-[#007aff] text-white' : 'bg-base-700 text-fog hover:text-white')}
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
        <div className="grid gap-2.5">
          {/* UP BUTTON: Green Quotex button with UP and Arrow */}
          <button
            onClick={() => open.mutate('UP')}
            disabled={busy || !!invalid}
            className={clsx(
              'w-full h-12 rounded-lg bg-[#00c076] hover:bg-[#00d684] active:scale-[0.98] text-white font-black text-[15px] flex items-center justify-between px-5 transition shadow-lg',
              flash === 'UP' && 'brightness-125'
            )}
          >
            <span>Up</span>
            <div className="w-7 h-7 rounded-full bg-black/20 flex items-center justify-center text-sm font-black">
              ↑
            </div>
          </button>

          {/* DOWN BUTTON: Red Quotex button with DOWN and Arrow */}
          <button
            onClick={() => open.mutate('DOWN')}
            disabled={busy || !!invalid}
            className={clsx(
              'w-full h-12 rounded-lg bg-[#ff5447] hover:bg-[#ff685c] active:scale-[0.98] text-white font-black text-[15px] flex items-center justify-between px-5 transition shadow-lg',
              flash === 'DOWN' && 'brightness-125'
            )}
          >
            <span>Down</span>
            <div className="w-7 h-7 rounded-full bg-black/20 flex items-center justify-center text-sm font-black">
              ↓
            </div>
          </button>
        </div>

        {invalid && account && stake > account.balance && (
          <div className="text-[10px] text-[#ff5447] text-center font-medium">Investment exceeds balance ({fmtMoney(account.balance)}).</div>
        )}
        {invalid && meta && !meta.enabled && (
          <div className="text-[10px] text-[#ff5447] text-center font-medium">{symbol} is currently halted.</div>
        )}

        <div className="flex items-center justify-between text-[11px] px-1 text-mute">
          <span>Demo Balance</span>
          <span className="font-mono font-bold text-white">{account ? fmtMoney(account.balance) : '—'}</span>
        </div>
      </div>
    </div>
  );
}

