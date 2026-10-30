import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { get } from '../../lib/api';
import { fmtMoney } from '../../lib/format';
import { fmtDur, type OptionsConfig } from '../../lib/options';
import { Card, Empty, SectionTitle } from '../../components/ui/primitives';

interface Leader { rank: number; name: string; profit: number; trades: number; me: boolean }
interface Leaderboard { since: string; items: Leader[]; me: { rank: number; profit: number; trades: number } | null; participants: number }

const MEDAL = ['bg-warn text-black', 'bg-fog text-black', 'bg-[#cd7f32] text-black'];

/** "Top of the day": traders ranked by today's net profit. */
export function TopPage() {
  const { data, isLoading } = useQuery({ queryKey: ['leaderboard'], queryFn: () => get<Leaderboard>('/api/v1/options/leaderboard'), refetchInterval: 15000 });
  return (
    <div className="max-w-[760px] mx-auto p-4 space-y-3">
      <div className="flex items-end gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Top of the day</h1>
          <p className="text-xs text-mute mt-0.5">Traders ranked by net profit on trades settled today. Resets at midnight.</p>
        </div>
        <span className="ml-auto text-[11px] text-mute ax-num">{data?.participants ?? 0} traders today</span>
      </div>

      <Card className="!p-4 flex items-center gap-4 bg-gradient-to-r from-accent-500/15 to-transparent">
        <div className="w-12 h-12 rounded-full bg-accent-500/20 border-2 border-accent-500/50 flex items-center justify-center text-lg font-semibold text-accent-300 ax-num">
          {data?.me ? `#${data.me.rank}` : '—'}
        </div>
        <div className="flex-1">
          <div className="text-[13px] font-bold">Your position</div>
          <div className="text-[11px] text-mute">{data?.me ? `${data.me.trades} trades settled today` : 'Close a trade today to enter the ranking.'}</div>
        </div>
        {data?.me && <div className={clsx('text-lg font-semibold ax-num', data.me.profit >= 0 ? 'text-up' : 'text-down')}>{data.me.profit >= 0 ? '+' : ''}{fmtMoney(data.me.profit)}</div>}
        <Link to="/trading" className="ax-btn-primary">Trade</Link>
      </Card>

      <Card className="!p-0 overflow-hidden">
        {isLoading && <div className="p-6 text-center text-xs text-mute">Loading ranking…</div>}
        {!isLoading && !data?.items.length && <Empty title="No ranked traders yet" hint="The first settled trade of the day opens the ranking." />}
        {(data?.items ?? []).map((l) => (
          <div key={l.rank} className={clsx('flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.05]', l.me && 'bg-accent-500/10')}>
            <span className={clsx('w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold ax-num shrink-0', MEDAL[l.rank - 1] ?? 'bg-base-700 text-fog')}>{l.rank}</span>
            <span className="w-8 h-8 rounded-full bg-base-700 flex items-center justify-center text-xs font-bold shrink-0">{l.name.charAt(0)}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold truncate">{l.name}{l.me && <span className="ml-1.5 text-[10px] text-accent-300 font-bold">YOU</span>}</span>
              <span className="block text-[10px] text-mute ax-num">{l.trades} trades</span>
            </span>
            <span className={clsx('ax-num text-[14px] font-bold', l.profit >= 0 ? 'text-up' : 'text-down')}>{l.profit >= 0 ? '+' : ''}{fmtMoney(l.profit)}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

const HOTKEYS: Array<[string, string]> = [
  ['Shift + W', 'Up trade'],
  ['Shift + S', 'Down trade'],
  ['Shift + D', 'Increase investment'],
  ['Shift + A', 'Decrease investment'],
  ['Shift + E', 'Increase time'],
  ['Shift + Q', 'Decrease time'],
  ['/', 'Open the asset list'],
];

function faq(cfg?: OptionsConfig): Array<[string, string]> {
  const lead = cfg?.fixedTimeMinLeadSec ?? 30;
  const pendingH = Math.round((cfg?.pendingValidityMs ?? 24 * 3600_000) / 3600_000);
  return [
    ['How does a trade work?', 'Choose an asset, a time and an investment, then press Up if you expect the price to be higher at expiry or Down if you expect it lower. The trade settles automatically on the quote at the exact expiry moment.'],
    ['What do I get when I win?', 'Your investment back plus the payout percentage shown on the asset (for example 85% → a $10 trade returns $18.50). A losing trade loses the investment. If the expiry price equals the entry price, the investment is returned.'],
    ['What is the difference between Timer and Time?', `Timer counts a duration from the moment you open the trade (${cfg ? `${fmtDur(cfg.minDurationSec)} to ${fmtDur(cfg.maxDurationSec)}` : 'seconds to hours'}). Time expires on a fixed clock minute; purchases for that minute close ${lead} seconds before it. Press SWITCH TIME in the ticket to change mode.`],
    ['What is a pending trade?', `A trade that opens automatically when the price reaches a level you set. The investment is reserved until it executes, you cancel it, or it expires after ${pendingH} hours.`],
    ['How do I invest a percentage of my balance?', 'Press SWITCH TO % in the Investment box. The amount is then recalculated from your available balance on every trade.'],
    ['How do I reset my demo balance?', 'Open the account menu at the top right and press Refill demo balance. It brings the demo account back to its starting balance.'],
    ['What does the bar on the left of the chart show?', 'Trader sentiment: the share of Up vs Down trades opened on that asset by all traders in the last 30 minutes.'],
  ];
}

export function SupportPage() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const { data: cfg } = useQuery({ queryKey: ['options-config'], queryFn: () => get<OptionsConfig>('/api/v1/options/config') });
  const { data: status } = useQuery({ queryKey: ['market-status'], queryFn: () => get<{ provider: string; demo: boolean; tickCount: number; serverTime: number }>('/api/v1/market/status'), refetchInterval: 15000 });
  const items = faq(cfg);
  return (
    <div className="max-w-[900px] mx-auto p-4 space-y-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Support</h1>
        <p className="text-xs text-mute mt-0.5">Answers to common questions, keyboard shortcuts and platform status.</p>
      </div>

      <div className="grid md:grid-cols-[1fr_280px] gap-3 items-start">
        <Card className="!p-0 overflow-hidden">
          <div className="px-4 pt-3"><SectionTitle title="Frequently asked questions" /></div>
          {items.map(([q, a], i) => (
            <div key={q} className="border-t border-white/[0.05]">
              <button onClick={() => setOpenIdx(openIdx === i ? null : i)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03]">
                <span className="text-[13px] font-semibold flex-1">{q}</span>
                <span className={clsx('text-mute transition', openIdx === i && 'rotate-45')}>+</span>
              </button>
              {openIdx === i && <p className="px-4 pb-3.5 -mt-1 text-xs text-fog leading-relaxed">{a}</p>}
            </div>
          ))}
        </Card>

        <div className="space-y-3">
          <Card>
            <SectionTitle title="Hotkeys" />
            <div className="space-y-1.5">
              {HOTKEYS.map(([k, d]) => (
                <div key={k} className="flex items-center text-xs">
                  <kbd className="px-1.5 py-0.5 rounded bg-base-700 border border-line text-[10px] font-mono font-bold">{k}</kbd>
                  <span className="ml-auto text-fog">{d}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <SectionTitle title="Platform status" />
            <div className="space-y-1.5 text-xs">
              <div className="flex"><span className="text-mute">Quotes</span><span className={clsx('ml-auto font-semibold', status?.tickCount ? 'text-up' : 'text-down')}>{status ? (status.tickCount ? 'Streaming' : 'No quotes') : '…'}</span></div>
              <div className="flex"><span className="text-mute">Feed</span><span className="ml-auto font-semibold">{status?.provider ?? '…'}</span></div>
              <div className="flex"><span className="text-mute">Mode</span><span className="ml-auto font-semibold">{status ? (status.demo ? 'Simulated' : 'Live market data') : '…'}</span></div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
