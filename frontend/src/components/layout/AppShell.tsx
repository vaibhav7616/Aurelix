import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { get } from '../../lib/api';
import { useAuth } from '../../stores/authStore';
import { useTerminal } from '../../stores/terminalStore';
import { Logo } from '../ui/primitives';
import { connectSocket, subscribeMarket } from '../../services/socket';
import { DEFAULT_SYMBOLS } from '../../lib/constants';
import { fmtMoney, fmtClock } from '../../lib/format';
import { useClock } from '../../hooks/useMediaQuery';

interface Account { id: string; accountNumber: string; balance: number; equity: number; accountType: string }
interface AssetRow { symbol: string; name: string }
interface NotifResp { items: Array<{ id: string; title: string; message: string }>; unread: number }

const RAIL: Array<[string, string, string]> = [
  ['/trading', 'Terminal', 'M4 4h4v6H4zM10 4h4v10h-4zM16 4h4v7h-4z'],
  ['/dashboard', 'Overview', 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z'],
  ['/markets-app', 'Markets', 'M3 17l5-6 4 3 6-8 3 4'],
  ['/positions', 'Trades', 'M4 6h16M4 12h16M4 18h10'],
  ['/history', 'History', 'M12 3a9 9 0 109 9M12 7v5l3 3M18 3v4h-4'],
  ['/wallet', 'Wallet', 'M4 7h16v10H4zM4 10h16M17 14h.01'],
  ['/notifications', 'Alerts', 'M6 9a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 004 0'],
];

function RailIcon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const { setSymbol } = useTerminal();
  const nav = useNavigate();
  const boxRef = useRef<HTMLDivElement>(null);
  const { data } = useQuery({ queryKey: ['assets'], queryFn: () => get<{ assets: AssetRow[] }>('/api/v1/assets') });

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const hits = (data?.assets ?? []).filter((a) => q && `${a.symbol} ${a.name}`.toLowerCase().includes(q.toLowerCase())).slice(0, 7);

  return (
    <div ref={boxRef} className="relative hidden md:block w-[240px]">
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search markets…  ( / )"
        className="ax-input !h-8 !text-xs !bg-white/[0.06]"
      />
      {open && hits.length > 0 && (
        <div className="absolute top-9 left-0 right-0 ax-raised shadow-pop overflow-hidden z-50">
          {hits.map((a) => (
            <button
              key={a.symbol}
              onClick={() => { setSymbol(a.symbol); setQ(''); setOpen(false); nav('/trading'); }}
              className="w-full text-left px-3 py-2 hover:bg-white/[0.06] flex justify-between items-center"
            >
              <span className="text-xs font-bold">{a.symbol}</span>
              <span className="text-[11px] text-mute truncate ml-2">{a.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Bell() {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const { data } = useQuery({
    queryKey: ['notifications', 'bell'],
    queryFn: () => get<NotifResp>('/api/v1/notifications', { pageSize: 5 }),
    refetchInterval: 15000,
  });

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <button onClick={() => setOpen((v) => !v)} className="relative w-8 h-8 rounded-md hover:bg-white/[0.07] flex items-center justify-center text-fog hover:text-ink1 transition" title="Notifications">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M6 9a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 004 0" /></svg>
        {!!data?.unread && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-down text-cream text-[9px] font-bold flex items-center justify-center">
            {data.unread > 9 ? '9+' : data.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute top-9 right-0 w-[300px] ax-raised shadow-pop z-50 overflow-hidden">
          <div className="px-3 py-2 ax-micro border-b border-line">Latest alerts</div>
          {(data?.items ?? []).map((n) => (
            <div key={n.id} className="px-3 py-2 border-b border-white/[0.06]">
              <div className="text-xs font-semibold">{n.title}</div>
              <div className="text-[11px] text-mute truncate">{n.message}</div>
            </div>
          ))}
          {!(data?.items?.length) && <div className="px-3 py-4 text-xs text-mute text-center">No alerts yet.</div>}
          <button onClick={() => { setOpen(false); nav('/notifications'); }} className="w-full text-center text-[11px] font-semibold text-accent-300 py-2 hover:bg-white/[0.06]">View all →</button>
        </div>
      )}
    </div>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const { accountId, setAccountId } = useTerminal();
  const [menuOpen, setMenuOpen] = useState(false);
  const now = useClock();

  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: () => get<Account[]>('/api/v1/accounts'), refetchInterval: 10000 });

  useEffect(() => {
    connectSocket();
    subscribeMarket(DEFAULT_SYMBOLS);
  }, []);

  useEffect(() => {
    if (!accountId && accounts?.length) setAccountId(accounts[0].id);
  }, [accounts, accountId, setAccountId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('input[placeholder^="Search markets"]')?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const active = accounts?.find((a) => a.id === accountId) ?? accounts?.[0];
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-base-950">
      {/* ── top bar ─────────────────────────────────── */}
      <header className="h-[52px] shrink-0 border-b border-line bg-base-900 flex items-center gap-3 px-3 z-40">
        <Link to="/trading" className="shrink-0"><Logo size={24} /></Link>
        <div className="hidden sm:flex items-center gap-1.5 pl-1">
          <span className="ax-live-dot" />
          <span className="text-[10px] font-bold tracking-[0.12em] text-up uppercase">Live</span>
        </div>
        <div className="hidden xl:block text-[11px] text-mute ax-num ml-1">{fmtClock(now)} UTC{now.getTimezoneOffset() <= 0 ? '+' : ''}{-now.getTimezoneOffset() / 60}</div>
        <div className="ml-2"><GlobalSearch /></div>

        <div className="ml-auto flex items-center gap-2">
          {/* account switcher */}
          <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-line">
            <select
              value={active?.id ?? ''}
              onChange={(e) => setAccountId(e.target.value)}
              className="h-8 bg-base-800 border border-line rounded-md text-[11px] font-semibold px-2 outline-none max-w-[150px] cursor-pointer"
              title="Trading account"
            >
              {(accounts ?? []).map((a) => (
                <option key={a.id} value={a.id}>{a.accountNumber}</option>
              ))}
            </select>
            <div className="text-right leading-tight hidden md:block">
              <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-mute">Equity</div>
              <div className="text-[13px] font-bold ax-num">{active ? fmtMoney(active.equity ?? active.balance) : '—'}</div>
            </div>
            <div className="text-right leading-tight hidden lg:block">
              <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-mute">Balance</div>
              <div className="text-[13px] font-semibold ax-num text-fog">{active ? fmtMoney(active.balance) : '—'}</div>
            </div>
          </div>
          <Bell />
          {/* user menu */}
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="flex items-center gap-2 h-8 pl-1 pr-1.5 rounded-md hover:bg-white/[0.07] transition">
              <span className="w-6 h-6 rounded bg-accent-500/20 border border-accent-500/40 text-accent-300 text-[10px] font-bold flex items-center justify-center">
                {(user?.firstName?.[0] ?? 'T').toUpperCase()}
              </span>
              <span className="hidden sm:block text-[11px] font-semibold max-w-[90px] truncate">{user?.firstName}</span>
            </button>
            {menuOpen && (
              <div className="absolute top-9 right-0 w-[200px] ax-raised shadow-pop z-50 py-1" onMouseLeave={() => setMenuOpen(false)}>
                <div className="px-3 py-2 border-b border-line">
                  <div className="text-xs font-bold truncate">{user?.firstName} {user?.lastName}</div>
                  <div className="text-[10px] text-mute truncate">{user?.email}</div>
                </div>
                {[
                  ['/dashboard', 'Overview'], ['/wallet', 'Wallet'], ['/settings', 'Settings'],
                  ...(isAdmin ? [['/admin', 'Control deck'] as [string, string]] : []),
                ].map(([to, label]) => (
                  <button key={to} onClick={() => { setMenuOpen(false); nav(to); }} className="w-full text-left px-3 py-2 text-xs text-fog hover:text-ink1 hover:bg-white/[0.06]">{label}</button>
                ))}
                <button onClick={async () => { await logout(); nav('/login'); }} className="w-full text-left px-3 py-2 text-xs text-down hover:bg-down/10 border-t border-line mt-1">Log out</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* icon rail */}
        <aside className="hidden md:flex w-[60px] shrink-0 flex-col items-center py-2.5 gap-1 border-r border-line bg-base-900">
          {RAIL.map(([to, label, d]) => (
            <NavLink
              key={to}
              to={to}
              title={label}
              className={({ isActive }) => `w-11 h-11 rounded-md flex flex-col items-center justify-center gap-[3px] transition ${isActive ? 'bg-accent-500/12 text-accent-300' : 'text-mute hover:text-ink1 hover:bg-white/[0.06]'}`}
            >
              <RailIcon d={d} />
              <span className="text-[8px] font-semibold uppercase tracking-wide">{label.slice(0, 5)}</span>
            </NavLink>
          ))}
          <div className="mt-auto flex flex-col gap-1">
            <NavLink to="/settings" title="Settings" className="w-11 h-9 rounded-md flex items-center justify-center text-mute hover:text-ink1 hover:bg-white/[0.06]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 01-.1 1.2l2 1.6-2 3.4-2.4-1a7 7 0 01-2 1.2L14 20h-4l-.4-2.6a7 7 0 01-2-1.2l-2.4 1-2-3.4 2-1.6A7 7 0 015 12a7 7 0 01.1-1.2l-2-1.6 2-3.4 2.4 1a7 7 0 012-1.2L10 4h4l.4 2.6a7 7 0 012 1.2l2.4-1 2 3.4-2 1.6c.06.4.1.8.1 1.2z" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </NavLink>
            {isAdmin && (
              <NavLink to="/admin" title="Control deck" className="w-11 h-9 rounded-md flex items-center justify-center text-accent-300 bg-accent-500/10 border border-accent-500/25">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" /></svg>
              </NavLink>
            )}
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto pb-16 md:pb-0">
          <Outlet />
        </main>
      </div>

      {/* mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-base-900/95 backdrop-blur border-t border-line grid grid-cols-5">
        {[['/markets-app', 'Market'], ['/trading', 'Trade'], ['/positions', 'Trades'], ['/wallet', 'Wallet'], ['/more', 'More']].map(([to, label]) => (
          <NavLink key={to} to={to} className={({ isActive }) => `py-2.5 flex flex-col items-center gap-1 text-[9px] font-semibold uppercase tracking-wide ${isActive ? 'text-accent-300' : 'text-mute'}`}>
            <span className="w-5 h-[3px] rounded-full bg-current opacity-70" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
