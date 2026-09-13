import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
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
  const { accountId, setAccountId, soundEnabled, setSoundEnabled } = useTerminal();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const now = useClock();

  const { data: accounts, refetch: refetchAccounts } = useQuery({ queryKey: ['accounts'], queryFn: () => get<Account[]>('/api/v1/accounts'), refetchInterval: 10000 });

  useEffect(() => {
    connectSocket();
    subscribeMarket(DEFAULT_SYMBOLS);
  }, []);

  useEffect(() => {
    if (!accountId && accounts?.length) setAccountId(accounts[0].id);
  }, [accounts, accountId, setAccountId]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!accountRef.current?.contains(e.target as Node)) setAccountOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

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
      {/* ── Quotex top bar ─────────────────────────────────── */}
      <header className="h-[52px] shrink-0 border-b border-line bg-base-900 flex items-center justify-between px-3.5 z-40 select-none">
        {/* Left branding */}
        <div className="flex items-center gap-3">
          <Link to="/trading" className="flex items-center gap-2">
            <Logo size={24} />
          </Link>
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#00c076]/10 border border-[#00c076]/20">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00c076] animate-pulse" />
            <span className="text-[10px] font-extrabold tracking-[0.1em] text-[#00c076] uppercase">Binary Terminal</span>
          </div>
          <div className="hidden lg:block text-[11px] text-mute font-mono ml-2">
            {fmtClock(now)} UTC
          </div>
          <div className="ml-1"><GlobalSearch /></div>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Sound toggle button */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="w-8 h-8 rounded-lg bg-base-800 border border-line flex items-center justify-center text-fog hover:text-white transition"
            title={soundEnabled ? 'Disable sound effects' : 'Enable sound effects'}
          >
            {soundEnabled ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>
            )}
          </button>

          {/* Account Selector pill */}
          <div ref={accountRef} className="relative">
            <button
              onClick={() => setAccountOpen((v) => !v)}
              className="flex items-center gap-2 h-8 px-2.5 rounded-lg bg-base-800/90 border border-line hover:border-accent-500/40 transition select-none"
            >
              <div className="text-left leading-none">
                <div className="text-[9px] font-bold uppercase tracking-wider text-accent-300">
                  {active?.accountType === 'DEMO' ? 'Demo Account' : 'Live Account'}
                </div>
                <div className="text-[12px] font-extrabold font-mono text-white mt-0.5">
                  {active ? fmtMoney(active.balance) : '$10,000.00'}
                </div>
              </div>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-mute"><polyline points="6 9 12 15 18 9" /></svg>
            </button>

            {accountOpen && (
              <div className="absolute top-10 right-0 w-[240px] bg-base-900 border border-line rounded-xl shadow-pop z-50 p-2 select-none">
                <div className="text-[10px] font-bold text-mute uppercase px-2 py-1">Trading Accounts</div>
                <div className="space-y-1 my-1">
                  {(accounts ?? []).map((a) => (
                    <button
                      key={a.id}
                      onClick={() => { setAccountId(a.id); setAccountOpen(false); }}
                      className={clsx('w-full text-left p-2 rounded-lg flex items-center justify-between transition', a.id === active?.id ? 'bg-accent-500/15 border border-accent-500/30' : 'hover:bg-white/[0.05]')}
                    >
                      <div>
                        <div className="text-xs font-bold text-white">{a.accountNumber}</div>
                        <div className="text-[10px] text-mute">{a.accountType === 'DEMO' ? 'Demo Practice' : 'Live Real'}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-mono font-bold text-accent-300">{fmtMoney(a.balance)}</div>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="pt-2 border-t border-line">
                  <button
                    onClick={() => {
                      nav('/wallet');
                      setAccountOpen(false);
                    }}
                    className="w-full h-8 rounded-lg bg-base-800 hover:bg-base-700 text-xs font-bold text-white transition flex items-center justify-center gap-1.5"
                  >
                    <span>+ Deposit / Top up</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Aurelix styled Deposit button */}
          <button
            onClick={() => nav('/wallet')}
            className="h-8 px-3 rounded-lg bg-accent-500 hover:bg-accent-400 text-base-950 font-extrabold text-xs tracking-wide flex items-center gap-1 transition shadow-sm active:scale-95"
          >
            <span className="text-sm font-bold leading-none">+</span>
            <span>Deposit</span>
          </button>

          <Bell />

          {/* User menu */}
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="flex items-center gap-1.5 h-8 pl-1 pr-1.5 rounded-lg hover:bg-white/[0.07] transition">
              <span className="w-7 h-7 rounded-full bg-accent-500/20 border border-accent-500/40 text-accent-300 text-xs font-black flex items-center justify-center">
                {(user?.firstName?.[0] ?? 'T').toUpperCase()}
              </span>
              <span className="hidden sm:block text-xs font-semibold max-w-[90px] truncate text-white">{user?.firstName}</span>
            </button>
            {menuOpen && (
              <div className="absolute top-10 right-0 w-[230px] bg-base-900 border border-line rounded-xl shadow-pop z-50 py-1.5" onMouseLeave={() => setMenuOpen(false)}>
                {/* User info */}
                <div className="px-3.5 py-2 border-b border-line">
                  <div className="text-xs font-bold truncate text-white">{user?.firstName} {user?.lastName}</div>
                  <div className="text-[10px] text-mute truncate">{user?.email}</div>
                </div>

                {/* Account quick status & switcher inside user dropdown */}
                <div className="px-2.5 py-2 border-b border-line bg-white/[0.02]">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-mute px-1 mb-1">Active Account</div>
                  <div className="p-2 rounded-lg bg-base-800/80 border border-line flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-accent-300 block leading-none">
                        {active?.accountType === 'DEMO' ? 'Demo Account' : 'Live Account'}
                      </span>
                      <span className="text-[13px] font-mono font-black text-white mt-1 block">
                        {active ? fmtMoney(active.balance) : '$10,000.00'}
                      </span>
                    </div>
                    {accounts && accounts.length > 1 && (
                      <button
                        onClick={() => {
                          const other = accounts.find((a) => a.id !== active?.id);
                          if (other) setAccountId(other.id);
                        }}
                        className="text-[10px] font-semibold text-accent-300 hover:underline bg-accent-500/10 px-2 py-1 rounded border border-accent-500/20"
                        title="Switch Account"
                      >
                        Switch
                      </button>
                    )}
                  </div>
                </div>

                {/* Nav links */}
                <div className="py-1">
                  {[
                    ['/dashboard', 'Overview'],
                    ['/wallet', 'Wallet & Deposit'],
                    ['/settings', 'Settings'],
                    ...(isAdmin ? [['/admin', 'Control deck'] as [string, string]] : []),
                  ].map(([to, label]) => (
                    <button key={to} onClick={() => { setMenuOpen(false); nav(to); }} className="w-full text-left px-3.5 py-2 text-xs text-fog hover:text-white hover:bg-white/[0.06] font-medium">{label}</button>
                  ))}
                </div>

                <div className="pt-1 border-t border-line">
                  <button onClick={async () => { await logout(); nav('/login'); }} className="w-full text-left px-3.5 py-2 text-xs text-[#ff5447] hover:bg-[#ff5447]/10 font-semibold">Log out</button>
                </div>
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
