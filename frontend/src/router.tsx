import { createBrowserRouter, Navigate } from 'react-router-dom';
import { PublicLayout } from './components/layout/PublicLayout';
import { AppShell } from './components/layout/AppShell';
import { AdminShell } from './components/layout/AdminShell';
import { Landing } from './pages/public/Landing';
import { MarketsPage, FeaturesPage, HowItWorksPage, SecurityPage, FaqPage } from './pages/public/SimplePages';
import { LoginPage, RegisterPage } from './pages/public/AuthPages';
import { Dashboard } from './pages/app/Dashboard';
import { Trading } from './pages/app/Trading';
import { MarketsApp } from './pages/app/MarketsApp';
import { PositionsPage } from './pages/app/PositionsPage';
import { HistoryPage } from './pages/app/HistoryPage';
import { WalletPage, TransfersPage } from './pages/app/WalletPages';
import { NotificationsPage, SettingsPage, MorePage } from './pages/app/MiscApp';
import { AdminOverview, AdminUsers, AdminAccounts, AdminAssets, AdminMarket } from './pages/admin/AdminPages';
import { AdminOptions, AdminOrders, AdminPositions, AdminTrades, AdminDeposits, AdminWithdrawals, AdminRisk, AdminBroadcast, AdminAudit, AdminSettings } from './pages/admin/AdminOps';
import { useAuth } from './stores/authStore';
import { RouteError } from './components/ui/RouteError';
import type { ReactNode } from 'react';

function Guard({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { user, ready } = useAuth();
  if (!ready) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-base-950">
        <img src="/logo.svg" alt="" width={36} height={36} />
        <div className="text-xs text-mute">Connecting to terminal…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') return <Navigate to="/trading" replace />;
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
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
