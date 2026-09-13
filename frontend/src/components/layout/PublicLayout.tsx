import { Link, Outlet, useLocation } from 'react-router-dom';
import { Logo } from '../ui/primitives';
import { useAuth } from '../../stores/authStore';

const LINKS: Array<[string, string]> = [
  ['/markets', 'Markets'],
  ['/trading-info', 'Trading'],
  ['/features', 'Features'],
  ['/how-it-works', 'How it works'],
  ['/security', 'Security'],
  ['/faq', 'FAQ'],
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
                to={to === '/trading-info' ? '/features' : to}
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
            <p className="text-mute mt-3 text-xs leading-relaxed max-w-[260px]">A professional trading terminal for active market participants.</p>
          </div>
          <div>
            <div className="ax-micro mb-2.5">Platform</div>
            {['/markets', '/features', '/how-it-works', '/security', '/faq'].map((l) => (
              <Link key={l} to={l} className="block py-[5px] text-fog hover:text-ink1 capitalize text-[13px]">{l.slice(1).replace('-', ' ')}</Link>
            ))}
          </div>
          <div>
            <div className="ax-micro mb-2.5">Account</div>
            <Link to="/login" className="block py-[5px] text-fog hover:text-ink1">Log in</Link>
            <Link to="/register" className="block py-[5px] text-fog hover:text-ink1">Create account</Link>
            <Link to="/trading" className="block py-[5px] text-fog hover:text-ink1">Trading terminal</Link>
          </div>
          <div>
            <div className="ax-micro mb-2.5">Risk disclosure</div>
            <p className="text-mute text-xs leading-relaxed">Trading involves substantial risk of loss. Past performance does not predict future results. Nothing on this site is financial advice.</p>
          </div>
        </div>
        <div className="border-t border-line py-3.5 text-center text-[11px] text-mute">
          © 2026 Aurelix · Charts powered by <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer" className="hover:text-fog">TradingView Lightweight Charts™</a>
        </div>
      </footer>
    </div>
  );
}
