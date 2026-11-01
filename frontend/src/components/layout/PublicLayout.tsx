import { Link, Outlet, useLocation } from 'react-router-dom';
import { Logo } from '../ui/primitives';
import { useAuth } from '../../stores/authStore';
import { useQuery } from '@tanstack/react-query';
import { get } from '../../lib/api';

/** Footer status line from the public status endpoint (green / amber / unknown). */
function FooterStatus() {
  const { data, isError } = useQuery({ queryKey: ['pub-status'], queryFn: () => get<{ overall: 'operational' | 'degraded' }>('/api/v1/public/status'), refetchInterval: 30_000 });
  const ok = data?.overall === 'operational';
  return (
    <Link to="/status" className="inline-flex items-center gap-1.5 hover:text-fog">
      <span className={`w-1.5 h-1.5 rounded-full ${isError ? 'bg-down' : !data ? 'bg-mute' : ok ? 'bg-up' : 'bg-warn'}`} aria-hidden />
      {isError ? 'Status unavailable' : !data ? 'Checking status' : ok ? 'All systems operational' : 'Some services degraded'}
    </Link>
  );
}

const LINKS: Array<[string, string]> = [
  ['/markets', 'Markets'],
  ['/features', 'Features'],
  ['/how-it-works', 'How it works'],
  ['/security', 'Security'],
  ['/promotions', 'Promotions'],
  ['/faq', 'FAQ'],
  ['/contact', 'Contact'],
];

export function PublicLayout() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  return (
    <div className="min-h-screen flex flex-col bg-base-950">
      <header className="sticky top-0 z-40 border-b border-line bg-base-950/90 backdrop-blur">
        <div className="max-w-[1240px] mx-auto px-4 h-[60px] flex items-center gap-5">
          <Link to="/" className="shrink-0"><Logo /></Link>
          <nav className="hidden lg:flex items-center gap-0.5 ml-2">
            {LINKS.map(([to, label]) => (
              <Link
                key={to}
                to={to}
                className={`px-2.5 h-8 inline-flex items-center text-[13px] font-medium rounded-md transition ${pathname === to ? 'text-ink1 bg-white/[0.07]' : 'text-fog hover:text-ink1 hover:bg-white/[0.06]'}`}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <Link to="/trading" className="ax-btn-primary ax-btn-sm !h-8 !px-4">Open terminal</Link>
            ) : (
              <>
                <Link to="/login" className="ax-btn-quiet !text-[13px]">Log in</Link>
                <Link to="/register" className="ax-btn-primary ax-btn-sm !h-8 !px-4">Create account</Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1"><Outlet /></main>
      <footer className="border-t border-line mt-14 bg-base-900/50">
        <div className="max-w-[1240px] mx-auto px-4 py-9 grid sm:grid-cols-2 lg:grid-cols-4 gap-7 text-[13px]">
          <div>
            <Logo />
            <p className="text-mute mt-3 text-xs leading-relaxed max-w-[260px]">Fixed-time trading on crypto, forex and gold, with server-side settlement and verified payments.</p>
          </div>
          <div>
            <div className="ax-micro mb-2.5">Platform</div>
            {LINKS.map(([to, label]) => (
              <Link key={to} to={to} className="block py-[5px] text-fog hover:text-ink1 text-[13px]">{label}</Link>
            ))}
          </div>
          <div>
            <div className="ax-micro mb-2.5">Account</div>
            <Link to="/login" className="block py-[5px] text-fog hover:text-ink1">Log in</Link>
            <Link to="/register" className="block py-[5px] text-fog hover:text-ink1">Create account</Link>
            <Link to="/trading" className="block py-[5px] text-fog hover:text-ink1">Trading terminal</Link>
            <Link to="/affiliate/login" className="block py-[5px] text-fog hover:text-ink1">Affiliate Center</Link>
          </div>
          <div>
            <div className="ax-micro mb-2.5">Risk warning</div>
            <p className="text-mute text-xs leading-relaxed">Fixed-time trading is high risk: you can lose the full amount of every trade. Past results do not predict future results. Nothing on this site is financial advice.</p>
            <Link to="/risk" className="inline-block mt-2 text-xs font-semibold text-accent-300 hover:underline">Read the full risk disclosure →</Link>
          </div>
        </div>
        <div className="border-t border-line py-3.5 text-center text-[11px] text-mute">
          <FooterStatus /> · © 2026 Aurelix · Charts powered by <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer" className="hover:text-fog">TradingView Lightweight Charts™</a>
        </div>
      </footer>
    </div>
  );
}
