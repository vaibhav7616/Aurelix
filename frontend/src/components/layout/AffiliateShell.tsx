import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../stores/authStore';
import { clsx } from 'clsx';
import { Logo } from '../ui/primitives';
import { useAppTheme } from '../../hooks/useAppTheme';
import { fmtMoney } from '../../lib/format';
import { apiError } from '../../lib/api';
import { useAffMe, Icon } from '../../pages/affiliate/shared';
import { AffiliateApply, AffiliateStatusScreen } from '../../pages/affiliate/AffiliateApply';

/** [path, label, svg path, tag] */
const NAV: Array<[string, string, string, string?]> = [
  ['/affiliate', 'Dashboard', 'M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z'],
  ['/affiliate/statistics', 'Statistics', 'M4 20V10M10 20V4M16 20v-6M22 20H2'],
  ['/affiliate/links', 'Links', 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1'],
  ['/affiliate/materials', 'Promo Materials', 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9h.01'],
  ['/affiliate/promocodes', 'Promocodes', 'M3 12V4h8l10 10-8 8zM7.5 8h.01'],
  ['/affiliate/postbacks', 'Postbacks', 'M4 12h12M12 6l6 6-6 6M20 5v14'],
  ['/affiliate/top', 'TOP 10 Partners', 'M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0zM17 6h3v2a3 3 0 01-3 3M7 6H4v2a3 3 0 003 3'],
  ['/affiliate/telegram', 'Telegram Bot', 'M21 4L3 11l6 2 2 6 3-4 5 4zM9 13l12-9', 'New'],
  ['/affiliate/support', 'Support', 'M12 21a9 9 0 100-18 9 9 0 000 18zM9.1 9a3 3 0 015.8 1c0 2-3 2.5-3 4M12 17h.01'],
  ['/affiliate/programs', 'Affiliate Programs', 'M5 4h11l3 3v13H5zM9 10h6M9 14h6M9 18h3'],
  ['/affiliate/withdrawal', 'Withdrawal', 'M12 3v12M7 10l5 5 5-5M4 21h16'],
  ['/affiliate/faq', 'FAQ', 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 8v4M12 16h.01'],
  ['/affiliate/sub-affiliate', 'Sub-Affiliate', 'M9 11a3 3 0 100-6 3 3 0 000 6zM3 20a6 6 0 0112 0M17 11a2.5 2.5 0 100-5M21 20a5 5 0 00-4-4.9'],
];

/** Pages a non-approved partner may still open. */
const OPEN_WHEN_NOT_APPROVED = ['/affiliate/support', '/affiliate/programs', '/affiliate/faq'];
/** Pages anyone signed in may read before applying. */
const OPEN_WITHOUT_APPLICATION = ['/affiliate/programs', '/affiliate/faq'];
const LOCK = 'M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 017 0v3';

function LockedNotice({ page, applied }: { page: string; applied: boolean }) {
  return (
    <div className="max-w-[1160px] mx-auto px-4 md:px-6 pt-4 md:pt-6 -mb-2">
      <div role="status" className="flex items-start gap-3 rounded-md border border-warn/30 bg-warn/10 px-4 py-3 text-xs text-ink1">
        <span className="text-warn mt-[1px]"><Icon d={LOCK} size={16} /></span>
        <div>
          <span className="font-semibold">{page} is locked.</span>{' '}
          {applied
            ? 'Partner tools open as soon as the partner team approves your application.'
            : 'This account is not a partner yet. Fill in the short form below once and every partner tool opens straight away.'}
        </div>
      </div>
    </div>
  );
}

export function AffiliateShell() {
  useAppTheme();
  const { pathname } = useLocation();
  const me = useAffMe();
  const nav = useNavigate();
  const logout = useAuth((s) => s.logout);
  const d = me.data;
  const aff = d && d.affiliate ? d : undefined;
  const path = pathname.replace(/\/+$/, '') || '/affiliate';
  const pageName = NAV.find(([to]) => to === path)?.[1] ?? 'This page';
  const approved = aff?.affiliate.status === 'APPROVED';
  const isLocked = (to: string) => !me.isLoading && !approved && !(aff ? OPEN_WHEN_NOT_APPROVED : OPEN_WITHOUT_APPLICATION).includes(to);

  let content;
  if (me.isLoading) content = <div className="p-6 text-xs text-mute">Loading your partner account…</div>;
  else if (me.isError) content = (
    <div className="p-6">
      <div className="ax-panel p-4 text-xs text-down flex items-center gap-3">
        {apiError(me.error)}
        <button className="ax-btn-ghost ax-btn-sm ml-auto" onClick={() => me.refetch()}>Retry</button>
      </div>
    </div>
  );
  else if (!aff && OPEN_WITHOUT_APPLICATION.includes(path)) content = <Outlet />;
  else if (!aff) content = <>{path !== '/affiliate' && <LockedNotice page={pageName} applied={false} />}<AffiliateApply /></>;
  else if (aff.affiliate.status !== 'APPROVED' && !OPEN_WHEN_NOT_APPROVED.includes(path)) content = <><LockedNotice page={pageName} applied /><AffiliateStatusScreen affiliate={aff.affiliate} /></>;
  else content = <Outlet />;

  const navClass = (isActive: boolean) => clsx(
    'relative flex items-center gap-2.5 rounded-md transition-colors whitespace-nowrap',
    isActive ? 'text-ink1 bg-base-800' : 'text-mute hover:text-ink1 hover:bg-base-850',
  );

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-base-950 text-ink1">
      <header className="h-[52px] shrink-0 border-b border-line bg-base-900 flex items-center gap-3 px-3 md:px-4 z-40">
        <Link to="/affiliate" className="shrink-0 flex items-center gap-2 min-w-0" aria-label="Aurelix Affiliate Center — dashboard">
          <Logo size={22} wordmark={false} />
          <span className="text-[13px] font-semibold text-cream truncate leading-tight">
            <span className="hidden sm:inline">Aurelix </span>Affiliate Center
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-2 min-w-0">
          {aff && (
            <div className="flex items-center gap-3 h-9 px-3 rounded-md bg-base-950 border border-line">
              <div className="leading-tight">
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-mute">Balance</div>
                <div className={clsx('text-[13px] font-semibold ax-num', aff.balance < 0 && 'text-down')}>{fmtMoney(aff.balance)}</div>
              </div>
              <span className="w-px h-6 bg-line" aria-hidden />
              <div className="leading-tight">
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-mute">Level</div>
                <div className="text-[13px] font-semibold ax-num">{aff.level.level}</div>
              </div>
            </div>
          )}
          <Link to="/trading" className="h-9 px-3 rounded-md border border-line text-fog hover:text-ink1 hover:bg-base-800 text-[12px] font-semibold flex items-center gap-1.5 transition shrink-0">
            <span aria-hidden>←</span><span className="hidden sm:inline">Trading terminal</span><span className="sm:hidden">Trade</span>
          </Link>
          <button type="button" onClick={async () => { await logout(); nav('/affiliate/login', { replace: true }); }}
            className="h-9 px-3 rounded-md text-fog hover:text-ink1 hover:bg-base-800 text-[12px] font-semibold shrink-0">Sign out</button>
        </div>
      </header>

      {/* mobile: horizontal tab row */}
      <nav aria-label="Affiliate sections" className="md:hidden shrink-0 border-b border-line bg-base-900 overflow-x-auto">
        <div className="flex gap-1 px-2 py-1.5 w-max">
          {NAV.map(([to, label, , tag]) => (
            <NavLink key={to} to={to} end={to === '/affiliate'} className={({ isActive }) => clsx(navClass(isActive), 'h-8 px-3 text-[12px] font-medium')}>
              {label}
              {isLocked(to) && <span className="opacity-70"><Icon d={LOCK} size={12} /></span>}
              {tag && <span className="ax-tag text-accent-300">{tag}</span>}
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="flex-1 flex min-h-0">
        <nav aria-label="Affiliate sections" className="hidden md:flex w-[212px] shrink-0 flex-col gap-0.5 p-2 border-r border-line bg-base-900 overflow-y-auto">
          {NAV.map(([to, label, d, tag]) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/affiliate'}
              className={({ isActive }) => clsx(
                navClass(isActive), 'h-9 px-3 text-[12.5px] font-medium',
                isActive && 'before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[2px] before:rounded-full before:bg-accent-400',
              )}
            >
              <Icon d={d} size={16} />
              <span className="truncate">{label}</span>
              {isLocked(to)
                ? <span className="ml-auto opacity-70" title="Opens after your partner account is approved"><Icon d={LOCK} size={13} /></span>
                : tag && <span className="ax-tag ml-auto text-accent-300">{tag}</span>}
            </NavLink>
          ))}
        </nav>
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">{content}</main>
      </div>
    </div>
  );
}
