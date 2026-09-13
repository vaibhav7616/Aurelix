import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '../../lib/api';
import { useTerminal } from '../../stores/terminalStore';
import { subscribeMarket } from '../../services/socket';
import { fmtPrice, fmtPct } from '../../lib/format';
import { clsx } from 'clsx';
import { TableSkeleton } from '../ui/primitives';

interface AssetTick { symbol: string; mid: number; bid: number; ask: number; changePct24h: number; ts: number }
export interface AssetRow { symbol: string; name: string; category: string; enabled: boolean; payoutPct?: number; tick: AssetTick | null }

const CATS = ['ALL', 'FAV', 'CRYPTO', 'FOREX', 'METALS', 'INDICES'] as const;

function Row({ a, active, onPick }: { a: AssetRow; active: boolean; onPick: () => void }) {
  const { ticks, favorites, toggleFavorite } = useTerminal();
  const live = ticks[a.symbol];
  const mid = live?.mid ?? a.tick?.mid ?? 0;
  const chg = live?.changePct24h ?? a.tick?.changePct24h ?? 0;
  const prev = useRef(mid);
  const [flash, setFlash] = useState<'' | 'flash-up' | 'flash-down'>('');
  useEffect(() => {
    if (mid === prev.current || !prev.current) { prev.current = mid; return; }
    setFlash(mid > prev.current ? 'flash-up' : 'flash-down');
    prev.current = mid;
    const t = setTimeout(() => setFlash(''), 600);
    return () => clearTimeout(t);
  }, [mid]);
  const fav = favorites.includes(a.symbol);

  return (
    <div
      onClick={() => a.enabled && onPick()}
      className={clsx(
        'group grid grid-cols-[1fr_auto] items-center gap-1 px-2.5 py-[7px] border-b border-white/[0.06] transition cursor-pointer',
        active ? 'bg-accent-500/[0.08] border-l-2 border-l-accent-500' : 'border-l-2 border-l-transparent hover:bg-white/[0.04]',
        !a.enabled && 'opacity-40 cursor-not-allowed'
      )}
    >
      <div className="min-w-0 flex items-center gap-1.5">
        <button
          onClick={(e) => { e.stopPropagation(); toggleFavorite(a.symbol); }}
          className={clsx('text-[11px] leading-none shrink-0', fav ? 'text-accent-300' : 'text-mute/30 opacity-0 group-hover:opacity-100 hover:text-accent-300')}
          title={fav ? 'Remove from favorites' : 'Add to favorites'}
        >★</button>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold tracking-tight">{a.symbol}</span>
            <span className={clsx('w-1 h-1 rounded-full shrink-0', a.enabled ? 'bg-up' : 'bg-down')} title={a.enabled ? 'Tradable' : 'Halted'} />
            {a.payoutPct != null && <span className="ax-num text-[9.5px] font-bold text-warn/90 leading-none" title="Payout on a winning trade">{a.payoutPct}%</span>}
          </div>
          <div className="text-[10px] text-mute truncate">{a.name}</div>
        </div>
      </div>
      <div className="text-right">
        <div className={clsx('ax-num text-xs font-bold leading-tight px-1', flash)}>{mid ? fmtPrice(mid) : '—'}</div>
        <div className={clsx('ax-num text-[10px] font-semibold leading-tight mt-[3px]', chg >= 0 ? 'text-up' : 'text-down')}>{fmtPct(chg)}</div>
      </div>
    </div>
  );
}

export function Watchlist() {
  const { symbol, setSymbol, favorites } = useTerminal();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<(typeof CATS)[number]>('ALL');
  const { data, isLoading } = useQuery({
    queryKey: ['assets'],
    queryFn: () => get<{ demo: boolean; assets: AssetRow[] }>('/api/v1/assets'),
    refetchInterval: 30000,
  });
  const assets = data?.assets ?? [];

  useEffect(() => {
    if (assets.length) subscribeMarket(assets.map((a) => a.symbol));
  }, [assets.length]);

  const filtered = assets.filter((a) => {
    if (cat === 'FAV' && !favorites.includes(a.symbol)) return false;
    if (cat !== 'ALL' && cat !== 'FAV' && a.category !== cat) return false;
    if (q && !`${a.symbol} ${a.name}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-2.5 pt-2.5 pb-2 border-b border-line space-y-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search symbols…" className="ax-input !h-8 !text-xs" />
        <div className="flex gap-0.5 flex-wrap">
          {CATS.map((c) => (
            <button key={c} onClick={() => setCat(c)} data-active={cat === c} className="ax-pill !text-[10px] uppercase">
              {c === 'FAV' ? '★' : c === 'ALL' ? 'All' : c.charAt(0) + c.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading && <TableSkeleton rows={8} cols={2} />}
        {!isLoading && filtered.map((a) => (
          <Row key={a.symbol} a={a} active={a.symbol === symbol} onPick={() => setSymbol(a.symbol)} />
        ))}
        {!isLoading && !filtered.length && (
          <div className="text-center text-mute text-xs py-10">{cat === 'FAV' ? 'No favorites yet — hover a row and click ★.' : 'No symbols match.'}</div>
        )}
      </div>
      <div className="px-2.5 py-1.5 border-t border-line text-[10px] text-mute ax-num">
        {assets.filter((a) => a.enabled).length}/{assets.length} tradable
      </div>
    </div>
  );
}
