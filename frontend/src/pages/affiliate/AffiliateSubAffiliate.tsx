import { useQuery } from '@tanstack/react-query';
import { get, apiError } from '../../lib/api';
import { fmtMoney } from '../../lib/format';
import { AFF, CopyButton, EmptyRow, Kpi, LoadingRow, Page, Panel, StatusTag, TableWrap, fmtDate, useApprovedMe, usePrograms } from './shared';
import { LevelsTable } from './AffiliatePrograms';

interface SubsResp { subCode: string; subPct: number; capUsd: number; subs: Array<{ id: string; name: string; status: string; joinedAt: string; earned: number }> }

export function AffiliateSubAffiliate() {
  const me = useApprovedMe();
  const { data: p } = usePrograms();
  const q = useQuery({ queryKey: ['aff', 'subs'], queryFn: () => get<SubsResp>(`${AFF}/subaffiliates`) });
  const d = q.data;
  const url = d ? `${window.location.origin}/affiliate?sub=${d.subCode}` : '';
  const total = (d?.subs ?? []).reduce((a, s) => a + s.earned, 0);
  const levels = p ? [...p.levels].sort((a, b) => a.minDeposits - b.minDeposits) : [];

  return (
    <Page title="Sub-Affiliate" lead="Invite other partners. Once approved, you receive a percentage of the commission they earn, on top of their own commission.">
      <Panel title="Your invite link">
        <div className="flex flex-col sm:flex-row gap-2">
          <input readOnly value={q.isLoading ? 'Loading…' : url} className="ax-input font-mono text-[12px]" aria-label="Sub-affiliate invite link" onFocus={(e) => e.currentTarget.select()} />
          <CopyButton text={url} what="invite link" label="Copy link" small={false} className="!bg-accent-600 !text-cream !border-accent-600 hover:!bg-accent-500" />
        </div>
        <p className="text-[11px] text-mute mt-2">Code <span className="font-mono text-fog">{d?.subCode ?? '—'}</span> · The partner must apply through this link to be linked to you.</p>
        {q.isError && <p className="text-xs text-down mt-2">{apiError(q.error)}</p>}
      </Panel>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Kpi label="Your sub-affiliate share" value={d ? `${d.subPct}%` : '—'} sub={me ? `At level ${me.level.level}` : ''} />
        <Kpi label="Cap per sub-affiliate" value={d ? fmtMoney(d.capUsd) : '—'} sub="Total you can earn from one partner" />
        <Kpi label="Sub-affiliates" value={d ? String(d.subs.length) : '—'} sub={d ? `${d.subs.filter((s) => s.status === 'APPROVED').length} approved` : ''} />
        <Kpi label="Earned from subs" value={d ? fmtMoney(total) : '—'} />
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-4 items-start">
        <Panel title="Your sub-affiliates" pad={false} className="overflow-hidden">
          <TableWrap>
            <table className="w-full">
              <thead><tr><th className="ax-th">Partner</th><th className="ax-th">Status</th><th className="ax-th">Joined</th><th className="ax-th text-right">Your earnings</th></tr></thead>
              <tbody>
                {q.isLoading && <LoadingRow cols={4} />}
                {(d?.subs ?? []).map((s) => (
                  <tr key={s.id} className="ax-row">
                    <td className="ax-td">{s.name}</td>
                    <td className="ax-td"><StatusTag status={s.status} /></td>
                    <td className="ax-td ax-num">{fmtDate(s.joinedAt)}</td>
                    <td className="ax-td text-right ax-num">{fmtMoney(s.earned)}</td>
                  </tr>
                ))}
                {d && !d.subs.length && <EmptyRow cols={4} text="No sub-affiliates yet. Share your invite link with other partners." />}
              </tbody>
            </table>
          </TableWrap>
        </Panel>
        <Panel title="Sub-affiliate share by level" pad={false} className="overflow-hidden">
          {levels.length ? <LevelsTable levels={levels} current={me?.level.level} columns={['sub']} /> : <p className="px-4 pb-4 text-xs text-mute">Loading…</p>}
        </Panel>
      </div>
    </Page>
  );
}
