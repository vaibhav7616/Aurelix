import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get } from '../../lib/api';
import { fmtPrice, fmtPct, clsUpDown } from '../../lib/format';
import { clsx } from 'clsx';

interface Asset { symbol: string; name: string; category: string; tick: { mid: number; changePct24h: number } | null }
interface Candle { open: number; high: number; low: number; close: number; openTime: number }

function useAssets() {
  return useQuery({
    queryKey: ['pub-assets'],
    queryFn: () => get<{ demo: boolean; assets: Asset[] }>('/api/v1/assets'),
    refetchInterval: 4000,
  });
}

function TickerTape() {
  const { data } = useAssets();
  const items = data?.assets ?? [];
  if (!items.length) return <div className="h-9 border-b border-line bg-base-900" />;
  const row = [...items, ...items];
  return (
    <div className="h-9 border-b border-line bg-base-900 overflow-hidden relative">
      <div className="tape-track flex items-center h-9 w-max">
        {row.map((a, i) => (
          <span key={`${a.symbol}-${i}`} className="flex items-center gap-2 px-5 text-[11px] ax-num whitespace-nowrap">
            <span className="font-bold text-ink1">{a.symbol}</span>
            <span className="text-fog">{a.tick ? fmtPrice(a.tick.mid) : '—'}</span>
            <span className={clsx('font-semibold', clsUpDown(a.tick?.changePct24h))}>{fmtPct(a.tick?.changePct24h)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Spark({ symbol, up }: { symbol: string; up: boolean }) {
  const { data } = useQuery({
    queryKey: ['spark', symbol],
    queryFn: () => get<{ candles: Candle[] }>('/api/v1/market/candles', { symbol, timeframe: '5m', limit: 40 }),
    refetchInterval: 30000,
    staleTime: 20000,
  });
  const closes = (data?.candles ?? []).map((c) => c.close);
  if (closes.length < 5) return <div className="skeleton h-10 w-full" />;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const rng = max - min || 1;
  const pts = closes.map((c, i) => `${(i / (closes.length - 1)) * 120},${36 - ((c - min) / rng) * 32}`).join(' ');
  return (
    <svg viewBox="0 0 120 40" className="h-10 w-full" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={up ? '#3CB179' : '#D4694E'} strokeWidth="1.5" />
    </svg>
  );
}

function TerminalMock() {
  const { data } = useAssets();
  const assets = (data?.assets ?? []).slice(0, 5);
  const { data: btc } = useQuery({
    queryKey: ['mock-btc'],
    queryFn: () => get<{ candles: Candle[] }>('/api/v1/market/candles', { symbol: 'BTC/USD', timeframe: '15m', limit: 42 }),
    refetchInterval: 30000,
  });
  const candles = btc?.candles ?? [];
  const min = candles.length ? Math.min(...candles.map((c) => c.low)) : 0;
  const max = candles.length ? Math.max(...candles.map((c) => c.high)) : 1;
  const rng = max - min || 1;
  const Y = (p: number) => 120 - ((p - min) / rng) * 108;

  return (
    <div className="ax-panel overflow-hidden shadow-pop">
      {/* mock topbar */}
      <div className="flex items-center gap-2 px-3 h-10 border-b border-line bg-base-900">
        <span className="text-[11px] font-bold ml-1">BTC/USD</span>
        <span className="ax-num text-[11px] font-bold text-up">{assets[0]?.tick ? fmtPrice(assets[0].tick.mid) : '—'}</span>
        <span className="ml-auto flex gap-1">{['1m', '5m', '15m', '1h'].map((t) => <span key={t} className={clsx('text-[10px] px-1.5 py-[3px] rounded', t === '15m' ? 'bg-accent-600/10 text-accent-300 font-semibold' : 'text-mute')}>{t}</span>)}</span>
      </div>
      <div className="grid grid-cols-[130px_1fr_120px] h-[220px]">
        <div className="border-r border-line py-1">
          {assets.map((a) => (
            <div key={a.symbol} className="px-2.5 py-[7px] border-b border-white/[0.06]">
              <div className="text-[10px] font-bold">{a.symbol}</div>
              <div className="flex justify-between items-center mt-[1px]">
                <span className="ax-num text-[10px] text-fog">{a.tick ? fmtPrice(a.tick.mid) : '—'}</span>
                <span className={clsx('ax-num text-[10px] font-semibold', clsUpDown(a.tick?.changePct24h))}>{fmtPct(a.tick?.changePct24h)}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="p-2 relative">
          <svg viewBox="0 0 300 128" className="w-full h-full" preserveAspectRatio="none">
            {[0.15, 0.4, 0.65, 0.9].map((f) => <line key={f} x1="0" y1={128 * f} x2="300" y2={128 * f} stroke="rgba(246,241,228,0.08)" strokeWidth="0.5" />)}
            {candles.map((c, i) => {
              const x = 4 + i * ((292 / Math.max(1, candles.length - 1)) || 0);
              const up = c.close >= c.open;
              return (
                <g key={i}>
                  <line x1={x} y1={Y(c.high)} x2={x} y2={Y(c.low)} stroke={up ? "#2FA36B" : "#8FAE94"} strokeWidth="1" />
                  <rect
                    x={x - 2.4} y={Y(Math.max(c.open, c.close))} width="4.8"
                    height={Math.max(1.5, Math.abs(Y(c.open) - Y(c.close)))}
                    fill={up ? '#2FA36B' : '#1A211B'} stroke={up ? "#2FA36B" : "#8FAE94"} strokeWidth={up ? 0 : 1} rx="0.5"
                  />
                </g>
              );
            })}
          </svg>
          <span className="absolute top-3 left-4 text-[9px] font-bold tracking-[0.18em] text-warn">ORDER BLOCK</span>
        </div>
        <div className="border-l border-line p-2 space-y-1.5">
          <div className="grid grid-cols-2 gap-1">
            <span className="text-center text-[10px] font-bold bg-accent-600 text-cream rounded py-1">BUY</span>
            <span className="text-center text-[10px] font-bold bg-down text-cream rounded py-1">SELL</span>
          </div>
          <div className="h-7 rounded bg-base-800 border border-line" />
          <div className="grid grid-cols-2 gap-1"><div className="h-7 rounded bg-base-800 border border-line" /><div className="h-7 rounded bg-base-800 border border-line" /></div>
          <div className="h-8 rounded bg-accent-600" />
          <div className="text-[9px] text-mute ax-num">Risk −$12.40 · Fee $0.25</div>
        </div>
      </div>
      <div className="border-t border-line px-3 h-9 flex items-center gap-4 text-[10px] ax-num">
        <span className="font-bold">BTC/USD <span className="text-up">BUY</span></span>
        <span className="text-mute">Entry {assets[0]?.tick ? fmtPrice(assets[0].tick.mid) : '—'}</span>
        <span className="text-up font-bold ml-auto">+$24.18</span>
      </div>
    </div>
  );
}

export function Landing() {
  const { data } = useAssets();
  const assets = data?.assets ?? [];

  return (
    <div>
      <TickerTape />
      {/* hero */}
      <section className="max-w-[1240px] mx-auto px-4 pt-8 pb-12">
        <div className="flex items-center justify-between">
          <span className="ax-eyebrow">Aurelix · Trading terminal</span>
          <span className="text-[10px] font-semibold tracking-[0.2em] uppercase border border-line rounded-sm px-2.5 py-1.5 text-fog">Live markets</span>
        </div>
        <div className="grid lg:grid-cols-[1fr_1.1fr] gap-10 items-center mt-6">
          <div>
            <h1 className="ax-h1 text-[40px] sm:text-[52px] leading-[1.04]">
              Read the market.<br />Take the trade.
            </h1>
            <p className="ax-lead text-[15px] mt-4 max-w-[480px]">
              Aurelix is a complete trading terminal with a real order engine — live quotes,
              server-side settlement at expiry, fixed payouts and a ledger-grade wallet.
              Crypto, forex and gold.
            </p>
            <div className="flex flex-wrap gap-2.5 mt-6">
              <Link to="/register" className="ax-btn-primary !h-11 !px-6">Open free account →</Link>
              <Link to="/markets" className="ax-btn-ghost !h-11 !px-6">View live markets</Link>
            </div>
            <div className="flex gap-8 mt-8 pt-6 border-t border-line">
              {[['6', 'Tradable assets'], ['1s', 'Quote refresh'], ['24/7', 'Market access']].map(([v, l]) => (
                <div key={l}><div className="font-display text-[26px] leading-none">{v}</div><div className="ax-micro mt-1.5">{l}</div></div>
              ))}
            </div>
          </div>
          <TerminalMock />
        </div>
      </section>

      {/* markets strip */}
      <section className="border-y border-line bg-base-900/60">
        <div className="max-w-[1240px] mx-auto px-4 py-9">
          <div className="flex items-end justify-between">
            <div>
              <div className="ax-micro">Live quotes</div>
              <h2 className="ax-h1 text-[26px] mt-1.5">Markets, streaming now</h2>
            </div>
            <Link to="/markets" className="text-xs font-semibold text-accent-300 hover:underline">All markets →</Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5 mt-5">
            {assets.slice(0, 6).map((a) => {
              const up = (a.tick?.changePct24h ?? 0) >= 0;
              return (
                <Link key={a.symbol} to="/register" className="ax-panel p-3.5 ax-card-hover grid grid-cols-[1fr_110px] gap-2 items-center">
                  <div>
                    <div className="text-[13px] font-bold">{a.symbol}</div>
                    <div className="text-[10px] text-mute">{a.name}</div>
                    <div className="ax-num text-lg font-bold mt-1.5">{a.tick ? fmtPrice(a.tick.mid) : '—'}</div>
                    <div className={clsx('ax-num text-[11px] font-bold', clsUpDown(a.tick?.changePct24h))}>{fmtPct(a.tick?.changePct24h)}</div>
                  </div>
                  <Spark symbol={a.symbol} up={up} />
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* engine */}
      <section className="max-w-[1240px] mx-auto px-4 py-11 grid lg:grid-cols-2 gap-8 items-start">
        <div>
          <div className="ax-micro">Execution architecture</div>
          <h2 className="ax-h1 text-[30px] mt-1.5">Built like real market infrastructure</h2>
          <p className="ax-lead text-sm mt-2.5 max-w-[440px]">Every ticket travels through authentication, live re-pricing, ten risk gates, and an atomic order → position → ledger write. Stops are watched on the server tick stream.</p>
          <div className="mt-5 space-y-2.5">
            {[
              ['Server-side expiry', 'Trades settle at the exact expiry tick even if your browser is closed.'],
              ['Risk engine', 'Balance, loss caps, position limits — enforced before any fill.'],
              ['Ledger wallet', 'Every cent traceable: deposits, fills, fees, adjustments.'],
              ['Idempotent orders', 'Double-clicks and retries never create duplicate trades.'],
            ].map(([t, d]) => (
              <div key={t} className="flex gap-3">
                <span className="w-5 h-5 rounded bg-up/15 text-up text-[11px] font-bold flex items-center justify-center shrink-0 mt-[1px]">✓</span>
                <div><div className="text-[13px] font-semibold">{t}</div><div className="text-xs text-mute">{d}</div></div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded shadow-pop p-4 font-mono text-xs leading-relaxed bg-[#0D120D] text-cream border border-line">
          <div className="flex justify-between text-[11px] mb-2"><span className="opacity-60">order lifecycle</span><span className="text-[#8FB699]">● live</span></div>
          <pre className="whitespace-pre-wrap opacity-90">{`POST /api/v1/options  →  201 Created
  ├─ auth + validation
  ├─ re-price @ live quote (client price ignored)
  ├─ risk: balance · limits · loss caps
  ├─ txn: order + position + ledger
  └─ ws → position:opened

tick → compare to entry → settle at expiry
  └─ auto-close → trade + ledger + balance:updated`}</pre>
          <div className="mt-3 pt-3 border-t border-cream/15 grid grid-cols-3 gap-2 text-center">
            {[['<50ms', 'Order path'], ['1s', 'Tick loop'], ['100%', 'Server-priced']].map(([v, l]) => (
              <div key={l}><div className="text-sm font-bold ax-num">{v}</div><div className="text-[10px] opacity-60">{l}</div></div>
            ))}
          </div>
        </div>
      </section>

      {/* steps */}
      <section className="border-t border-line bg-base-900/60">
        <div className="max-w-[1240px] mx-auto px-4 py-11">
          <div className="ax-micro">Getting started</div>
          <h2 className="ax-h1 text-[30px] mt-1.5">First fill in under a minute</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mt-5">
            {[
              ['01', 'Create account', 'One form. Instant $10,000 balance.'],
              ['02', 'Pick a market', 'BTC, ETH, majors and gold with live candles.'],
              ['03', 'Pick time & amount', 'Choose an expiry from 5s to 4h, set your investment, press Up or Down.'],
              ['04', 'Settle at expiry', 'Right direction → stake + payout (up to 85%). Wrong → stake lost. Equal → returned.'],
            ].map(([n, t, d]) => (
              <div key={n} className="ax-panel p-4">
                <div className="text-[11px] font-bold ax-num text-warn">{n}</div>
                <div className="font-display text-[19px] mt-1.5">{t}</div>
                <div className="text-xs text-mute mt-1 leading-relaxed">{d}</div>
              </div>
            ))}
          </div>
          <div className="ax-cta-band mt-2.5 p-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <div className="font-display text-[22px]">Evaluate the platform with a free account.</div>
              <div className="text-xs mt-1 opacity-70">Free account · no card required.</div>
            </div>
            <Link to="/register" className="inline-flex items-center justify-center h-11 px-6 rounded text-[13px] font-semibold bg-cream text-accent-600 hover:bg-white transition whitespace-nowrap">Create free account</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
