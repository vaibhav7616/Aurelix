import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, apiError } from '../../lib/api';
import { useTerminal, serverNow } from '../../stores/terminalStore';
import { useUI } from '../../stores/uiStore';
import { fmtMoney, fmtPrice } from '../../lib/format';
import { fmtHMS, payoutFor, effectivePayoutPct, DURATION_PRESETS, nextFixedExpiry, FIXED_TIME_MIN_LEAD_SEC, type OptionsConfig, type OptionTrade, type PendingTrade, type Direction, type ExpiryMode } from '../../lib/options';
import { getAssetMeta } from '../../lib/assetMeta';
import { soundService } from '../../lib/sound';
import { useSettingsStore } from '../../stores/settingsStore';
import { useSignalsStore } from '../../stores/signalsStore';
import { FieldError } from '../ui/primitives';
import { clsx } from 'clsx';
import { uuid } from '../../lib/uuid';

interface Account { id: string; balance: number; lockedBalance?: number; accountNumber: string; accountType: string }

const MAX_FIXED_AHEAD_MS = 4 * 3600_000;
function fmtClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const STAKE_STEPS = [1, 5, 10, 25, 50, 100];
const PCT_STEPS = [1, 2, 5, 10, 25, 50];
const TIME_PRESETS = [5, 15, 30, 60, 120, 180, 300, 600, 900, 1800, 3600];

function nextPreset(cur: number, dir: 1 | -1): number {
  const i = DURATION_PRESETS.findIndex((d) => d >= cur);
  if (dir === 1) {
    if (i === -1) return cur;
    return DURATION_PRESETS[Math.min(DURATION_PRESETS.length - 1, DURATION_PRESETS[i] === cur ? i + 1 : i)];
  }
  if (i === -1) return DURATION_PRESETS[DURATION_PRESETS.length - 1];
  return DURATION_PRESETS[Math.max(0, i - 1)];
}
function stepStake(cur: number, dir: 1 | -1): number {
  const step = cur >= 1000 ? 100 : cur >= 100 ? 10 : cur >= 20 ? 5 : 1;
  return Math.max(1, Math.round((cur + dir * step) * 100) / 100);
}
function stepPct(cur: number, dir: 1 | -1): number {
  const step = cur >= 10 ? 5 : 1;
  return Math.min(100, Math.max(1, cur + dir * step));
}
function isTyping(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;
}

function StepBtn({ onClick, children, title }: { onClick: () => void; children: string; title: string }) {
  return (
    <button onClick={onClick} title={title} aria-label={`${children === '+' ? 'Increase' : 'Decrease'} (${title})`} className="w-8 h-8 rounded-md border border-line bg-base-850 hover:bg-base-700 text-ink1 text-[16px] leading-none flex items-center justify-center transition-colors shrink-0">
      {children}
    </button>
  );
}

function Box({ label, action, children }: { label: string; action?: { text: string; onClick: () => void }; children: React.ReactNode }) {
  return (
    <div className="bg-base-950 border border-line rounded-md px-3 pt-2 pb-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-mute">{label}</span>
        {action && <button onClick={action.onClick} className="text-[10.5px] text-accent-300 hover:text-accent-200 font-medium">{action.text}</button>}
      </div>
      {children}
    </div>
  );
}

