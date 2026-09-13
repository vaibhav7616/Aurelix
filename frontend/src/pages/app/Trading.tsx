import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '../../lib/api';
import { useTerminal } from '../../stores/terminalStore';
import { TIMEFRAMES, CHART_TYPES } from '../../lib/constants';
import { PriceChart } from '../../components/charts/PriceChart';
import { Watchlist } from '../../components/trading/Watchlist';
import { Ticket } from '../../components/trading/Ticket';
import { OpenTradesList, OpenTradesTable, TradeHistoryTable } from '../../components/trading/TradesPanel';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { fmtPrice, fmtCompact, clsUpDown } from '../../lib/format';
import type { OptionTrade } from '../../lib/options';
import { clsx } from 'clsx';

type WSTab = 'trades' | 'history';

interface SymStats { high24h: number; low24h: number; volume24h: number; spread: number | null; bid: number | null; ask: number | null }
interface OptCfg { assets: Array<{ symbol: string; payoutPct: number; enabled: boolean }> }

function SymbolStrip() {
  const { symbol, timeframe, setTimeframe, chartType, setChartType, ticks } = useTerminal();
  const tick = ticks[symbol];
  const { data: stats } = useQuery({
    queryKey: ['symstats', symbol],
    queryFn: () => get<SymStats>('/api/v1/market/stats', { symbol }),
    refetchInterval: 15000,
  });
  const { data: cfg } = useQuery({ queryKey: ['options-config'], queryFn: () => get<OptCfg>('/api/v1/options/config'), refetchInterval: 30000 });
  const payout = cfg?.assets.find((a) => a.symbol === symbol)?.payoutPct;
  return (
    <div className="flex items-center gap-2.5 flex-wrap px-3 min-h-[46px] py-1 border-b border-line bg-base-900 shrink-0">
      <h1 className="text-[15px] font-bold tracking-tight">{symbol}</h1>
      {payout !== undefined && <span className="ax-num text-[11px] font-bold text-warn bg-warn/10 border border-warn/25 rounded px-1.5 py-[2px]" title="Payout on a winning trade">{payout}%</span>}
      <span className={clsx('ax-num text-[15px] font-bold', clsUpDown(tick?.changePct24h ?? 0))}>{tick ? fmtPrice(tick.mid) : '—'}</span>
      <span className={clsx('ax-num text-[11px] font-semibold', clsUpDown(tick?.changePct24h ?? 0))}>
        {tick ? `${tick.changePct24h >= 0 ? '▲' : '▼'} ${Math.abs(tick.changePct24h).toFixed(2)}%` : ''}
      </span>
      <div className="hidden xl:flex items-center gap-4 ml-3 pl-3 border-l border-line text-[10px] ax-num">
        <span><span className="text-mute">24H H </span><span className="font-semibold">{stats ? fmtPrice(stats.high24h) : '—'}</span></span>
        <span><span className="text-mute">24H L </span><span className="font-semibold">{stats ? fmtPrice(stats.low24h) : '—'}</span></span>
        <span><span className="text-mute">VOL </span><span className="font-semibold">{stats ? fmtCompact(stats.volume24h) : '—'}</span></span>
        <span><span className="text-mute">SPREAD </span><span className="font-semibold">{stats?.spread != null ? `${(stats.spread * 100).toFixed(3)}%` : '—'}</span></span>
        <span className="text-mute">BID <span className="text-ink1 font-semibold">{stats?.bid ? fmtPrice(stats.bid) : '—'}</span> · ASK <span className="text-ink1 font-semibold">{stats?.ask ? fmtPrice(stats.ask) : '—'}</span></span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <div className="flex items-center bg-white/[0.06] border border-line rounded-md p-[3px] max-w-[calc(100vw-24px)] overflow-x-auto no-scrollbar">
          {TIMEFRAMES.map((t) => (
            <button key={t} onClick={() => setTimeframe(t)} data-active={timeframe === t} className="ax-pill !h-[22px] uppercase shrink-0">{t}</button>
          ))}
        </div>
        <div className="hidden sm:flex items-center bg-white/[0.06] border border-line rounded-md p-[3px]">
          {CHART_TYPES.map((t) => (
            <button key={t} onClick={() => setChartType(t)} data-active={chartType === t} title={t} className="ax-pill !h-[22px] !px-2">
              {t === 'candles' ? '◫' : t === 'line' ? '╱' : '◣'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Workspace() {
  const [tab, setTab] = useState<WSTab>('trades');
  const [collapsed, setCollapsed] = useState(false);
  const { data: open } = useQuery({ queryKey: ['options', 'open'], queryFn: () => get<OptionTrade[]>('/api/v1/options/open'), refetchInterval: 3000 });
  return (
    <div className="flex flex-col min-h-0 bg-base-900">
      <div className="flex items-center border-b border-line px-1 shrink-0 h-10">
        <button onClick={() => { setTab('trades'); setCollapsed(false); }} data-active={tab === 'trades' && !collapsed} className="ax-wtab">
          Trades {!!open?.length && <span className="ax-num text-[10px] bg-warn/15 text-warn rounded px-1.5 py-[1px]">{open.length}</span>}
        </button>
        <button onClick={() => { setTab('history'); setCollapsed(false); }} data-active={tab === 'history' && !collapsed} className="ax-wtab">History</button>
        <button onClick={() => setCollapsed((v) => !v)} className="ml-auto ax-btn-quiet !text-[11px]" title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? '▲ Expand' : '▼ Collapse'}
        </button>
      </div>
      {!collapsed && (
        <div className="flex-1 overflow-auto min-h-0">
          {tab === 'trades' && <OpenTradesTable />}
          {tab === 'history' && <TradeHistoryTable />}
        </div>
      )}
    </div>
  );
}

/** Right rail below the ticket — Quotex "Trades | History" tabs. */
function RailTabs() {
  const { accountId } = useTerminal();
  const [tab, setTab] = useState<'trades' | 'history'>('trades');
  const { data: open } = useQuery({ queryKey: ['options', 'open', accountId], queryFn: () => get<OptionTrade[]>('/api/v1/options/open', accountId ? { accountId } : {}), refetchInterval: 3000 });
  return (
    <div className="flex flex-col min-h-0 border-t border-line">
      <div className="flex items-center border-b border-line px-1 shrink-0 h-9">
        <button onClick={() => setTab('trades')} data-active={tab === 'trades'} className="ax-wtab !h-9">Trades {!!open?.length && <span className="ax-num text-[10px] bg-warn/15 text-warn rounded px-1.5 py-[1px]">{open.length}</span>}</button>
        <button onClick={() => setTab('history')} data-active={tab === 'history'} className="ax-wtab !h-9">◷</button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {tab === 'trades' ? <OpenTradesList accountId={accountId} /> : <div className="text-[11px]"><TradeHistoryTable pageSize={12} compact /></div>}
      </div>
    </div>
  );
}

function MobileTrade() {
  const [tab, setTab] = useState<'chart' | 'markets' | 'trade' | 'trades'>('chart');
  return (
    <div className="flex flex-col h-[calc(100dvh-52px-56px)] min-h-[480px]">
      <SymbolStrip />
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'chart' && <PriceChart />}
        {tab === 'markets' && <div className="h-full overflow-hidden bg-base-900"><Watchlist /></div>}
        {tab === 'trade' && <div className="h-full overflow-hidden bg-base-900"><Ticket /></div>}
        {tab === 'trades' && <div className="h-full overflow-auto bg-base-900"><OpenTradesTable compact /><div className="ax-rule" /><TradeHistoryTable pageSize={15} compact /></div>}
      </div>
      <div className="grid grid-cols-4 border-t border-line bg-base-900 shrink-0">
        {[['chart', 'Chart'], ['markets', 'Markets'], ['trade', 'Trade'], ['trades', 'Trades']].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v as never)} className={clsx('py-2.5 text-[10px] font-bold uppercase tracking-wide border-t-2 transition', tab === v ? 'text-accent-300 border-accent-500' : 'text-mute border-transparent')}>{l}</button>
        ))}
      </div>
    </div>
  );
}

export function Trading() {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileTrade />;

  return (
    <div className="h-[calc(100vh-52px)] min-h-[560px] flex flex-col">
      <SymbolStrip />
      <div className="flex-1 grid grid-cols-[minmax(0,1fr)_296px] lg:grid-cols-[248px_minmax(0,1fr)_296px] min-h-0">
        {/* watchlist */}
        <div className="border-r border-line bg-base-900 min-h-0 overflow-hidden hidden lg:block">
          <Watchlist />
        </div>
        {/* chart + workspace */}
        <div className="flex flex-col min-h-0 min-w-0">
          <div className="flex-[1.6] min-h-[280px] relative">
            <PriceChart />
          </div>
          <div className="flex-1 min-h-[190px] border-t border-line overflow-hidden">
            <Workspace />
          </div>
        </div>
        {/* ticket + running trades (Quotex right rail) */}
        <div className="border-l border-line bg-base-900 min-h-0 overflow-hidden grid grid-rows-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <div className="min-h-0 overflow-hidden"><Ticket /></div>
          <RailTabs />
        </div>
      </div>
    </div>
  );
}
