import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '../../lib/api';
import { useTerminal } from '../../stores/terminalStore';
import { useSignalsStore, type TradingSignalItem, type SignalFilter } from '../../stores/signalsStore';
import { getAssetMeta } from '../../lib/assetMeta';
import { soundService } from '../../lib/sound';
import { clsx } from 'clsx';

function formatRemaining(expiresAt: number): string {
  const diff = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function SignalsDrawer() {
  const { isOpen, setOpen, filter, setFilter, armSignal } = useSignalsStore();
  const { setSymbol, addTab, setPendingDuration } = useTerminal();
  const [, setTick] = useState(0);

  // Re-render countdown every second
  useEffect(() => {
    if (!isOpen) return;
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, [isOpen]);

  const { data, isLoading } = useQuery({
    queryKey: ['algorithmic-signals'],
    queryFn: () => get<{ signals: TradingSignalItem[]; generatedAt: number }>('/api/v1/market/signals'),
    refetchInterval: 5000,
    enabled: isOpen,
  });

  if (!isOpen) return null;

  const signals = data?.signals ?? [];
  const filtered = signals.filter((s) => {
    if (filter === '1m') return s.timeframe === '1m';
    if (filter === '5m') return s.timeframe === '5m';
    if (filter === 'CRYPTO') return s.symbol.includes('BTC') || s.symbol.includes('ETH');
    if (filter === 'CURRENCIES') return !s.symbol.includes('BTC') && !s.symbol.includes('ETH') && !s.symbol.includes('XAU');
    return true;
  });

  const handleSelectSignal = (sig: TradingSignalItem) => {
    soundService.playClick();
    setSymbol(sig.symbol);
    addTab(sig.symbol);
    setPendingDuration(sig.durationSec);
    armSignal({
      symbol: sig.symbol,
      direction: sig.direction,
      durationSec: sig.durationSec,
      indicator: sig.indicator,
    });
  };

  return (
    <div className="absolute top-0 left-0 bottom-0 w-[350px] max-w-[calc(100vw-3rem)] bg-[#121620]/95 backdrop-blur-xl border-r border-white/10 z-40 flex flex-col shadow-2xl animate-in slide-in-from-left-4 duration-200 select-none">
      {/* Header */}
      <div className="p-3.5 border-b border-white/10 flex items-center justify-between shrink-0 bg-[#161a25]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm">
            ⚡
          </div>
          <div>
            <div className="text-xs font-black text-white flex items-center gap-1.5 uppercase tracking-wide">
              <span>Trading Signals</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div className="text-[10px] text-slate-400">Algorithmic technical indicators</div>
          </div>
        </div>

        <button
          onClick={() => setOpen(false)}
          className="w-6 h-6 rounded-md hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center text-xs transition"
        >
          ✕
        </button>
      </div>

      {/* Filter Chips */}
      <div className="p-2 border-b border-white/5 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 bg-[#141822]">
        {(['ALL', '1m', '5m', 'CURRENCIES', 'CRYPTO'] as SignalFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => { soundService.playClick(); setFilter(f); }}
            className={clsx(
              'px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wide transition whitespace-nowrap',
              filter === f
                ? 'bg-[#007aff] text-white shadow-sm'
                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
            )}
          >
            {f === '1m' ? '1m Turbo' : f === '5m' ? '5m Intraday' : f}
          </button>
        ))}
      </div>

      {/* Signals List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 min-h-0">
        {isLoading && !signals.length ? (
          <div className="py-12 text-center text-xs text-slate-400 space-y-2">
            <div className="w-5 h-5 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin mx-auto" />
            <div>Scanning assets across technical indicators…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            No active signals for this filter. Check back in a few seconds.
          </div>
        ) : (
          filtered.map((sig) => {
            const isUp = sig.direction === 'UP';
            const meta = getAssetMeta(sig.symbol);
            const remaining = formatRemaining(sig.expiresAt);

            return (
              <div
                key={sig.id}
                className={clsx(
                  'p-3 rounded-xl border transition-all duration-200 bg-[#181d29]/90 hover:bg-[#1c2230]',
                  isUp ? 'border-emerald-500/30 hover:border-emerald-500/60' : 'border-rose-500/30 hover:border-rose-500/60'
                )}
              >
                {/* Top Row: Symbol + Direction Badge */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base leading-none">{meta.flag1}{meta.flag2}</span>
                    <span className="text-xs font-black text-white">{sig.symbol}</span>
                    <span className="text-[9px] font-black text-amber-400 bg-amber-400/10 px-1 py-0.2 rounded border border-amber-400/20">
                      OTC
                    </span>
                  </div>

                  <span
                    className={clsx(
                      'px-2 py-0.5 rounded font-black text-[11px] flex items-center gap-1 shadow-sm',
                      isUp ? 'bg-[#00c076] text-slate-950' : 'bg-[#ff5447] text-white'
                    )}
                  >
                    <span>{isUp ? '▲' : '▼'}</span>
                    <span>{isUp ? 'CALL' : 'PUT'}</span>
                  </span>
                </div>

                {/* Middle Row: Strategy & Confidence */}
                <div className="mt-2 text-[11px] flex items-center justify-between">
                  <span className="text-slate-300 font-medium truncate pr-2">
                    {sig.indicator}
                  </span>
                  <span className="text-[10px] font-extrabold text-amber-300 font-mono shrink-0">
                    {sig.confidence}% Conf.
                  </span>
                </div>

                {/* Confidence Progress Bar */}
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden mt-1.5">
                  <div
                    className={clsx('h-full rounded-full', isUp ? 'bg-[#00c076]' : 'bg-[#ff5447]')}
                    style={{ width: `${sig.confidence}%` }}
                  />
                </div>

                {/* Bottom Row: Timeframe, Expiry Countdown & 1-Click Action */}
                <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2 text-slate-400 font-mono text-[10px]">
                    <span className="bg-white/5 px-1.5 py-0.5 rounded font-bold text-slate-300">
                      {sig.timeframe}
                    </span>
                    <span>⏱ {remaining}</span>
                  </div>

                  <button
                    onClick={() => handleSelectSignal(sig)}
                    className={clsx(
                      'px-2.5 py-1 rounded-lg font-black text-[10px] uppercase tracking-wider transition active:scale-95 shadow-sm',
                      isUp
                        ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500 hover:text-slate-950 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 hover:bg-rose-500 hover:text-white border border-rose-500/30'
                    )}
                  >
                    Trade Signal →
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
