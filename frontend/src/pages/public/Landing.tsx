import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get } from '../../lib/api';
import { fmtPrice, fmtPct, clsUpDown } from '../../lib/format';
import { clsx } from 'clsx';
import { useState } from 'react';
import { effectivePayoutPct, type PayoutRules } from '../../lib/options';
import { useUsdInr, fmtInr } from '../../lib/fx';

interface Asset { symbol: string; name: string; category: string; tick: { mid: number; changePct24h: number } | null }
interface Candle { open: number; high: number; low: number; close: number; openTime: number }

function useAssets() {
  return useQuery({
    queryKey: ['pub-assets'],
    queryFn: () => get<{ demo: boolean; assets: Asset[] }>('/api/v1/assets'),
    refetchInterval: 4000,
  });
}

interface OptionsCfg { minDurationSec: number; maxDurationSec: number; assets: Array<{ symbol: string; payoutPct: number; minStake: number; enabled: boolean }> }

/** Live product facts: payout range, trade lengths, minimum investment — straight from the server. */
function useProductFacts() {
  const { data } = useQuery({ queryKey: ['pub-options-config'], queryFn: () => get<OptionsCfg>('/api/v1/options/config'), staleTime: 60_000 });
  const live = (data?.assets ?? []).filter((a) => a.enabled);
  const fmtDur = (sec: number) => (sec < 60 ? `${sec}s` : sec < 3600 ? `${sec / 60}m` : `${sec / 3600}h`);
  return {
    ready: !!data,
    maxPayout: live.length ? Math.max(...live.map((a) => a.payoutPct)) : null,
    payoutOf: (sym: string) => data?.assets.find((a) => a.symbol === sym)?.payoutPct ?? null,
    minStake: live.length ? Math.min(...live.map((a) => a.minStake)) : null,
    durations: data ? `${fmtDur(data.minDurationSec)}–${fmtDur(data.maxDurationSec)}` : '—',
  };
}

function TickerTape() {
  const { data } = useAssets();
  const fx = useUsdInr();
  const items = data?.assets ?? [];
  if (!items.length) return <div className="h-9 border-b border-line bg-base-900" />;
  const row = [...items, ...items];
  const fxItem = (k: string) => fx && (
    <span key={k} className="flex items-center gap-2 px-5 text-[11px] ax-num whitespace-nowrap" title={`Source: ${fx.source}, ${fx.date}`}>
      <span className="font-bold text-ink1">USD/INR</span>
      <span className="text-fog">₹{fx.rate.toFixed(2)}</span>
      <span className="text-mute">{fx.isLive ? 'live rate' : 'indicative'}</span>
    </span>
  );
  return (
    <div className="h-9 border-b border-line bg-base-900 overflow-hidden relative">
      <div className="tape-track flex items-center h-9 w-max">
        {fxItem('fx-a')}
        {row.map((a, i) => (
          <span key={`${a.symbol}-${i}`} className="flex items-center gap-2 px-5 text-[11px] ax-num whitespace-nowrap">
            <span className="font-bold text-ink1">{a.symbol}</span>
            <span className="text-fog">{a.tick ? fmtPrice(a.tick.mid) : '—'}</span>
            <span className={clsx('font-semibold', clsUpDown(a.tick?.changePct24h))}>{fmtPct(a.tick?.changePct24h)}</span>
          </span>
        )).flatMap((el, i) => (i === items.length - 1 ? [el, fxItem('fx-b')] : [el]))}
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
  const facts = useProductFacts();
  const btcPayout = facts.payoutOf('BTC/USD');
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
        </div>
        <div className="border-l border-line p-2 space-y-1.5 text-[10px]">
          <div className="rounded bg-base-800 border border-line px-2 py-1"><div className="text-mute text-[9px]">Time</div><div className="ax-num font-bold">00:01:00</div></div>
          <div className="rounded bg-base-800 border border-line px-2 py-1"><div className="text-mute text-[9px]">Investment</div><div className="ax-num font-bold">$10</div></div>
          <div className="text-center ax-num font-bold text-up text-[13px] pt-0.5">{btcPayout != null ? `+${btcPayout}%` : '—'}</div>
          <span className="block text-center font-bold bg-up text-cream rounded py-1.5">Up ↗</span>
          <span className="block text-center font-bold bg-down text-cream rounded py-1.5">Down ↘</span>
        </div>
      </div>
      <div className="border-t border-line px-3 h-9 flex items-center gap-4 text-[10px] ax-num">
        <span className="font-bold">BTC/USD</span>
        <span className="text-mute">Price {assets[0]?.tick ? fmtPrice(assets[0].tick.mid) : '—'}</span>
        <span className="text-mute ml-auto">Payout known before you trade</span>
      </div>
    </div>
  );
}

