import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { get, put, apiError } from '../../lib/api';
import { fmtMoney } from '../../lib/format';
import { useUI } from '../../stores/uiStore';
import { AFF, Check, EmptyRow, Kpi, LoadingRow, Page, Panel, StatusTag, TableWrap, WEEKDAYS, fmtDate, fmtDateTime, usePrograms, useApprovedMe } from './shared';

interface Payout { id: string; amount: number; status: 'REQUESTED' | 'PAID' | 'REJECTED'; periodEnd: string; method: string | null; note: string | null; createdAt: string; processedAt: string | null }

const METHODS = [
  { id: 'bank', label: 'Bank transfer', fields: [['holderName', 'Account holder name'], ['bankName', 'Bank name'], ['accountNumber', 'Account number'], ['ifsc', 'IFSC / bank code']] },
  { id: 'upi', label: 'UPI', fields: [['upiId', 'UPI ID']] },
  { id: 'crypto', label: 'Crypto', fields: [['network', 'Network (e.g. TRC20)'], ['address', 'Wallet address']] },
] as const;
type Method = (typeof METHODS)[number]['id'];

function PayoutDetailsForm({ method: savedMethod, details: savedDetails }: { method: string | null; details: Record<string, string> | null }) {
  const push = useUI((s) => s.push);
  const qc = useQueryClient();
  const [method, setMethod] = useState<Method>((['bank', 'upi', 'crypto'].includes(savedMethod ?? '') ? savedMethod : 'bank') as Method);
  const [vals, setVals] = useState<Record<string, string>>(savedDetails ?? {});
  const m = METHODS.find((x) => x.id === method)!;

  const save = useMutation({
    mutationFn: () => put(`${AFF}/payout-details`, { method, details: Object.fromEntries(m.fields.map(([k]) => [k, (vals[k] ?? '').trim()])) }),
    onSuccess: () => { push('ok', 'Payout details saved'); qc.invalidateQueries({ queryKey: ['aff', 'me'] }); },
    onError: (e) => push('err', apiError(e)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (m.fields.some(([k]) => !(vals[k] ?? '').trim())) return push('err', 'Fill in all payout fields');
    save.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="ax-seg" role="tablist" aria-label="Payout method">
        {METHODS.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={method === x.id} data-active={method === x.id} className="ax-seg-btn" onClick={() => setMethod(x.id)}>{x.label}</button>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {m.fields.map(([k, label]) => (
          <div key={k}>
            <label htmlFor={`pd-${k}`} className="ax-label">{label}</label>
            <input id={`pd-${k}`} className="ax-input" maxLength={200} value={vals[k] ?? ''} onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))} autoComplete="off" />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" className="ax-btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save payout details'}</button>
        {savedMethod && <span className="text-[11px] text-mute">Current method: {METHODS.find((x) => x.id === savedMethod)?.label ?? savedMethod}</span>}
      </div>
    </form>
  );
}

export function AffiliateWithdrawal() {
  const me = useApprovedMe();
  const { data: p } = usePrograms();
  const payouts = useQuery({ queryKey: ['aff', 'payouts'], queryFn: () => get<Payout[]>(`${AFF}/payouts`) });
  if (!me) return null;
  const c = me.payoutChecks;
  const paid = (payouts.data ?? []).filter((x) => x.status === 'PAID').reduce((a, x) => a + x.amount, 0);
  const day = WEEKDAYS[p?.payoutWeekday ?? 4];

  return (
    <Page title="Withdrawal" lead={`Partner earnings are paid automatically every ${day} for the previous week, to the payout details saved below. There is no manual request — make sure every item in the checklist is met.`}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Kpi label="Your balance" value={fmtMoney(me.balance)} tone={me.balance < 0 ? 'down' : undefined} sub={`Minimum payout ${fmtMoney(me.minPayout)}`} />
        <Kpi label="On hold" value={fmtMoney(me.held)} tone={me.held > 0 ? 'warn' : undefined} sub="Commission under review" />
        <Kpi label="Paid out" value={fmtMoney(paid)} sub="All time" />
        <Kpi label="Next payout run" value={<span className="text-[15px]">{fmtDateTime(me.nextPayoutAt)}</span>} sub={me.payoutEligible ? 'You are included' : 'Checklist incomplete'} tone={me.payoutEligible ? 'up' : 'warn'} />
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
        <Panel title="Payout details">
          <PayoutDetailsForm method={me.affiliate.payoutMethod} details={me.affiliate.payoutDetails} />
          <p className="text-[11px] text-mute mt-3">Payout details must belong to you. Details shared with a referred trader put the related commission on hold.</p>
        </Panel>
        <Panel title="Payout checklist">
          <ul className="space-y-2">
            <Check ok={c.approved}>Partner account approved</Check>
            <Check ok={c.verified}>Partner account verified by the programme team</Check>
            <Check ok={c.activeTraders}>{me.minActiveTraders} active traders ({me.activeTraders} so far{c.activeTraders ? '' : `, ${me.minActiveTraders - me.activeTraders} more needed`})</Check>
            <Check ok={c.minBalance}>Balance of at least {fmtMoney(me.minPayout)}</Check>
            <Check ok={c.payoutDetails}>Payout details saved</Check>
          </ul>
          <div className={clsx('mt-3 text-xs font-semibold', me.payoutEligible ? 'text-up' : 'text-warn')}>
            {me.payoutEligible ? 'You will be included in the next payout.' : 'Complete the missing items to receive payouts.'}
          </div>
          {!c.verified && <p className="mt-2 text-[11px] text-mute">Verification is done by the partner team — <Link to="/affiliate/support" className="text-accent-300 hover:underline">contact support</Link> if it is pending.</p>}
        </Panel>
      </div>

      <Panel title="Payout history" pad={false}>
        <TableWrap>
          <table className="w-full">
            <thead><tr><th className="ax-th">Period end</th><th className="ax-th text-right">Amount</th><th className="ax-th">Method</th><th className="ax-th">Status</th><th className="ax-th">Processed</th></tr></thead>
            <tbody>
              {payouts.isLoading && <LoadingRow cols={5} />}
              {(payouts.data ?? []).map((x) => (
                <tr key={x.id} className="ax-row">
                  <td className="ax-td ax-num">{fmtDate(x.periodEnd)}</td>
                  <td className="ax-td text-right ax-num font-semibold">{fmtMoney(x.amount)}</td>
                  <td className="ax-td">{x.method ?? '—'}</td>
                  <td className="ax-td"><StatusTag status={x.status} />{x.note && <span className="ml-1.5 text-[10px] text-mute">{x.note}</span>}</td>
                  <td className="ax-td ax-num">{fmtDate(x.processedAt)}</td>
                </tr>
              ))}
              {payouts.data && !payouts.data.length && <EmptyRow cols={5} text="No payouts yet." />}
              {payouts.isError && <EmptyRow cols={5} text={apiError(payouts.error)} />}
            </tbody>
          </table>
        </TableWrap>
      </Panel>
    </Page>
  );
}
