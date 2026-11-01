import { useQuery } from '@tanstack/react-query';
import { get } from './api';

export interface UsdInr { rate: number; date: string; source: string; isLive: boolean }

/** USD→INR from the server's exchange-rate service (the same rate the cashier uses). */
export function useUsdInr() {
  const { data } = useQuery({
    queryKey: ['pub-usd-inr'],
    queryFn: () => get<UsdInr>('/api/v1/payments/exchange-rate'),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });
  return data ?? null;
}

/** ₹ in Indian grouping (₹9,50,500), whole rupees. */
export function fmtInr(usd: number, rate: number): string {
  return `₹${Math.round(usd * rate).toLocaleString('en-IN')}`;
}
