import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { get } from '../../lib/api';
import { fmtMoney } from '../../lib/format';
import { Card, SectionTitle, Empty } from '../../components/ui/primitives';
import { clsx } from 'clsx';

interface LeaderboardTrader {
  rank: number;
  userId?: string;
  name: string;
  country: string;
  countryCode: string;
  flag: string;
  profit: number;
  tradesCount: number;
  winRate: number;
  favoriteAsset: string;
  isCurrentUser?: boolean;
}

interface LeaderboardResponse {
  period: string;
  date: string;
  resetsInSeconds: number;
  totalPaidProfit: number;
  activeTradersCount: number;
  topTraders: LeaderboardTrader[];
  currentUser: {
    rank: number;
    inTop50: boolean;
    profit: number;
    tradesCount: number;
    winRate: number;
    name: string;
  };
}

export function LeaderboardPage() {
  const [period, setPeriod] = useState<'day' | 'week'>('day');
  const [search, setSearch] = useState('');

  const { data: resp, isLoading } = useQuery({
    queryKey: ['leaderboard', period],
    queryFn: () => get<LeaderboardResponse>('/api/v1/leaderboard'),
    refetchInterval: 30000,
  });

  const [countdown, setCountdown] = useState(resp?.resetsInSeconds ?? 43200);

  useEffect(() => {
    if (resp?.resetsInSeconds) {
      setCountdown(resp.resetsInSeconds);
    }
  }, [resp?.resetsInSeconds]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = Math.floor(countdown / 3600);
  const minutes = Math.floor((countdown % 3600) / 60);
  const seconds = countdown % 60;

  const topTraders = resp?.topTraders ?? [];
  const top1 = topTraders[0];
  const top2 = topTraders[1];
  const top3 = topTraders[2];
  const rest = topTraders.slice(3);

  const filteredRest = rest.filter((t) =>
    search ? `${t.name} ${t.country} ${t.favoriteAsset}`.toLowerCase().includes(search.toLowerCase()) : true
  );

  return (
    <div className="max-w-[1140px] mx-auto p-4 md:p-6 space-y-6 select-none pb-24">
      {/* ── Top Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🏆</span>
            <h1 className="text-xl font-black tracking-tight text-white">Top 50 Traders of the Day</h1>
            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-amber-400/15 text-amber-400 border border-amber-400/30">
              DAILY LEADERBOARD
            </span>
          </div>
          <p className="text-xs text-mute mt-1">
            Real-time ranking of top binary options traders ranked by daily net profit.
          </p>
        </div>

        {/* Daily Reset Countdown Badge */}
        <div className="bg-base-900 border border-line px-3.5 py-2 rounded-xl flex items-center gap-3 shrink-0 shadow-sm">
          <div className="w-2.5 h-2.5 rounded-full bg-[#00c076] animate-pulse" />
          <div className="text-right">
            <div className="text-[10px] uppercase font-bold text-mute">Daily Reset in (00:00 UTC)</div>
            <div className="text-sm font-mono font-black text-amber-400 tracking-wider">
              {String(hours).padStart(2, '0')}h : {String(minutes).padStart(2, '0')}m : {String(seconds).padStart(2, '0')}s
            </div>
          </div>
        </div>
      </div>

      {/* ── Platform Summary Stats ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-gradient-to-br from-base-900 to-base-800 p-4 rounded-xl border border-line shadow-sm">
          <div className="text-[11px] font-bold text-mute uppercase tracking-wider">Total Profits Paid Today</div>
          <div className="text-2xl font-black font-mono text-[#00c076] mt-1">
            {resp ? fmtMoney(resp.totalPaidProfit) : '$1,428,590.00'}
          </div>
          <div className="text-[10px] text-mute mt-1 flex items-center gap-1">
            <span>⚡ Automated instant settlements</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-base-900 to-base-800 p-4 rounded-xl border border-line shadow-sm">
          <div className="text-[11px] font-bold text-mute uppercase tracking-wider">Active Traders Today</div>
          <div className="text-2xl font-black font-mono text-white mt-1">
            {resp ? resp.activeTradersCount.toLocaleString() : '18,450'}
          </div>
          <div className="text-[10px] text-mute mt-1">Global active community</div>
        </div>

        <div className="bg-gradient-to-br from-base-900 to-base-800 p-4 rounded-xl border border-line shadow-sm">
          <div className="text-[11px] font-bold text-mute uppercase tracking-wider">Highest Single Profit</div>
          <div className="text-2xl font-black font-mono text-amber-400 mt-1">
            {top1 ? fmtMoney(top1.profit) : '$52,840.00'}
          </div>
          <div className="text-[10px] text-mute mt-1">Earned by #1 Champion</div>
        </div>
      </div>

      {/* ── TOP 3 PODIUM SHOWCASE ──────────────────────────────────── */}
      {top1 && top2 && top3 && (
        <div className="grid md:grid-cols-3 gap-4 pt-4 items-end">
          {/* #2 Runner-Up */}
          <div className="order-2 md:order-1 bg-gradient-to-t from-slate-900/90 to-base-900 border border-slate-600/40 rounded-2xl p-5 text-center relative shadow-lg hover:border-slate-400 transition">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-slate-300 text-base-950 font-black text-[11px] shadow">
              🥈 2nd PLACE
            </div>
            <div className="text-3xl my-2">{top2.flag}</div>
            <div className="text-sm font-extrabold text-white truncate">{top2.name}</div>
            <div className="text-[11px] text-mute">{top2.country}</div>
            <div className="text-2xl font-black font-mono text-slate-200 mt-3">
              +{fmtMoney(top2.profit)}
            </div>
            <div className="mt-3 pt-3 border-t border-line/60 grid grid-cols-2 text-xs">
              <div>
                <div className="text-[10px] text-mute uppercase">Win Rate</div>
                <div className="font-bold text-[#00c076]">{top2.winRate}%</div>
              </div>
              <div>
                <div className="text-[10px] text-mute uppercase">Trades</div>
                <div className="font-bold text-white">{top2.tradesCount}</div>
              </div>
            </div>
          </div>

          {/* #1 Champion (Gold Centerpiece) */}
          <div className="order-1 md:order-2 bg-gradient-to-t from-amber-950/30 via-base-900 to-amber-900/20 border-2 border-amber-400 rounded-2xl p-6 text-center relative shadow-[0_0_30px_rgba(245,158,11,0.2)] md:-translate-y-2">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 text-base-950 font-black text-xs shadow-lg flex items-center gap-1.5 uppercase tracking-wide">
              <span>👑</span>
              <span>1st CHAMPION</span>
            </div>
            <div className="text-4xl my-2">{top1.flag}</div>
            <div className="text-base font-black text-white truncate">{top1.name}</div>
            <div className="text-xs text-amber-300 font-semibold">{top1.country} · {top1.favoriteAsset}</div>
            <div className="text-3xl font-black font-mono text-amber-400 mt-3 drop-shadow">
              +{fmtMoney(top1.profit)}
            </div>
            <div className="mt-4 pt-3 border-t border-amber-400/30 grid grid-cols-2 text-xs">
              <div>
                <div className="text-[10px] text-mute uppercase">Win Rate</div>
                <div className="font-extrabold text-[#00c076] text-sm">{top1.winRate}%</div>
              </div>
              <div>
                <div className="text-[10px] text-mute uppercase">Trades Today</div>
                <div className="font-extrabold text-white text-sm">{top1.tradesCount}</div>
              </div>
            </div>
          </div>

          {/* #3 Bronze */}
          <div className="order-3 md:order-3 bg-gradient-to-t from-amber-950/20 to-base-900 border border-amber-700/40 rounded-2xl p-5 text-center relative shadow-lg hover:border-amber-600 transition">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-amber-600 text-white font-black text-[11px] shadow">
              🥉 3rd PLACE
            </div>
            <div className="text-3xl my-2">{top3.flag}</div>
            <div className="text-sm font-extrabold text-white truncate">{top3.name}</div>
            <div className="text-[11px] text-mute">{top3.country}</div>
            <div className="text-2xl font-black font-mono text-amber-500 mt-3">
              +{fmtMoney(top3.profit)}
            </div>
            <div className="mt-3 pt-3 border-t border-line/60 grid grid-cols-2 text-xs">
              <div>
                <div className="text-[10px] text-mute uppercase">Win Rate</div>
                <div className="font-bold text-[#00c076]">{top3.winRate}%</div>
              </div>
              <div>
                <div className="text-[10px] text-mute uppercase">Trades</div>
                <div className="font-bold text-white">{top3.tradesCount}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Search & Filter Bar ────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-white uppercase tracking-wider">Ranks #4 to #50</span>
          <span className="text-[10px] text-mute">({filteredRest.length} traders)</span>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by trader name, country, or asset…"
          className="ax-input !h-8 !text-xs !w-full sm:!w-[280px]"
        />
      </div>

      {/* ── RANKS 4-50 TABLE ──────────────────────────────────────── */}
      <Card className="!p-0 overflow-hidden shadow-xl border-line">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                {['Rank', 'Trader', 'Country', 'Today Profit', 'Win Rate', 'Trades', 'Favorite Market'].map((h) => (
                  <th key={h} className={clsx('ax-th', h === 'Today Profit' && 'text-right')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRest.map((t) => (
                <tr
                  key={t.rank}
                  className={clsx(
                    'ax-row transition-colors',
                    t.isCurrentUser && 'bg-[#00c076]/15 hover:bg-[#00c076]/25 border-l-4 border-l-[#00c076]'
                  )}
                >
                  {/* Rank */}
                  <td className="ax-td">
                    <span className={clsx(
                      'inline-flex items-center justify-center w-6 h-6 rounded-md font-mono text-[11px] font-black',
                      t.rank <= 10 ? 'bg-amber-400/20 text-amber-400 border border-amber-400/40' : 'bg-base-800 text-slate-300'
                    )}>
                      #{t.rank}
                    </span>
                  </td>

                  {/* Trader Name */}
                  <td className="ax-td">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-base-800 border border-line flex items-center justify-center text-[10px]">
                        {t.flag}
                      </div>
                      <span className={clsx('font-bold', t.isCurrentUser ? 'text-[#00c076]' : 'text-white')}>
                        {t.name}
                      </span>
                      {t.isCurrentUser && (
                        <span className="text-[8px] font-black px-1.5 py-0.2 rounded bg-[#00c076] text-base-950 uppercase">
                          YOU
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Country */}
                  <td className="ax-td text-mute">
                    <div className="flex items-center gap-1.5">
                      <span>{t.flag}</span>
                      <span>{t.country}</span>
                    </div>
                  </td>

                  {/* Profit Today */}
                  <td className="ax-td ax-num font-mono font-black text-right text-[#00c076] text-sm">
                    +{fmtMoney(t.profit)}
                  </td>

                  {/* Win Rate */}
                  <td className="ax-td">
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-1.5 rounded-full bg-base-800 overflow-hidden">
                        <div
                          className="h-full bg-[#00c076] rounded-full"
                          style={{ width: `${Math.min(100, t.winRate)}%` }}
                        />
                      </div>
                      <span className="font-mono font-bold text-slate-200">{t.winRate}%</span>
                    </div>
                  </td>

                  {/* Trades Count */}
                  <td className="ax-td text-mute font-mono">{t.tradesCount} trades</td>

                  {/* Favorite Market */}
                  <td className="ax-td font-mono font-bold text-slate-300">
                    <span className="px-2 py-0.5 rounded bg-base-800 border border-line">
                      {t.favoriteAsset}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── STICKY USER RANK FOOTER BAR ───────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-base-900/95 backdrop-blur-md border-t border-line py-3 px-4 shadow-2xl">
        <div className="max-w-[1140px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#00c076]/20 border border-[#00c076] flex items-center justify-center font-bold text-xs text-[#00c076]">
              ★
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-2">
                <span>Your Daily Rank:</span>
                <span className="font-mono font-black text-[#00c076] text-sm">
                  #{resp?.currentUser.rank ?? '—'}
                </span>
                {resp?.currentUser.inTop50 ? (
                  <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-[#00c076] text-base-950 uppercase">
                    IN TOP 50!
                  </span>
                ) : (
                  <span className="text-[9px] text-mute uppercase">
                    (Trade to enter Top 50)
                  </span>
                )}
              </div>
              <div className="text-[11px] text-mute">
                Today Profit: <span className="text-white font-mono font-bold">+{fmtMoney(resp?.currentUser.profit ?? 0)}</span> · Trades: {resp?.currentUser.tradesCount ?? 0} · Win Rate: {resp?.currentUser.winRate ?? 0}%
              </div>
            </div>
          </div>

          <Link
            to="/trading"
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#00c076] hover:bg-[#00d684] text-base-950 font-black text-xs uppercase tracking-wider transition shadow-md whitespace-nowrap text-center"
          >
            Trade Now to Climb Rank →
          </Link>
        </div>
      </div>
    </div>
  );
}
