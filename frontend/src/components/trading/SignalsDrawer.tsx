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
    <div className="absolute top-0 left-0 bottom-0 w-[350px] max-w-[calc(100vw-3rem)] bg-base-950/95 backdrop-blur-xl border-r border-white/10 z-40 flex flex-col shadow-pop animate-in slide-in-from-left-4 duration-200 select-none">
      {/* Header */}
      <div className="p-3.5 border-b border-white/10 flex items-center justify-between shrink-0 bg-base-900">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-up/15 border border-up/30 flex items-center justify-center text-up font-bold text-sm">
            ⚡
          </div>
          <div>
            <div className="text-xs font-bold text-cream flex items-center gap-1.5 uppercase tracking-wide">
              <span>Trading Signals</span>
              <span className="w-1.5 h-1.5 rounded-full bg-up animate-pulse" />
            </div>
            <div className="text-[10px] text-fog">Algorithmic technical indicators</div>
          </div>
        </div>

        <button
          onClick={() => setOpen(false)}
          className="w-6 h-6 rounded-md hover:bg-white/10 text-fog hover:text-cream flex items-center justify-center text-xs transition"
        >
          ✕
        </button>
      </div>

      {/* Filter Chips */}
      <div className="p-2 border-b border-white/5 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 bg-base-950">
        {(['ALL', '1m', '5m', 'CURRENCIES', 'CRYPTO'] as SignalFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => { soundService.playClick(); setFilter(f); }}
            className={clsx(
              'px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wide transition whitespace-nowrap',
              filter === f
                ? 'bg-accent-400 text-cream shadow-sm'
                : 'bg-white/5 text-fog hover:text-cream hover:bg-white/10'
            )}
          >
            {f === '1m' ? '1m Turbo' : f === '5m' ? '5m Intraday' : f}
          </button>
        ))}
      </div>

      {/* Signals List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 min-h-0">
        {isLoading && !signals.length ? (
          <div className="py-12 text-center text-xs text-fog space-y-2">
            <div className="w-5 h-5 rounded-full border-2 border-up border-t-transparent animate-spin mx-auto" />
            <div>Scanning assets across technical indicators…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-xs text-fog">
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
                  'p-3 rounded-md border transition-all duration-200 bg-base-900/90 hover:bg-base-800',
                  isUp ? 'border-up/30 hover:border-up/60' : 'border-down/30 hover:border-down/60'
                )}
              >
                {/* Top Row: Symbol + Direction Badge */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base leading-none">{meta.flag1}{meta.flag2}</span>
                    <span className="text-xs font-bold text-cream">{sig.symbol}</span>
                    <span className="text-[9px] font-bold text-warn bg-warn/10 px-1 py-0.2 rounded border border-warn/20">
                      OTC
                    </span>
                  </div>

                  <span
                    className={clsx(
                      'px-2 py-0.5 rounded font-bold text-[11px] flex items-center gap-1 shadow-sm',
                      isUp ? 'bg-up text-base-950' : 'bg-down text-cream'
                    )}
                  >
                    <span>{isUp ? '▲' : '▼'}</span>
                    <span>{isUp ? 'CALL' : 'PUT'}</span>
                  </span>
                </div>

                {/* Middle Row: Strategy & Confidence */}
                <div className="mt-2 text-[11px] flex items-center justify-between">
                  <span className="text-fog font-medium truncate pr-2">
                    {sig.indicator}
                  </span>
                  <span className="text-[10px] font-semibold text-warn font-mono shrink-0">
                    {sig.confidence}% Conf.
                  </span>
                </div>

                {/* Confidence Progress Bar */}
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden mt-1.5">
                  <div
                    className={clsx('h-full rounded-full', isUp ? 'bg-up' : 'bg-down')}
                    style={{ width: `${sig.confidence}%` }}
                  />
                </div>

                {/* Bottom Row: Timeframe, Expiry Countdown & 1-Click Action */}
                <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2 text-fog font-mono text-[10px]">
                    <span className="bg-white/5 px-1.5 py-0.5 rounded font-bold text-fog">
                      {sig.timeframe}
                    </span>
                    <span>⏱ {remaining}</span>
                  </div>

                  <button
                    onClick={() => handleSelectSignal(sig)}
                    className={clsx(
                      'px-2.5 py-1 rounded-lg font-bold text-[10px] uppercase tracking-wider transition active:scale-95 shadow-sm',
                      isUp
                        ? 'bg-up/20 text-up hover:bg-up hover:text-base-950 border border-up/30'
                        : 'bg-down/20 text-down hover:bg-down hover:text-cream border border-down/30'
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
