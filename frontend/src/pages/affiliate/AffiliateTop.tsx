import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { get, apiError } from '../../lib/api';
import { fmtMoney } from '../../lib/format';
import { AFF, EmptyRow, LoadingRow, Page, Panel, TableWrap } from './shared';

interface TopResp {
  month: string;
  top: Array<{ rank: number; name: string; country: string | null; commission: number; me: boolean }>;
  me: { rank: number | null; commission: number };
}

const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function AffiliateTop() {
  const q = useQuery({ queryKey: ['aff', 'top'], queryFn: () => get<TopResp>(`${AFF}/top`), refetchInterval: 5 * 60_000 });
  const d = q.data;

  return (
    <Page title="TOP 10 Partners" lead={`Partners ranked by commission earned this calendar month${d ? ` (${monthName(d.month)})` : ''}. Names are partially hidden for privacy.`}>
      <div className="grid lg:grid-cols-[1fr_280px] gap-4 items-start">
        <Panel pad={false} className="overflow-hidden">
          <TableWrap>
            <table className="w-full">
              <thead><tr><th className="ax-th w-[60px]">Rank</th><th className="ax-th">Partner</th><th className="ax-th">Country</th><th className="ax-th text-right">Commission</th></tr></thead>
              <tbody>
                {q.isLoading && <LoadingRow cols={4} />}
                {q.isError && <EmptyRow cols={4} text={apiError(q.error)} />}
                {(d?.top ?? []).map((t) => (
                  <tr key={t.rank} className={clsx('ax-row', t.me && 'bg-accent-500/10')} aria-current={t.me ? 'true' : undefined}>
                    <td className="ax-td ax-num font-semibold">{t.rank}</td>
                    <td className={clsx('ax-td', t.me && 'text-accent-200 font-semibold')}>{t.name}</td>
                    <td className="ax-td">{t.country ?? '—'}</td>
                    <td className="ax-td text-right ax-num font-semibold">{fmtMoney(t.commission)}</td>
                  </tr>
                ))}
                {d && !d.top.length && <EmptyRow cols={4} text="No partner has earned commission this month yet. The ranking fills in as commission accrues." />}
              </tbody>
            </table>
          </TableWrap>
        </Panel>
        <Panel title="Your position">
          {d ? (
            <>
              <div className="text-[28px] font-semibold ax-num">{d.me.rank ? `#${d.me.rank}` : '—'}</div>
              <div className="text-xs text-mute mt-1">{d.me.rank ? (d.me.rank <= 10 ? 'You are in the TOP 10 this month.' : 'Outside the TOP 10 this month.') : 'Not ranked yet — earn commission this month to appear.'}</div>
              <div className="mt-3 pt-3 ax-rule">
                <div className="ax-micro">Commission this month</div>
                <div className="text-[18px] font-semibold ax-num mt-1">{fmtMoney(d.me.commission)}</div>
              </div>
            </>
          ) : <p className="text-xs text-mute">{q.isLoading ? 'Loading…' : '—'}</p>}
        </Panel>
      </div>
    </Page>
  );
}
