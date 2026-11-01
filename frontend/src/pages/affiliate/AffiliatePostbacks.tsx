import { useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { get, post, patch, del, apiError } from '../../lib/api';
import { useUI } from '../../stores/uiStore';
import { AFF, EmptyRow, LoadingRow, Page, Panel, TableWrap, fmtDateTime } from './shared';

type Ev = 'reg' | 'conf' | 'ftd' | 'dep' | 'withdrawal';
interface Postback { id: string; url: string; method: 'GET' | 'POST'; events: Ev[]; statusMap: Partial<Record<Ev, string>> | null; active: boolean; createdAt: string }
interface Log { id: string; postbackId: string; url: string; status: number | null; error: string | null; createdAt: string }
interface PostbacksResp { events: Ev[]; macros: string[]; postbacks: Postback[]; logs: Log[] }

const EVENTS: Array<[Ev, string, string]> = [
  ['reg', 'Registration', 'A trader registered through your link'],
  ['conf', 'Email confirmation', 'A trader confirmed their email address'],
  ['ftd', 'First deposit', "A trader's first deposit was credited"],
  ['dep', 'Repeat deposit', 'Any later deposit was credited'],
  ['withdrawal', 'Withdrawal', "A trader's withdrawal was paid out"],
];
const PARAMS: Array<[string, string, string]> = [
  ['status', 'Required', 'Event status — reg, conf, ftd, dep or withdrawal (or your own name from the status mapping)'],
  ['click_id', 'Required', 'The click_id your tracker added to the link'],
  ['event_id', 'Optional', 'Unique id of this event — use it to ignore duplicates'],
  ['site_id', 'Optional', 'The sub-ID of the visit (sub parameter or the link\'s sub-ID)'],
  ['lid', 'Optional', 'Numeric id of the link the trader came from'],
  ['trader_id', 'Optional', 'Anonymous trader number (same as in Statistics)'],
  ['sumdep', 'Optional', 'Amount in USD for ftd, dep and withdrawal; 0 otherwise'],
];
const label = (e: Ev) => EVENTS.find(([k]) => k === e)?.[1] ?? e;
const macro = (m: string) => `{${m}}`;
const okStatus = (s: number | null) => s !== null && s >= 200 && s < 300;

function NewPostback({ onDone }: { onDone: () => void }) {
  const push = useUI((s) => s.push);
  const qc = useQueryClient();
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState<'GET' | 'POST'>('GET');
  const [events, setEvents] = useState<Ev[]>(['reg', 'ftd', 'dep']);
  const [map, setMap] = useState<Partial<Record<Ev, string>>>({});
  const urlRef = useRef<HTMLInputElement>(null);

  const create = useMutation({
    mutationFn: () => post(`${AFF}/postbacks`, {
      url: url.trim(), method, events,
      statusMap: Object.fromEntries(Object.entries(map).map(([k, v]) => [k, (v ?? '').trim()]).filter(([, v]) => v)),
    }),
    onSuccess: () => { push('ok', 'Postback added'); qc.invalidateQueries({ queryKey: ['aff', 'postbacks'] }); onDone(); },
    onError: (e) => push('err', apiError(e)),
  });
  const insert = (m: string) => {
    const el = urlRef.current, token = macro(m);
    const a = el?.selectionStart ?? url.length, b = el?.selectionEnd ?? url.length;
    setUrl(url.slice(0, a) + token + url.slice(b));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(a + token.length, a + token.length); });
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^https?:\/\/\S+$/i.test(url.trim())) return push('err', 'Enter a full URL starting with http:// or https://');
    if (!events.length) return push('err', 'Choose at least one event');
    if (Object.values(map).some((v) => v && !/^[A-Za-z0-9_.-]{1,40}$/.test(v.trim()))) return push('err', 'Status names: letters, digits, "_", "-" and "." (max 40)');
    create.mutate();
  };

  return (
    <Panel title="New postback">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid sm:grid-cols-[1fr_160px] gap-3 items-end">
          <div className="min-w-0">
            <label htmlFor="pb-url" className="ax-label">Postback URL</label>
            <input id="pb-url" ref={urlRef} className="ax-input font-mono text-[12px]" maxLength={1000} placeholder="https://your-tracker.com/postback?subid={click_id}&status={status}" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div>
            <span className="ax-label">Method</span>
            <div className="ax-seg" role="radiogroup" aria-label="Method">
              {(['GET', 'POST'] as const).map((m) => <button key={m} type="button" role="radio" aria-checked={method === m} data-active={method === m} className="ax-seg-btn" onClick={() => setMethod(m)}>{m}</button>)}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-mute mr-1">Insert parameter:</span>
          {PARAMS.map(([m]) => <button key={m} type="button" className="ax-btn-ghost ax-btn-sm font-mono" onClick={() => insert(m)}>{macro(m)}</button>)}
        </div>

        <div>
          <div className="ax-label">Events and status mapping</div>
          <p className="text-[11px] text-mute mb-2">Tick the events to send. Leave the status empty to send our name, or type the status name your tracker expects.</p>
          <div className="ax-well divide-y divide-line">
            {EVENTS.map(([k, l, hint]) => (
              <div key={k} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <label className="flex items-center gap-2 text-xs cursor-pointer min-w-[200px]">
                  <input type="checkbox" className="ax-check" checked={events.includes(k)} onChange={(e) => setEvents((v) => (e.target.checked ? [...v, k] : v.filter((x) => x !== k)))} />
                  <span><span className="text-ink1 font-semibold">{l}</span> <span className="font-mono text-mute">({k})</span></span>
                </label>
                <span className="text-[11px] text-mute flex-1 min-w-[160px]">{hint}</span>
                <input aria-label={`Status sent for ${l}`} className="ax-input !h-8 w-[160px] font-mono text-[12px]" placeholder={k} maxLength={40} disabled={!events.includes(k)}
                  value={map[k] ?? ''} onChange={(e) => setMap((m) => ({ ...m, [k]: e.target.value }))} />
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button type="submit" className="ax-btn-primary" disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Save postback'}</button>
          <button type="button" className="ax-btn-ghost" onClick={onDone}>Cancel</button>
        </div>
      </form>
    </Panel>
  );
}

function Guide() {
  const origin = window.location.origin;
  return (
    <Panel title="About postbacks">
      <div className="text-xs text-fog leading-relaxed space-y-4 max-w-[900px]">
        <p>
          A postback is a server-to-server request our platform sends to your tracker when something happens with a trader you referred — a registration,
          a deposit, a withdrawal. It lets your tracker count conversions without relying on the visitor's browser.
        </p>

        <div>
          <h3 className="text-[13px] font-semibold text-cream mb-1">How it works</h3>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Your tracker sends the visitor to your link and adds its own visit id as <span className="font-mono text-ink1">click_id</span>, e.g. <span className="font-mono break-all">{origin}/register?lid=100001&amp;click_id=ABC123</span>.</li>
            <li>We remember that click_id with the visit and keep it with the trader when they register.</li>
            <li>For every event you subscribed to, we call your postback URL and replace the parameters (<span className="font-mono">{'{click_id}'}</span>, <span className="font-mono">{'{status}'}</span>, …) with real values.</li>
            <li>Your tracker finds the visit by click_id and records the conversion.</li>
          </ol>
        </div>

        <div>
          <h3 className="text-[13px] font-semibold text-cream mb-1">Data we pass</h3>
          <TableWrap>
            <table className="w-full">
              <thead><tr><th className="ax-th">Parameter</th><th className="ax-th">Required</th><th className="ax-th">Meaning</th></tr></thead>
              <tbody>
                {PARAMS.map(([k, r, m]) => (
                  <tr key={k} className="ax-row"><td className="ax-td font-mono">{macro(k)}</td><td className={clsx('ax-td', r === 'Required' && 'text-accent-300')}>{r}</td><td className="ax-td whitespace-normal">{m}</td></tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <p className="text-mute mt-1">Your postback URL must contain at least <span className="font-mono">{'{status}'}</span> and <span className="font-mono">{'{click_id}'}</span> (or receive them in the POST body).</p>
        </div>

        <div>
          <h3 className="text-[13px] font-semibold text-cream mb-1">GET or POST</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li><span className="font-semibold text-ink1">GET</span> — parameters are placed into the URL: <span className="font-mono break-all">https://tracker.com/pb?subid={'{click_id}'}&amp;status={'{status}'}&amp;payout={'{sumdep}'}</span></li>
            <li><span className="font-semibold text-ink1">POST</span> — the URL is called as written (parameters in it are still replaced) and all parameters are also sent as a JSON body: <span className="font-mono">{'{"status":"ftd","click_id":"ABC123","event_id":"dep-…","site_id":"","lid":"100001","trader_id":"3F9A1C","sumdep":"50.00"}'}</span></li>
          </ul>
        </div>

        <div>
          <h3 className="text-[13px] font-semibold text-cream mb-1">Statuses and mapping</h3>
          <p>Our statuses are <span className="font-mono">reg</span>, <span className="font-mono">conf</span>, <span className="font-mono">ftd</span>, <span className="font-mono">dep</span> and <span className="font-mono">withdrawal</span>.
            If your tracker uses different names, map them when you create the postback — for example send <span className="font-mono">lead</span> instead of <span className="font-mono">reg</span> and <span className="font-mono">sale</span> instead of <span className="font-mono">ftd</span>.
            Email confirmation (<span className="font-mono">conf</span>) is sent once that step is enabled on the platform.</p>
        </div>

        <div>
          <h3 className="text-[13px] font-semibold text-cream mb-1">Example: a self-hosted tracker such as Keitaro</h3>
          <ol className="list-decimal pl-5 space-y-1">
            <li>In the tracker, add your Aurelix link as an offer and append its click macro: <span className="font-mono break-all">{origin}/register?lid=100001&amp;click_id={'{subid}'}</span></li>
            <li>Copy the tracker's postback URL, e.g. <span className="font-mono break-all">https://your-tracker.com/postback?subid=…&amp;status=…&amp;payout=…</span></li>
            <li>Replace the values with our parameters: <span className="font-mono break-all">https://your-tracker.com/postback?subid={'{click_id}'}&amp;status={'{status}'}&amp;payout={'{sumdep}'}&amp;tid={'{event_id}'}</span></li>
            <li>Map the statuses to the tracker's: <span className="font-mono">reg → lead</span>, <span className="font-mono">ftd → sale</span>, <span className="font-mono">dep → sale</span>, and press <span className="font-semibold">Test</span> to check the connection.</li>
          </ol>
        </div>

        <p className="text-mute">Only public http/https addresses on ports 80, 443, 8080 or 8443 are accepted. Every delivery and its response code is listed under Recent deliveries.</p>
      </div>
    </Panel>
  );
}

export function AffiliatePostbacks() {
  const push = useUI((s) => s.push);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['aff', 'postbacks'], queryFn: () => get<PostbacksResp>(`${AFF}/postbacks`) });
  const [tab, setTab] = useState<'list' | 'about'>('list');
  const [creating, setCreating] = useState(false);
  const [results, setResults] = useState<Record<string, { status: number | null; error: string | null }>>({});
  const inval = () => qc.invalidateQueries({ queryKey: ['aff', 'postbacks'] });

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => patch(`${AFF}/postbacks/${id}`, { active }),
    onSuccess: inval, onError: (e) => push('err', apiError(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`${AFF}/postbacks/${id}`),
    onSuccess: () => { push('ok', 'Postback deleted'); inval(); }, onError: (e) => push('err', apiError(e)),
  });
  const test = useMutation({
    mutationFn: (id: string) => post<{ status: number | null; error: string | null }>(`${AFF}/postbacks/${id}/test`, {}),
    onSuccess: (r, id) => { setResults((x) => ({ ...x, [id]: r })); push(okStatus(r.status) ? 'ok' : 'err', okStatus(r.status) ? `Test delivered (HTTP ${r.status})` : `Test failed: ${r.error ?? `HTTP ${r.status}`}`); inval(); },
    onError: (e) => push('err', apiError(e)),
  });
  const d = q.data;

  return (
    <Page title="Postbacks" right={
      <div className="flex gap-2">
        <div className="ax-seg w-[220px]" role="tablist" aria-label="Postbacks">
          <button role="tab" aria-selected={tab === 'list'} data-active={tab === 'list'} className="ax-seg-btn" onClick={() => setTab('list')}>Postbacks</button>
          <button role="tab" aria-selected={tab === 'about'} data-active={tab === 'about'} className="ax-seg-btn" onClick={() => setTab('about')}>About postbacks</button>
        </div>
        {tab === 'list' && !creating && <button className="ax-btn-primary" onClick={() => setCreating(true)}>+ New postback</button>}
      </div>
    }>
      {tab === 'about' ? <Guide /> : (
        <>
          {creating && <NewPostback onDone={() => setCreating(false)} />}
          <Panel pad={false} className="overflow-hidden" title="Your postbacks">
            <TableWrap>
              <table className="w-full">
                <thead><tr><th className="ax-th">Method</th><th className="ax-th">URL</th><th className="ax-th">Events → status</th><th className="ax-th">Active</th><th className="ax-th">Last test</th><th className="ax-th"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {q.isLoading && <LoadingRow cols={6} />}
                  {q.isError && <EmptyRow cols={6} text={apiError(q.error)} />}
                  {(d?.postbacks ?? []).map((p) => {
                    const r = results[p.id];
                    return (
                      <tr key={p.id} className="ax-row">
                        <td className="ax-td font-mono">{p.method}</td>
                        <td className="ax-td font-mono text-[11px] text-fog max-w-[360px] truncate" title={p.url}>{p.url}</td>
                        <td className="ax-td">
                          <div className="flex flex-wrap gap-1">
                            {p.events.map((e) => <span key={e} className="ax-tag" title={label(e)}>{e}{p.statusMap?.[e] ? ` → ${p.statusMap[e]}` : ''}</span>)}
                          </div>
                        </td>
                        <td className="ax-td">
                          <button role="switch" aria-checked={p.active} aria-label={`Postback ${p.active ? 'active' : 'paused'}`} disabled={toggle.isPending}
                            onClick={() => toggle.mutate({ id: p.id, active: !p.active })}
                            className={clsx('relative w-9 h-5 rounded-full border transition-colors', p.active ? 'bg-accent-600 border-accent-500' : 'bg-base-800 border-line')}>
                            <span className={clsx('absolute top-[2px] w-3.5 h-3.5 rounded-full bg-cream transition-all', p.active ? 'left-[18px]' : 'left-[2px]')} />
                          </button>
                        </td>
                        <td className="ax-td text-[11px]">
                          {r ? <span className={okStatus(r.status) ? 'text-up' : 'text-down'}>{r.status ? `HTTP ${r.status}` : 'No response'}{r.error ? ` · ${r.error}` : ''}</span> : <span className="text-mute">—</span>}
                        </td>
                        <td className="ax-td">
                          <div className="flex justify-end gap-1.5">
                            <button className="ax-btn-ghost ax-btn-sm" disabled={test.isPending} onClick={() => test.mutate(p.id)}>{test.isPending && test.variables === p.id ? 'Testing…' : 'Test'}</button>
                            <button className="ax-btn-danger ax-btn-sm" disabled={remove.isPending} onClick={() => remove.mutate(p.id)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {d && !d.postbacks.length && <EmptyRow cols={6} text="No postbacks yet. Press “New postback”, or read “About postbacks” first." />}
                </tbody>
              </table>
            </TableWrap>
          </Panel>

          <Panel pad={false} className="overflow-hidden" title="Recent deliveries">
            <TableWrap>
              <table className="w-full">
                <thead><tr><th className="ax-th">Time</th><th className="ax-th">Request</th><th className="ax-th">Status</th><th className="ax-th">Error</th></tr></thead>
                <tbody>
                  {(d?.logs ?? []).map((l) => (
                    <tr key={l.id} className="ax-row">
                      <td className="ax-td ax-num">{fmtDateTime(l.createdAt)}</td>
                      <td className="ax-td font-mono text-[11px] text-fog max-w-[420px] truncate" title={l.url}>{l.url}</td>
                      <td className={clsx('ax-td ax-num', okStatus(l.status) ? 'text-up' : 'text-down')}>{l.status ?? '—'}</td>
                      <td className="ax-td text-[11px] text-mute max-w-[280px] truncate" title={l.error ?? undefined}>{l.error ?? '—'}</td>
                    </tr>
                  ))}
                  {d && !d.logs.length && <EmptyRow cols={4} text="No deliveries yet." />}
                </tbody>
              </table>
            </TableWrap>
          </Panel>
        </>
      )}
    </Page>
  );
}