export function Ticket() {
  const { symbol, ticks, accountId, pendingTrade, setPendingTrade, setPendingDuration, setPreviewExpiry, setHoverDir } = useTerminal();
  const push = useUI((s) => s.push);
  const qc = useQueryClient();
  const [durationSec, setDurationSec] = useState<number>(() => Number(localStorage.getItem('ax_opt_dur') ?? 60) || 60);
  const [stake, setStake] = useState<number>(() => Number(localStorage.getItem('ax_opt_stake') ?? 1) || 1);
  // Investment SWITCH: fixed amount ($) or percent of available balance (%)
  const [stakeMode, setStakeMode] = useState<'USD' | 'PCT'>(() => (localStorage.getItem('ax_opt_stake_mode') === 'PCT' ? 'PCT' : 'USD'));
  const [stakePct, setStakePct] = useState<number>(() => Number(localStorage.getItem('ax_opt_stake_pct') ?? 1) || 1);
  const [stakeInput, setStakeInput] = useState<string | null>(null);
  const [showTimePresets, setShowTimePresets] = useState(false);
  const [targetPrice, setTargetPrice] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<Direction | null>(null);
  const [confirmDir, setConfirmDir] = useState<Direction | null>(null);

  const oneClickTrading = useSettingsStore((s) => s.oneClickTrading);
  const armedSignal = useSignalsStore((s) => s.armedSignal);
  const armSignal = useSignalsStore((s) => s.armSignal);

  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: () => get<Account[]>('/api/v1/accounts') });
  const { data: cfg } = useQuery({ queryKey: ['options-config'], queryFn: () => get<OptionsConfig>('/api/v1/options/config'), refetchInterval: 30000 });
  const leadSec = cfg?.fixedTimeMinLeadSec ?? FIXED_TIME_MIN_LEAD_SEC;
  const leadRef = useRef(leadSec);
  leadRef.current = leadSec;

  // Expiry mode (Quotex "SWITCH TIME"): TIMER = duration from open, TIME = fixed clock minute
  const [mode, setMode] = useState<ExpiryMode>(() => (localStorage.getItem('ax_opt_mode') === 'TIME' ? 'TIME' : 'TIMER'));
  const [fixedExpiry, setFixedExpiry] = useState<number>(() => nextFixedExpiry(serverNow()));
  // purchases for a minute close leadSec before it — roll forward like Quotex does
  useEffect(() => {
    if (mode !== 'TIME') return;
    const t = setInterval(() => {
      const min = nextFixedExpiry(serverNow(), leadRef.current);
      setFixedExpiry((cur) => (cur < min ? min : cur));
    }, 500);
    return () => clearInterval(t);
  }, [mode]);

  useEffect(() => { localStorage.setItem('ax_opt_mode', mode); }, [mode]);
  useEffect(() => { localStorage.setItem('ax_opt_dur', String(durationSec)); setPendingDuration(durationSec); }, [durationSec, setPendingDuration]);
  useEffect(() => { setPreviewExpiry(mode === 'TIME' ? fixedExpiry : null); }, [mode, fixedExpiry, setPreviewExpiry]);
  useEffect(() => () => { setPreviewExpiry(null); setHoverDir(null); }, [setPreviewExpiry, setHoverDir]);
  useEffect(() => { localStorage.setItem('ax_opt_stake', String(stake)); }, [stake]);
  useEffect(() => { localStorage.setItem('ax_opt_stake_mode', stakeMode); }, [stakeMode]);
  useEffect(() => { localStorage.setItem('ax_opt_stake_pct', String(stakePct)); }, [stakePct]);

  const account = accounts?.find((a) => a.id === accountId) ?? accounts?.[0];
  const meta = cfg?.assets.find((a) => a.symbol === symbol);
  const assetInfo = getAssetMeta(symbol);
  const tick = ticks[symbol];
  // payout depends on the trade length (and OTC) — the server locks the same % in when the trade opens
  const tradeSec = mode === 'TIME' ? Math.max(1, Math.round((fixedExpiry - serverNow()) / 1000)) : durationSec;
  const payoutPct = effectivePayoutPct(meta?.payoutPct ?? assetInfo.defaultPayout ?? 80, tradeSec, meta?.otc ?? true, cfg?.payoutRules);
  const available = (account?.balance ?? 0) - (account?.lockedBalance ?? 0); // pending trades reserve their stake
  const effStake = stakeMode === 'PCT' ? Math.floor(available * stakePct) / 100 : stake;
  const payout = useMemo(() => payoutFor(effStake, payoutPct), [effStake, payoutPct]);

  const open = useMutation({
    mutationFn: (direction: Direction) =>
      post<OptionTrade & { balance: number }>(
        '/api/v1/options',
        { accountId: account?.id, symbol, direction, stake: effStake, ...(mode === 'TIME' ? { expiresAt: fixedExpiry } : { durationSec }) },
        { 'Idempotency-Key': uuid() },
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
      post<PendingTrade>('/api/v1/options/pending', { accountId: account?.id, symbol, direction, stake: effStake, durationSec, targetPrice: Number(targetPrice) }),
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

  const minS = meta?.minStake ?? cfg?.minStake ?? 1;
  const maxS = meta?.maxStake ?? cfg?.maxStake ?? 50000;
  const halted = !!meta && !meta.enabled;
  const invalid = !account || halted || effStake <= 0 || effStake < minS || effStake > maxS || effStake > available;
  const busy = open.isPending || placePending.isPending;

  const submit = (direction: Direction) => {
    if (busy || invalid) return;
    if (!oneClickTrading && !confirmDir) {
      setConfirmDir(direction);
      return;
    }
    setConfirmDir(null);
    if (!pendingTrade) {
      open.mutate(direction);
      if (armedSignal && armedSignal.symbol === symbol) armSignal(null);
      return;
    }
    if (mode === 'TIME') { setErr('Pending trades use Timer mode — press SWITCH TIME'); return; }
    const tp = Number(targetPrice);
    if (!targetPrice || !Number.isFinite(tp) || tp <= 0) { setErr('Enter the target price for the pending trade'); return; }
    placePending.mutate(direction);
  };

  const shiftFixed = (dir: 1 | -1) => setFixedExpiry((cur) => {
    const now = serverNow();
    const min = nextFixedExpiry(now, leadSec);
    return Math.min(now + MAX_FIXED_AHEAD_MS, Math.max(min, cur + dir * 60_000));
  });
  const shiftTime = (dir: 1 | -1) => { soundService.playClick(); if (mode === 'TIME') shiftFixed(dir); else setDurationSec((d) => nextPreset(d, dir)); };
  const shiftStake = (dir: 1 | -1) => { soundService.playClick(); if (stakeMode === 'PCT') setStakePct((p) => stepPct(p, dir)); else setStake((s) => stepStake(s, dir)); };

  // Quotex hotkeys: Shift+W up · Shift+S down · Shift+A/D investment −/+ · Shift+Q/E time −/+
  const keyRef = useRef({ submit, shiftTime, shiftStake });
  keyRef.current = { submit, shiftTime, shiftStake };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.repeat || isTyping(e.target)) return;
      const k = keyRef.current;
      const map: Record<string, () => void> = {
        KeyW: () => k.submit('UP'), KeyS: () => k.submit('DOWN'),
        KeyA: () => k.shiftStake(-1), KeyD: () => k.shiftStake(1),
        KeyQ: () => k.shiftTime(-1), KeyE: () => k.shiftTime(1),
      };
      const fn = map[e.code];
      if (fn) { e.preventDefault(); fn(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const commitStakeInput = () => {
    const v = parseFloat(stakeInput ?? '');
    if (Number.isFinite(v) && v > 0) {
      if (stakeMode === 'PCT') setStakePct(Math.min(100, Math.max(1, Math.round(v))));
      else setStake(Math.round(v * 100) / 100);
    }
    setStakeInput(null);
  };

  const dirBtn = (d: Direction) => {
    const up = d === 'UP';
    return (
      <button
        onClick={() => submit(d)}
        onMouseEnter={() => setHoverDir(d)}
        onMouseLeave={() => setHoverDir(null)}
        disabled={busy || invalid}
        title={up ? 'Up (Shift+W)' : 'Down (Shift+S)'}
        className={clsx(
          'w-full h-12 rounded-md text-cream font-semibold text-[15px] flex items-center justify-between px-4 transition disabled:opacity-45',
          up ? 'bg-up hover:brightness-110' : 'bg-down hover:brightness-110',
          flash === d && 'brightness-125',
          armedSignal?.symbol === symbol && armedSignal?.direction === d && 'ring-2 ring-offset-2 ring-offset-base-900 animate-pulse ' + (up ? 'ring-up' : 'ring-down'),
        )}
      >
        <span>{up ? 'Up' : 'Down'}</span>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          {up ? <path d="M7 17L17 7M9 7h8v8" /> : <path d="M7 7l10 10M17 9v8H9" />}
        </svg>
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-base-900 select-none">
      {/* asset + payout */}
      <div className="px-4 pt-3 pb-3 border-b border-line">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[15px] leading-none shrink-0" aria-hidden>{assetInfo.flag1}{assetInfo.flag2}</span>
            <span className="text-[13.5px] font-semibold text-ink1 truncate">{symbol}</span>
          </div>
          <span className="text-[12px] ax-num text-mute">Payout <span className="font-semibold text-up">{payoutPct}%</span></span>
        </div>
        {/* bid / ask straight from the server quote — no client-side spread */}
        <div className="mt-2.5 grid grid-cols-2 gap-1.5 ax-num">
          <div className="rounded-md bg-base-950 border border-line px-2.5 py-1.5">
            <div className="text-[10px] uppercase tracking-[0.06em] text-mute">Bid</div>
            <div className="text-[13px] text-ink1">{tick ? fmtPrice(tick.bid) : '—'}</div>
          </div>
          <div className="rounded-md bg-base-950 border border-line px-2.5 py-1.5">
            <div className="text-[10px] uppercase tracking-[0.06em] text-mute">Ask</div>
            <div className="text-[13px] text-ink1">{tick ? fmtPrice(tick.ask) : '—'}</div>
          </div>
        </div>
      </div>

      {/* Armed Algorithmic Signal Indicator Banner */}
      {armedSignal && armedSignal.symbol === symbol && (
        <div className="mx-4 mt-2.5 p-2 rounded-md bg-up/10 border border-up/30 flex items-center justify-between text-xs animate-in fade-in">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base leading-none">⚡</span>
            <div className="min-w-0">
              <div className="font-bold text-up flex items-center gap-1 text-[11px] leading-tight">
                <span>SIGNAL: {armedSignal.direction === 'UP' ? 'CALL ▲' : 'PUT ▼'}</span>
              </div>
              <div className="text-[10px] text-fog truncate">{armedSignal.indicator}</div>
            </div>
          </div>
          <button
            onClick={() => armSignal(null)}
            className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 text-fog hover:text-cream flex items-center justify-center text-xs shrink-0"
            title="Dismiss signal"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-2 space-y-2.5">
        {/* TIME */}
        <Box label={mode === 'TIME' ? 'Time' : 'Timer'} action={{ text: 'SWITCH TIME', onClick: () => { soundService.playClick(); setShowTimePresets(false); setMode((m) => (m === 'TIME' ? 'TIMER' : 'TIME')); } }}>
          <div className="flex items-center gap-2">
            <StepBtn onClick={() => shiftTime(-1)} title="Shift+Q">−</StepBtn>
            <button
              onClick={() => { if (mode === 'TIMER') setShowTimePresets((v) => !v); }}
              className={clsx('flex-1 text-center ax-num text-[18px] font-bold tracking-tight', mode === 'TIMER' ? 'cursor-pointer hover:text-accent-300' : 'cursor-default')}
            >
              {mode === 'TIME' ? fmtClock(fixedExpiry) : fmtHMS(durationSec)}
            </button>
            <StepBtn onClick={() => shiftTime(1)} title="Shift+E">+</StepBtn>
          </div>
          {mode === 'TIMER' && showTimePresets && (
            <div className="grid grid-cols-4 gap-1 mt-2 pt-2 border-t border-line">
              {TIME_PRESETS.map((d) => (
                <button
                  key={d}
                  onClick={() => { soundService.playClick(); setDurationSec(d); setShowTimePresets(false); }}
                  className={clsx('h-7 rounded-md text-[11px] font-bold transition ax-num', durationSec === d ? 'bg-accent-500 text-cream' : 'bg-base-700/70 text-fog hover:text-ink1')}
                >
                  {d < 60 ? `${d}s` : d < 3600 ? `${d / 60}m` : `${d / 3600}h`}
                </button>
              ))}
            </div>
          )}
          {mode === 'TIME' && <div className="text-[10px] text-mute text-center mt-1">Purchases close {leadSec}s before expiry</div>}
        </Box>

        {/* INVESTMENT */}
        <Box label="Investment" action={{ text: stakeMode === 'PCT' ? 'SWITCH TO $' : 'SWITCH TO %', onClick: () => { soundService.playClick(); setStakeInput(null); setStakeMode((m) => (m === 'PCT' ? 'USD' : 'PCT')); } }}>
          <div className="flex items-center gap-2">
            <StepBtn onClick={() => shiftStake(-1)} title="Shift+A">−</StepBtn>
            <div className="flex-1 text-center ax-num text-[18px] font-bold tracking-tight">
              {stakeInput !== null ? (
                <input
                  value={stakeInput}
                  autoFocus
                  onChange={(e) => setStakeInput(e.target.value.replace(/[^0-9.]/g, ''))}
                  onBlur={commitStakeInput}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setStakeInput(null); }}
                  className="w-24 bg-transparent text-center outline-none border-b border-accent-500"
                />
              ) : (
                <button onClick={() => setStakeInput(String(stakeMode === 'PCT' ? stakePct : stake))} className="hover:text-accent-300">
                  {stakeMode === 'PCT' ? `${stakePct}%` : `$${stake}`}
                </button>
              )}
            </div>
            <StepBtn onClick={() => shiftStake(1)} title="Shift+D">+</StepBtn>
          </div>
          <div className="text-[10.5px] text-mute text-center mt-1 ax-num">
            {stakeMode === 'PCT' ? <>= {fmtMoney(effStake)} · </> : null}Available {account ? fmtMoney(available) : '—'}
          </div>
          {/* ½ · 2× · Min · Max (USD mode) */}
          {stakeMode === 'USD' && (
          <div className="grid grid-cols-4 gap-1 mt-2.5 pt-2 border-t border-line">
            <button
              onClick={() => { soundService.playClick(); setStake((s) => Math.max(minS, Math.round((s / 2) * 100) / 100)); }}
              title="Half Stake (1/2)"
              className="h-6 rounded bg-base-700/80 hover:bg-base-700 text-fog hover:text-cream text-[11px] font-bold ax-num transition active:scale-95"
            >
              ½
            </button>
            <button
              onClick={() => { soundService.playClick(); setStake((s) => Math.min(available > 0 ? available : maxS, Math.round(s * 2 * 100) / 100)); }}
              title="Double Stake (2x)"
              className="h-6 rounded bg-base-700/80 hover:bg-base-700 text-fog hover:text-cream text-[11px] font-bold ax-num transition active:scale-95"
            >
              2×
            </button>
            <button
              onClick={() => { soundService.playClick(); setStake(minS); }}
              title="Minimum Stake"
              className="h-6 rounded bg-base-700/80 hover:bg-base-700 text-fog hover:text-cream text-[10px] font-bold uppercase transition active:scale-95"
            >
              Min
            </button>
            <button
              onClick={() => { soundService.playClick(); setStake(Math.min(maxS, Math.max(minS, Math.floor(available)))); }}
              title="All-in / Max Available"
              className="h-6 rounded bg-base-700/80 hover:bg-base-700 text-warn hover:text-warn text-[10px] font-bold uppercase transition active:scale-95"
            >
              Max
            </button>
          </div>
          )}
          <div className="grid grid-cols-6 gap-1 mt-1.5">
            {(stakeMode === 'PCT' ? PCT_STEPS : STAKE_STEPS).map((v) => {
              const sel = stakeMode === 'PCT' ? stakePct === v : stake === v;
              return (
                <button
                  key={v}
                  onClick={() => { soundService.playClick(); if (stakeMode === 'PCT') setStakePct(v); else setStake(v); }}
                  className={clsx('h-6 rounded-md text-[10px] font-bold transition ax-num', sel ? 'bg-accent-500 text-cream' : 'bg-base-700/70 text-fog hover:text-ink1')}
                >
                  {stakeMode === 'PCT' ? `${v}%` : `$${v}`}
                </button>
              );
            })}
          </div>
        </Box>

        {/* PENDING TRADE */}
        <div className="rounded-md border border-line px-3 py-2">
          <button onClick={() => { soundService.playClick(); setPendingTrade(!pendingTrade); }} className="w-full flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-fog">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
              Pending trade
            </span>
            <span className={clsx('w-9 h-5 rounded-full transition-colors relative', pendingTrade ? 'bg-accent-500' : 'bg-base-700')}>
              <span className={clsx('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', pendingTrade ? 'left-[18px]' : 'left-0.5')} />
            </span>
          </button>
          {pendingTrade && (
            <div className="mt-2 space-y-1">
              <div className="text-[10px] text-mute">Open the trade when the price reaches:</div>
              <div className="flex gap-1.5">
                <input
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder={tick ? fmtPrice(tick.mid) : 'Target price'}
                  inputMode="decimal"
                  className="ax-input !h-8 !text-xs ax-num"
                />
                {tick && <button onClick={() => setTargetPrice(String(tick.mid))} className="h-8 px-2 rounded-md bg-base-700 text-[10px] font-bold text-fog hover:text-ink1 shrink-0">Current</button>}
              </div>
            </div>
          )}
        </div>

        <FieldError message={err} />
      </div>

      {/* UP · payout · DOWN (Quotex order) */}
      <div className="shrink-0 px-4 pt-2 pb-4 space-y-2">
        {/* 1-Click Disabled Confirmation Card */}
        {confirmDir && (
          <div className="p-3 rounded-md bg-base-800 border border-warn/40 space-y-2 animate-in fade-in">
            <div className="text-xs font-bold text-warn flex items-center justify-between">
              <span>Confirm {confirmDir === 'UP' ? 'CALL ▲' : 'PUT ▼'} Trade?</span>
              <span className="text-cream ax-num font-bold">{fmtMoney(effStake)}</span>
            </div>
            <div className="text-[10px] text-fog flex justify-between ax-num">
              <span>{symbol}</span>
              <span>Expiry: {mode === 'TIME' ? fmtClock(fixedExpiry) : `${fmtHMS(durationSec)}`}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => setConfirmDir(null)}
                className="py-1.5 rounded-lg bg-white/10 text-fog text-xs font-bold hover:bg-white/20 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => submit(confirmDir)}
                className="py-1.5 rounded-lg bg-up text-base-950 text-xs font-bold hover:bg-up transition"
              >
                Confirm Trade
              </button>
            </div>
          </div>
        )}

        {dirBtn('UP')}
        <div className="text-center py-1">
          <div className="text-[19px] font-semibold ax-num text-up leading-none">+{payoutPct}%</div>
          <div className="text-[11px] text-mute mt-1">Your payout: <span className="ax-num font-bold text-ink1">{fmtMoney(payout)}</span></div>
        </div>
        {dirBtn('DOWN')}

        {account && effStake > available && (
          <div className="text-[10px] text-down text-center font-medium">
            Investment exceeds available balance ({fmtMoney(available)}).
            {account.accountType === 'LIVE' && <a href="/wallet" className="block text-up underline font-bold mt-1">+ Deposit funds to trade live</a>}
          </div>
        )}
        {account && effStake <= available && (effStake < minS || effStake > maxS) && <div className="text-[10px] text-down text-center font-medium">Investment must be between {fmtMoney(minS)} and {fmtMoney(maxS)}.</div>}
        {halted && <div className="text-[10px] text-down text-center font-medium">{symbol} is currently closed for trading.</div>}
      </div>
    </div>
  );
}
