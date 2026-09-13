import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { get, post } from '../../lib/api';
import { useTerminal } from '../../stores/terminalStore';
import { useAuth } from '../../stores/authStore';
import { useUI } from '../../stores/uiStore';
import { fmtMoney, fmtTime } from '../../lib/format';
import { OpenTradesTable, TradeHistoryTable } from '../../components/trading/TradesPanel';
import { Empty, TableSkeleton } from '../../components/ui/primitives';
import { clsx } from 'clsx';

interface Account {
  id: string;
  accountNumber: string;
  balance: number;
  currency: string;
  accountType: string;
}

interface WalletTx {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  memo?: string;
  createdAt: string;
}

interface OptionStat {
  totalTrades: number;
  wonTrades: number;
  lostTrades: number;
  tieTrades: number;
  winRatePct: number;
  totalVolume: number;
  netProfit: number;
}

/** Fixed-time Binary Trades Page */
export function PositionsPage() {
  const [tab, setTab] = useState<'open' | 'history'>('open');

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Binary Options Trades</h1>
          <p className="text-xs text-mute mt-0.5">Real-time status and outcome of all fixed-time contracts</p>
        </div>
        <div className="flex bg-base-900 border border-line rounded-lg p-0.5">
          <button
            onClick={() => setTab('open')}
            className={clsx('px-4 py-1.5 rounded-md text-xs font-bold transition', tab === 'open' ? 'bg-[#007aff] text-white' : 'text-mute hover:text-white')}
          >
            Running Trades
          </button>
          <button
            onClick={() => setTab('history')}
            className={clsx('px-4 py-1.5 rounded-md text-xs font-bold transition', tab === 'history' ? 'bg-[#007aff] text-white' : 'text-mute hover:text-white')}
          >
            Settled History
          </button>
        </div>
      </div>

      <div className="bg-base-900 border border-line rounded-xl overflow-hidden p-4">
        {tab === 'open' ? <OpenTradesTable /> : <TradeHistoryTable pageSize={40} />}
      </div>
    </div>
  );
}

/** Settled Trade History Page */
export function HistoryPage() {
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">Trade History</h1>
        <p className="text-xs text-mute mt-0.5">Historical log of all expired and settled binary options contracts</p>
      </div>

      <div className="bg-base-900 border border-line rounded-xl overflow-hidden p-4">
        <TradeHistoryTable pageSize={50} />
      </div>
    </div>
  );
}

