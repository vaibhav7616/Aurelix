import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { post, patch, apiError } from '../../lib/api';
import { useUI } from '../../stores/uiStore';
import {
  AFF, CopyButton, EmptyRow, LINK_TYPES, LoadingRow, MODEL_LABEL, ModelSelect, Page, Panel, TableWrap, fmtDate, firstAllowedModel,
  linkType, linkUrl, modelBlocked, useLinks, usePrograms, type Model,
} from './shared';

export function AffiliateLinks() {
  const push = useUI((s) => s.push);
  const qc = useQueryClient();
  const { data: programs } = usePrograms();
  const links = useLinks();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [model, setModel] = useState<Model>('TURNOVER');
  const [subId, setSubId] = useState('');
  const [landing, setLanding] = useState('/register');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => { if (programs && modelBlocked(programs, model)) setModel(firstAllowedModel(programs)); }, [programs, model]);
  const inval = () => qc.invalidateQueries({ queryKey: ['aff', 'links'] });

  const create = useMutation({
    mutationFn: () => post(`${AFF}/links`, { name: name.trim(), model, landing, ...(subId.trim() ? { subId: subId.trim() } : {}) }),
    onSuccess: () => { push('ok', 'Link created'); setName(''); setSubId(''); setOpen(false); inval(); },
    onError: (e) => push('err', apiError(e)),
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; archived?: boolean; name?: string }) => patch(`${AFF}/links/${id}`, body),
    onSuccess: () => { setEditing(null); inval(); },
    onError: (e) => push('err', apiError(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return push('err', 'Add a comment so you can recognise the link');
    if (subId && !/^[A-Za-z0-9_.-]{1,64}$/.test(subId.trim())) return push('err', 'Sub-ID: letters, digits, "_", "-" and "." only (max 64)');
    create.mutate();
  };

  const rows = (links.data ?? []).filter((l) => showArchived || !l.archived);
  const archivedCount = (links.data ?? []).filter((l) => l.archived).length;

  return (
    <Page
      title="Links"
      right={<button className="ax-btn-primary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? 'Close' : '+ New link'}</button>}
    >
      <Panel>
        <div className="text-xs text-fog leading-relaxed space-y-2 max-w-[860px]">
          <p>
            Your links are unique to your partner account — every trader who arrives through one of them is attributed to you.
            Ready-made links are created for each commission model available to you: <span className="text-ink1 font-semibold">Revenue Share</span> (a share of the platform's net result on your traders)
            and <span className="text-ink1 font-semibold">Turnover Share</span> (a share of your traders' trade volume). The model is fixed for each trader when they register.
          </p>
          <p>
            Read how each model is calculated in <Link to="/affiliate/programs" className="text-accent-300 hover:underline">Affiliate Programs</Link>.
            Create additional links for each traffic source (a channel, a post, a campaign) to compare them in <Link to="/affiliate/statistics" className="text-accent-300 hover:underline">Statistics → Links</Link>.
          </p>
        </div>
      </Panel>

      {open && (
        <Panel title="New link">
          <form onSubmit={submit} className="grid sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr_auto] gap-3 items-end">
            <div>
              <label htmlFor="ln-name" className="ax-label">Comment</label>
              <input id="ln-name" className="ax-input" maxLength={60} placeholder="e.g. YouTube description" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div>
              <label htmlFor="ln-landing" className="ax-label">Type</label>
              <select id="ln-landing" className="ax-input" value={landing} onChange={(e) => setLanding(e.target.value)}>
                {LINK_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="ln-model" className="ax-label">Program</label>
              <ModelSelect id="ln-model" value={model} onChange={setModel} programs={programs} />
            </div>
            <div>
              <label htmlFor="ln-sub" className="ax-label">Sub-ID (optional)</label>
              <input id="ln-sub" className="ax-input" maxLength={64} placeholder="e.g. video42" value={subId} onChange={(e) => setSubId(e.target.value)} />
            </div>
            <button type="submit" className="ax-btn-primary" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create link'}</button>
          </form>
        </Panel>
      )}

      <Panel pad={false} className="overflow-hidden" title="Your links" right={archivedCount > 0 && (
        <label className="flex items-center gap-1.5 text-[11px] text-fog cursor-pointer">
          <input type="checkbox" className="ax-check" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived ({archivedCount})
        </label>
      )}>
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <th className="ax-th">ID</th><th className="ax-th">Link</th><th className="ax-th">Comment</th><th className="ax-th">Type</th>
                <th className="ax-th">Program</th><th className="ax-th">Date</th><th className="ax-th text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {links.isLoading && <LoadingRow cols={7} />}
              {links.isError && <EmptyRow cols={7} text={apiError(links.error)} />}
              {rows.map((l) => {
                const url = linkUrl(l);
                return (
                  <tr key={l.id} className={clsx('ax-row', l.archived && 'opacity-60')}>
                    <td className="ax-td font-mono ax-num">#{l.num}</td>
                    <td className="ax-td">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-fog">{url}</span>
                        <CopyButton text={url} what="link" />
                      </div>
                      {l.subId && <div className="text-[10px] text-mute mt-0.5">sub-ID: <span className="font-mono">{l.subId}</span></div>}
                    </td>
                    <td className="ax-td">
                      {editing?.id === l.id ? (
                        <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (editing.name.trim()) update.mutate({ id: l.id, name: editing.name.trim() }); }}>
                          <input aria-label="Comment" className="ax-input !h-7 w-[160px]" maxLength={60} value={editing.name} onChange={(e) => setEditing({ id: l.id, name: e.target.value })} autoFocus />
                          <button className="ax-btn-ghost ax-btn-sm" type="submit">Save</button>
                        </form>
                      ) : (
                        <button className="text-left hover:text-accent-300" title="Edit comment" onClick={() => setEditing({ id: l.id, name: l.name })}>
                          {l.name}{l.archived && <span className="ax-tag ml-1.5">Archived</span>}
                        </button>
                      )}
                    </td>
                    <td className="ax-td">{linkType(l.landing)}</td>
                    <td className="ax-td">{MODEL_LABEL[l.model] ?? l.model}</td>
                    <td className="ax-td ax-num">{fmtDate(l.createdAt)}</td>
                    <td className="ax-td text-right whitespace-nowrap">
                      <Link className="ax-btn-quiet" to={`/affiliate/statistics?tab=links`}>Stats</Link>
                      <button className="ax-btn-quiet" disabled={update.isPending} onClick={() => update.mutate({ id: l.id, archived: !l.archived })} aria-label={`${l.archived ? 'Restore' : 'Archive'} link #${l.num}`}>
                        {l.archived ? 'Restore' : 'Archive'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {links.data && !rows.length && <EmptyRow cols={7} text="No links yet." />}
            </tbody>
          </table>
        </TableWrap>
      </Panel>

      <Panel title="Link parameters">
        <div className="text-xs text-fog leading-relaxed space-y-2">
          <p>Any link can carry two optional parameters, so you can see which placement brought each trader:</p>
          <p className="ax-well p-3 font-mono text-[11px] break-all text-ink1">{window.location.origin}/register?lid=100001&amp;sub=summer_post&amp;click_id=8f2c1a</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><span className="font-mono text-ink1">sub</span> — your own label (channel, post, campaign). It overrides the link's sub-ID and is shown in Statistics.</li>
            <li><span className="font-mono text-ink1">click_id</span> — the visit id from your tracker. It comes back to you in <Link to="/affiliate/postbacks" className="text-accent-300 hover:underline">postbacks</Link> as <span className="font-mono">{'{click_id}'}</span>.</li>
          </ul>
          <p className="text-mute">Archiving only hides a link from this list; it keeps working and traders already attributed stay yours.</p>
        </div>
      </Panel>
    </Page>
  );
}
