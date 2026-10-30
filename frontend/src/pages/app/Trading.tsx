import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '../../lib/api';
import { useTerminal } from '../../stores/terminalStore';
import { PriceChart } from '../../components/charts/PriceChart';
import { Ticket } from '../../components/trading/Ticket';
import { SignalsDrawer } from '../../components/trading/SignalsDrawer';
import { SettingsModal } from '../../components/trading/SettingsModal';
import { useSignalsStore } from '../../stores/signalsStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { OpenTradesList, PendingTradesList, ClosedTradesList } from '../../components/trading/TradesPanel';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { getAssetMeta } from '../../lib/assetMeta';
import { effectivePayoutPct, type OptionTrade, type OptionsConfig } from '../../lib/options';
import { clsx } from 'clsx';
import { fmtPrice } from '../../lib/format';

interface AssetRow { symbol: string; name: string; category: string; enabled: boolean; payoutPct?: number }
/** Effective payout % and OTC flag per symbol, for the ticket's current trade length. */
function usePayoutInfo() {
  const { data: cfg } = useQuery({ queryKey: ['options-config'], queryFn: () => get<OptionsConfig>('/api/v1/options/config'), refetchInterval: 30000 });
  const durationSec = useTerminal((s) => s.pendingDurationSec);
  return (symbol: string, basePct?: number) => {
    const a = cfg?.assets.find((x) => x.symbol === symbol);
    const otc = a?.otc ?? true;
    return { otc, pct: effectivePayoutPct(basePct ?? a?.payoutPct ?? getAssetMeta(symbol).defaultPayout ?? 80, durationSec, otc, cfg?.payoutRules) };
  };
}

const OtcBadge = () => (
  <span title="Over-the-counter: price made by the platform's quote engine, not an exchange" className="text-[9px] font-semibold tracking-[0.06em] text-warn border border-warn/35 px-1 rounded-[3px] leading-[14px]">OTC</span>
);

/** Live price + change for one symbol — subscribes to that symbol's tick only. */
function TabQuote({ symbol }: { symbol: string }) {
  const tick = useTerminal((s) => s.ticks[symbol]);
  if (!tick) return <span className="text-[11px] text-mute ax-num">—</span>;
  const ch = tick.changePct24h;
  return (
    <span className="flex items-baseline gap-1.5 ax-num leading-none">
      <span className="text-[11.5px] text-ink1">{fmtPrice(tick.mid)}</span>
      <span className={clsx('text-[10.5px]', ch > 0 ? 'text-up' : ch < 0 ? 'text-down' : 'text-mute')}>
        {ch > 0 ? '+' : ''}{ch.toFixed(2)}%
      </span>
    </span>
  );
}

