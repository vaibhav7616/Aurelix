import React from 'react';
import { useSettlementStore, type SettlementCard } from '../../stores/settlementStore';
import { fmtMoney, fmtPrice } from '../../lib/format';
import { getAssetMeta } from '../../lib/assetMeta';
import { clsx } from 'clsx';

function SettlementItem({ card, onDismiss }: { card: SettlementCard; onDismiss: () => void }) {
  const isWin = card.status === 'WON';
  const isTie = card.status === 'TIE';
  const isLoss = card.status === 'LOST';
  const meta = getAssetMeta(card.symbol);
  const isUp = card.direction === 'UP';

  return (
    <div
      className={clsx(
        'w-[320px] max-w-[calc(100vw-2rem)] rounded-xl overflow-hidden shadow-2xl backdrop-blur-xl border select-none transition-all duration-300 animate-in fade-in slide-in-from-top-3',
        isWin && 'bg-[#111915]/95 border-emerald-500/40 shadow-[0_8px_30px_rgba(0,192,118,0.25)]',
        isLoss && 'bg-[#1a1315]/95 border-rose-500/40 shadow-[0_8px_30px_rgba(255,84,71,0.22)]',
        isTie && 'bg-[#161a22]/95 border-slate-700/60 shadow-[0_8px_25px_rgba(0,0,0,0.5)]'
      )}
    >
      <div className="p-3">
        {/* Top Header: Symbol, OTC, Direction Pill, and Close Button */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm leading-none">{meta.flag1}{meta.flag2}</span>
            <span className="text-xs font-black text-white tracking-wide">{card.symbol}</span>
            <span className="text-[9px] font-black text-amber-400 bg-amber-400/10 border border-amber-400/25 px-1 rounded leading-tight">
              OTC
            </span>
            <span
              className={clsx(
                'text-[9px] font-black px-1.5 py-0.2 rounded tracking-wider flex items-center gap-0.5',
                isUp
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
              )}
            >
              <span>{isUp ? '▲' : '▼'}</span>
              <span>{isUp ? 'CALL' : 'PUT'}</span>
            </span>
          </div>

          <button
            onClick={onDismiss}
            className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-[10px] text-slate-400 hover:text-white transition"
            title="Dismiss"
          >
            ✕
          </button>
        </div>

        {/* Center: Large Outcome & Status Badge */}
        <div className="flex items-baseline justify-between mb-2">
          <div>
            <div className="text-[9.5px] uppercase font-bold text-slate-400 tracking-wider">
              {isWin ? 'Net Profit' : isLoss ? 'Investment' : 'Stake Returned'}
            </div>
            <div
              className={clsx(
                'text-xl font-black font-mono tracking-tight leading-tight',
                isWin && 'text-[#00c076]',
                isLoss && 'text-[#ff5447]',
                isTie && 'text-slate-300'
              )}
            >
              {isWin
                ? `+${fmtMoney(card.profit)}`
                : isLoss
                ? `-${fmtMoney(card.stake)}`
                : fmtMoney(card.stake)}
            </div>
          </div>

          <div
            className={clsx(
              'px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider',
              isWin && 'bg-[#00c076]/20 text-[#00c076] border border-[#00c076]/35',
              isLoss && 'bg-[#ff5447]/15 text-[#ff5447] border border-[#ff5447]/25',
              isTie && 'bg-slate-700/40 text-slate-300 border border-slate-600/30'
            )}
          >
            {isWin ? `+${card.payoutPct || meta.defaultPayout}% WIN` : isLoss ? 'SETTLED' : 'TIE'}
          </div>
        </div>

        {/* Bottom Details Row: Strike, Close, and Stake */}
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1.5 border-t border-white/5">
          <span>Strike: <span className="text-slate-200 font-semibold">{fmtPrice(card.entryPrice)}</span></span>
          <span className="text-slate-600">→</span>
          <span>Close: <span className="text-slate-200 font-semibold">{fmtPrice(card.closePrice)}</span></span>
          <span>Invested: <span className="text-slate-200 font-semibold">{fmtMoney(card.stake)}</span></span>
        </div>
      </div>

      {/* Auto-Dismiss Progress Bar */}
      <div className="w-full h-0.5 bg-white/5 overflow-hidden">
        <div
          className={clsx(
            'h-full origin-left',
            isWin && 'bg-[#00c076]',
            isLoss && 'bg-[#ff5447]',
            isTie && 'bg-slate-400'
          )}
          style={{
            animation: 'shrinkProgress 4.5s linear forwards',
          }}
        />
      </div>
    </div>
  );
}

export function TradeSettlementOverlay() {
  const { settlements, dismissSettlement } = useSettlementStore();

  if (!settlements.length) return null;

  return (
    <>
      <style>{`
        @keyframes shrinkProgress {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
      <div className="fixed top-14 right-4 md:right-[325px] z-[9999] flex flex-col gap-2.5 pointer-events-auto">
        {settlements.map((card) => (
          <SettlementItem
            key={card.id}
            card={card}
            onDismiss={() => dismissSettlement(card.id)}
          />
        ))}
      </div>
    </>
  );
}
