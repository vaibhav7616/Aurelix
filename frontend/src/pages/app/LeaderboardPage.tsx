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
            <h1 className="text-xl font-bold tracking-tight text-cream">Top 50 Traders of the Day</h1>
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-warn/15 text-warn border border-warn/30">
              DAILY LEADERBOARD
            </span>
          </div>
          <p className="text-xs text-mute mt-1">
            Real-time ranking of top binary options traders ranked by daily net profit.
          </p>
        </div>

        {/* Daily Reset Countdown Badge */}
        <div className="bg-base-900 border border-line px-3.5 py-2 rounded-md flex items-center gap-3 shrink-0 shadow-sm">
          <div className="w-2.5 h-2.5 rounded-full bg-up animate-pulse" />
          <div className="text-right">
            <div className="text-[10px] uppercase font-bold text-mute">Daily Reset in (00:00 UTC)</div>
            <div className="text-sm font-mono font-bold text-warn tracking-wider">
              {String(hours).padStart(2, '0')}h : {String(minutes).padStart(2, '0')}m : {String(seconds).padStart(2, '0')}s
            </div>
          </div>
        </div>
      </div>

      {/* ── Platform Summary Stats ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-gradient-to-br from-base-900 to-base-800 p-4 rounded-md border border-line shadow-sm">
          <div className="text-[11px] font-bold text-mute uppercase tracking-wider">Total Profits Paid Today</div>
          <div className="text-2xl font-bold font-mono text-up mt-1">
            {resp ? fmtMoney(resp.totalPaidProfit) : '—'}
          </div>
          <div className="text-[10px] text-mute mt-1 flex items-center gap-1">
            <span>⚡ Automated instant settlements</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-base-900 to-base-800 p-4 rounded-md border border-line shadow-sm">
          <div className="text-[11px] font-bold text-mute uppercase tracking-wider">Active Traders Today</div>
          <div className="text-2xl font-bold font-mono text-cream mt-1">
            {resp ? resp.activeTradersCount.toLocaleString() : '—'}
          </div>
          <div className="text-[10px] text-mute mt-1">Global active community</div>
        </div>

        <div className="bg-gradient-to-br from-base-900 to-base-800 p-4 rounded-md border border-line shadow-sm">
          <div className="text-[11px] font-bold text-mute uppercase tracking-wider">Highest Single Profit</div>
          <div className="text-2xl font-bold font-mono text-warn mt-1">
            {top1 ? fmtMoney(top1.profit) : '—'}
          </div>
          <div className="text-[10px] text-mute mt-1">Earned by #1 Champion</div>
        </div>
      </div>

      {/* ── TOP 3 PODIUM SHOWCASE ──────────────────────────────────── */}
      {top1 && top2 && top3 && (
        <div className="grid md:grid-cols-3 gap-4 pt-4 items-end">
          {/* #2 Runner-Up */}
          <div className="order-2 md:order-1 bg-gradient-to-t from-base-950/90 to-base-900 border border-mute/40 rounded-lg p-5 text-center relative shadow-lg hover:border-fog transition">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-fog text-base-950 font-bold text-[11px] shadow">
              🥈 2nd PLACE
            </div>
            <div className="text-3xl my-2">{top2.flag}</div>
            <div className="text-sm font-semibold text-cream truncate">{top2.name}</div>
            <div className="text-[11px] text-mute">{top2.country}</div>
            <div className="text-2xl font-bold font-mono text-ink1 mt-3">
              +{fmtMoney(top2.profit)}
            </div>
            <div className="mt-3 pt-3 border-t border-line/60 grid grid-cols-2 text-xs">
              <div>
                <div className="text-[10px] text-mute uppercase">Win Rate</div>
                <div className="font-bold text-up">{top2.winRate}%</div>
              </div>
              <div>
                <div className="text-[10px] text-mute uppercase">Trades</div>
                <div className="font-bold text-cream">{top2.tradesCount}</div>
              </div>
            </div>
          </div>

          {/* #1 Champion (Gold Centerpiece) */}
          <div className="order-1 md:order-2 bg-gradient-to-t from-warn/30 via-base-900 to-warn/20 border-2 border-warn rounded-lg p-6 text-center relative md:-translate-y-2">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-warn to-warn text-base-950 font-bold text-xs shadow-lg flex items-center gap-1.5 uppercase tracking-wide">
              <span>👑</span>
              <span>1st CHAMPION</span>
            </div>
            <div className="text-4xl my-2">{top1.flag}</div>
            <div className="text-base font-bold text-cream truncate">{top1.name}</div>
            <div className="text-xs text-warn font-semibold">{top1.country} · {top1.favoriteAsset}</div>
            <div className="text-3xl font-bold font-mono text-warn mt-3 drop-shadow">
              +{fmtMoney(top1.profit)}
            </div>
            <div className="mt-4 pt-3 border-t border-warn/30 grid grid-cols-2 text-xs">
              <div>
                <div className="text-[10px] text-mute uppercase">Win Rate</div>
                <div className="font-semibold text-up text-sm">{top1.winRate}%</div>
              </div>
              <div>
                <div className="text-[10px] text-mute uppercase">Trades Today</div>
                <div className="font-semibold text-cream text-sm">{top1.tradesCount}</div>
              </div>
            </div>
          </div>

          {/* #3 Bronze */}
          <div className="order-3 md:order-3 bg-gradient-to-t from-warn/20 to-base-900 border border-warn/40 rounded-lg p-5 text-center relative shadow-lg hover:border-warn transition">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-warn text-cream font-bold text-[11px] shadow">
              🥉 3rd PLACE
            </div>
            <div className="text-3xl my-2">{top3.flag}</div>
            <div className="text-sm font-semibold text-cream truncate">{top3.name}</div>
            <div className="text-[11px] text-mute">{top3.country}</div>
            <div className="text-2xl font-bold font-mono text-warn mt-3">
              +{fmtMoney(top3.profit)}
            </div>
            <div className="mt-3 pt-3 border-t border-line/60 grid grid-cols-2 text-xs">
              <div>
                <div className="text-[10px] text-mute uppercase">Win Rate</div>
                <div className="font-bold text-up">{top3.winRate}%</div>
              </div>
              <div>
                <div className="text-[10px] text-mute uppercase">Trades</div>
                <div className="font-bold text-cream">{top3.tradesCount}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Search & Filter Bar ────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-cream uppercase tracking-wider">Ranks #4 to #50</span>
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
                    t.isCurrentUser && 'bg-up/15 hover:bg-up/25 border-l-4 border-l-[#32A66A]'
                  )}
                >
                  {/* Rank */}
                  <td className="ax-td">
                    <span className={clsx(
                      'inline-flex items-center justify-center w-6 h-6 rounded-md font-mono text-[11px] font-bold',
                      t.rank <= 10 ? 'bg-warn/20 text-warn border border-warn/40' : 'bg-base-800 text-fog'
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
                      <span className={clsx('font-bold', t.isCurrentUser ? 'text-up' : 'text-cream')}>
                        {t.name}
                      </span>
                      {t.isCurrentUser && (
                        <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-up text-base-950 uppercase">
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
                  <td className="ax-td ax-num font-mono font-bold text-right text-up text-sm">
                    +{fmtMoney(t.profit)}
                  </td>

                  {/* Win Rate */}
                  <td className="ax-td">
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-1.5 rounded-full bg-base-800 overflow-hidden">
                        <div
                          className="h-full bg-up rounded-full"
                          style={{ width: `${Math.min(100, t.winRate)}%` }}
                        />
                      </div>
                      <span className="font-mono font-bold text-ink1">{t.winRate}%</span>
                    </div>
                  </td>

                  {/* Trades Count */}
                  <td className="ax-td text-mute font-mono">{t.tradesCount} trades</td>

                  {/* Favorite Market */}
                  <td className="ax-td font-mono font-bold text-fog">
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
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-base-900/95 backdrop-blur-md border-t border-line py-3 px-4 shadow-pop">
        <div className="max-w-[1140px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-up/20 border border-up flex items-center justify-center font-bold text-xs text-up">
              ★
            </div>
            <div>
              <div className="text-xs font-bold text-cream flex items-center gap-2">
                <span>Your Daily Rank:</span>
                <span className="font-mono font-bold text-up text-sm">
                  #{resp?.currentUser.rank ?? '—'}
                </span>
                {resp?.currentUser.inTop50 ? (
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-up text-base-950 uppercase">
                    IN TOP 50!
                  </span>
                ) : (
                  <span className="text-[9px] text-mute uppercase">
                    (Trade to enter Top 50)
                  </span>
                )}
              </div>
              <div className="text-[11px] text-mute">
                Today Profit: <span className="text-cream font-mono font-bold">+{fmtMoney(resp?.currentUser.profit ?? 0)}</span> · Trades: {resp?.currentUser.tradesCount ?? 0} · Win Rate: {resp?.currentUser.winRate ?? 0}%
              </div>
            </div>
          </div>

          <Link
            to="/trading"
            className="w-full sm:w-auto px-5 py-2.5 rounded-md bg-up hover:bg-up text-base-950 font-bold text-xs uppercase tracking-wider transition shadow-md whitespace-nowrap text-center"
          >
            Trade Now to Climb Rank →
          </Link>
        </div>
      </div>
    </div>
  );
}