/** Quotex Account Wallet & Reload Page */
export function WalletPage() {
  const { accountId, setAccountId } = useTerminal();
  const push = useUI((s) => s.push);
  const qc = useQueryClient();

  const { data: accounts, isLoading: accLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => get<Account[]>('/api/v1/accounts'),
  });

  const active = accounts?.find((a) => a.id === accountId) ?? accounts?.[0];

  const { data: txs, isLoading: txLoading } = useQuery({
    queryKey: ['wallet-txs', active?.id],
    queryFn: () => get<{ items: WalletTx[] }>('/api/v1/wallet/transactions', { accountId: active?.id, pageSize: 20 }),
    enabled: !!active?.id,
  });

  const [topupAmount, setTopupAmount] = useState('1000');
  const [busy, setBusy] = useState(false);

  const handleDeposit = async () => {
    if (!active) return;
    const val = parseFloat(topupAmount);
    if (!val || val <= 0) return;
    setBusy(true);
    try {
      await post('/api/v1/wallet/deposit', {
        accountId: active.id,
        amount: val,
        memo: 'Demo account balance top-up',
      });
      push('ok', `Successfully added ${fmtMoney(val)} to your ${active.accountType} account.`);
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['wallet-txs'] });
    } catch {
      push('err', 'Failed to deposit. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">Wallet & Balances</h1>
        <p className="text-xs text-mute mt-0.5">Manage your practice and live balances for fixed-time trading</p>
      </div>

      {accLoading ? (
        <TableSkeleton rows={3} />
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Account Card */}
          <div className="bg-base-900 border border-line rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-accent-300 tracking-wider">
                {active?.accountType === 'DEMO' ? 'Demo Practice Account' : 'Live Trading Account'}
              </span>
              <span className="text-[11px] font-mono text-mute">{active?.accountNumber}</span>
            </div>

            <div>
              <div className="text-xs text-mute font-medium">Available Balance</div>
              <div className="text-3xl font-extrabold font-mono text-white mt-1">
                {active ? fmtMoney(active.balance) : '—'}
              </div>
            </div>

            <div className="pt-2 border-t border-line flex items-center gap-2">
              <div className="text-xs text-mute">Account Type:</div>
              <span className="text-xs font-bold text-white bg-base-800 px-2.5 py-0.5 rounded border border-line">
                {active?.accountType}
              </span>
            </div>
          </div>

          {/* Quick Reload Card */}
          <div className="bg-base-900 border border-line rounded-xl p-5 space-y-4">
            <div className="text-xs font-bold uppercase text-white tracking-wider">
              Instant Balance Reload
            </div>
            <p className="text-xs text-mute">
              Reset or top up your practice demo balance with instant virtual funds to test strategies.
            </p>

            <div className="flex items-center gap-2">
              {[500, 1000, 5000, 10000].map((amt) => (
                <button
                  key={amt}
                  onClick={() => setTopupAmount(String(amt))}
                  className={clsx(
                    'flex-1 py-1.5 text-xs font-bold rounded-lg border transition font-mono',
                    topupAmount === String(amt)
                      ? 'bg-[#007aff] border-[#007aff] text-white'
                      : 'bg-base-800 border-line text-fog hover:text-white'
                  )}
                >
                  +${amt}
                </button>
              ))}
            </div>

            <button
              onClick={handleDeposit}
              disabled={busy || !active}
              className="w-full h-10 rounded-lg bg-[#00c076] hover:bg-[#00d684] text-white font-bold text-xs flex items-center justify-center transition shadow"
            >
              {busy ? 'Processing…' : `Top Up +$${topupAmount} (Instant)`}
            </button>
          </div>
        </div>
      )}

      {/* Transaction History */}
      <div className="bg-base-900 border border-line rounded-xl overflow-hidden p-4 space-y-3">
        <h2 className="text-sm font-bold text-white">Recent Wallet Activity</h2>
        {txLoading ? (
          <TableSkeleton rows={4} cols={4} />
        ) : !txs?.items?.length ? (
          <Empty title="No wallet transactions yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-mute border-b border-line text-left">
                  <th className="py-2 px-3">Type</th>
                  <th className="py-2 px-3">Amount</th>
                  <th className="py-2 px-3">Balance After</th>
                  <th className="py-2 px-3">Note</th>
                  <th className="py-2 px-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {txs.items.map((tx) => (
                  <tr key={tx.id} className="hover:bg-white/[0.02]">
                    <td className="py-2.5 px-3 font-semibold text-white">{tx.type}</td>
                    <td className={clsx('py-2.5 px-3 font-mono font-bold', tx.amount >= 0 ? 'text-[#00c076]' : 'text-[#ff5447]')}>
                      {tx.amount >= 0 ? `+${fmtMoney(tx.amount)}` : fmtMoney(tx.amount)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-fog">{fmtMoney(tx.balanceAfter)}</td>
                    <td className="py-2.5 px-3 text-mute">{tx.memo || '—'}</td>
                    <td className="py-2.5 px-3 text-mute font-mono">{fmtTime(tx.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** Notifications Page */
export function NotificationsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 'page'],
    queryFn: () => get<{ items: Array<{ id: string; title: string; message: string; createdAt: string }> }>('/api/v1/notifications', { pageSize: 30 }),
  });

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">System Alerts</h1>
        <p className="text-xs text-mute mt-0.5">Contract expirations, payouts, and platform notifications</p>
      </div>

      <div className="bg-base-900 border border-line rounded-xl p-4">
        {isLoading ? (
          <TableSkeleton rows={4} />
        ) : !data?.items?.length ? (
          <Empty title="No notifications right now" />
        ) : (
          <div className="divide-y divide-line">
            {data.items.map((n) => (
              <div key={n.id} className="py-3 px-2 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-base-800 border border-line flex items-center justify-center text-sm shrink-0">
                  🔔
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-white">{n.title}</div>
                  <div className="text-xs text-fog mt-0.5">{n.message}</div>
                  <div className="text-[10px] text-mute mt-1 font-mono">{fmtTime(n.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Dashboard Overview */
export function DashboardPage() {
  const { accountId } = useTerminal();
  const { data: stats } = useQuery({
    queryKey: ['options', 'stats', accountId],
    queryFn: () => get<OptionStat>('/api/v1/options/stats', accountId ? { accountId } : {}),
  });

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Trading Overview</h1>
          <p className="text-xs text-mute mt-0.5">Summary performance across all binary contracts</p>
        </div>
        <Link
          to="/trading"
          className="h-9 px-4 rounded-lg bg-[#00c076] hover:bg-[#00d684] text-white font-bold text-xs flex items-center gap-1.5 transition shadow"
        >
          <span>Open Binary Terminal</span>
          <span>→</span>
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-base-900 border border-line rounded-xl p-4">
          <div className="text-xs text-mute font-medium">Total Contracts</div>
          <div className="text-2xl font-extrabold font-mono text-white mt-1">
            {stats?.totalTrades ?? 0}
          </div>
        </div>
        <div className="bg-base-900 border border-line rounded-xl p-4">
          <div className="text-xs text-mute font-medium">Win Rate</div>
          <div className="text-2xl font-extrabold font-mono text-[#00c076] mt-1">
            {stats?.winRatePct != null ? `${stats.winRatePct.toFixed(1)}%` : '0.0%'}
          </div>
        </div>
        <div className="bg-base-900 border border-line rounded-xl p-4">
          <div className="text-xs text-mute font-medium">Net Profit / Loss</div>
          <div className={clsx('text-2xl font-extrabold font-mono mt-1', (stats?.netProfit ?? 0) >= 0 ? 'text-[#00c076]' : 'text-[#ff5447]')}>
            {stats ? fmtMoney(stats.netProfit) : '$0.00'}
          </div>
        </div>
        <div className="bg-base-900 border border-line rounded-xl p-4">
          <div className="text-xs text-mute font-medium">Trading Volume</div>
          <div className="text-2xl font-extrabold font-mono text-white mt-1">
            {stats ? fmtMoney(stats.totalVolume) : '$0.00'}
          </div>
        </div>
      </div>

      <div className="bg-base-900 border border-line rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Recent Fixed-Time Contracts</h2>
          <Link to="/history" className="text-xs text-[#007aff] hover:underline font-semibold">
            View all history →
          </Link>
        </div>
        <TradeHistoryTable pageSize={10} compact />
      </div>
    </div>
  );
}
