import { Fragment, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, apiError } from '../../lib/api';
import { useUI } from '../../stores/uiStore';
import { Empty } from '../../components/ui/primitives';
import { fmtMoney, fmtTime } from '../../lib/format';
import { clsx } from 'clsx';

interface AdminAffiliate {
  id: string; email: string; status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'BLOCKED'; verified: boolean; country: string | null;
  trafficSources: string; payoutMethod: string | null; parentId: string | null; createdAt: string;
  available: number; held: number; activeTraders: number; referrals: number; suspicious: number;
}
interface AdminReferral {
  id: string; email?: string; model: string; level: number; sharePct: number; status: string; flags: string | null;
  registeredAt: string; ftdAt: string | null; depositTotal: number; activeTraderAt: string | null; held: number;
}

const statusCls = (s: string) => clsx('ax-tag', s === 'APPROVED' && '!text-up', (s === 'BLOCKED' || s === 'REJECTED') && '!text-down', s === 'PENDING' && '!text-warn');

export function AdminAffiliates() {
  const qc = useQueryClient();
  const push = useUI((s) => s.push);
  const { data } = useQuery({ queryKey: ['admin-affiliates'], queryFn: () => get<AdminAffiliate[]>('/api/v1/admin/affiliates') });
  const [open, setOpen] = useState<string | null>(null);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['admin-affiliates'] }); qc.invalidateQueries({ queryKey: ['admin-aff-refs'] }); };
  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); push('ok', ok); refresh(); } catch (e) { push('err', apiError(e)); } };

  const setStatus = (a: AdminAffiliate, status: AdminAffiliate['status']) => {
    const note = status === 'REJECTED' || status === 'BLOCKED' ? window.prompt(`Reason shown to ${a.email}:`) ?? undefined : undefined;
    if ((status === 'REJECTED' || status === 'BLOCKED') && note === undefined) return;
    void act(() => post(`/api/v1/admin/affiliates/${a.id}/status`, { status, note }), `Affiliate ${status.toLowerCase()}`);
  };
  const adjust = (a: AdminAffiliate) => {
    const amount = Number(window.prompt(`Adjust ${a.email} balance by (USD, negative to deduct):`) ?? '');
    if (!amount) return;
    const note = window.prompt('Reason (recorded in the ledger and audit log):') ?? '';
    if (note.trim().length < 5) { push('err', 'A reason of at least 5 characters is required'); return; }
    void act(() => post(`/api/v1/admin/affiliates/${a.id}/adjust`, { amount, note }), 'Balance adjusted');
  };

  return (
    <div>
      <h1 className="text-lg font-bold tracking-tight">Affiliates</h1>
      <p className="text-[11px] text-mute">Approve and verify partners, review held commission, adjust balances. Every action is audited.</p>
      <div className="ax-panel mt-3 overflow-x-auto">
        {!data?.length ? <Empty title="No affiliate applications yet" /> : (
          <table className="w-full">
            <thead><tr>{['Partner', 'Status', 'Country', 'Traders', 'Active', 'Held', 'Balance', 'Joined', 'Actions'].map((h) => <th key={h} className="ax-th">{h}</th>)}</tr></thead>
            <tbody>
              {data.map((a) => (
                <Fragment key={a.id}>
                  <tr className="ax-row">
                    <td className="ax-td"><button className="text-left hover:underline" onClick={() => setOpen(open === a.id ? null : a.id)}>{a.email}</button>{a.parentId && <span className="ax-tag ml-1.5">sub</span>}</td>
                    <td className="ax-td"><span className={statusCls(a.status)}>{a.status}</span>{a.verified && <span className="ax-tag ml-1 !text-up">verified</span>}</td>
                    <td className="ax-td">{a.country ?? '—'}</td>
                    <td className="ax-td ax-num">{a.referrals}{a.suspicious > 0 && <span className="text-warn"> · {a.suspicious} flagged</span>}</td>
                    <td className="ax-td ax-num">{a.activeTraders}</td>
                    <td className={clsx('ax-td ax-num', a.held && 'text-warn')}>{fmtMoney(a.held)}</td>
                    <td className={clsx('ax-td ax-num', a.available < 0 && 'text-down')}>{fmtMoney(a.available)}</td>
                    <td className="ax-td text-mute">{fmtTime(a.createdAt)}</td>
                    <td className="ax-td">
                      <div className="flex flex-wrap gap-1">
                        {a.status !== 'APPROVED' && <button className="ax-btn-ghost ax-btn-sm" onClick={() => setStatus(a, 'APPROVED')}>Approve</button>}
                        {a.status === 'PENDING' && <button className="ax-btn-ghost ax-btn-sm" onClick={() => setStatus(a, 'REJECTED')}>Reject</button>}
                        {a.status === 'APPROVED' && <button className="ax-btn-ghost ax-btn-sm" onClick={() => setStatus(a, 'BLOCKED')}>Block</button>}
                        <button className="ax-btn-ghost ax-btn-sm" onClick={() => void act(() => post(`/api/v1/admin/affiliates/${a.id}/verify`, { verified: !a.verified }), a.verified ? 'Verification removed' : 'Verified')}>{a.verified ? 'Unverify' : 'Verify'}</button>
                        <button className="ax-btn-ghost ax-btn-sm" onClick={() => adjust(a)}>Adjust</button>
                      </div>
                    </td>
                  </tr>
                  {open === a.id && (
                    <tr><td colSpan={9} className="ax-td bg-base-950 whitespace-normal">
                      <div className="text-[11px] text-mute mb-2">Traffic sources: <span className="text-fog">{a.trafficSources}</span> · payout method: {a.payoutMethod ?? 'not set'}</div>
                      <Referrals affiliateId={a.id} onChange={refresh} />
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Referrals({ affiliateId, onChange }: { affiliateId: string; onChange: () => void }) {
  const push = useUI((s) => s.push);
  const { data } = useQuery({ queryKey: ['admin-aff-refs', affiliateId], queryFn: () => get<AdminReferral[]>(`/api/v1/admin/affiliates/${affiliateId}/referrals`) });
  const review = async (r: AdminReferral, action: 'release' | 'cancel') => {
    if (action === 'cancel' && !window.confirm(`Cancel all commission from ${r.email} and reject this referral?`)) return;
    try { await post(`/api/v1/admin/affiliates/referrals/${r.id}/review`, { action }); push('ok', action === 'release' ? 'Held commission released' : 'Commission cancelled'); onChange(); } catch (e) { push('err', apiError(e)); }
  };
  if (!data?.length) return <div className="text-xs text-mute">No traders yet.</div>;
  return (
    <table className="w-full">
      <thead><tr>{['Trader', 'Model', 'Share', 'Status', 'Flags', 'FTD', 'Deposits', 'Active', 'Held', ''].map((h) => <th key={h} className="ax-th">{h}</th>)}</tr></thead>
      <tbody>
        {data.map((r) => (
          <tr key={r.id} className="ax-row">
            <td className="ax-td">{r.email}</td>
            <td className="ax-td">{r.model} · L{r.level}</td>
            <td className="ax-td ax-num">{r.model === 'CPA' ? '—' : `${r.sharePct}%`}</td>
            <td className="ax-td"><span className={statusCls(r.status === 'ACTIVE' ? 'APPROVED' : r.status === 'SUSPICIOUS' ? 'PENDING' : 'REJECTED')}>{r.status}</span></td>
            <td className="ax-td text-warn">{r.flags ?? '—'}</td>
            <td className="ax-td text-mute">{r.ftdAt ? fmtTime(r.ftdAt) : '—'}</td>
            <td className="ax-td ax-num">{fmtMoney(r.depositTotal)}</td>
            <td className="ax-td">{r.activeTraderAt ? 'yes' : 'no'}</td>
            <td className="ax-td ax-num">{fmtMoney(r.held)}</td>
            <td className="ax-td">
              {r.status === 'SUSPICIOUS' && <button className="ax-btn-ghost ax-btn-sm mr-1" onClick={() => void review(r, 'release')}>Release</button>}
              {r.status !== 'REJECTED' && <button className="ax-btn-ghost ax-btn-sm" onClick={() => void review(r, 'cancel')}>Cancel</button>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface AdminPayout { id: string; email: string; amount: number; status: string; method: string | null; details: Record<string, string> | null; periodEnd: string; createdAt: string; note: string | null }

export function AdminAffiliatePayouts() {
  const qc = useQueryClient();
  const push = useUI((s) => s.push);
  const [status, setStatus] = useState('REQUESTED');
  const { data } = useQuery({ queryKey: ['admin-aff-payouts', status], queryFn: () => get<AdminPayout[]>('/api/v1/admin/affiliates/payouts', status ? { status } : {}) });
  const act = async (p: AdminPayout, action: 'paid' | 'reject') => {
    if (action === 'paid' && !window.confirm(`Confirm that ${fmtMoney(p.amount)} was sent to ${p.email} (${p.method ?? 'method not set'})?`)) return;
    const note = action === 'reject' ? window.prompt('Reason for rejecting (the amount returns to the partner balance):') ?? undefined : undefined;
    if (action === 'reject' && note === undefined) return;
    try { await post(`/api/v1/admin/affiliates/payouts/${p.id}`, { action, note }); push('ok', action === 'paid' ? 'Marked as paid' : 'Payout rejected'); qc.invalidateQueries({ queryKey: ['admin-aff-payouts'] }); } catch (e) { push('err', apiError(e)); }
  };
  return (
    <div>
      <h1 className="text-lg font-bold tracking-tight">Affiliate payouts</h1>
      <p className="text-[11px] text-mute">Created automatically each payout day for eligible partners. Send the money by the partner’s method, then mark it paid.</p>
      <div className="ax-seg mt-3 max-w-[360px]" role="tablist">
        {[['REQUESTED', 'Requested'], ['PAID', 'Paid'], ['REJECTED', 'Rejected'], ['', 'All']].map(([v, l]) => (
          <button key={l} role="tab" aria-selected={status === v} data-active={status === v} className="ax-seg-btn" onClick={() => setStatus(v)}>{l}</button>
        ))}
      </div>
      <div className="ax-panel mt-3 overflow-x-auto">
        {!data?.length ? <Empty title="No payouts" /> : (
          <table className="w-full">
            <thead><tr>{['Partner', 'Amount', 'Method', 'Details', 'Period to', 'Status', ''].map((h) => <th key={h} className="ax-th">{h}</th>)}</tr></thead>
            <tbody>{data.map((p) => (
              <tr key={p.id} className="ax-row">
                <td className="ax-td">{p.email}</td>
                <td className="ax-td ax-num font-semibold">{fmtMoney(p.amount)}</td>
                <td className="ax-td">{p.method ?? '—'}</td>
                <td className="ax-td font-mono text-[11px] whitespace-normal">{p.details ? Object.entries(p.details).map(([k, v]) => `${k}: ${v}`).join(' · ') : '—'}</td>
                <td className="ax-td text-mute">{p.periodEnd.slice(0, 10)}</td>
                <td className="ax-td"><span className={statusCls(p.status === 'PAID' ? 'APPROVED' : p.status === 'REQUESTED' ? 'PENDING' : 'REJECTED')}>{p.status}</span></td>
                <td className="ax-td">{p.status === 'REQUESTED' && (<div className="flex gap-1"><button className="ax-btn-ghost ax-btn-sm" onClick={() => void act(p, 'paid')}>Mark paid</button><button className="ax-btn-ghost ax-btn-sm" onClick={() => void act(p, 'reject')}>Reject</button></div>)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

interface Ticket { id: string; affiliateId: string; subject: string; status: string; updatedAt: string }
interface Thread { ticket: Ticket; messages: Array<{ id: string; fromAdmin: boolean; body: string; createdAt: string }> }

export function AdminAffiliateTickets() {
  const qc = useQueryClient();
  const push = useUI((s) => s.push);
  const [sel, setSel] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const { data } = useQuery({ queryKey: ['admin-aff-tickets'], queryFn: () => get<Ticket[]>('/api/v1/admin/affiliates/tickets/all'), refetchInterval: 30_000 });
  const { data: thread } = useQuery({ queryKey: ['admin-aff-ticket', sel], queryFn: () => get<Thread>(`/api/v1/admin/affiliates/tickets/${sel}`), enabled: !!sel });
  const send = async () => {
    try { await post(`/api/v1/admin/affiliates/tickets/${sel}/reply`, { body: reply }); setReply(''); push('ok', 'Reply sent'); qc.invalidateQueries({ queryKey: ['admin-aff-ticket', sel] }); qc.invalidateQueries({ queryKey: ['admin-aff-tickets'] }); } catch (e) { push('err', apiError(e)); }
  };
  return (
    <div>
      <h1 className="text-lg font-bold tracking-tight">Affiliate support</h1>
      <div className="grid md:grid-cols-[320px_1fr] gap-3 mt-3">
        <div className="ax-panel overflow-hidden">
          {!data?.length ? <Empty title="No tickets" /> : data.map((t) => (
            <button key={t.id} onClick={() => setSel(t.id)} className={clsx('w-full text-left px-3 py-2.5 border-b border-line hover:bg-base-850', sel === t.id && 'bg-base-850')}>
              <div className="text-[13px] font-semibold truncate">{t.subject}</div>
              <div className="text-[11px] text-mute flex justify-between"><span className={statusCls(t.status === 'OPEN' ? 'PENDING' : t.status === 'ANSWERED' ? 'APPROVED' : 'REJECTED')}>{t.status}</span><span>{fmtTime(t.updatedAt)}</span></div>
            </button>
          ))}
        </div>
        <div className="ax-panel p-4 min-h-[300px]">
          {!thread ? <div className="text-xs text-mute">Select a ticket.</div> : (
            <>
              <div className="text-[14px] font-semibold">{thread.ticket.subject}</div>
              <div className="mt-3 space-y-2 max-h-[420px] overflow-y-auto">
                {thread.messages.map((m) => (
                  <div key={m.id} className={clsx('rounded-md px-3 py-2 text-[13px] whitespace-pre-wrap', m.fromAdmin ? 'bg-accent-700/40 ml-8' : 'bg-base-850 mr-8')}>
                    <div className="text-[10px] text-mute mb-1">{m.fromAdmin ? 'Support' : 'Partner'} · {fmtTime(m.createdAt)}</div>{m.body}
                  </div>
                ))}
              </div>
              {thread.ticket.status !== 'CLOSED' && (
                <div className="mt-3 flex gap-2">
                  <textarea className="ax-input !h-20 py-2" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to the partner" aria-label="Reply" />
                  <button className="ax-btn-primary self-end" disabled={!reply.trim()} onClick={() => void send()}>Send</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
