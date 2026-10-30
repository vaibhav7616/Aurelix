import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { get, post, apiError } from '../../lib/api';
import { useAuth } from '../../stores/authStore';
import { useTerminal } from '../../stores/terminalStore';
import { useUI } from '../../stores/uiStore';
import { Logo } from '../ui/primitives';
import { connectSocket, subscribeMarket } from '../../services/socket';
import { DEFAULT_SYMBOLS } from '../../lib/constants';
import { fmtMoney } from '../../lib/format';
import { soundService } from '../../lib/sound';

interface Account { id: string; accountNumber: string; balance: number; lockedBalance?: number; equity: number; accountType: 'DEMO' | 'LIVE' }
interface NotifResp { items: Array<{ id: string; title: string; message: string }>; unread: number }

/** Left sidebar sections (Quotex order). [route, label, svg path] */
const RAIL: Array<[string, string, string]> = [
  ['/trading', 'Trade', 'M4 19V9M9 19V5M14 19v-7M19 19V8M3 21h18'],
  ['/dashboard', 'Analytics', 'M4 20V10M10 20V4M16 20v-6M22 20H2'],
  ['/top', 'Top', 'M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0zM17 6h3v2a3 3 0 01-3 3M7 6H4v2a3 3 0 003 3'],
  ['/markets-app', 'Market', 'M3 17l5-6 4 3 6-8 3 4'],
  ['/positions', 'Trades', 'M4 6h16M4 12h16M4 18h10'],
  ['/settings', 'Account', 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0'],
  ['/support', 'Support', 'M12 21a9 9 0 100-18 9 9 0 000 18zM9.1 9a3 3 0 015.8 1c0 2-3 2.5-3 4M12 17h.01'],
];

function Icon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/** Closes a dropdown on outside click. */
function useOutside<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, close]);
  return ref;
}

function Dropdown({ open, className, children }: { open: boolean; className?: string; children: ReactNode }) {
  if (!open) return null;
  return <div className={clsx('absolute top-[calc(100%+6px)] right-0 bg-base-850 border border-line rounded-xl shadow-pop z-50 overflow-hidden', className)}>{children}</div>;
}

