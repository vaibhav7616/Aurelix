import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, apiError } from '../../lib/api';
import { useTerminal } from '../../stores/terminalStore';
import { useUI } from '../../stores/uiStore';
import { Card, SectionTitle, Empty } from '../../components/ui/primitives';
import { fmtMoney, fmtTime } from '../../lib/format';
import { clsx } from 'clsx';

interface Account { id: string; accountNumber: string; balance: number }
interface Txn { id: string; type: string; amount: number; balanceAfter: number; memo: string | null; createdAt: string }

export function WalletPage() {
  const { accountId, setAccountId } = useTerminal();
  const push = useUI((s) => s.push);
  const qc = useQueryClient();
  const [depAmt, setDepAmt] = useState('1000');
  const [wdAmt, setWdAmt] = useState('100');
  const [wdMethod, setWdMethod] = useState('bank');

  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: () => get<Account[]>('/api/v1/accounts') });
  const id = accountId ?? accounts?.[0]?.id;
  const { data: wallet } = useQuery({ queryKey: ['wallet', id], queryFn: () => get<{ balance: number; locked: number; available: number; currency: string }>(`/api/v1/wallet/${id}`), enabled: !!id, refetchInterval: 8000 });
  const { data: txns } = useQuery({ queryKey: ['wallet-txns', id], queryFn: () => get<{ items: Txn[] }>(`/api/v1/wallet/${id}/transactions`, { pageSize: 25 }), enabled: !!id, refetchInterval: 10000 });

  const deposit = useMutation({
    mutationFn: () => post(`/api/v1/wallet/deposit`, { accountId: id, amount: parseFloat(depAmt), currency: 'USD' }),
    onSuccess: () => { push('ok', 'Deposit credited'); ['wallet', 'accounts', 'wallet-txns', 'stats'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); },
    onError: (e) => push('err', apiError(e)),
  });
  const withdraw = useMutation({
    mutationFn: () => post('/api/v1/withdrawals', { accountId: id, amount: parseFloat(wdAmt), method: wdMethod }),
    onSuccess: () => { push('ok', 'Withdrawal requested — pending review'); qc.invalidateQueries({ queryKey: ['wallet'] }); },
    onError: (e) => push('err', apiError(e)),
  });

  return (
    <div className="max-w-[1100px] mx-auto p-4 space-y-3">
      <div className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-lg font-bold tracking-tight">Wallet</h1>
        <select value={id ?? ''} onChange={(e) => setAccountId(e.target.value)} className="ax-input !w-auto !h-8 !text-xs font-bold">
          {(accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.accountNumber}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[['Balance', wallet?.balance], ['Available', wallet?.available], ['Locked in review', wallet?.locked]].map(([l, v]) => (
          <div key={l as string} className="ax-panel px-3.5 py-3">
            <div className="ax-micro">{l}</div>
            <div className="text-[19px] font-bold ax-num mt-1">{v !== undefined ? fmtMoney(v as number) : '—'}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <Card>
          <SectionTitle title="Deposit" right={<span className="text-[10px] text-mute">instant</span>} />
          <div className="flex gap-2">
            <input value={depAmt} onChange={(e) => setDepAmt(e.target.value)} inputMode="decimal" className="ax-input ax-num font-bold" />
            <button onClick={() => deposit.mutate()} disabled={deposit.isPending || !id} className="ax-btn-primary whitespace-nowrap">{deposit.isPending ? '…' : 'Deposit'}</button>
          </div>
          <p className="text-[11px] text-mute mt-2">Funds are credited instantly to your account.</p>
        </Card>
        <Card>
          <SectionTitle title="Withdraw" right={<span className="text-[10px] text-mute">locks funds · admin review</span>} />
          <div className="flex gap-2">
            <select value={wdMethod} onChange={(e) => setWdMethod(e.target.value)} className="ax-input !w-[110px]"><option value="bank">Bank</option><option value="crypto">Crypto</option><option value="upi">UPI</option></select>
            <input value={wdAmt} onChange={(e) => setWdAmt(e.target.value)} inputMode="decimal" className="ax-input ax-num font-bold" />
            <button onClick={() => withdraw.mutate()} disabled={withdraw.isPending || !id} className="ax-btn-ghost whitespace-nowrap">{withdraw.isPending ? '…' : 'Request'}</button>
          </div>
          <p className="text-[11px] text-mute mt-2">Requests lock funds immediately until reviewed.</p>
        </Card>
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="px-3.5 pt-3"><SectionTitle title="Ledger" right={<span className="text-[10px] text-mute">every balance movement</span>} /></div>
        {!txns?.items.length ? <Empty title="No transactions" /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
            <thead><tr>{['Type', 'Amount', 'Balance after', 'Memo', 'Time'].map((h) => <th key={h} className={clsx('ax-th', h === 'Amount' && 'text-right')}>{h}</th>)}</tr></thead>
            <tbody>{txns.items.map((t) => (
              <tr key={t.id} className="ax-row">
                <td className="ax-td"><span className="ax-tag">{t.type}</span></td>
                <td className={clsx('ax-td ax-num font-bold text-right', Number(t.amount) >= 0 ? 'text-up' : 'text-down')}>{fmtMoney(t.amount)}</td>
                <td className="ax-td ax-num text-fog">{fmtMoney(t.balanceAfter)}</td>
                <td className="ax-td text-mute text-[11px] max-w-[280px] truncate">{t.memo ?? '—'}</td>
                <td className="ax-td text-mute">{fmtTime(t.createdAt)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}

export function TransfersPage({ kind }: { kind: 'deposits' | 'withdrawals' }) {
  const isDep = kind === 'deposits';
  const { data } = useQuery({
    queryKey: [kind],
    queryFn: () => get<Array<{ id: string; amount: number; status: string; createdAt: string; provider?: string; method?: string }>>(isDep ? '/api/v1/payments' : '/api/v1/withdrawals'),
    refetchInterval: 10000,
  });
  return (
    <div className="max-w-[860px] mx-auto p-4">
      <h1 className="text-lg font-bold tracking-tight capitalize">{kind}</h1>
      <div className="ax-panel mt-3 overflow-hidden">
        {!data?.length ? <Empty title={`No ${kind} yet`} /> : (
          <table className="w-full">
            <thead><tr>{['Amount', isDep ? 'Provider' : 'Method', 'Status', 'Date'].map((h) => <th key={h} className="ax-th">{h}</th>)}</tr></thead>
            <tbody>{data.map((r) => (
              <tr key={r.id} className="ax-row">
                <td className="ax-td ax-num font-bold">{fmtMoney(r.amount)}</td>
                <td className="ax-td text-mute">{r.provider ?? r.method ?? '—'}</td>
                <td className="ax-td"><span className="ax-tag">{r.status}</span></td>
                <td className="ax-td text-mute">{fmtTime(r.createdAt)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
