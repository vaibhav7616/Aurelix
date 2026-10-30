import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { get, post, apiError } from '../../lib/api';
import { useAuth } from '../../stores/authStore';
import { useTerminal } from '../../stores/terminalStore';
import { useUI } from '../../stores/uiStore';
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
  ['/top', 'Top', 'M8 21h8m-4-3v3M6 4h12v5a6 6 0 01-12 0V4zm0 2H3a2 2 0 000 4h3m12-4h3a2 2 0 010 4h-3'],
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
  const qc = useQueryClient();
  const push = useUI((s) => s.push);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [resettingDemo, setResettingDemo] = useState(false);
  const [openingLive, setOpeningLive] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const now = useClock();

  const { data: accounts, refetch: refetchAccounts } = useQuery({ queryKey: ['accounts'], queryFn: () => get<Account[]>('/api/v1/accounts'), refetchInterval: 10000 });
  const { data: ratesData } = useQuery({
    queryKey: ['market-rates'],
    queryFn: () => get<{ base: string; rates: { INR: number; EUR: number; BRL: number; GBP: number } }>('/api/v1/market/rates'),
    refetchInterval: 30000,
  });
  const inrRate = ratesData?.rates?.INR ?? 86.85;

  const liveAccount = accounts?.find((a) => a.accountType === 'LIVE');
  const demoAccount = accounts?.find((a) => a.accountType === 'DEMO');

  const handleResetDemo = async (demoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setResettingDemo(true);
    try {
      await post(`/api/v1/accounts/${demoId}/reset-demo`);
      await qc.invalidateQueries({ queryKey: ['accounts'] });
      push('ok', 'Demo balance reloaded to $10,000.00!');
    } catch (err) {
      push('err', apiError(err));
    } finally {
      setTimeout(() => setResettingDemo(false), 500);
    }
  };

  const handleOpenLive = async () => {
    setOpeningLive(true);
    try {
      const res = await post<Account>('/api/v1/accounts', { accountType: 'LIVE' });
      await qc.invalidateQueries({ queryKey: ['accounts'] });
      if (res?.id) setAccountId(res.id);
      push('ok', 'Live Real Account opened! You can now deposit and trade live.');
      setAccountOpen(false);
    } catch (err) {
      push('err', apiError(err));
    } finally {
      setOpeningLive(false);
    }
  };

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

          {/* Quotex Signature Account Selector pill */}
          <div ref={accountRef} className="relative">
            <button
              onClick={() => setAccountOpen((v) => !v)}
              className={clsx(
                'flex items-center gap-2.5 h-8 px-2.5 rounded-lg bg-base-800/90 border transition select-none',
                active?.accountType === 'LIVE'
                  ? 'border-[#00c076]/40 hover:border-[#00c076]/80'
                  : 'border-line hover:border-accent-500/40'
              )}
            >
              <span
                className={clsx(
                  'w-2 h-2 rounded-full shrink-0',
                  active?.accountType === 'LIVE'
                    ? 'bg-[#00c076] shadow-[0_0_8px_rgba(0,192,118,0.6)]'
                    : 'bg-accent-400 shadow-[0_0_8px_rgba(0,122,255,0.6)]'
                )}
              />
              <div className="text-left leading-none">
                <div
                  className={clsx(
                    'text-[9px] font-bold uppercase tracking-wider',
                    active?.accountType === 'LIVE' ? 'text-[#00c076]' : 'text-accent-300'
                  )}
                >
                  {active?.accountType === 'LIVE' ? 'Live Account' : 'Demo Account'}
                </div>
                <div className="text-[12px] font-extrabold font-mono text-white mt-0.5 flex items-baseline gap-1.5">
                  <span>{active ? fmtMoney(active.balance) : '$0.00'}</span>
                  {active?.balance !== undefined && (
                    <span className="text-[10px] font-mono text-slate-400 font-semibold hidden sm:inline">
                      (₹{Math.round(active.balance * inrRate).toLocaleString('en-IN')})
                    </span>
                  )}
                </div>
              </div>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-mute"><polyline points="6 9 12 15 18 9" /></svg>
            </button>

            {accountOpen && (
              <div className="absolute top-10 right-0 w-[290px] bg-base-900 border border-line rounded-xl shadow-2xl z-50 p-2.5 select-none animate-in fade-in zoom-in-95 duration-100">
                <div className="flex items-center justify-between text-[10px] font-bold text-mute uppercase px-1 py-1 mb-1">
                  <span>Trading Accounts</span>
                  <span className="text-[9px] text-[#00c076] font-extrabold">LIVE READY</span>
                </div>

                <div className="space-y-1.5 my-1">
                  {/* 1. Live Account Option */}
                  {liveAccount ? (
                    <div
                      onClick={() => { setAccountId(liveAccount.id); setAccountOpen(false); }}
                      className={clsx(
                        'w-full text-left p-2.5 rounded-lg border transition cursor-pointer flex items-center justify-between',
                        liveAccount.id === active?.id
                          ? 'bg-[#00c076]/15 border-[#00c076]/50 shadow-sm'
                          : 'bg-base-800/50 border-line hover:bg-base-800 hover:border-line/80'
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={clsx(
                            'w-4 h-4 rounded-full flex items-center justify-center shrink-0 border transition',
                            liveAccount.id === active?.id
                              ? 'border-[#00c076] bg-[#00c076]/20'
                              : 'border-mute/40'
                          )}
                        >
                          {liveAccount.id === active?.id && <div className="w-2 h-2 rounded-full bg-[#00c076]" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-white">Live Account</span>
                            <span className="text-[8px] font-extrabold px-1.5 py-0.2 rounded bg-[#00c076]/20 text-[#00c076]">REAL</span>
                          </div>
                          <div className="text-[10px] font-mono text-mute truncate">{liveAccount.accountNumber}</div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-xs font-mono font-black text-[#00c076]">{fmtMoney(liveAccount.balance)}</div>
                        <div className="text-[9.5px] font-mono text-slate-400 font-medium">₹{Math.round(liveAccount.balance * inrRate).toLocaleString('en-IN')}</div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setAccountId(liveAccount.id);
                            setAccountOpen(false);
                            nav('/wallet');
                          }}
                          className="mt-1 px-2 py-0.5 rounded bg-[#00c076] hover:bg-[#00d684] text-base-950 font-black text-[9px] uppercase tracking-wide transition shadow-sm active:scale-95"
                        >
                          Deposit
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={handleOpenLive}
                      disabled={openingLive}
                      className="w-full p-2.5 rounded-lg border border-dashed border-[#00c076]/60 bg-[#00c076]/10 hover:bg-[#00c076]/20 text-[#00c076] transition flex items-center justify-between group"
                    >
                      <div className="text-left">
                        <div className="text-xs font-bold flex items-center gap-1">
                          <span>+ Open Live Account</span>
                        </div>
                        <div className="text-[10px] text-mute">Instant live trading with real funds</div>
                      </div>
                      <span className="px-2 py-1 rounded bg-[#00c076] text-base-950 text-[10px] font-extrabold group-hover:bg-[#00d684]">
                        {openingLive ? 'Opening…' : 'Activate'}
                      </span>
                    </button>
                  )}

                  {/* 2. Demo Practice Account Option */}
                  {demoAccount && (
                    <div
                      onClick={() => { setAccountId(demoAccount.id); setAccountOpen(false); }}
                      className={clsx(
                        'w-full text-left p-2.5 rounded-lg border transition cursor-pointer flex items-center justify-between',
                        demoAccount.id === active?.id
                          ? 'bg-accent-500/15 border-accent-500/50 shadow-sm'
                          : 'bg-base-800/50 border-line hover:bg-base-800 hover:border-line/80'
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={clsx(
                            'w-4 h-4 rounded-full flex items-center justify-center shrink-0 border transition',
                            demoAccount.id === active?.id
                              ? 'border-accent-400 bg-accent-500/20'
                              : 'border-mute/40'
                          )}
                        >
                          {demoAccount.id === active?.id && <div className="w-2 h-2 rounded-full bg-accent-400" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-white">Demo Account</span>
                            <span className="text-[8px] font-extrabold px-1.5 py-0.2 rounded bg-accent-500/20 text-accent-300">PRACTICE</span>
                          </div>
                          <div className="text-[10px] font-mono text-mute truncate">{demoAccount.accountNumber}</div>
                        </div>
                      </div>

                      <div className="text-right shrink-0 flex items-center gap-1.5">
                        <div className="text-right">
                          <div className="text-xs font-mono font-black text-accent-300">{fmtMoney(demoAccount.balance)}</div>
                          <div className="text-[9.5px] font-mono text-slate-400 font-medium">₹{Math.round(demoAccount.balance * inrRate).toLocaleString('en-IN')}</div>
                        </div>
                        <button
                          onClick={(e) => handleResetDemo(demoAccount.id, e)}
                          title="Reset practice balance back to $10,000.00"
                          disabled={resettingDemo}
                          className="w-6 h-6 rounded-md bg-base-700 hover:bg-accent-500 hover:text-base-950 text-fog flex items-center justify-center transition active:scale-90"
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            className={clsx(resettingDemo && 'animate-spin')}
                          >
                            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Any other accounts if created */}
                  {(accounts ?? []).filter((a) => a.id !== liveAccount?.id && a.id !== demoAccount?.id).map((a) => (
                    <button
                      key={a.id}
                      onClick={() => { setAccountId(a.id); setAccountOpen(false); }}
                      className={clsx('w-full text-left p-2 rounded-lg flex items-center justify-between transition', a.id === active?.id ? 'bg-accent-500/15 border border-accent-500/30' : 'hover:bg-white/[0.05]')}
                    >
                      <div>
                        <div className="text-xs font-bold text-white">{a.accountNumber}</div>
                        <div className="text-[10px] text-mute">{a.accountType}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-mono font-bold text-accent-300">{fmtMoney(a.balance)}</div>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="pt-2 border-t border-line mt-2">
                  <button
                    onClick={() => {
                      nav('/wallet');
                      setAccountOpen(false);
                    }}
                    className="w-full h-8 rounded-lg bg-base-800 hover:bg-base-700 text-xs font-bold text-white transition flex items-center justify-center gap-1.5 border border-line"
                  >
                    <span>Manage Wallet & Deposit →</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Quotex Signature Green Deposit button */}
          <button
            onClick={() => {
              if (liveAccount) setAccountId(liveAccount.id);
              nav('/wallet');
            }}
            className="h-8 px-3.5 rounded-lg bg-[#00c076] hover:bg-[#00d684] text-base-950 font-black text-xs tracking-wide flex items-center gap-1.5 transition shadow-sm active:scale-95"
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
                    ['/top', 'Top 50 Traders 🏆'],
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