interface CalcCfg {
  durations: number[];
  payoutRules?: PayoutRules;
  assets: Array<{ symbol: string; payoutPct: number; minStake: number; maxStake: number; enabled: boolean; otc?: boolean }>;
}

const CALC_STAKES = [10, 25, 50, 100, 250];
const CALC_LENGTHS = [30, 60, 300, 900, 3600];
const fmtLen = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${s / 60} min` : `${s / 3600} h`);
const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** What a trade returns, with the platform's real payouts (including any trade-length rules). */
function PayoutCalculator() {
  const fx = useUsdInr();
  const inr = (usd: number) => (fx ? fmtInr(usd, fx.rate) : '');
  const { data: cfg } = useQuery({ queryKey: ['pub-options-config'], queryFn: () => get<CalcCfg>('/api/v1/options/config'), staleTime: 60_000 });
  const markets = (cfg?.assets ?? []).filter((a) => a.enabled);
  const [symbol, setSymbol] = useState('BTC/USD');
  const [stake, setStake] = useState(10);
  const [len, setLen] = useState(60);
  const m = markets.find((a) => a.symbol === symbol) ?? markets[0];
  const lengths = CALC_LENGTHS.filter((l) => !cfg || cfg.durations.includes(l));
  const pct = m ? effectivePayoutPct(m.payoutPct, len, m.otc ?? true, cfg?.payoutRules) : null;
  const profit = pct != null ? Math.round(stake * pct) / 100 : null;
  const tooSmall = !!m && stake < m.minStake;

  const chip = (active: boolean) => clsx('h-8 px-3 rounded text-[12px] font-semibold ax-num border transition', active ? 'bg-accent-600 border-accent-600 text-cream' : 'border-line text-fog hover:text-ink1 hover:bg-white/[0.05]');

  return (
    <div className="ax-panel p-5">
      <div className="flex items-center justify-between">
        <div className="ax-micro">Return calculator</div>
        <span className="text-[10px] text-mute">live payouts</span>
      </div>

      <label className="ax-label mt-4" htmlFor="calc-market">Market</label>
      <select id="calc-market" className="ax-input" value={m?.symbol ?? ''} onChange={(e) => setSymbol(e.target.value)}>
        {markets.map((a) => <option key={a.symbol} value={a.symbol}>{a.symbol} — {a.payoutPct}% payout</option>)}
      </select>

      <div className="ax-label mt-4">Investment</div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Investment">
        {CALC_STAKES.map((v) => <button key={v} type="button" aria-pressed={stake === v} onClick={() => setStake(v)} className={chip(stake === v)}>${v}</button>)}
      </div>

      <div className="ax-label mt-4">Trade length</div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Trade length">
        {lengths.map((v) => <button key={v} type="button" aria-pressed={len === v} onClick={() => setLen(v)} className={chip(len === v)}>{fmtLen(v)}</button>)}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-1.5 text-center" aria-live="polite">
        <div className="rounded border border-up/30 bg-updim/40 px-2 py-3">
          <div className="text-[10px] uppercase tracking-[0.08em] text-mute">If right</div>
          <div className="ax-num text-[17px] font-bold text-up mt-1">{profit != null ? money(stake + profit) : '—'}</div>
          <div className="ax-num text-[10.5px] text-fog">{profit != null ? `+${money(profit)} profit` : ''}</div>
          {fx && profit != null && <div className="ax-num text-[10.5px] text-mute">≈ {inr(stake + profit)}</div>}
        </div>
        <div className="rounded border border-line bg-base-850 px-2 py-3">
          <div className="text-[10px] uppercase tracking-[0.08em] text-mute">If equal</div>
          <div className="ax-num text-[17px] font-bold text-ink1 mt-1">{money(stake)}</div>
          <div className="text-[10.5px] text-fog">returned</div>
          {fx && <div className="ax-num text-[10.5px] text-mute">≈ {inr(stake)}</div>}
        </div>
        <div className="rounded border border-down/30 bg-downdim/40 px-2 py-3">
          <div className="text-[10px] uppercase tracking-[0.08em] text-mute">If wrong</div>
          <div className="ax-num text-[17px] font-bold text-down mt-1">{money(0)}</div>
          <div className="ax-num text-[10.5px] text-fog">−{money(stake)}</div>
          {fx && <div className="ax-num text-[10.5px] text-mute">≈ −{inr(stake)}</div>}
        </div>
      </div>
      <p className="text-[11px] text-mute mt-3 leading-relaxed">
        {pct != null ? `${m?.symbol}, ${fmtLen(len)}: ${pct}% payout. ` : ''}
        {tooSmall ? `Minimum investment on this market is $${m?.minStake}. ` : ''}
        The payout is confirmed in the terminal before you trade and locked when the trade opens.
        {fx ? ` ₹ amounts at 1 USD = ₹${fx.rate.toFixed(2)} (${fx.isLive ? 'live rate' : 'indicative'}, ${fx.date}).` : ''}
      </p>
    </div>
  );
}

interface RecentTrade { id: string; symbol: string; direction: 'UP' | 'DOWN'; durationSec: number; payoutPct: number; result: 'WON' | 'LOST' | 'TIE'; settledAt: string | null }

function ago(iso: string | null): string {
  if (!iso) return '';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
}

/** Real settled live-account trades, newest first. No names, no amounts. Hidden when there are none. */
function RecentResults() {
  const { data } = useQuery({ queryKey: ['pub-recent-trades'], queryFn: () => get<{ trades: RecentTrade[] }>('/api/v1/public/recent-trades'), refetchInterval: 10_000 });
  const trades = data?.trades ?? [];
  if (!trades.length) return null;
  const won = trades.filter((t) => t.result === 'WON').length;
  const decided = trades.filter((t) => t.result !== 'TIE').length;
  return (
    <section className="border-t border-line">
      <div className="max-w-[1240px] mx-auto px-4 py-11">
        <div className="flex items-end justify-between flex-wrap gap-2">
          <div>
            <div className="ax-micro">Live results</div>
            <h2 className="ax-h1 text-[26px] mt-1.5">The last {trades.length} live trades, as they settled</h2>
          </div>
          <div className="text-xs text-mute">Wins in this sample: <span className="text-ink1 ax-num">{won}/{decided}</span> · losses happen too</div>
        </div>
        <div className="ax-panel mt-5 overflow-x-auto">
          <table className="w-full">
            <thead><tr>{['Market', 'Direction', 'Length', 'Payout', 'Result', 'Settled'].map((h) => <th key={h} className="ax-th">{h}</th>)}</tr></thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id} className="ax-row">
                  <td className="ax-td font-semibold">{t.symbol}</td>
                  <td className={clsx('ax-td font-semibold', t.direction === 'UP' ? 'text-up' : 'text-down')}>{t.direction === 'UP' ? '▲ Up' : '▼ Down'}</td>
                  <td className="ax-td ax-num text-fog">{t.durationSec < 60 ? `${t.durationSec}s` : `${Math.round(t.durationSec / 60)} min`}</td>
                  <td className="ax-td ax-num text-fog">{t.payoutPct}%</td>
                  <td className={clsx('ax-td font-semibold', t.result === 'WON' ? 'text-up' : t.result === 'LOST' ? 'text-down' : 'text-fog')}>
                    {t.result === 'WON' ? `Won +${t.payoutPct}%` : t.result === 'LOST' ? 'Lost' : 'Tie · returned'}
                  </td>
                  <td className="ax-td text-mute ax-num">{ago(t.settledAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-mute mt-2">Real live-account trades settled by the platform. Trader names and amounts are never shown.</p>
      </div>
    </section>
  );
}

export function Landing() {
  const { data } = useAssets();
  const assets = data?.assets ?? [];
  const facts = useProductFacts();
  const fx = useUsdInr();

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
              Fixed-time trading on crypto, forex and gold. Choose Up or Down, pick how long,
              and see your payout before you trade. Every trade is settled by the server on the
              price live at the exact expiry.
            </p>
            <div className="flex flex-wrap gap-2.5 mt-6">
              <Link to="/register" className="ax-btn-primary !h-11 !px-6">Open free account →</Link>
              <Link to="/markets" className="ax-btn-ghost !h-11 !px-6">View live markets</Link>
            </div>
            <p className="text-[11.5px] text-mute mt-3 max-w-[480px] leading-relaxed">
              <span className="text-warn font-semibold">Risk warning:</span> you can lose the full amount of every trade.
              Practise first on the free demo account. <Link to="/risk" className="underline hover:text-fog">Read the risk disclosure</Link>.
            </p>
            <div className="flex gap-8 mt-8 pt-6 border-t border-line">
              {[[assets.length ? String(assets.length) : '—', 'Markets'], [facts.maxPayout != null ? `${facts.maxPayout}%` : '—', 'Top payout'], [facts.durations, 'Trade length']].map(([v, l]) => (
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

      <RecentResults />

      {/* know your return + terminal tools */}
      <section className="max-w-[1240px] mx-auto px-4 py-11 grid lg:grid-cols-[1fr_440px] gap-10 items-start">
        <div>
          <div className="ax-micro">Know your numbers</div>
          <h2 className="ax-h1 text-[30px] mt-1.5">Work out your return before you trade</h2>
          <p className="ax-lead text-sm mt-2.5 max-w-[500px]">Pick a market, an amount and a trade length to see exactly what comes back in each outcome — using the payouts the platform is offering right now.</p>
          <div className="ax-micro mt-8">Inside the terminal</div>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4 mt-3">
            {[
              ['Timer or clock time', 'Run a trade for a set duration, or have it close on an exact minute.'],
              ['Pending trades', 'Set a price level; the trade opens by itself when the market reaches it.'],
              ['Indicators & drawings', 'SMA, EMA, Bollinger, SAR, Supertrend, MACD — plus trend lines and Fibonacci.'],
              ['Signals', 'Indicator-based Up/Down readings across timeframes, to inform — not replace — your decision.'],
              ['Keyboard trading', 'Shift+W for Up, Shift+S for Down, and shortcuts for amount and time.'],
              ['Percentage stakes', 'Invest a fixed amount or a percentage of your available balance.'],
            ].map(([t, d]) => (
              <div key={t}>
                <div className="text-[13px] font-semibold">{t}</div>
                <div className="text-xs text-mute mt-0.5 leading-relaxed">{d}</div>
              </div>
            ))}
          </div>
        </div>
        <PayoutCalculator />
      </section>

      {/* demo vs live */}
      <section className="border-t border-line">
        <div className="max-w-[1240px] mx-auto px-4 py-11">
          <div className="ax-micro">Two accounts, one login</div>
          <h2 className="ax-h1 text-[30px] mt-1.5">Practise free. Trade live when you are ready.</h2>
          <div className="grid md:grid-cols-2 gap-2.5 mt-5">
            <div className="ax-panel p-5">
              <div className="flex items-center gap-2"><span className="text-[10px] font-bold tracking-[0.12em] uppercase text-warn">Demo account</span><span className="text-[10px] text-mute">· practice money</span></div>
              <div className="font-display text-[22px] mt-2">$10,000 to learn with{fx && <span className="text-[14px] text-mute font-sans ml-2">≈ {fmtInr(10000, fx.rate)}</span>}</div>
              <ul className="mt-3 space-y-1.5 text-xs text-fog">
                {['Same markets, prices and charts as live', 'Top up the practice balance any time', 'No deposit, no card, nothing to lose', 'Demo results are never shown on the public leaderboard'].map((t) => <li key={t} className="flex gap-2"><span className="text-accent-300">–</span>{t}</li>)}
              </ul>
            </div>
            <div className="ax-panel p-5">
              <div className="flex items-center gap-2"><span className="text-[10px] font-bold tracking-[0.12em] uppercase text-up">Live account</span><span className="text-[10px] text-mute">· real money</span></div>
              <div className="font-display text-[22px] mt-2">Deposits verified, withdrawals reviewed</div>
              <ul className="mt-3 space-y-1.5 text-xs text-fog">
                {[fx ? `Deposit in ₹ by UPI at the live rate (now 1 USD = ₹${fx.rate.toFixed(2)}), or by bank transfer or crypto` : 'Deposit by UPI, bank transfer or crypto (where offered)', 'Your balance is credited once the payment is confirmed', 'Withdraw from your live balance; each request is reviewed before payout', 'Starts at $0 — only money you deposit is ever at risk'].map((t) => <li key={t} className="flex gap-2"><span className="text-accent-300">–</span>{t}</li>)}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* steps */}
      <section className="border-t border-line bg-base-900/60">
        <div className="max-w-[1240px] mx-auto px-4 py-11">
          <div className="ax-micro">Getting started</div>
          <h2 className="ax-h1 text-[30px] mt-1.5">Your first trade in under a minute</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mt-5">
            {[
              ['01', 'Create account', 'One short form. Free $10,000 demo balance to practise with.'],
              ['02', 'Pick a market', 'BTC, ETH, majors and gold with live candles.'],
              ['03', 'Pick time & amount', `Choose a trade length (${facts.durations}), set your investment, press Up or Down.`],
              ['04', 'Settle at expiry', `Right direction → investment + payout${facts.maxPayout != null ? ` (up to ${facts.maxPayout}%)` : ''}. Wrong → investment lost. Equal → returned.`],
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
              <div className="font-display text-[22px]">Start with $10,000 in practice funds.</div>
              <div className="text-xs mt-1 opacity-70">Free account · no card required · switch to live when you are ready.</div>
            </div>
            <Link to="/register" className="inline-flex items-center justify-center h-11 px-6 rounded text-[13px] font-semibold bg-cream text-accent-600 hover:bg-white transition whitespace-nowrap">Create free account</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