/** Instrument tabs above the chart. */
function AssetTabs({ onOpenSelector }: { onOpenSelector: () => void }) {
  const { symbol, setSymbol, openTabs, closeTab } = useTerminal();
  const payoutInfo = usePayoutInfo();

  return (
    <div role="tablist" aria-label="Open instruments" className="flex items-stretch h-[46px] bg-base-900 border-b border-line overflow-x-auto select-none shrink-0 no-scrollbar">
      {openTabs.map((sym) => {
        const meta = getAssetMeta(sym);
        const { pct: payout, otc } = payoutInfo(sym);
        const isActive = sym === symbol;
        return (
          <div
            key={sym}
            className={clsx(
              'group relative flex items-center border-r border-line shrink-0 transition-colors',
              isActive ? 'bg-base-950 after:absolute after:left-0 after:right-0 after:top-0 after:h-[2px] after:bg-accent-400' : 'hover:bg-base-850',
            )}
          >
            <button
              role="tab"
              aria-selected={isActive}
              onClick={() => setSymbol(sym)}
              className="h-full pl-3.5 pr-2 flex flex-col justify-center gap-[5px] text-left"
            >
              <span className="flex items-center gap-1.5 leading-none">
                <span className="text-[13px] leading-none" aria-hidden>{meta.flag1}{meta.flag2}</span>
                <span className={clsx('text-[12.5px] font-semibold', isActive ? 'text-ink1' : 'text-fog group-hover:text-ink1')}>{sym}</span>
                {otc && <OtcBadge />}
                <span className="text-[10.5px] font-semibold text-up ax-num" title="Payout on a winning trade for the selected expiry">{payout}%</span>
              </span>
              <TabQuote symbol={sym} />
            </button>
            {openTabs.length > 1 && (
              <button
                onClick={() => closeTab(sym)}
                aria-label={`Close ${sym} tab`}
                className="mr-1.5 w-5 h-5 rounded text-[11px] text-mute hover:text-ink1 hover:bg-base-800 flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition"
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
      <button
        onClick={onOpenSelector}
        aria-label="Add instrument (shortcut: /)"
        title="Add instrument ( / )"
        className="shrink-0 px-3.5 flex items-center gap-1.5 text-[12px] font-medium text-mute hover:text-ink1 hover:bg-base-850 transition-colors"
      >
        <span className="text-[15px] leading-none" aria-hidden>+</span>
        <span className="hidden xl:inline">Instrument</span>
      </button>
    </div>
  );
}

/** Quotex Asset Selector Modal */
function AssetSelectorModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { addTab } = useTerminal();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<'ALL' | 'CURRENCIES' | 'CRYPTO' | 'COMMODITIES'>('ALL');

  const payoutInfo = usePayoutInfo();
  const { data } = useQuery({
    queryKey: ['assets'],
    queryFn: () => get<{ assets: AssetRow[] }>('/api/v1/assets'),
  });
  const assets = data?.assets ?? [];

  const filtered = assets
    .filter((a) => {
      const meta = getAssetMeta(a.symbol);
      const effectiveCategory: string = meta.category;
      if (cat !== 'ALL' && effectiveCategory !== cat && a.category !== cat) {
        if (cat === 'CURRENCIES' && (a.category === 'FOREX' || effectiveCategory === 'CURRENCIES')) return true;
        if (cat === 'COMMODITIES' && (a.category === 'METALS' || effectiveCategory === 'COMMODITIES')) return true;
        return false;
      }
      if (q && !a.symbol.toLowerCase().includes(q.toLowerCase()) && !a.name.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      const pA = payoutInfo(a.symbol, a.payoutPct).pct;
      const pB = payoutInfo(b.symbol, b.payoutPct).pct;
      return pB - pA; // highest payout first
    });

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/55 flex items-start justify-center p-4 pt-[12vh]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Select instrument"
        className="bg-base-900 border border-line rounded-lg w-full max-w-[520px] shadow-pop select-none overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 h-12 border-b border-line">
          <h3 className="text-[13.5px] font-semibold text-ink1">Select instrument</h3>
          <span className="text-[11px] text-mute">{filtered.length} available</span>
          <button onClick={onClose} aria-label="Close" className="ml-auto w-7 h-7 rounded-md text-mute hover:text-ink1 hover:bg-base-800 flex items-center justify-center">✕</button>
        </div>
        <div className="p-3 space-y-2.5 border-b border-line">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search symbol or name"
            aria-label="Search instruments"
            className="ax-input"
            autoFocus
          />
          <div className="ax-seg" role="tablist" aria-label="Category">
            {(['ALL', 'CURRENCIES', 'CRYPTO', 'COMMODITIES'] as const).map((c) => (
              <button key={c} role="tab" aria-selected={cat === c} data-active={cat === c} onClick={() => setCat(c)} className="ax-seg-btn">
                {c === 'ALL' ? 'All' : c === 'CURRENCIES' ? 'Currencies' : c === 'CRYPTO' ? 'Crypto' : 'Commodities'}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto_56px] px-4 h-8 items-center text-[10px] font-semibold uppercase tracking-[0.06em] text-mute border-b border-line">
          <span>Instrument</span><span className="text-right">Price · 24h</span><span className="text-right">Payout</span>
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {filtered.map((a) => {
            const meta = getAssetMeta(a.symbol);
            const { pct: payout, otc } = payoutInfo(a.symbol, a.payoutPct);
            return (
              <button
                key={a.symbol}
                disabled={!a.enabled}
                onClick={() => { addTab(a.symbol); onClose(); }}
                className="w-full grid grid-cols-[1fr_auto_56px] gap-3 items-center px-4 h-12 text-left border-b border-line/60 hover:bg-base-850 focus-visible:bg-base-850 disabled:opacity-45 transition-colors"
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span className="text-[16px] leading-none" aria-hidden>{meta.flag1}{meta.flag2}</span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink1">{a.symbol}{otc && <OtcBadge />}</span>
                    <span className="block text-[11px] text-mute truncate">{a.name}{!a.enabled && ' · closed'}</span>
                  </span>
                </span>
                <span className="justify-self-end"><TabQuote symbol={a.symbol} /></span>
                <span className="text-right text-[12px] font-semibold text-up ax-num">{payout}%</span>
              </button>
            );
          })}
          {!filtered.length && <div className="px-4 py-8 text-center text-[12px] text-mute">No instruments match “{q}”.</div>}
        </div>
      </div>
    </div>
  );
}

/** Quotex "Trades" panel: Opened (pending + running) and Closed tabs. */
function TradesPanel({ onClose }: { onClose?: () => void }) {
  const { accountId } = useTerminal();
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  const { data: open } = useQuery({
    queryKey: ['options', 'open', accountId],
    queryFn: () => get<OptionTrade[]>('/api/v1/options/open', accountId ? { accountId } : {}),
    refetchInterval: 2000,
  });

  return (
    <div className="flex flex-col h-full min-h-0 bg-base-900">
      <div className="flex items-center px-3 h-11 border-b border-line shrink-0">
        <h2 className="text-[12.5px] font-semibold text-ink1">Trades</h2>
        {onClose && (
          <button onClick={onClose} aria-label="Hide trades panel" className="ml-auto w-7 h-7 rounded-md text-mute hover:text-ink1 hover:bg-base-800 flex items-center justify-center">✕</button>
        )}
      </div>
      <div className="p-2.5 shrink-0">
        <div className="ax-seg" role="tablist" aria-label="Trades">
          {([['open', 'Open'], ['closed', 'Closed']] as const).map(([v, l]) => (
            <button key={v} role="tab" aria-selected={tab === v} data-active={tab === v} onClick={() => setTab(v)} className="ax-seg-btn flex items-center justify-center gap-1.5">
              {l}
              {v === 'open' && !!open?.length && <span className="text-[10px] text-accent-300 ax-num">{open.length}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {tab === 'open' ? (
          <>
            <PendingTradesList accountId={accountId} />
            <OpenTradesList accountId={accountId} />
          </>
        ) : (
          <ClosedTradesList accountId={accountId} />
        )}
      </div>
    </div>
  );
}

/** "/" opens the asset selector (when not typing). */
function useSlashToOpen(open: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      open();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
}

/** Chart top-row controls owned by the page: signals drawer + trading settings. */
function ChartToolbar() {
  const toggleSignals = useSignalsStore((s) => s.toggleOpen);
  const isSignalsOpen = useSignalsStore((s) => s.isOpen);
  const toggleSettings = useSettingsStore((s) => s.toggleOpen);
  return (
    <>
      <button
        onClick={toggleSignals}
        aria-pressed={isSignalsOpen}
        aria-label="Signals"
        className={clsx(
          'h-8 px-2.5 rounded-md text-[12px] font-medium flex items-center gap-1.5 border transition-colors',
          isSignalsOpen ? 'bg-accent-600 border-accent-500 text-cream' : 'bg-base-900/95 border-line text-fog hover:text-ink1 hover:bg-base-800',
        )}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>
        <span className="hidden sm:inline">Signals</span>
      </button>
      <button
        onClick={toggleSettings}
        aria-label="Trading settings"
        title="Trading settings"
        className="h-8 w-8 rounded-md bg-base-900/95 border border-line text-fog hover:text-ink1 hover:bg-base-800 flex items-center justify-center transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></svg>
      </button>
    </>
  );
}

function MobileTrade() {
  const [tab, setTab] = useState<'chart' | 'trade' | 'trades'>('chart');
  const [showAssetSelector, setShowAssetSelector] = useState(false);

  return (
    <div className="flex flex-col h-[calc(100dvh-52px-52px)] min-h-[480px] relative">
      <AssetTabs onOpenSelector={() => setShowAssetSelector(true)} />
      <AssetSelectorModal isOpen={showAssetSelector} onClose={() => setShowAssetSelector(false)} />
      <SignalsDrawer />
      <SettingsModal />

      <div className="flex-1 min-h-0 overflow-hidden relative">
        {tab === 'chart' && (
          <div className="h-full w-full relative">
            <PriceChart toolbar={<ChartToolbar />} />
          </div>
        )}
        {tab === 'trade' && <div className="h-full overflow-hidden"><Ticket /></div>}
        {tab === 'trades' && <TradesPanel />}
      </div>
      <div className="grid grid-cols-3 border-t border-line bg-base-900 shrink-0">
        {[['chart', 'Chart'], ['trade', 'Trade'], ['trades', 'Trades']].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setTab(v as never)}
            className={clsx('py-2.5 text-[11px] font-bold uppercase tracking-wide border-t-2 transition', tab === v ? 'text-accent-400 border-accent-500' : 'text-mute border-transparent')}
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
  const [showTrades, setShowTrades] = useState<boolean>(() => {
    const saved = localStorage.getItem('ax_trades_panel');
    return saved ? saved === '1' : window.innerWidth >= 1600;
  });
  useEffect(() => { localStorage.setItem('ax_trades_panel', showTrades ? '1' : '0'); }, [showTrades]);
  const openSelector = useCallback(() => setShowAssetSelector(true), []);
  useSlashToOpen(openSelector);

  if (isMobile) return <MobileTrade />;

  return (
    <div className="h-[calc(100vh-52px)] min-h-[560px] flex flex-col bg-base-950">
      <div className="flex items-stretch bg-base-900 shrink-0">
        <div className="flex-1 min-w-0"><AssetTabs onOpenSelector={openSelector} /></div>
        {!showTrades && (
          <button onClick={() => setShowTrades(true)} aria-label="Show trades panel" className="hidden xl:flex px-4 text-[12px] font-medium text-fog hover:text-ink1 hover:bg-base-850 border-l border-b border-line items-center gap-1.5 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
            Trades
          </button>
        )}
      </div>

      <AssetSelectorModal isOpen={showAssetSelector} onClose={() => setShowAssetSelector(false)} />

      {/* Live Algorithmic Trading Signals Drawer */}
      <SignalsDrawer />

      {/* Fast 1-Click Trading & Customization Settings Modal */}
      <SettingsModal />

      {/* [chart] [order panel] [trades — xl+ only, so the chart keeps the space at 1366px] */}
      <div className={clsx('flex-1 grid min-h-0 grid-cols-[minmax(0,1fr)_272px]', showTrades && 'xl:grid-cols-[minmax(0,1fr)_272px_280px]')}>
        <div className="h-full w-full relative min-h-0 overflow-hidden">
          <PriceChart toolbar={<ChartToolbar />} />
        </div>
        <div className="border-l border-line min-h-0 overflow-hidden">
          <Ticket />
        </div>
        {showTrades && (
          <div className="hidden xl:block border-l border-line min-h-0 overflow-hidden">
            <TradesPanel onClose={() => setShowTrades(false)} />
          </div>
        )}
      </div>
    </div>
  );
}
