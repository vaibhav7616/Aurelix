import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, put, apiError } from '../../lib/api';
import { useUI } from '../../stores/uiStore';
import { Card, Empty } from '../../components/ui/primitives';
import { fmtMoney, fmtTime } from '../../lib/format';
import { clsx } from 'clsx';

export function AdminOverview() {
  const { data } = useQuery({ queryKey: ['admin-overview'], queryFn: () => get<Record<string, number>>('/api/v1/admin/overview'), refetchInterval: 10000 });
  const cards: Array<[string, string, string]> = [
    ['Users', String(data?.users ?? 0), ''],
    ['Active users', String(data?.activeUsers ?? 0), 'text-up'],
    ['Trading accounts', String(data?.accounts ?? 0), ''],
    ['Running trades', String(data?.openOptions ?? data?.openPositions ?? 0), 'text-accent-300'],
    ['Settled trades', String(data?.settledOptions ?? data?.closedTrades ?? 0), ''],
    ['Turnover', fmtMoney(data?.optionTurnover ?? data?.volume ?? 0), ''],
    ['House result', fmtMoney(data?.houseEdge ?? 0), data && (data.houseEdge ?? 0) < 0 ? 'text-down' : 'text-up'],
    ['Client win rate', `${(data?.optionWinRate ?? 0).toFixed(1)}%`, ''],
    ['Deposits', fmtMoney(data?.deposits ?? 0), 'text-up'],
    ['Withdrawals', fmtMoney(data?.withdrawals ?? 0), ''],
  ];
  return (
    <div>
      <h1 className="text-lg font-bold tracking-tight">Dashboard</h1>
      <p className="text-[11px] text-mute">Platform health · refreshes every 10s</p>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5 mt-3">
        {cards.map(([l, v, c]) => (
          <div key={l} className="ax-panel px-3 py-2.5">
            <div className="ax-micro">{l}</div>
            <div className={clsx('text-lg font-bold ax-num mt-0.5', c)}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminUsers() {
  const [q, setQ] = useState('');
  const qc = useQueryClient();
  const push = useUI((s) => s.push);
  const [adjust, setAdjust] = useState({ accountId: '', amount: '', reason: '' });
  const { data } = useQuery({ queryKey: ['admin-users', q], queryFn: () => get<{ items: Array<{ id: string; email: string; firstName: string; lastName: string; role: string; status: string; createdAt: string }> }>('/api/v1/admin/users', { search: q, pageSize: 30 }) });

  const act = async (id: string, action: 'suspend' | 'activate') => {
    try { await post(`/api/v1/admin/users/${id}/${action}`, {}); push('ok', `User ${action}d`); qc.invalidateQueries({ queryKey: ['admin-users'] }); }
    catch (e) { push('err', apiError(e)); }
  };
  const doAdjust = async () => {
    try {
      await post('/api/v1/admin/adjust', { accountId: adjust.accountId.trim(), amount: parseFloat(adjust.amount), reason: adjust.reason.trim() });
      push('ok', 'Balance adjusted (audit-logged)'); setAdjust({ accountId: '', amount: '', reason: '' });
    } catch (e) { push('err', apiError(e)); }
  };

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold tracking-tight">Users</h1>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email or name…" className="ax-input max-w-[320px] !h-8 !text-xs" />
      <div className="ax-panel overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full min-w-[680px]">
          <thead><tr>{['Email', 'Name', 'Role', 'Status', 'Joined', ''].map((h) => <th key={h} className="ax-th">{h}</th>)}</tr></thead>
          <tbody>{(data?.items ?? []).map((u) => (
            <tr key={u.id} className="ax-row">
              <td className="ax-td font-semibold">{u.email}</td>
              <td className="ax-td text-fog">{u.firstName} {u.lastName}</td>
              <td className="ax-td"><span className="ax-tag">{u.role}</span></td>
              <td className="ax-td">{u.status === 'ACTIVE' ? <span className="text-up text-[11px] font-semibold">● Active</span> : <span className="text-down text-[11px] font-semibold">● {u.status}</span>}</td>
              <td className="ax-td text-mute">{fmtTime(u.createdAt)}</td>
              <td className="ax-td text-right">
                {u.status === 'ACTIVE'
                  ? <button onClick={() => act(u.id, 'suspend')} className="ax-btn-danger ax-btn-sm">Suspend</button>
                  : <button onClick={() => act(u.id, 'activate')} className="ax-btn-ghost ax-btn-sm">Activate</button>}
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>
      <Card>
        <div className="text-[13px] font-bold">Balance adjustment <span className="text-[10px] text-mute font-normal">· requires reason · writes audit record</span></div>
        <div className="grid sm:grid-cols-[1fr_140px_1fr_auto] gap-2 mt-2.5">
          <input className="ax-input ax-num !text-xs font-mono" placeholder="Account ID" value={adjust.accountId} onChange={(e) => setAdjust({ ...adjust, accountId: e.target.value })} />
          <input className="ax-input ax-num !text-xs" placeholder="+/− amount" value={adjust.amount} onChange={(e) => setAdjust({ ...adjust, amount: e.target.value })} />
          <input className="ax-input !text-xs" placeholder="Reason (min 5 chars)" value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })} />
          <button onClick={doAdjust} className="ax-btn-primary ax-btn-sm !h-9">Apply</button>
        </div>
      </Card>
    </div>
  );
}

export function AdminAccounts() {
  const { data } = useQuery({
    queryKey: ['admin-accounts'],
    queryFn: () => get<{ items: Array<{ id: string; accountNumber: string; accountType: string; currency: string; balance: number; lockedBalance: number; status: string; user: { email: string }; _count: { positions: number; trades: number } }> }>('/api/v1/admin/accounts', { pageSize: 30 }),
    refetchInterval: 15000,
  });
  return (
    <div>
      <h1 className="text-lg font-bold tracking-tight">Trading accounts</h1>
      <div className="ax-panel mt-3 overflow-hidden">
        {!data?.items.length ? <Empty title="No accounts" /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[780px]">
            <thead><tr>{['Account', 'Owner', 'Type', 'Balance', 'Locked', 'Status', 'Pos', 'Trades'].map((h) => <th key={h} className={clsx('ax-th', (h === 'Balance' || h === 'Locked') && 'text-right')}>{h}</th>)}</tr></thead>
            <tbody>{data.items.map((a) => (
              <tr key={a.id} className="ax-row">
                <td className="ax-td font-mono text-[11px]">{a.accountNumber}</td>
                <td className="ax-td text-fog">{a.user.email}</td>
                <td className="ax-td"><span className="ax-tag">{a.accountType}</span></td>
                <td className="ax-td ax-num font-bold text-right">{fmtMoney(a.balance)}</td>
                <td className="ax-td ax-num text-right text-mute">{fmtMoney(a.lockedBalance)}</td>
                <td className="ax-td">{a.status === 'ACTIVE' ? <span className="text-up text-[11px] font-semibold">● Active</span> : <span className="text-down text-[11px] font-semibold">● {a.status}</span>}</td>
                <td className="ax-td ax-num">{a._count.positions}</td>
                <td className="ax-td ax-num">{a._count.trades}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

export function AdminAssets() {
  const qc = useQueryClient();
  const push = useUI((s) => s.push);
  const { data } = useQuery({ queryKey: ['admin-assets'], queryFn: () => get<Array<{ id: string; symbol: string; name: string; category: string; enabled: boolean; basePrice: number; volatility: number; spread: number; feeBps: number; minOrder: number; maxOrder: number; payoutPct: number }>>('/api/v1/admin/assets') });
  const [form, setForm] = useState({ symbol: '', name: '', category: 'CRYPTO', basePrice: '', volatility: '', spread: '', feeBps: '', payoutPct: '' });

  const save = async () => {
    try {
      const body: Record<string, unknown> = { symbol: form.symbol.trim(), name: form.name.trim(), category: form.category, enabled: true };
      if (form.basePrice) body.basePrice = parseFloat(form.basePrice);
      if (form.volatility) body.volatility = parseFloat(form.volatility);
      if (form.spread) body.spread = parseFloat(form.spread);
      if (form.feeBps) body.feeBps = parseInt(form.feeBps, 10);
      if (form.payoutPct) body.payoutPct = parseInt(form.payoutPct, 10);
      await put('/api/v1/admin/assets', body);
      push('ok', 'Asset saved — engine reloaded'); qc.invalidateQueries({ queryKey: ['admin-assets'] });
      setForm({ symbol: '', name: '', category: 'CRYPTO', basePrice: '', volatility: '', spread: '', feeBps: '', payoutPct: '' });
    } catch (e) { push('err', apiError(e)); }
  };
  const setPayout = async (a: NonNullable<typeof data>[number]) => {
    const v = window.prompt(`Payout % for ${a.symbol} (1–100)`, String(a.payoutPct));
    if (v === null) return;
    const n = parseInt(v, 10);
    if (!Number.isFinite(n) || n < 1 || n > 100) { push('err', 'Payout must be 1–100'); return; }
    try {
      await put('/api/v1/admin/assets', { symbol: a.symbol, name: a.name, category: a.category, payoutPct: n });
      push('ok', `${a.symbol} payout set to ${n}%`); qc.invalidateQueries({ queryKey: ['admin-assets'] }); qc.invalidateQueries({ queryKey: ['options-config'] });
    } catch (e) { push('err', apiError(e)); }
  };
  const toggle = async (a: NonNullable<typeof data>[number]) => {
    try {
      await put('/api/v1/admin/assets', { symbol: a.symbol, name: a.name, category: a.category, enabled: !a.enabled });
      push('ok', `${a.symbol} ${!a.enabled ? 'enabled' : 'halted'}`); qc.invalidateQueries({ queryKey: ['admin-assets'] });
    } catch (e) { push('err', apiError(e)); }
  };

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold tracking-tight">Assets</h1>
      <div className="ax-panel overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full min-w-[820px]">
          <thead><tr>{['Symbol', 'Name', 'Cat', 'Base', 'Vol', 'Spread', 'Payout', 'Min–Max', 'Status', ''].map((h) => <th key={h} className="ax-th">{h}</th>)}</tr></thead>
          <tbody>{(data ?? []).map((a) => (
            <tr key={a.id} className="ax-row">
              <td className="ax-td font-bold">{a.symbol}</td>
              <td className="ax-td text-mute max-w-[180px] truncate">{a.name}</td>
              <td className="ax-td"><span className="ax-tag">{a.category}</span></td>
              <td className="ax-td ax-num">{a.basePrice}</td>
              <td className="ax-td ax-num">{a.volatility}</td>
              <td className="ax-td ax-num">{a.spread}</td>
              <td className="ax-td"><button onClick={() => setPayout(a)} className="ax-num text-[11px] font-bold text-warn hover:underline" title="Click to change payout">{a.payoutPct}%</button></td>
              <td className="ax-td ax-num text-mute">{fmtMoney(a.minOrder)}–{fmtMoney(a.maxOrder)}</td>
              <td className="ax-td">{a.enabled ? <span className="text-up text-[11px] font-semibold">● Live</span> : <span className="text-down text-[11px] font-semibold">● Halted</span>}</td>
              <td className="ax-td text-right"><button onClick={() => toggle(a)} className="ax-btn-ghost ax-btn-sm">{a.enabled ? 'Halt' : 'Enable'}</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>
      <Card>
        <div className="text-[13px] font-bold">Create / update asset</div>
        <div className="grid sm:grid-cols-4 gap-2 mt-2.5">
          <input className="ax-input !text-xs" placeholder="Symbol e.g. SOL/USD" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} />
          <input className="ax-input !text-xs sm:col-span-2" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className="ax-input !text-xs" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option>CRYPTO</option><option>FOREX</option><option>METALS</option><option>INDICES</option></select>
          <input className="ax-input !text-xs" placeholder="Base price" value={form.basePrice} onChange={(e) => setForm({ ...form, basePrice: e.target.value })} />
          <input className="ax-input !text-xs" placeholder="Volatility e.g. 0.002" value={form.volatility} onChange={(e) => setForm({ ...form, volatility: e.target.value })} />
          <input className="ax-input !text-xs" placeholder="Spread e.g. 0.0004" value={form.spread} onChange={(e) => setForm({ ...form, spread: e.target.value })} />
          <input className="ax-input !text-xs" placeholder="Fee bps e.g. 10" value={form.feeBps} onChange={(e) => setForm({ ...form, feeBps: e.target.value })} />
          <input className="ax-input !text-xs" placeholder="Payout % e.g. 80" value={form.payoutPct} onChange={(e) => setForm({ ...form, payoutPct: e.target.value })} />
        </div>
        <button onClick={save} className="ax-btn-primary ax-btn-sm mt-2.5 !h-8 !px-4">Save asset</button>
      </Card>
    </div>
  );
}

export function AdminMarket() {
  const qc = useQueryClient();
  const push = useUI((s) => s.push);
  const { data } = useQuery({
    queryKey: ['admin-market'],
    queryFn: () => get<{ provider: string; demo: boolean; symbols: string[]; enabled: number; halted: number; persistedCandles: number; serverTime: number; ticks: Array<{ symbol: string; mid: number; ts: number }> }>('/api/v1/admin/market'),
    refetchInterval: 5000,
  });
  const reload = useMutation({
    mutationFn: () => post('/api/v1/admin/market/reload', {}),
    onSuccess: () => { push('ok', 'Market engine reloaded from database'); qc.invalidateQueries({ queryKey: ['admin-market'] }); },
    onError: (e) => push('err', apiError(e)),
  });
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <h1 className="text-lg font-bold tracking-tight">Market engine</h1>
        <span className="ax-tag">Live</span>
        <button onClick={() => reload.mutate()} disabled={reload.isPending} className="ax-btn-ghost ax-btn-sm ml-auto">Reload from DB</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mt-3">
        {[['Provider', data?.provider ?? '—'], ['Symbols', `${data?.enabled ?? 0} live / ${data?.halted ?? 0} halted`], ['Persisted candles', String(data?.persistedCandles ?? 0)], ['Server time', data ? new Date(data.serverTime).toLocaleTimeString('en-GB') : '—']].map(([l, v]) => (
          <div key={l} className="ax-panel px-3 py-2.5"><div className="ax-micro">{l}</div><div className="text-[15px] font-bold ax-num mt-0.5">{v}</div></div>
        ))}
      </div>
      <div className="ax-panel mt-2.5 overflow-hidden">
        <table className="w-full">
          <thead><tr>{['Symbol', 'Mid', 'Tick age', 'State'].map((h) => <th key={h} className="ax-th">{h}</th>)}</tr></thead>
          <tbody>{(data?.ticks ?? []).map((t) => {
            const age = data ? Math.max(0, Math.round((data.serverTime - t.ts) / 1000)) : 0;
            return (
              <tr key={t.symbol} className="ax-row">
                <td className="ax-td font-bold">{t.symbol}</td>
                <td className="ax-td ax-num">{t.mid.toLocaleString()}</td>
                <td className="ax-td ax-num text-mute">{age}s ago</td>
                <td className="ax-td"><span className={clsx('text-[11px] font-semibold', age < 10 ? 'text-up' : 'text-down')}>● {age < 10 ? 'Streaming' : 'Stale'}</span></td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <p className="text-[11px] text-mute mt-2">Tick cadence, volatility and spread are configured per asset. Halting is instant via Assets.</p>
    </div>
  );
}
