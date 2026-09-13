import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, put, apiError } from '../../lib/api';
import { useUI } from '../../stores/uiStore';
import { Card, Empty, FieldError } from '../../components/ui/primitives';
import { fmtMoney, fmtPrice, fmtTime, clsUpDown, shortId } from '../../lib/format';
import { clsx } from 'clsx';

function PagedTable({ title, queryKey, url, cols, render }: {
  title: string; queryKey: string; url: string;
  cols: string[]; render: (row: Record<string, never>) => React.ReactNode;
}) {
  const { data } = useQuery({ queryKey: ['admin', queryKey], queryFn: () => get<{ items: Array<Record<string, never>> }>(url, { pageSize: 30 }) });
  return (
    <div>
      <h1 className="text-lg font-bold tracking-tight">{title}</h1>
      <div className="ax-panel mt-3 overflow-hidden">
        {!data?.items.length ? <Empty title={`No ${title.toLowerCase()}`} /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[760px]">
            <thead><tr>{cols.map((h) => <th key={h} className="ax-th">{h}</th>)}</tr></thead>
            <tbody>{data.items.map((r, i) => <tr key={i} className="ax-row">{render(r)}</tr>)}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

export function AdminOrders() {
  return <PagedTable title="Orders" queryKey="orders" url="/api/v1/admin/orders"
    cols={['Order', 'Asset', 'Side', 'Amount', 'Entry', 'Status', 'Placed']}
    render={(o) => (<>
      <td className="ax-td ax-num font-mono text-[11px] text-mute">{shortId(String(o.id))}</td>
      <td className="ax-td font-bold">{String((o.asset as { symbol: string })?.symbol ?? '')}</td>
      <td className="ax-td"><span className={o.side === 'BUY' ? 'ax-side-buy' : 'ax-side-sell'}>{String(o.side)}</span></td>
      <td className="ax-td ax-num">{fmtMoney(o.amount as number)}</td>
      <td className="ax-td ax-num text-fog">{fmtPrice(o.entryPrice as number)}</td>
      <td className="ax-td"><span className="ax-tag">{String(o.status)}</span></td>
      <td className="ax-td text-mute">{fmtTime(o.createdAt as string)}</td>
    </>)} />;
}

export function AdminOptions() {
  const [status, setStatus] = useState<'OPEN' | 'CLOSED'>('OPEN');
  const { data } = useQuery({
    queryKey: ['admin-options', status],
    queryFn: () => get<{ items: Array<{ id: string; direction: 'UP' | 'DOWN'; stake: number; payoutPct: number; entryPrice: number; closePrice: number | null; profit: number | null; durationSec: number; openedAt: string; expiresAt: string; settledAt: string | null; status: string; asset: { symbol: string }; account: { accountNumber: string; user: { email: string } } }>; total: number }>('/api/v1/admin/options', { status, pageSize: 60 }),
    refetchInterval: 4000,
  });
  const rows = data?.items ?? [];
  const sum = rows.reduce((a, o) => a + Number(o.profit ?? 0), 0);
  return (
    <div>
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-lg font-bold tracking-tight">Fixed-time trades</h1>
        <div className="ax-seg !w-auto">
          {(['OPEN', 'CLOSED'] as const).map((v) => <button key={v} onClick={() => setStatus(v)} data-active={status === v} className="ax-seg-btn !px-3">{v === 'OPEN' ? 'Running' : 'Settled'}</button>)}
        </div>
        <span className="text-[11px] text-mute ax-num ml-auto">{data?.total ?? 0} total{status === 'CLOSED' && <> · client P/L on page <span className={clsx('font-bold', clsUpDown(sum))}>{fmtMoney(sum)}</span></>}</span>
      </div>
      <div className="ax-panel mt-3 overflow-hidden">
        {!rows.length ? <Empty title={status === 'OPEN' ? 'No running trades platform-wide' : 'No settled trades yet'} /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[980px]">
            <thead><tr>{['Owner', 'Account', 'Asset', 'Dir', 'Stake', 'Payout', 'Entry', status === 'OPEN' ? 'Expires' : 'Close', 'Result', 'Profit', 'Opened'].map((h) => <th key={h} className={clsx('ax-th', h === 'Profit' && 'text-right')}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((o) => (
              <tr key={o.id} className="ax-row">
                <td className="ax-td text-fog">{o.account.user.email}</td>
                <td className="ax-td font-mono text-[11px] text-mute">{o.account.accountNumber}</td>
                <td className="ax-td font-bold">{o.asset.symbol}</td>
                <td className="ax-td"><span className={o.direction === 'UP' ? 'ax-side-buy' : 'ax-side-sell'}>{o.direction === 'UP' ? '▲ UP' : '▼ DOWN'}</span></td>
                <td className="ax-td ax-num">{fmtMoney(o.stake)}</td>
                <td className="ax-td ax-num text-warn">{o.payoutPct}%</td>
                <td className="ax-td ax-num text-fog">{fmtPrice(o.entryPrice)}</td>
                <td className="ax-td ax-num text-fog">{status === 'OPEN' ? fmtTime(o.expiresAt) : o.closePrice != null ? fmtPrice(o.closePrice) : '—'}</td>
                <td className="ax-td"><span className={clsx('text-[10px] font-bold px-1.5 py-[3px] rounded', o.status === 'WON' ? 'bg-up/15 text-up' : o.status === 'LOST' ? 'bg-down/15 text-down' : o.status === 'TIE' ? 'bg-white/[0.07] text-fog' : 'bg-warn/15 text-warn')}>{o.status === 'OPEN' ? 'RUNNING' : o.status}</span></td>
                <td className={clsx('ax-td ax-num font-bold text-right', clsUpDown(o.profit ?? 0))}>{o.profit == null ? '—' : `${o.profit > 0 ? '+' : ''}${fmtMoney(o.profit)}`}</td>
                <td className="ax-td text-mute">{fmtTime(o.openedAt)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

export function AdminPositions() {
  const { data } = useQuery({
    queryKey: ['admin-positions'],
    queryFn: () => get<Array<{ id: string; side: string; quantity: number; entryPrice: number; currentPrice: number; unrealizedPnl: number; openedAt: string; asset: { symbol: string }; account: { accountNumber: string; user: { email: string } } }>>('/api/v1/admin/positions'),
    refetchInterval: 8000,
  });
  const total = (data ?? []).reduce((a, p) => a + Number(p.unrealizedPnl), 0);
  return (
    <div>
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold tracking-tight">Open positions</h1>
        <span className={clsx('ax-num text-sm font-bold', clsUpDown(total))}>Σ {fmtMoney(total)}</span>
      </div>
      <div className="ax-panel mt-3 overflow-hidden">
        {!data?.length ? <Empty title="No open positions platform-wide" /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[820px]">
            <thead><tr>{['Owner', 'Account', 'Asset', 'Side', 'Qty', 'Entry', 'Mark', 'uP/L', 'Opened'].map((h) => <th key={h} className={clsx('ax-th', h === 'uP/L' && 'text-right')}>{h}</th>)}</tr></thead>
            <tbody>{data.map((p) => (
              <tr key={p.id} className="ax-row">
                <td className="ax-td text-fog">{p.account.user.email}</td>
                <td className="ax-td font-mono text-[11px] text-mute">{p.account.accountNumber}</td>
                <td className="ax-td font-bold">{p.asset.symbol}</td>
                <td className="ax-td"><span className={p.side === 'BUY' ? 'ax-side-buy' : 'ax-side-sell'}>{p.side}</span></td>
                <td className="ax-td ax-num">{Number(p.quantity).toFixed(6)}</td>
                <td className="ax-td ax-num text-fog">{fmtPrice(p.entryPrice)}</td>
                <td className="ax-td ax-num">{fmtPrice(p.currentPrice)}</td>
                <td className={clsx('ax-td ax-num font-bold text-right', clsUpDown(p.unrealizedPnl))}>{fmtMoney(p.unrealizedPnl)}</td>
                <td className="ax-td text-mute">{fmtTime(p.openedAt)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

export function AdminTrades() {
  return <PagedTable title="Trades" queryKey="trades" url="/api/v1/admin/trades"
    cols={['Asset', 'Side', 'Entry', 'Exit', 'P/L', 'Fee', 'Closed', 'Reason']}
    render={(t) => (<>
      <td className="ax-td font-bold">{String((t.asset as { symbol: string })?.symbol ?? '')}</td>
      <td className="ax-td"><span className={t.side === 'BUY' ? 'ax-side-buy' : 'ax-side-sell'}>{String(t.side)}</span></td>
      <td className="ax-td ax-num text-fog">{fmtPrice(t.entryPrice as number)}</td>
      <td className="ax-td ax-num text-fog">{fmtPrice(t.exitPrice as number)}</td>
      <td className={clsx('ax-td ax-num font-bold', clsUpDown(t.realizedPnl as number))}>{fmtMoney(t.realizedPnl as number)}</td>
      <td className="ax-td ax-num text-mute">{fmtMoney(t.fee as number)}</td>
      <td className="ax-td text-mute">{fmtTime(t.closedAt as string)}</td>
      <td className="ax-td"><span className="ax-tag">{String(t.closeReason)}</span></td>
    </>)} />;
}

export function AdminDeposits() {
  const { data } = useQuery({
    queryKey: ['admin-deposits'],
    queryFn: () => get<Array<{ id: string; amount: number; currency: string; provider: string; providerRef: string | null; status: string; createdAt: string; user: { email: string } }>>('/api/v1/admin/deposits'),
  });
  return (
    <div>
      <h1 className="text-lg font-bold tracking-tight">Deposits</h1>
      <div className="ax-panel mt-3 overflow-hidden">
        {!data?.length ? <Empty title="No deposits" /> : (
          <table className="w-full">
            <thead><tr>{['User', 'Amount', 'Provider', 'Reference', 'Status', 'Date'].map((h) => <th key={h} className="ax-th">{h}</th>)}</tr></thead>
            <tbody>{data.map((d) => (
              <tr key={d.id} className="ax-row">
                <td className="ax-td text-fog">{d.user.email}</td>
                <td className="ax-td ax-num font-bold">{fmtMoney(d.amount)} <span className="text-mute text-[10px]">{d.currency}</span></td>
                <td className="ax-td"><span className="ax-tag">{d.provider} · simulated</span></td>
                <td className="ax-td font-mono text-[11px] text-mute">{d.providerRef ?? '—'}</td>
                <td className="ax-td"><span className="ax-tag">{d.status}</span></td>
                <td className="ax-td text-mute">{fmtTime(d.createdAt)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function AdminWithdrawals() {
  const qc = useQueryClient();
  const push = useUI((s) => s.push);
  const [status, setStatus] = useState('');
  const { data } = useQuery({ queryKey: ['admin-wd', status], queryFn: () => get<Array<{ id: string; amount: number; method: string; status: string; createdAt: string; user: { email: string } }>>('/api/v1/admin/withdrawals', status ? { status } : {}) });

  const review = async (id: string, action: string) => {
    try { await post(`/api/v1/admin/withdrawals/${id}/review`, { action }); push('ok', `Withdrawal ${action}d`); qc.invalidateQueries({ queryKey: ['admin-wd'] }); }
    catch (e) { push('err', apiError(e)); }
  };
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <h1 className="text-lg font-bold tracking-tight">Withdrawals</h1>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="ax-input !w-auto !h-8 !text-xs">
          <option value="">All states</option>{['REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED'].map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <div className="ax-panel mt-3 overflow-hidden">
        {!data?.length ? <Empty title="No withdrawals" /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[720px]">
            <thead><tr>{['User', 'Amount', 'Method', 'Status', 'Requested', 'Review'].map((h) => <th key={h} className="ax-th">{h}</th>)}</tr></thead>
            <tbody>{data.map((w) => (
              <tr key={w.id} className="ax-row">
                <td className="ax-td text-fog">{w.user.email}</td>
                <td className="ax-td ax-num font-bold">{fmtMoney(w.amount)}</td>
                <td className="ax-td text-mute capitalize">{w.method}</td>
                <td className="ax-td"><span className="ax-tag">{w.status}</span></td>
                <td className="ax-td text-mute">{fmtTime(w.createdAt)}</td>
                <td className="ax-td">
                  <div className="flex gap-1">
                    <button onClick={() => review(w.id, 'approve')} className="ax-btn-ghost ax-btn-sm">Approve</button>
                    <button onClick={() => review(w.id, 'process')} className="ax-btn-ghost ax-btn-sm">Process</button>
                    <button onClick={() => review(w.id, 'complete')} className="ax-btn-ghost ax-btn-sm">Complete</button>
                    <button onClick={() => review(w.id, 'reject')} className="ax-btn-danger ax-btn-sm">Reject</button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      <p className="text-[11px] text-mute mt-2">Approve → locks stay · Complete → settles ledger · Reject → releases lock. Every transition is audit-logged.</p>
    </div>
  );
}

export function AdminRisk() {
  const qc = useQueryClient();
  const push = useUI((s) => s.push);
  const { data } = useQuery({ queryKey: ['admin-risk'], queryFn: () => get<Record<string, number | boolean>>('/api/v1/admin/risk') });
  const [f, setF] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const v = (k: string) => f[k] ?? String(data?.[k] ?? '');
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const save = useMutation({
    mutationFn: () => put('/api/v1/admin/risk', {
      maxOrderAmount: parseFloat(v('maxOrderAmount')), minOrderAmount: parseFloat(v('minOrderAmount')),
      maxPositionAmount: parseFloat(v('maxPositionAmount')), maxOpenPositions: parseInt(v('maxOpenPositions'), 10),
      maxDailyLoss: parseFloat(v('maxDailyLoss')), maxTotalLoss: parseFloat(v('maxTotalLoss')),
      tradingEnabled: v('tradingEnabled') === 'true',
    }),
    onSuccess: () => { push('ok', 'Risk rules updated — enforced on next order'); setErr(null); qc.invalidateQueries({ queryKey: ['admin-risk'] }); },
    onError: (e) => setErr(apiError(e)),
  });

  return (
    <div className="max-w-[560px]">
      <h1 className="text-lg font-bold tracking-tight">Risk rules</h1>
      <p className="text-[11px] text-mute">Stored in PostgreSQL · evaluated on every order · changes apply immediately.</p>
      <Card className="mt-3 space-y-2.5">
        {[['maxOrderAmount', 'Max order amount (USD)'], ['minOrderAmount', 'Min order amount (USD)'], ['maxPositionAmount', 'Max position amount (USD)'], ['maxOpenPositions', 'Max open positions'], ['maxDailyLoss', 'Max daily loss (USD)'], ['maxTotalLoss', 'Max total loss (USD)']].map(([k, l]) => (
          <div key={k}><label className="ax-label">{l}</label><input className="ax-input ax-num" value={v(k)} onChange={set(k)} /></div>
        ))}
        <label className={`flex items-center gap-2.5 text-[13px] font-semibold rounded-md border px-3 py-2.5 cursor-pointer ${v('tradingEnabled') === 'true' ? 'border-up/40 bg-updim/40' : 'border-down/40 bg-downdim/40'}`}>
          <input type="checkbox" className="ax-check" checked={v('tradingEnabled') === 'true'} onChange={(e) => setF({ ...f, tradingEnabled: String(e.target.checked) })} />
          {v('tradingEnabled') === 'true' ? 'Trading enabled platform-wide' : 'TRADING HALTED platform-wide'}
        </label>
        <FieldError message={err} />
        <button onClick={() => save.mutate()} disabled={save.isPending} className="ax-btn-primary !h-9">Save rules</button>
      </Card>
    </div>
  );
}

export function AdminBroadcast() {
  const push = useUI((s) => s.push);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: () => post<{ recipients: number }>('/api/v1/admin/notifications/broadcast', { title: title.trim(), message: message.trim() }),
    onSuccess: (r) => { push('ok', `Broadcast sent to ${r.recipients} users`); setTitle(''); setMessage(''); setErr(null); },
    onError: (e) => setErr(apiError(e)),
  });
  return (
    <div className="max-w-[560px]">
      <h1 className="text-lg font-bold tracking-tight">Notifications</h1>
      <p className="text-[11px] text-mute">Broadcast a system notice to all active users. Delivery is instant over websocket + inbox.</p>
      <Card className="mt-3 space-y-2.5">
        <div><label className="ax-label">Title</label><input className="ax-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Scheduled feed maintenance" /></div>
        <div><label className="ax-label">Message</label><textarea className="ax-input !h-24 resize-none" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Keep it short and factual…" /></div>
        <FieldError message={err} />
        <button onClick={() => send.mutate()} disabled={send.isPending || title.trim().length < 3 || message.trim().length < 3} className="ax-btn-primary !h-9">Send broadcast</button>
      </Card>
    </div>
  );
}

export function AdminAudit() {
  const { data } = useQuery({ queryKey: ['admin', 'audit'], queryFn: () => get<{ items: Array<{ id: string; action: string; entityType: string; entityId: string | null; actorId: string | null; ipAddress: string | null; createdAt: string }> }>('/api/v1/admin/audit', { pageSize: 40 }) });
  return (
    <div>
      <h1 className="text-lg font-bold tracking-tight">Audit logs</h1>
      <div className="ax-panel mt-3 overflow-hidden">
        {!data?.items.length ? <Empty title="No audit records" /> : (
          <div className="overflow-x-auto max-h-[70vh]"><table className="w-full min-w-[760px]">
            <thead><tr>{['Action', 'Entity', 'Entity ID', 'Actor', 'IP', 'Time'].map((h) => <th key={h} className="ax-th">{h}</th>)}</tr></thead>
            <tbody>{data.items.map((r) => (
              <tr key={r.id} className="ax-row">
                <td className="ax-td font-mono text-[11px] text-accent-300">{r.action}</td>
                <td className="ax-td text-fog">{r.entityType}</td>
                <td className="ax-td font-mono text-[11px] text-mute">{r.entityId ? shortId(r.entityId) : '—'}</td>
                <td className="ax-td font-mono text-[11px] text-mute">{r.actorId ? shortId(r.actorId) : 'system'}</td>
                <td className="ax-td ax-num text-mute">{r.ipAddress ?? '—'}</td>
                <td className="ax-td text-mute">{fmtTime(r.createdAt)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

export function AdminSettings() {
  const qc = useQueryClient();
  const push = useUI((s) => s.push);
  const { data } = useQuery({ queryKey: ['admin-settings'], queryFn: () => get<Record<string, string>>('/api/v1/admin/settings') });
  const [kv, setKv] = useState({ k: '', v: '' });
  const save = async () => {
    try { await put('/api/v1/admin/settings', { [kv.k.trim()]: kv.v }); push('ok', 'Setting saved'); setKv({ k: '', v: '' }); qc.invalidateQueries({ queryKey: ['admin-settings'] }); }
    catch (e) { push('err', apiError(e)); }
  };
  return (
    <div className="max-w-[560px]">
      <h1 className="text-lg font-bold tracking-tight">System settings</h1>
      <Card className="mt-3">
        {Object.entries(data ?? {}).map(([k, val]) => (
          <div key={k} className="flex justify-between text-xs py-2 border-b border-white/[0.06]"><span className="text-mute font-mono">{k}</span><span className="ax-num font-semibold">{val}</span></div>
        ))}
        {!Object.keys(data ?? {}).length && <div className="text-xs text-mute">No settings stored.</div>}
        <div className="flex gap-2 mt-3">
          <input className="ax-input !text-xs font-mono" placeholder="key" value={kv.k} onChange={(e) => setKv({ ...kv, k: e.target.value })} />
          <input className="ax-input !text-xs" placeholder="value" value={kv.v} onChange={(e) => setKv({ ...kv, v: e.target.value })} />
          <button onClick={save} disabled={!kv.k.trim()} className="ax-btn-primary ax-btn-sm !h-9">Set</button>
        </div>
      </Card>
    </div>
  );
}
