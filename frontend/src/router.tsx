import { createBrowserRouter, Navigate } from 'react-router-dom';
import { PublicLayout } from './components/layout/PublicLayout';
import { AppShell } from './components/layout/AppShell';
import { AdminShell } from './components/layout/AdminShell';
import { Landing } from './pages/public/Landing';
import { MarketsPage, FeaturesPage, HowItWorksPage, SecurityPage, FaqPage, RiskPage, StatusPage, ContactPage, PromotionsPage } from './pages/public/SimplePages';
import { LoginPage, RegisterPage } from './pages/public/AuthPages';
import { Dashboard } from './pages/app/Dashboard';
import { Trading } from './pages/app/Trading';
import { MarketsApp } from './pages/app/MarketsApp';
import { PositionsPage } from './pages/app/PositionsPage';
import { HistoryPage } from './pages/app/HistoryPage';
import { WalletPage, TransfersPage } from './pages/app/WalletPages';
import { LeaderboardPage } from './pages/app/LeaderboardPage';
import { NotificationsPage, SettingsPage, MorePage } from './pages/app/MiscApp';
import { TopPage, SupportPage } from './pages/app/CommunityPages';
import { AdminOverview, AdminUsers, AdminAccounts, AdminAssets, AdminMarket } from './pages/admin/AdminPages';
import { AdminOptions, AdminOrders, AdminPositions, AdminTrades, AdminDeposits, AdminWithdrawals, AdminRisk, AdminBroadcast, AdminAudit, AdminSettings } from './pages/admin/AdminOps';
import { AdminAffiliates, AdminAffiliatePayouts, AdminAffiliateTickets } from './pages/admin/AdminAffiliates';
import { TrackRedirect } from './pages/public/TrackRedirect';
import { AffiliateShell } from './components/layout/AffiliateShell';
import { AffiliateDashboard } from './pages/affiliate/AffiliateDashboard';
import { AffiliateStatistics } from './pages/affiliate/AffiliateStatistics';
import { AffiliateLinks } from './pages/affiliate/AffiliateLinks';
import { AffiliateMaterials } from './pages/affiliate/AffiliateMaterials';
import { AffiliatePromocodes } from './pages/affiliate/AffiliatePromocodes';
import { AffiliatePostbacks } from './pages/affiliate/AffiliatePostbacks';
import { AffiliateTop } from './pages/affiliate/AffiliateTop';
import { AffiliateTelegram } from './pages/affiliate/AffiliateTelegram';
import { AffiliateSupport } from './pages/affiliate/AffiliateSupport';
import { AffiliatePrograms } from './pages/affiliate/AffiliatePrograms';
import { AffiliateSubAffiliate } from './pages/affiliate/AffiliateSubAffiliate';
import { AffiliateLogin, AffiliateSignup } from './pages/affiliate/AffiliateAuth';
import { AffiliateWithdrawal } from './pages/affiliate/AffiliateWithdrawal';
import { AffiliateFaq } from './pages/affiliate/AffiliateFaq';
import { useAuth } from './stores/authStore';
import { hasSession } from './lib/api';
import { RouteError } from './components/ui/RouteError';
import type { ReactNode } from 'react';

