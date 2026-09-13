import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, patch, apiError } from '../../lib/api';
import { useUI } from '../../stores/uiStore';
import { useAuth } from '../../stores/authStore';
import { Card, Empty, FieldError } from '../../components/ui/primitives';
import { fmtTime } from '../../lib/format';

export function NotificationsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => get<{ items: Array<{ id: string; type: string; title: string; message: string; read: boolean; createdAt: string }>; unread: number }>('/api/v1/notifications', { pageSize: 40 }),
    refetchInterval: 12000,
  });
  const readAll = useMutation({
    mutationFn: () => post('/api/v1/notifications/read-all', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markOne = async (id: string) => {
    await post(`/api/v1/notifications/${id}/read`, {});
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  return (
    <div className="max-w-[720px] mx-auto p-4">
      <div className="flex items-center gap-2.5">
        <h1 className="text-lg font-bold tracking-tight">Alerts</h1>
        {!!data?.unread && <span className="text-[10px] font-bold bg-accent-500/15 text-accent-300 rounded px-1.5 py-[3px] ax-num">{data.unread} unread</span>}
        <button onClick={() => readAll.mutate()} className="ax-btn-ghost ax-btn-sm ml-auto">Mark all read</button>
      </div>
      <div className="space-y-2 mt-3">
        {!data?.items.length && <Card><Empty title="No alerts" hint="Fills, deposits, withdrawals and security events land here." /></Card>}
        {(data?.items ?? []).map((n) => (
          <button key={n.id} onClick={() => markOne(n.id)} className={`w-full text-left ax-panel !p-3.5 flex gap-3 transition hover:border-base-600 ${n.read ? 'opacity-55' : ''}`}>
            <span className="ax-tag h-fit shrink-0 mt-[1px]">{n.type}</span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold">{n.title}</span>
              <span className="block text-xs text-mute mt-0.5">{n.message}</span>
              <span className="block text-[10px] text-mute mt-1 ax-num">{fmtTime(n.createdAt)}</span>
            </span>
            {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-accent-400 shrink-0 mt-1.5 ml-auto" />}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SettingsPage() {
  const push = useUI((s) => s.push);
  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: () => get<{ firstName: string; lastName: string; email: string; role: string }>('/api/v1/users/profile') });
  const { data: sessions } = useQuery({ queryKey: ['sessions'], queryFn: () => get<Array<{ id: string; userAgent: string | null; ipAddress: string | null; createdAt: string; revokedAt: string | null }>>('/api/v1/auth/sessions') });
  const [f, setF] = useState({ firstName: '', lastName: '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [pwErr, setPwErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => patch('/api/v1/users/profile', { firstName: f.firstName || undefined, lastName: f.lastName || undefined }),
    onSuccess: () => { push('ok', 'Profile updated'); qc.invalidateQueries({ queryKey: ['profile'] }); },
    onError: (e) => push('err', apiError(e)),
  });
  const qc = useQueryClient();
  const changePw = useMutation({
    mutationFn: () => post('/api/v1/auth/change-password', pw),
    onSuccess: () => { push('ok', 'Password changed — other sessions revoked'); setPw({ currentPassword: '', newPassword: '' }); setPwErr(null); },
    onError: (e) => setPwErr(apiError(e)),
  });

  return (
    <div className="max-w-[640px] mx-auto p-4 space-y-3">
      <h1 className="text-lg font-bold tracking-tight">Settings</h1>
      <Card>
        <div className="text-[13px] font-bold">Profile</div>
        <div className="text-[11px] text-mute mt-0.5">{profile?.email} · {profile?.role}</div>
        <div className="grid grid-cols-2 gap-2.5 mt-3">
          <div><label className="ax-label">First name</label><input className="ax-input" placeholder={profile?.firstName ?? ''} value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></div>
          <div><label className="ax-label">Last name</label><input className="ax-input" placeholder={profile?.lastName ?? ''} value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></div>
        </div>
        <button onClick={() => save.mutate()} disabled={save.isPending} className="ax-btn-primary ax-btn-sm mt-3 !h-8 !px-4">Save profile</button>
      </Card>
      <Card>
        <div className="text-[13px] font-bold">Change password</div>
        <div className="space-y-2.5 mt-3">
          <div><label className="ax-label">Current password</label><input className="ax-input" type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></div>
          <div><label className="ax-label">New password (8+ characters)</label><input className="ax-input" type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></div>
          <FieldError message={pwErr} />
          <button onClick={() => changePw.mutate()} disabled={changePw.isPending} className="ax-btn-ghost ax-btn-sm !h-8 !px-4">Change password</button>
        </div>
      </Card>
      <Card>
        <div className="text-[13px] font-bold">Sessions</div>
        <div className="mt-2 space-y-1.5">
          {(sessions ?? []).slice(0, 8).map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-[11px] text-mute">
              <span className={s.revokedAt ? 'text-mute' : 'text-up'}>●</span>
              <span className="truncate flex-1">{s.userAgent ?? 'Unknown device'} · {s.ipAddress ?? '—'}</span>
              <span className="ax-num">{fmtTime(s.createdAt)}</span>
            </div>
          ))}
          {!(sessions?.length) && <div className="text-xs text-mute">No sessions found.</div>}
        </div>
      </Card>
    </div>
  );
}

export function MorePage() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const links: Array<[string, string]> = [
    ['/dashboard', 'Overview'], ['/history', 'Trade history'], ['/deposits', 'Deposits'],
    ['/withdrawals', 'Withdrawals'], ['/notifications', 'Alerts'], ['/settings', 'Settings'],
    ...(isAdmin ? [['/admin', 'Control deck'] as [string, string]] : []),
  ];
  return (
    <div className="p-4 max-w-[560px] mx-auto">
      <div className="ax-panel p-4 flex items-center gap-3">
        <span className="w-10 h-10 rounded-md bg-accent-500/20 border border-accent-500/40 text-accent-300 font-bold flex items-center justify-center">{(user?.firstName?.[0] ?? 'T').toUpperCase()}</span>
        <div><div className="text-sm font-bold">{user?.firstName} {user?.lastName}</div><div className="text-[11px] text-mute">{user?.email}</div></div>
      </div>
      <div className="ax-panel mt-2.5 overflow-hidden">
        {links.map(([to, label]) => (
          <Link key={to} to={to} className="flex items-center px-4 h-11 border-b border-white/[0.06] text-[13px] font-medium hover:bg-white/[0.04]">{label}<span className="ml-auto text-mute">→</span></Link>
        ))}
        <button onClick={async () => { await logout(); nav('/login'); }} className="w-full text-left px-4 h-11 text-[13px] font-semibold text-down hover:bg-down/10">Log out</button>
      </div>
    </div>
  );
}