/** Quotex account switcher: "DEMO ACCOUNT / $10,000.00" pill with a list of accounts, refill and new demo account. */
function AccountSwitcher({ accounts, active, inrRate }: { accounts: Account[]; active?: Account; inrRate: number }) {
  const [open, setOpen] = useState(false);
  const ref = useOutside<HTMLDivElement>(open, () => setOpen(false));
  const setAccountId = useTerminal((s) => s.setAccountId);
  const push = useUI((s) => s.push);
  const qc = useQueryClient();

  const refill = useMutation({
    mutationFn: (id: string) => post<{ added: number }>(`/api/v1/accounts/${id}/refill`, {}),
    onSuccess: (r) => { push('ok', `Demo balance refilled (+${fmtMoney(r.added)})`); ['accounts', 'stats', 'wallet', 'wallet-txns'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); },
    onError: (e) => push('err', apiError(e)),
  });
  const create = useMutation({
    mutationFn: () => post<Account>('/api/v1/accounts', { accountType: 'DEMO' }),
    onSuccess: (a) => { push('ok', `Demo account ${a.accountNumber} opened`); setAccountId(a.id); qc.invalidateQueries({ queryKey: ['accounts'] }); },
    onError: (e) => push('err', apiError(e)),
  });

  const openLive = useMutation({
    mutationFn: () => post<Account>('/api/v1/accounts', { accountType: 'LIVE' }),
    onSuccess: (a) => { push('ok', 'Live account opened — deposit funds to start trading live'); setAccountId(a.id); qc.invalidateQueries({ queryKey: ['accounts'] }); },
    onError: (e) => push('err', apiError(e)),
  });
  const nav = useNavigate();
  const inr = (v: number) => `₹${Math.round(v * inrRate).toLocaleString('en-IN')}`;

  const isDemo = active?.accountType !== 'LIVE';
  const hasLive = accounts.some((a) => a.accountType === 'LIVE');
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-10 pl-3 pr-2 rounded-lg bg-base-800 hover:bg-base-700 border border-line flex items-center gap-2.5 transition"
      >
        <div className="text-left leading-tight">
          <div className={clsx('text-[9px] font-extrabold uppercase tracking-[0.12em]', isDemo ? 'text-warn' : 'text-up')}>{isDemo ? 'Demo account' : 'Live account'}</div>
          <div className="text-[14px] font-bold ax-num">
            {active ? fmtMoney(active.balance) : '—'}
            {active && <span className="hidden sm:inline ml-1.5 text-[10px] font-semibold text-mute">({inr(active.balance)})</span>}
          </div>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={clsx('text-mute transition', open && 'rotate-180')}><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <Dropdown open={open} className="w-[300px]">
        <div className="p-2 space-y-1">
          {accounts.map((a) => {
            const sel = a.id === active?.id;
            const demo = a.accountType !== 'LIVE';
            return (
              <div key={a.id} className={clsx('rounded-lg border px-3 py-2.5 transition', sel ? 'border-accent-500/60 bg-accent-500/10' : 'border-transparent hover:bg-white/[0.04]')}>
                <button onClick={() => { setAccountId(a.id); setOpen(false); }} className="w-full flex items-center gap-2.5 text-left">
                  <span className={clsx('w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0', sel ? 'border-accent-500' : 'border-base-600')}>
                    {sel && <span className="w-2 h-2 rounded-full bg-accent-500" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={clsx('block text-[9px] font-extrabold uppercase tracking-[0.12em]', demo ? 'text-warn' : 'text-up')}>{demo ? 'Demo account' : 'Live account'}</span>
                    <span className="block text-[11px] text-mute ax-num">#{a.accountNumber}</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[14px] font-bold ax-num">{fmtMoney(a.balance)}</span>
                    <span className="block text-[10px] text-mute ax-num">{inr(a.balance)}</span>
                  </span>
                </button>
                {!demo && (
                  <button
                    onClick={() => { setAccountId(a.id); setOpen(false); nav('/wallet'); }}
                    className="mt-2 w-full h-7 rounded-md bg-up/15 text-up text-[11px] font-bold hover:bg-up/25 transition"
                  >
                    + Deposit
                  </button>
                )}
                {demo && (
                  <button
                    onClick={() => refill.mutate(a.id)}
                    disabled={refill.isPending}
                    className="mt-2 w-full h-7 rounded-md bg-warn/15 text-warn text-[11px] font-bold hover:bg-warn/25 transition disabled:opacity-50"
                  >
                    ↻ Refill demo balance
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="border-t border-line p-2 space-y-1">
          {!hasLive && (
            <button onClick={() => openLive.mutate()} disabled={openLive.isPending} className="w-full h-8 rounded-md text-[12px] font-bold text-up border border-dashed border-up/50 hover:bg-up/10 transition disabled:opacity-50">
              {openLive.isPending ? 'Opening…' : '+ Open live account'}
            </button>
          )}
          <button onClick={() => create.mutate()} disabled={create.isPending} className="w-full h-8 rounded-md text-[12px] font-semibold text-accent-300 hover:bg-white/[0.05] transition">
            + Open another demo account
          </button>
        </div>
      </Dropdown>
    </div>
  );
}

function Bell() {
  const [open, setOpen] = useState(false);
  const ref = useOutside<HTMLDivElement>(open, () => setOpen(false));
  const nav = useNavigate();
  const { data } = useQuery({
    queryKey: ['notifications', 'bell'],
    queryFn: () => get<NotifResp>('/api/v1/notifications', { pageSize: 5 }),
    refetchInterval: 15000,
  });
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} className="relative w-10 h-10 rounded-lg bg-base-800 hover:bg-base-700 border border-line flex items-center justify-center text-fog hover:text-ink1 transition" title="Notifications">
        <Icon d="M6 9a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 004 0" size={17} />
        {!!data?.unread && (
          <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-down text-cream text-[9px] font-bold flex items-center justify-center">
            {data.unread > 9 ? '9+' : data.unread}
          </span>
        )}
      </button>
      <Dropdown open={open} className="w-[300px]">
        <div className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-mute border-b border-line">Notifications</div>
        {(data?.items ?? []).map((n) => (
          <div key={n.id} className="px-3 py-2 border-b border-white/[0.05]">
            <div className="text-xs font-semibold">{n.title}</div>
            <div className="text-[11px] text-mute truncate">{n.message}</div>
          </div>
        ))}
        {!(data?.items?.length) && <div className="px-3 py-5 text-xs text-mute text-center">No notifications yet.</div>}
        <button onClick={() => { setOpen(false); nav('/notifications'); }} className="w-full text-center text-[11px] font-semibold text-accent-300 py-2.5 hover:bg-white/[0.05]">View all</button>
      </Dropdown>
    </div>
  );
}

function ProfileMenu({ isAdmin }: { isAdmin: boolean }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [sound, setSound] = useState(soundService.isEnabled());
  const ref = useOutside<HTMLDivElement>(open, () => setOpen(false));
  const go = (to: string) => { setOpen(false); nav(to); };
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} className="w-10 h-10 rounded-full bg-accent-500/20 border-2 border-accent-500/50 text-accent-300 text-sm font-bold flex items-center justify-center hover:border-accent-400 transition">
        {(user?.firstName?.[0] ?? 'T').toUpperCase()}
      </button>
      <Dropdown open={open} className="w-[240px]">
        <div className="px-4 py-3 border-b border-line">
          <div className="text-[13px] font-bold truncate">{user?.firstName} {user?.lastName}</div>
          <div className="text-[11px] text-mute truncate">{user?.email}</div>
        </div>
        <div className="py-1">
          {[
            ['/settings', 'Account settings'], ['/wallet', 'Wallet & transactions'], ['/history', 'Trading history'], ['/top', 'Top 50 traders'],
            ['/notifications', 'Notifications'], ['/support', 'Help & hotkeys'],
            ...(isAdmin ? [['/admin', 'Control deck'] as [string, string]] : []),
          ].map(([to, label]) => (
            <button key={to} onClick={() => go(to)} className="w-full text-left px-4 py-2 text-[12px] text-fog hover:text-ink1 hover:bg-white/[0.05]">{label}</button>
          ))}
          <button onClick={() => setSound(soundService.toggle())} className="w-full text-left px-4 py-2 text-[12px] text-fog hover:text-ink1 hover:bg-white/[0.05] flex items-center">
            Trade sounds<span className={clsx('ml-auto text-[10px] font-bold', sound ? 'text-up' : 'text-mute')}>{sound ? 'ON' : 'OFF'}</span>
          </button>
        </div>
        <button onClick={async () => { await logout(); nav('/login'); }} className="w-full text-left px-4 py-2.5 text-[12px] font-semibold text-down hover:bg-down/10 border-t border-line">Log out</button>
      </Dropdown>
    </div>
  );
}

export function AppShell() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { accountId, setAccountId } = useTerminal();

  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: () => get<Account[]>('/api/v1/accounts'), refetchInterval: 10000 });
  const { data: ratesData } = useQuery({
    queryKey: ['market-rates'],
    queryFn: () => get<{ base: string; rates: { INR: number; EUR: number; BRL: number; GBP: number } }>('/api/v1/market/rates'),
    refetchInterval: 30000,
  });
  const inrRate = ratesData?.rates?.INR ?? 86.85;

  // the signed-in app uses the Quotex-style palette; applied on <html> so portals and toasts follow it too
  useEffect(() => {
    document.documentElement.classList.add('theme-qx');
    return () => document.documentElement.classList.remove('theme-qx');
  }, []);

  useEffect(() => {
    connectSocket();
    subscribeMarket(DEFAULT_SYMBOLS);
  }, []);

  useEffect(() => {
    if (accounts?.length && !accounts.some((a) => a.id === accountId)) setAccountId(accounts[0].id);
  }, [accounts, accountId, setAccountId]);

  const active = accounts?.find((a) => a.id === accountId) ?? accounts?.[0];
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-base-950 text-ink1">
      {/* ── top bar ─────────────────────────────────── */}
      <header className="h-[60px] shrink-0 border-b border-line bg-base-900 flex items-center gap-3 px-3 md:px-4 z-40">
        <Link to="/trading" className="shrink-0"><Logo size={28} /></Link>
        <div className="hidden lg:flex items-center gap-1.5 ml-3 px-2.5 h-7 rounded-full bg-up/10 border border-up/25">
          <span className="w-1.5 h-1.5 rounded-full bg-up animate-pulse" />
          <span className="text-[10px] font-bold tracking-[0.1em] text-up uppercase">Live quotes</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {accounts && <AccountSwitcher accounts={accounts} active={active} inrRate={inrRate} />}
          <button onClick={() => nav('/wallet')} className="hidden sm:flex h-10 px-4 rounded-lg bg-up hover:brightness-110 text-white text-[13px] font-bold items-center gap-1.5 transition">
            <span className="text-base leading-none">+</span> Deposit
          </button>
          <button onClick={() => nav('/wallet')} className="hidden md:flex h-10 px-4 rounded-lg bg-base-800 hover:bg-base-700 border border-line text-[13px] font-semibold items-center transition">
            Withdrawal
          </button>
          <Bell />
          <ProfileMenu isAdmin={isAdmin} />
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* ── left sidebar ─────────────────────────────── */}
        <aside className="hidden md:flex w-[76px] shrink-0 flex-col items-center py-2 gap-0.5 border-r border-line bg-base-900">
          {RAIL.map(([to, label, d]) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => clsx(
                'relative w-[64px] h-[58px] rounded-lg flex flex-col items-center justify-center gap-1 transition',
                isActive ? 'text-ink1 bg-white/[0.06] before:absolute before:-left-1.5 before:top-3 before:bottom-3 before:w-[3px] before:rounded-r before:bg-accent-500' : 'text-mute hover:text-ink1 hover:bg-white/[0.04]',
              )}
            >
              <Icon d={d} />
              <span className="text-[10px] font-semibold">{label}</span>
            </NavLink>
          ))}
          <div className="mt-auto flex flex-col items-center gap-1">
            {isAdmin && (
              <NavLink to="/admin" title="Control deck" className="w-[64px] h-[50px] rounded-lg flex flex-col items-center justify-center gap-0.5 text-warn hover:bg-warn/10">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" /></svg>
                <span className="text-[9px] font-semibold">Admin</span>
              </NavLink>
            )}
            <NavLink to="/more" className={({ isActive }) => clsx('w-[64px] h-[50px] rounded-lg flex flex-col items-center justify-center gap-0.5', isActive ? 'text-ink1 bg-white/[0.06]' : 'text-mute hover:text-ink1 hover:bg-white/[0.04]')}>
              <Icon d="M5 12h.01M12 12h.01M19 12h.01" />
              <span className="text-[9px] font-semibold">More</span>
            </NavLink>
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto pb-16 md:pb-0">
          <Outlet />
        </main>
      </div>

      {/* ── mobile bottom nav ─────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-base-900/95 backdrop-blur border-t border-line grid grid-cols-5">
        {([['/trading', 'Trade', RAIL[0][2]], ['/positions', 'Trades', RAIL[4][2]], ['/top', 'Top', RAIL[2][2]], ['/wallet', 'Wallet', 'M4 7h16v10H4zM4 10h16M17 14h.01'], ['/more', 'More', 'M5 12h.01M12 12h.01M19 12h.01']] as Array<[string, string, string]>).map(([to, label, d]) => (
          <NavLink key={to} to={to} className={({ isActive }) => clsx('py-2 flex flex-col items-center gap-0.5 text-[10px] font-semibold', isActive ? 'text-accent-300' : 'text-mute')}>
            <Icon d={d} size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
