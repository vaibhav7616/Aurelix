import { NavLink, Outlet, Link } from 'react-router-dom';
import { Logo } from '../ui/primitives';
import { useAuth } from '../../stores/authStore';

const GROUPS: Array<{ title: string; items: Array<[string, string]> }> = [
  { title: 'Monitor', items: [['/admin', 'Dashboard'], ['/admin/market', 'Market engine']] },
  { title: 'Operations', items: [['/admin/users', 'Users'], ['/admin/accounts', 'Trading accounts'], ['/admin/assets', 'Assets & payouts'], ['/admin/options', 'Fixed-time trades'], ['/admin/orders', 'Orders (legacy)'], ['/admin/positions', 'Positions (legacy)'], ['/admin/trades', 'CFD trades (legacy)']] },
  { title: 'Money', items: [['/admin/deposits', 'Deposits'], ['/admin/withdrawals', 'Withdrawals'], ['/admin/payments', 'Payments']] },
  { title: 'Control', items: [['/admin/risk', 'Risk rules'], ['/admin/notifications', 'Notifications'], ['/admin/audit', 'Audit logs'], ['/admin/settings', 'System settings']] },
];

export function AdminShell() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-base-950">
      <header className="h-[52px] border-b border-line bg-base-900 flex items-center gap-3 px-4 sticky top-0 z-30">
        <Link to="/trading"><Logo size={24} /></Link>
        <span className="text-[9px] font-bold tracking-[0.16em] uppercase text-accent-300 border border-accent-500/40 bg-accent-500/[0.08] rounded px-2 py-1">Control deck</span>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[11px] text-mute hidden sm:block">{user?.email} · <span className="text-accent-300 font-semibold">{user?.role}</span></span>
          <Link to="/trading" className="ax-btn-ghost ax-btn-sm">← Terminal</Link>
        </div>
      </header>
      <div className="flex">
        <aside className="w-[208px] shrink-0 hidden lg:block border-r border-line min-h-[calc(100vh-52px)] p-2.5 space-y-4 bg-base-900/60">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="ax-micro px-2 mb-1">{g.title}</div>
              {g.items.map(([to, label]) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/admin'}
                  className={({ isActive }) => `block px-2.5 h-8 leading-8 rounded-md text-[13px] transition ${isActive ? 'bg-white/[0.08] text-ink1 font-semibold' : 'text-fog hover:text-ink1 hover:bg-white/[0.06]'}`}
                >
                  {label}
                </NavLink>
              ))}
            </div>
          ))}
        </aside>
        <main className="flex-1 p-4 min-w-0 max-w-[1400px]"><Outlet /></main>
      </div>
      {/* mobile admin nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-base-900/95 border-t border-line flex overflow-x-auto px-2 py-2 gap-1">
        {GROUPS.flatMap((g) => g.items).map(([to, label]) => (
          <NavLink key={to} to={to} end={to === '/admin'} className={({ isActive }) => `shrink-0 px-2.5 h-8 leading-8 rounded-md text-xs ${isActive ? 'bg-white/[0.08] text-ink1' : 'text-mute'}`}>{label}</NavLink>
        ))}
      </nav>
    </div>
  );
}
