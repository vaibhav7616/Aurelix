import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '../../lib/api';
import { useTerminal } from '../../stores/terminalStore';
import { PriceChart } from '../../components/charts/PriceChart';
import { Ticket } from '../../components/trading/Ticket';
import { OpenTradesList, TradeHistoryTable } from '../../components/trading/TradesPanel';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { getAssetMeta } from '../../lib/assetMeta';
import type { OptionTrade } from '../../lib/options';
import { clsx } from 'clsx';

interface AssetRow { symbol: string; name: string; category: string; enabled: boolean; payoutPct?: number }
interface OptCfg { assets: Array<{ symbol: string; payoutPct: number; enabled: boolean }> }

/** Quotex Top Asset Tabs Bar */
function AssetTabs({ onOpenSelector }: { onOpenSelector: () => void }) {
  const { symbol, setSymbol, openTabs, closeTab } = useTerminal();
  const { data: cfg } = useQuery({ queryKey: ['options-config'], queryFn: () => get<OptCfg>('/api/v1/options/config'), refetchInterval: 30000 });

  return (
    <div className="flex items-center h-10 bg-[#161a25] border-b border-white/10 px-2 overflow-x-auto select-none shrink-0 no-scrollbar">
      <div className="flex items-center gap-1.5 min-w-max">
        {openTabs.map((sym) => {
          const meta = getAssetMeta(sym);
          const cfgAsset = cfg?.assets.find((a) => a.symbol === sym);
          const payout = cfgAsset?.payoutPct ?? meta.defaultPayout ?? 80;
          const isActive = sym === symbol;

          return (
            <div
              key={sym}
              onClick={() => setSymbol(sym)}
              className={clsx(
                'group flex items-center gap-2 h-8 px-3 rounded-t-md text-xs font-bold transition-all cursor-pointer relative border-t-2',
                isActive
                  ? 'bg-[#121620] text-white border-t-[#00c076]'
                  : 'bg-[#1a202c]/60 text-slate-400 hover:text-slate-200 hover:bg-[#1a202c] border-t-transparent'
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-sm leading-none">{meta.flag1}{meta.flag2}</span>
                <span>{sym}</span>
                <span className="text-[9px] font-black text-amber-400 bg-amber-400/15 border border-amber-400/30 px-1 py-0.2 rounded leading-none">
                  OTC
                </span>
              </div>
              <span className="text-[10px] font-extrabold text-[#00c076] bg-[#00c076]/15 px-1.5 py-0.5 rounded leading-none font-mono">
                {payout}%
              </span>
              {openTabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(sym);
                  }}
                  className="w-4 h-4 rounded hover:bg-white/10 flex items-center justify-center text-[10px] text-slate-400 hover:text-white opacity-40 group-hover:opacity-100 transition"
                  title="Close tab"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}

        {/* Quotex signature "+" button to open assets dialog */}
        <button
          onClick={onOpenSelector}
          title="Add binary asset to tabs"
          className="w-7 h-7 rounded-md bg-[#1a202c] hover:bg-[#232b3b] text-slate-300 hover:text-white flex items-center justify-center text-base font-bold transition border border-white/10 ml-1"
        >
          +
        </button>
      </div>
    </div>
  );
}

/** Quotex Asset Selector Modal */
function AssetSelectorModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { addTab } = useTerminal();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<'ALL' | 'CURRENCIES' | 'CRYPTO' | 'COMMODITIES'>('ALL');

  const { data } = useQuery({
    queryKey: ['assets'],
    queryFn: () => get<{ assets: AssetRow[] }>('/api/v1/assets'),
  });
  const assets = data?.assets ?? [];

  const filtered = assets
    .filter((a) => {
      const meta = getAssetMeta(a.symbol);
      const effectiveCategory = meta.category;
      if (cat !== 'ALL' && effectiveCategory !== cat && a.category !== cat) {
        if (cat === 'CURRENCIES' && (a.category === 'FOREX' || effectiveCategory === 'CURRENCIES')) return true;
        if (cat === 'COMMODITIES' && (a.category === 'METALS' || effectiveCategory === 'COMMODITIES')) return true;
        return false;
      }
      if (q && !a.symbol.toLowerCase().includes(q.toLowerCase()) && !a.name.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      const pA = a.payoutPct ?? getAssetMeta(a.symbol).defaultPayout ?? 80;
      const pB = b.payoutPct ?? getAssetMeta(b.symbol).defaultPayout ?? 80;
      return pB - pA; // Highest payout first (Quotex style)
    });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#171c26] border border-white/15 rounded-2xl w-full max-w-lg p-5 text-white shadow-2xl space-y-3.5 select-none" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <h3 className="font-extrabold text-base">Binary Options (OTC)</h3>
            <span className="text-[10px] font-bold text-amber-400 bg-amber-400/15 border border-amber-400/30 px-1.5 py-0.5 rounded">
              24/7 Trading
            </span>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-sm font-bold">✕</button>
        </div>

        {/* Search */}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search binary OTC pairs (e.g. EUR/USD, GBP/USD, BTC)..."
          className="w-full h-9 px-3 bg-base-900 border border-white/15 rounded-lg text-xs placeholder:text-slate-500 focus:outline-none focus:border-[#007aff]"
          autoFocus
        />

        {/* Category tabs */}
        <div className="flex items-center gap-1 border-b border-white/10 pb-2">
          {(['ALL', 'CURRENCIES', 'CRYPTO', 'COMMODITIES'] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={clsx(
                'px-3 py-1 rounded-md text-xs font-bold transition',
                cat === c ? 'bg-[#007aff] text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'
              )}
            >
              {c === 'CURRENCIES' ? 'Currencies (OTC)' : c === 'COMMODITIES' ? 'Commodities' : c}
            </button>
          ))}
        </div>

        {/* List of assets */}
        <div className="max-h-[340px] overflow-y-auto space-y-1 pr-1">
          {filtered.map((a) => {
            const meta = getAssetMeta(a.symbol);
            const payout = a.payoutPct ?? meta.defaultPayout ?? 80;
            return (
              <div
                key={a.symbol}
                onClick={() => {
                  addTab(a.symbol);
                  onClose();
                }}
                className="flex items-center justify-between p-2.5 rounded-lg hover:bg-white/[0.07] cursor-pointer transition border border-transparent hover:border-white/10"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-xl leading-none">{meta.flag1}{meta.flag2}</span>
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-white">
                      <span>{a.symbol}</span>
                      <span className="text-[9px] font-black text-amber-400 bg-amber-400/15 border border-amber-400/30 px-1 py-0.2 rounded">
                        OTC
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400">{meta.name} · Binary Option</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-[#00c076] bg-[#00c076]/15 px-2 py-0.5 rounded font-mono">
                    {payout}%
                  </span>
                  <span className="text-xs text-[#007aff] font-bold">Trade →</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Right rail tabs: Trades and History */
function RailTabs() {
  const { accountId } = useTerminal();
  const [tab, setTab] = useState<'trades' | 'history'>('trades');
  const { data: open } = useQuery({
    queryKey: ['options', 'open', accountId],
    queryFn: () => get<OptionTrade[]>('/api/v1/options/open', accountId ? { accountId } : {}),
    refetchInterval: 2000,
  });

  return (
    <div className="flex flex-col min-h-0 border-t border-line bg-[#171c26]">
      <div className="flex items-center border-b border-line px-2 shrink-0 h-9">
        <button
          onClick={() => setTab('trades')}
          data-active={tab === 'trades'}
          className={clsx(
            'h-full px-3 text-xs font-bold border-b-2 transition flex items-center gap-1.5',
            tab === 'trades' ? 'border-[#007aff] text-white' : 'border-transparent text-slate-400 hover:text-white'
          )}
        >
          <span>Trades</span>
          {!!open?.length && (
            <span className="text-[10px] bg-[#eab308] text-black font-extrabold rounded-full px-1.5 py-0.2 leading-tight">
              {open.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('history')}
          data-active={tab === 'history'}
          className={clsx(
            'h-full px-3 text-xs font-bold border-b-2 transition flex items-center gap-1.5',
            tab === 'history' ? 'border-[#007aff] text-white' : 'border-transparent text-slate-400 hover:text-white'
          )}
        >
          <span>History</span>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 p-2">
        {tab === 'trades' ? (
          <OpenTradesList accountId={accountId} />
        ) : (
          <div className="text-[11px]">
            <TradeHistoryTable pageSize={12} compact />
          </div>
        )}
      </div>
    </div>
  );
}

function MobileTrade() {
  const [tab, setTab] = useState<'chart' | 'trade' | 'trades'>('chart');
  const [showAssetSelector, setShowAssetSelector] = useState(false);

  return (
    <div className="flex flex-col h-[calc(100dvh-52px-56px)] min-h-[480px]">
      <AssetTabs onOpenSelector={() => setShowAssetSelector(true)} />
      <AssetSelectorModal isOpen={showAssetSelector} onClose={() => setShowAssetSelector(false)} />
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'chart' && <PriceChart />}
        {tab === 'trade' && <div className="h-full overflow-hidden bg-base-900"><Ticket /></div>}
        {tab === 'trades' && <div className="h-full overflow-auto bg-base-900"><RailTabs /></div>}
      </div>
      <div className="grid grid-cols-3 border-t border-line bg-[#171c26] shrink-0">
        {[['chart', 'Chart'], ['trade', 'Trade Ticket'], ['trades', 'Positions']].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setTab(v as never)}
            className={clsx(
              'py-2.5 text-[11px] font-bold uppercase tracking-wide border-t-2 transition',
              tab === v ? 'text-[#007aff] border-[#007aff]' : 'text-slate-400 border-transparent'
            )}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Trading() {
  const isMobile = useIsMobile();
  const [showAssetSelector, setShowAssetSelector] = useState(false);

  if (isMobile) return <MobileTrade />;

  return (
    <div className="h-[calc(100vh-52px)] min-h-[560px] flex flex-col bg-[#121620]">
      {/* Quotex Asset Tabs */}
      <AssetTabs onOpenSelector={() => setShowAssetSelector(true)} />

      {/* Asset Selector Modal */}
      <AssetSelectorModal isOpen={showAssetSelector} onClose={() => setShowAssetSelector(false)} />

      {/* Full-bleed Quotex layout: [Chart 100% height] [Right Ticket + Trades Rail] */}
      <div className="flex-1 grid grid-cols-[minmax(0,1fr)_310px] min-h-0">
        {/* Full-height Quotex Candlestick Chart */}
        <div className="h-full w-full relative min-h-0 overflow-hidden">
          <PriceChart />
        </div>

        {/* Right Rail: Quotex Ticket + Open Trades */}
        <div className="border-l border-white/10 bg-[#161a25] min-h-0 overflow-hidden grid grid-rows-[minmax(0,1.8fr)_minmax(0,1fr)]">
          <div className="min-h-0 overflow-hidden">
            <Ticket />
          </div>
          <RailTabs />
        </div>
      </div>
    </div>
  );
}
