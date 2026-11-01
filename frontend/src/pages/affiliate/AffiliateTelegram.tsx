import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, del, apiError } from '../../lib/api';
import { useUI } from '../../stores/uiStore';
import { AFF, CopyButton, Page, Panel } from './shared';

interface TgState { configured: boolean; botUsername: string | null; linked: boolean; code: string | null }

const NOTIFICATIONS = [
  'A new trader registers through your link or promo code',
  'A trader makes a first deposit',
  'Payouts are requested, paid or rejected',
  'The partner team replies to your support ticket',
  'Your partner account status changes',
];

export function AffiliateTelegram() {
  const push = useUI((s) => s.push);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['aff', 'telegram'], queryFn: () => get<TgState>(`${AFF}/telegram`), refetchInterval: (query) => (query.state.data?.code && !query.state.data.linked ? 5000 : false) });
  const inval = () => qc.invalidateQueries({ queryKey: ['aff', 'telegram'] });
  const gen = useMutation({ mutationFn: () => post<{ code: string }>(`${AFF}/telegram/code`, {}), onSuccess: inval, onError: (e) => push('err', apiError(e)) });
  const unlink = useMutation({ mutationFn: () => del(`${AFF}/telegram`), onSuccess: () => { push('ok', 'Telegram disconnected'); inval(); }, onError: (e) => push('err', apiError(e)) });
  const t = q.data;
  const bot = t?.botUsername ?? '';

  return (
    <Page title="Telegram Bot" lead="Get partner notifications in Telegram as they happen.">
      <div className="grid lg:grid-cols-[1fr_320px] gap-4 items-start">
        <Panel title="Connection">
          {q.isLoading && <p className="text-xs text-mute">Loading…</p>}
          {q.isError && <p className="text-xs text-down">{apiError(q.error)}</p>}
          {t && !t.configured && (
            <div className="text-xs text-fog leading-relaxed">
              <span className="ax-tag">Not configured</span>
              <p className="mt-2">The notification bot is not configured yet. Once the partner team enables it, you will be able to connect it here.</p>
            </div>
          )}
          {t?.configured && t.linked && (
            <div className="text-xs text-fog leading-relaxed space-y-3">
              <div className="flex items-center gap-2"><span className="ax-tag bg-up/15 text-up">Connected</span>{bot && <span>to <span className="font-mono">@{bot}</span></span>}</div>
              <p>Your Telegram chat receives partner notifications. Disconnect to stop them.</p>
              <button className="ax-btn-danger" disabled={unlink.isPending} onClick={() => { if (window.confirm('Disconnect Telegram notifications?')) unlink.mutate(); }}>Disconnect</button>
            </div>
          )}
          {t?.configured && !t.linked && (
            <div className="text-xs text-fog leading-relaxed space-y-3">
              <span className="ax-tag">Not connected</span>
              {t.code ? (
                <>
                  <ol className="list-decimal pl-5 space-y-1">
                    <li>Open the bot with the button below and press <span className="font-semibold text-ink1">Start</span>.</li>
                    <li>Or send <span className="font-mono text-ink1">/start {t.code}</span> to <span className="font-mono text-ink1">@{bot}</span> manually.</li>
                  </ol>
                  <div className="flex flex-wrap items-center gap-2">
                    <a className="ax-btn-primary" href={`https://t.me/${bot}?start=${t.code}`} target="_blank" rel="noopener noreferrer">Open @{bot}</a>
                    <CopyButton text={`/start ${t.code}`} what="start command" small={false} label="Copy command" />
                    <button className="ax-btn-quiet" disabled={gen.isPending} onClick={() => gen.mutate()}>New code</button>
                  </div>
                  <p className="text-[11px] text-mute">This page updates automatically once the bot confirms the connection.</p>
                </>
              ) : (
                <>
                  <p>Generate a one-time code to link your Telegram chat to this partner account.</p>
                  <button className="ax-btn-primary" disabled={gen.isPending} onClick={() => gen.mutate()}>{gen.isPending ? 'Generating…' : 'Generate connection code'}</button>
                </>
              )}
            </div>
          )}
        </Panel>
        <Panel title="Notifications">
          <ul className="space-y-2 text-xs text-fog list-disc pl-4">
            {NOTIFICATIONS.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </Panel>
      </div>
    </Page>
  );
}
