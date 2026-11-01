import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, del, apiError } from '../../lib/api';
import { useUI } from '../../stores/uiStore';
import {
  AFF, CopyButton, EmptyRow, LoadingRow, MODEL_LABEL, ModelSelect, Page, Panel, TableWrap, fmtDate, firstAllowedModel, modelBlocked, usePrograms, type Model,
} from './shared';

interface PromoCode { id: string; code: string; model: Model; createdAt: string; registrations: number }

export function AffiliatePromocodes() {
  const push = useUI((s) => s.push);
  const qc = useQueryClient();
  const { data: programs } = usePrograms();
  const codes = useQuery({ queryKey: ['aff', 'promocodes'], queryFn: () => get<PromoCode[]>(`${AFF}/promocodes`) });
  const [code, setCode] = useState('');
  const [model, setModel] = useState<Model>('TURNOVER');
  useEffect(() => { if (programs && modelBlocked(programs, model)) setModel(firstAllowedModel(programs)); }, [programs, model]);

  const create = useMutation({
    mutationFn: () => post(`${AFF}/promocodes`, { code: code.trim().toUpperCase(), model }),
    onSuccess: () => { push('ok', 'Promo code created'); setCode(''); qc.invalidateQueries({ queryKey: ['aff', 'promocodes'] }); },
    onError: (e) => push('err', apiError(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`${AFF}/promocodes/${id}`),
    onSuccess: () => { push('ok', 'Promo code deleted'); qc.invalidateQueries({ queryKey: ['aff', 'promocodes'] }); },
    onError: (e) => push('err', apiError(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^[A-Za-z0-9]{4,16}$/.test(code.trim())) return push('err', 'Use 4–16 letters or digits');
    create.mutate();
  };

  return (
    <Page title="Promocodes" lead="A promo code works like a tracking link without a URL: traders enter it when they register and are attributed to you with the code’s commission model.">
      <Panel title="New promo code">
        <form onSubmit={submit} className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end max-w-[720px]">
          <div>
            <label htmlFor="pc-code" className="ax-label">Code</label>
            <input id="pc-code" className="ax-input font-mono uppercase" maxLength={16} placeholder="4–16 letters or digits" value={code} onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, ''))} />
          </div>
          <div>
            <label htmlFor="pc-model" className="ax-label">Commission model</label>
            <ModelSelect id="pc-model" value={model} onChange={setModel} programs={programs} />
          </div>
          <button type="submit" className="ax-btn-primary" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create code'}</button>
        </form>
      </Panel>

      <Panel pad={false} className="overflow-hidden" title="Your promo codes">
        <TableWrap>
          <table className="w-full">
            <thead><tr><th className="ax-th">Code</th><th className="ax-th">Model</th><th className="ax-th text-right">Registrations</th><th className="ax-th">Created</th><th className="ax-th"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {codes.isLoading && <LoadingRow cols={5} />}
              {codes.isError && <EmptyRow cols={5} text={apiError(codes.error)} />}
              {(codes.data ?? []).map((c) => (
                <tr key={c.id} className="ax-row">
                  <td className="ax-td font-mono font-semibold">{c.code}</td>
                  <td className="ax-td">{MODEL_LABEL[c.model] ?? c.model}</td>
                  <td className="ax-td text-right ax-num">{c.registrations}</td>
                  <td className="ax-td ax-num">{fmtDate(c.createdAt)}</td>
                  <td className="ax-td">
                    <div className="flex justify-end gap-1.5">
                      <CopyButton text={c.code} what="promo code" />
                      <button
                        className="ax-btn-danger ax-btn-sm" disabled={remove.isPending} aria-label={`Delete promo code ${c.code}`}
                        onClick={() => { if (window.confirm(`Delete promo code ${c.code}? New traders will no longer be able to use it.`)) remove.mutate(c.id); }}
                      >Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {codes.data && !codes.data.length && <EmptyRow cols={5} text="No promo codes yet." />}
            </tbody>
          </table>
        </TableWrap>
      </Panel>
    </Page>
  );
}
