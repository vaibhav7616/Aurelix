import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from './stores/authStore';
import { useUI } from './stores/uiStore';
import { AppShell } from './components/layout/AppShell';
import { Trading } from './pages/app/Trading';
import { PositionsPage, HistoryPage, WalletPage, NotificationsPage, DashboardPage } from './pages/app/SecondaryPages';
import { AdminOptions, AdminOrders } from './pages/admin/AdminOps';
import { LoginPage, RegisterPage } from './pages/public/AuthPages';
import { clsx } from 'clsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ToastHost() {
  const { toasts, dismiss } = useUI();
  if (!toasts.length) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={clsx(
            'pointer-events-auto p-3 rounded-lg border text-xs font-semibold shadow-2xl flex items-center justify-between gap-3 cursor-pointer transition-all animate-in fade-in slide-in-from-top-2',
            t.type === 'ok' && 'bg-[#00c076]/90 border-[#00c076] text-white',
            t.type === 'err' && 'bg-[#ff5447]/90 border-[#ff5447] text-white',
            t.type === 'warn' && 'bg-[#eab308]/90 border-[#eab308] text-black',
            t.type === 'info' && 'bg-[#007aff]/90 border-[#007aff] text-white'
          )}
        >
          <span>{t.message}</span>
          <span className="text-xs opacity-70 hover:opacity-100">✕</span>
        </div>
      ))}
    </div>
  );
}

function AppContent() {
  const { isAuthenticated, initDemoSession, refreshMe } = useAuth();

  useEffect(() => {
    // If not authenticated, automatically initialize a demo session with starting balance
    if (!isAuthenticated) {
      initDemoSession();
    } else {
      refreshMe();
    }
  }, [isAuthenticated, initDemoSession, refreshMe]);

  return (
    <>
      <ToastHost />
      <BrowserRouter>
        <Routes>
          {/* Public Auth Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Main AppShell routes */}
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/trading" replace />} />
            <Route path="/trading" element={<Trading />} />
            <Route path="/markets-app" element={<Trading />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/positions" element={<PositionsPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/admin" element={<AdminOptions />} />
            <Route path="/admin/options" element={<AdminOptions />} />
            <Route path="/admin/orders" element={<AdminOrders />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/trading" replace />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