function Guard({ children, admin, loginTo = '/login' }: { children: ReactNode; admin?: boolean; loginTo?: string }) {
  const { user, ready } = useAuth();
  const token = hasSession();

  if (!ready && token) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-base-950">
        <img src="/logo.svg" alt="" width={36} height={36} />
        <div className="text-xs text-mute">Connecting to terminal…</div>
      </div>
    );
  }
  if (!user && !token) return <Navigate to={loginTo} replace />;
  if (admin && user && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') return <Navigate to="/trading" replace />;
  return <>{children}</>;
}

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/markets', element: <MarketsPage /> },
      { path: '/features', element: <FeaturesPage /> },
      { path: '/how-it-works', element: <HowItWorksPage /> },
      { path: '/security', element: <SecurityPage /> },
      { path: '/faq', element: <FaqPage /> },
      { path: '/risk', element: <RiskPage /> },
      { path: '/status', element: <StatusPage /> },
      { path: '/contact', element: <ContactPage /> },
      { path: '/promotions', element: <PromotionsPage /> },
      { path: '/r/:code', element: <TrackRedirect /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    element: <Guard><AppShell /></Guard>,
    errorElement: <RouteError />,
    children: [
      { path: '/trading', element: <Trading /> },
      { path: '/dashboard', element: <Dashboard /> },
      { path: '/top', element: <LeaderboardPage /> },
      { path: '/leaderboard', element: <LeaderboardPage /> },
      { path: '/markets-app', element: <MarketsApp /> },
      { path: '/positions', element: <PositionsPage /> },
      { path: '/orders', element: <PositionsPage /> },
      { path: '/history', element: <HistoryPage /> },
      { path: '/wallet', element: <WalletPage /> },
      { path: '/deposits', element: <TransfersPage kind="deposits" /> },
      { path: '/withdrawals', element: <TransfersPage kind="withdrawals" /> },
      { path: '/notifications', element: <NotificationsPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/more', element: <MorePage /> },
      { path: '/top', element: <TopPage /> },
      { path: '/support', element: <SupportPage /> },
      { path: '/referrals', element: <Navigate to="/affiliate" replace /> },
    ],
  },
  {
    element: <Guard admin><AdminShell /></Guard>,
    errorElement: <RouteError />,
    children: [
      { path: '/admin', element: <AdminOverview /> },
      { path: '/admin/users', element: <AdminUsers /> },
      { path: '/admin/accounts', element: <AdminAccounts /> },
      { path: '/admin/assets', element: <AdminAssets /> },
      { path: '/admin/market', element: <AdminMarket /> },
      { path: '/admin/options', element: <AdminOptions /> },
      { path: '/admin/orders', element: <AdminOrders /> },
      { path: '/admin/positions', element: <AdminPositions /> },
      { path: '/admin/trades', element: <AdminTrades /> },
      { path: '/admin/deposits', element: <AdminDeposits /> },
      { path: '/admin/withdrawals', element: <AdminWithdrawals /> },
      { path: '/admin/risk', element: <AdminRisk /> },
      { path: '/admin/payments', element: <AdminDeposits /> },
      { path: '/admin/notifications', element: <AdminBroadcast /> },
      { path: '/admin/audit', element: <AdminAudit /> },
      { path: '/admin/settings', element: <AdminSettings /> },
      { path: '/admin/affiliates', element: <AdminAffiliates /> },
      { path: '/admin/affiliate-payouts', element: <AdminAffiliatePayouts /> },
      { path: '/admin/affiliate-support', element: <AdminAffiliateTickets /> },
    ],
  },
  { path: '/affiliate/login', element: <AffiliateLogin />, errorElement: <RouteError /> },
  { path: '/affiliate/signup', element: <AffiliateSignup />, errorElement: <RouteError /> },
  {
    element: <Guard loginTo="/affiliate/login"><AffiliateShell /></Guard>,
    errorElement: <RouteError />,
    children: [
      { path: '/affiliate', element: <AffiliateDashboard /> },
      { path: '/affiliate/statistics', element: <AffiliateStatistics /> },
      { path: '/affiliate/links', element: <AffiliateLinks /> },
      { path: '/affiliate/materials', element: <AffiliateMaterials /> },
      { path: '/affiliate/promocodes', element: <AffiliatePromocodes /> },
      { path: '/affiliate/postbacks', element: <AffiliatePostbacks /> },
      { path: '/affiliate/top', element: <AffiliateTop /> },
      { path: '/affiliate/telegram', element: <AffiliateTelegram /> },
      { path: '/affiliate/support', element: <AffiliateSupport /> },
      { path: '/affiliate/programs', element: <AffiliatePrograms /> },
      { path: '/affiliate/sub-affiliate', element: <AffiliateSubAffiliate /> },
      { path: '/affiliate/withdrawal', element: <AffiliateWithdrawal /> },
      { path: '/affiliate/faq', element: <AffiliateFaq /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
