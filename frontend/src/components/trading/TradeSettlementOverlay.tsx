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
        'w-[320px] max-w-[calc(100vw-2rem)] rounded-md overflow-hidden shadow-pop backdrop-blur-xl border select-none transition-all duration-300 animate-in fade-in slide-in-from-top-3',
        isWin && 'bg-base-950/95 border-up/40 shadow-[0_8px_30px_rgba(0,192,118,0.25)]',
        isLoss && 'bg-base-950/95 border-down/40 shadow-[0_8px_30px_rgba(255,84,71,0.22)]',
        isTie && 'bg-base-900/95 border-base-700/60 shadow-[0_8px_25px_rgba(0,0,0,0.5)]'
      )}
    >
      <div className="p-3">
        {/* Top Header: Symbol, OTC, Direction Pill, and Close Button */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm leading-none">{meta.flag1}{meta.flag2}</span>
            <span className="text-xs font-bold text-cream tracking-wide">{card.symbol}</span>
            <span className="text-[9px] font-bold text-warn bg-warn/10 border border-warn/25 px-1 rounded leading-tight">
              OTC
            </span>
            <span
              className={clsx(
                'text-[9px] font-bold px-1.5 py-0.2 rounded tracking-wider flex items-center gap-0.5',
                isUp
                  ? 'bg-up/15 text-up border border-up/30'
                  : 'bg-down/15 text-down border border-down/30'
              )}
            >
              <span>{isUp ? '▲' : '▼'}</span>
              <span>{isUp ? 'CALL' : 'PUT'}</span>
            </span>
          </div>

          <button
            onClick={onDismiss}
            className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-[10px] text-fog hover:text-cream transition"
            title="Dismiss"
          >
            ✕
          </button>
        </div>

        {/* Center: Large Outcome & Status Badge */}
        <div className="flex items-baseline justify-between mb-2">
          <div>
            <div className="text-[9.5px] uppercase font-bold text-fog tracking-wider">
              {isWin ? 'Net Profit' : isLoss ? 'Investment' : 'Stake Returned'}
            </div>
            <div
              className={clsx(
                'text-xl font-bold font-mono tracking-tight leading-tight',
                isWin && 'text-up',
                isLoss && 'text-down',
                isTie && 'text-fog'
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
              'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider',
              isWin && 'bg-up/20 text-up border border-up/35',
              isLoss && 'bg-down/15 text-down border border-down/25',
              isTie && 'bg-base-700/40 text-fog border border-mute/30'
            )}
          >
            {isWin ? `+${card.payoutPct || meta.defaultPayout}% WIN` : isLoss ? 'SETTLED' : 'TIE'}
          </div>
        </div>

        {/* Bottom Details Row: Strike, Close, and Stake */}
        <div className="flex items-center justify-between text-[10px] font-mono text-fog pt-1.5 border-t border-white/5">
          <span>Strike: <span className="text-ink1 font-semibold">{fmtPrice(card.entryPrice)}</span></span>
          <span className="text-mute">→</span>
          <span>Close: <span className="text-ink1 font-semibold">{fmtPrice(card.closePrice)}</span></span>
          <span>Invested: <span className="text-ink1 font-semibold">{fmtMoney(card.stake)}</span></span>
        </div>
      </div>

      {/* Auto-Dismiss Progress Bar */}
      <div className="w-full h-0.5 bg-white/5 overflow-hidden">
        <div
          className={clsx(
            'h-full origin-left',
            isWin && 'bg-up',
            isLoss && 'bg-down',
            isTie && 'bg-fog'
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
