import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { get, post, apiError } from '../../lib/api';
import { useUI } from '../../stores/uiStore';
import { AFF, Page, Panel, StatusTag, fmtDateTime } from './shared';

interface Ticket { id: string; subject: string; status: 'OPEN' | 'ANSWERED' | 'CLOSED'; createdAt: string; updatedAt: string }
interface Thread { ticket: Ticket; messages: Array<{ id: string; fromAdmin: boolean; body: string; createdAt: string }> }

function NewTicket({ onCreated }: { onCreated: (id: string) => void }) {
  const push = useUI((s) => s.push);
  const qc = useQueryClient();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const create = useMutation({
    mutationFn: () => post<Ticket>(`${AFF}/tickets`, { subject: subject.trim(), body: body.trim() }),
    onSuccess: (t) => { push('ok', 'Ticket sent'); setSubject(''); setBody(''); qc.invalidateQueries({ queryKey: ['aff', 'tickets'] }); onCreated(t.id); },
    onError: (e) => push('err', apiError(e)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (subject.trim().length < 3) return push('err', 'Subject must be at least 3 characters');
    if (body.trim().length < 5) return push('err', 'Message must be at least 5 characters');
    create.mutate();
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label htmlFor="tk-subject" className="ax-label">Subject</label>
        <input id="tk-subject" className="ax-input" maxLength={120} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div>
        <label htmlFor="tk-body" className="ax-label">Message</label>
        <textarea id="tk-body" rows={6} maxLength={5000} className="ax-input h-auto py-2 leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <button type="submit" className="ax-btn-primary" disabled={create.isPending}>{create.isPending ? 'Sending…' : 'Send ticket'}</button>
    </form>
  );
}

function ThreadView({ id, onBack }: { id: string; onBack: () => void }) {
  const push = useUI((s) => s.push);
  const qc = useQueryClient();
  const [reply, setReply] = useState('');
  const q = useQuery({ queryKey: ['aff', 'ticket', id], queryFn: () => get<Thread>(`${AFF}/tickets/${id}`), refetchInterval: 20_000 });
  const inval = () => { qc.invalidateQueries({ queryKey: ['aff', 'ticket', id] }); qc.invalidateQueries({ queryKey: ['aff', 'tickets'] }); };
  const send = useMutation({
    mutationFn: () => post(`${AFF}/tickets/${id}/messages`, { body: reply.trim() }),
    onSuccess: () => { setReply(''); inval(); },
    onError: (e) => push('err', apiError(e)),
  });
  const close = useMutation({
    mutationFn: () => post(`${AFF}/tickets/${id}/close`, {}),
    onSuccess: () => { push('ok', 'Ticket closed'); inval(); },
    onError: (e) => push('err', apiError(e)),
  });
  const t = q.data?.ticket;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className="ax-btn-quiet" onClick={onBack}>← All tickets</button>
        {t && <StatusTag status={t.status} />}
        {t && t.status !== 'CLOSED' && <button className="ax-btn-ghost ax-btn-sm ml-auto" disabled={close.isPending} onClick={() => close.mutate()}>Close ticket</button>}
      </div>
      {q.isLoading && <p className="text-xs text-mute">Loading…</p>}
      {q.isError && <p className="text-xs text-down">{apiError(q.error)}</p>}
      {t && <h2 className="text-[15px] font-semibold text-cream break-words">{t.subject}</h2>}
      <div className="space-y-2">
        {(q.data?.messages ?? []).map((m) => (
          <div key={m.id} className={clsx('rounded-md border p-3 max-w-[85%]', m.fromAdmin ? 'bg-base-850 border-line' : 'ml-auto bg-accent-700/30 border-accent-700')}>
            <div className="text-[10px] text-mute mb-1">{m.fromAdmin ? 'Partner team' : 'You'} · {fmtDateTime(m.createdAt)}</div>
            <div className="text-xs text-ink1 whitespace-pre-wrap break-words leading-relaxed">{m.body}</div>
          </div>
        ))}
      </div>
      {t && t.status !== 'CLOSED' ? (
        <form onSubmit={(e) => { e.preventDefault(); if (reply.trim()) send.mutate(); }} className="space-y-2">
          <label htmlFor="tk-reply" className="ax-label">Reply</label>
          <textarea id="tk-reply" rows={4} maxLength={5000} className="ax-input h-auto py-2 leading-relaxed" value={reply} onChange={(e) => setReply(e.target.value)} />
          <button type="submit" className="ax-btn-primary" disabled={send.isPending || !reply.trim()}>{send.isPending ? 'Sending…' : 'Send reply'}</button>
        </form>
      ) : t && <p className="text-[11px] text-mute">This ticket is closed. Open a new ticket if you need more help.</p>}
    </div>
  );
}

export function AffiliateSupport() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<'list' | 'new'>('list');
  const q = useQuery({ queryKey: ['aff', 'tickets'], queryFn: () => get<Ticket[]>(`${AFF}/tickets`), refetchInterval: 30_000 });

  return (
    <Page title="Support" lead="Questions about commission, payouts, traffic approval or anything else — the partner team answers here.">
      <Panel>
        {openId ? <ThreadView id={openId} onBack={() => setOpenId(null)} /> : (
          <>
            <div className="ax-seg w-[240px] mb-4" role="tablist" aria-label="Support">
              <button role="tab" aria-selected={mode === 'list'} data-active={mode === 'list'} className="ax-seg-btn" onClick={() => setMode('list')}>My tickets</button>
              <button role="tab" aria-selected={mode === 'new'} data-active={mode === 'new'} className="ax-seg-btn" onClick={() => setMode('new')}>New ticket</button>
            </div>
            {mode === 'new' ? <NewTicket onCreated={(id) => { setMode('list'); setOpenId(id); }} /> : (
              <div role="tabpanel">
                {q.isLoading && <p className="text-xs text-mute">Loading…</p>}
                {q.isError && <p className="text-xs text-down">{apiError(q.error)}</p>}
                {q.data && !q.data.length && (
                  <div className="text-center py-8">
                    <p className="text-xs text-mute">No tickets yet.</p>
                    <button className="ax-btn-primary mt-3" onClick={() => setMode('new')}>Open a ticket</button>
                  </div>
                )}
                <ul className="divide-y divide-line">
                  {(q.data ?? []).map((t) => (
                    <li key={t.id}>
                      <button className="w-full text-left py-3 px-1 flex items-center gap-3 hover:bg-base-850 rounded-md transition-colors" onClick={() => setOpenId(t.id)}>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-semibold text-ink1 truncate">{t.subject}</span>
                          <span className="block text-[11px] text-mute">Updated {fmtDateTime(t.updatedAt)}</span>
                        </span>
                        <StatusTag status={t.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </Panel>
    </Page>
  );
}
