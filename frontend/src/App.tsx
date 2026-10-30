import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { router } from './router';
import { queryClient } from './lib/queryClient';
import { useAuth } from './stores/authStore';
import { Toasts } from './components/ui/Toasts';
import { TradeSettlementOverlay } from './components/trading/TradeSettlementOverlay';

export default function App() {
  const bootstrap = useAuth((s) => s.bootstrap);
  useEffect(() => { void bootstrap(); }, [bootstrap]);
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toasts />
      <TradeSettlementOverlay />
    </QueryClientProvider>
  );
}
