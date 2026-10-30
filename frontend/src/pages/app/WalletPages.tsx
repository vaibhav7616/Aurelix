import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { get, post, apiError } from '../../lib/api';
import { useTerminal } from '../../stores/terminalStore';
import { useUI } from '../../stores/uiStore';
import { Card, SectionTitle, Empty } from '../../components/ui/primitives';
import { fmtMoney, fmtTime } from '../../lib/format';
import { clsx } from 'clsx';

interface Account {
  id: string;
  accountNumber: string;
  balance: number;
  lockedBalance: number;
  accountType: 'LIVE' | 'DEMO';
  currency: string;
}

interface Txn {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  memo: string | null;
  createdAt: string;
}

interface DepositOrder {
  depositId: string;
  orderRef: string;
  amount: number;
  bonusPct: number;
  bonusAmount: number;
  totalCredit: number;
  method: string;
  status: string;
  gatewayData: {
    type?: string;
    title?: string;
    network?: string;
    address?: string;
    amountCrypto?: string;
    cryptoCurrency?: string;
    rate?: string;
    exchangeRate?: number;
    exchangeRateDate?: string;
    exchangeRateSource?: string;
    memo?: string;
    expiryMinutes?: number;
    warning?: string;
    upiId?: string;
    payeeName?: string;
    amountInr?: number;
    qrPayload?: string;
    intents?: {
      phonepe?: string;
      gpay?: string;
      paytm?: string;
      bhim?: string;
      generic?: string;
    };
    bankName?: string;
    beneficiaryName?: string;
    accountNumber?: string;
    ifsc?: string;
    swift?: string;
    instructions?: string;
  };
  createdAt: string;
}

interface ExchangeRateResponse {
  base: string;
  target: string;
  rate: number;
  date: string;
  source: string;
  lastUpdated: number;
  isLive: boolean;
  formatted: string;
}

interface WithdrawalRow {
  id: string;
  amount: number;
  currency: string;
  method: string;
  status: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

interface DepositRow {
  id: string;
  amount: number;
  currency: string;
  provider: string;
  providerRef: string | null;
  status: string;
  createdAt: string;
}

// Payment method configurations matching Quotex platform
const DEPOSIT_METHODS = [
  {
    id: 'crypto_usdt_trc20',
    name: 'USDT (Tether)',
    badge: 'TRC-20',
    category: 'crypto',
    desc: 'Lowest fee · Tron network',
    icon: '₮',
    recommended: true,
  },
  {
    id: 'crypto_btc',
    name: 'Bitcoin',
    badge: 'BTC',
    category: 'crypto',
    desc: 'Native blockchain · 1 confirmation',
    icon: '₿',
  },
  {
    id: 'crypto_eth',
    name: 'Ethereum',
    badge: 'ERC-20',
    category: 'crypto',
    desc: 'Ethereum network',
    icon: 'Ξ',
  },
  {
    id: 'upi_qr',
    name: 'UPI QR',
    badge: 'UPI',
    category: 'epay',
    desc: 'PhonePe, GPay, Paytm, BHIM · ₹ INR',
    icon: '⚡',
    recommended: true,
  },
  {
    id: 'bank_transfer',
    name: 'Bank Transfer',
    badge: 'IMPS/NEFT',
    category: 'bank',
    desc: 'Direct Wire · Global / Local accounts',
    icon: '🏦',
  },
];

const PRESET_AMOUNTS = [10, 25, 50, 100, 250, 500, 1000, 2500];

// SVG / Dynamic QR Code generator component
function QrDisplay({ payload, label }: { payload: string; label: string }) {
  const [imgError, setImgError] = useState(false);
  const qrUrl = payload ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(payload)}` : '';

  return (
    <div className="flex flex-col items-center justify-center p-3.5 bg-white rounded-md shadow-lg border border-ink1 shrink-0">
      {!imgError && qrUrl ? (
        <img
          src={qrUrl}
          alt="Payment QR"
          width={180}
          height={180}
          onError={() => setImgError(true)}
          className="rounded-lg object-contain"
        />
      ) : (
        <svg width="180" height="180" viewBox="0 0 100 100" className="shape-rendering-crispEdges">
          <rect width="100" height="100" fill="#ffffff" />
          {/* Top-left position marker */}
          <rect x="6" y="6" width="28" height="28" fill="#101610" rx="3" />
          <rect x="10" y="10" width="20" height="20" fill="#ffffff" rx="2" />
          <rect x="14" y="14" width="12" height="12" fill="#101610" rx="1.5" />
          {/* Top-right position marker */}
          <rect x="66" y="6" width="28" height="28" fill="#101610" rx="3" />
          <rect x="70" y="10" width="20" height="20" fill="#ffffff" rx="2" />
          <rect x="74" y="14" width="12" height="12" fill="#101610" rx="1.5" />
          {/* Bottom-left position marker */}
          <rect x="6" y="66" width="28" height="28" fill="#101610" rx="3" />
          <rect x="10" y="70" width="20" height="20" fill="#ffffff" rx="2" />
          <rect x="14" y="74" width="12" height="12" fill="#101610" rx="1.5" />
          {/* Simulated data pattern dots */}
          <circle cx="45" cy="15" r="3" fill="#101610" />
          <circle cx="55" cy="20" r="2.5" fill="#101610" />
          <circle cx="48" cy="28" r="3" fill="#101610" />
          <circle cx="20" cy="45" r="2.5" fill="#101610" />
          <circle cx="28" cy="52" r="3" fill="#101610" />
          <circle cx="40" cy="42" r="2.8" fill="#101610" />
          <circle cx="50" cy="50" r="3.5" fill="#32A66A" />
          <circle cx="60" cy="44" r="2.5" fill="#101610" />
          <circle cx="75" cy="48" r="3" fill="#101610" />
          <circle cx="85" cy="55" r="2.5" fill="#101610" />
          <circle cx="44" cy="65" r="3" fill="#101610" />
          <circle cx="55" cy="72" r="2.5" fill="#101610" />
          <circle cx="68" cy="68" r="3" fill="#101610" />
          <circle cx="82" cy="78" r="3" fill="#101610" />
          <circle cx="48" cy="85" r="2.8" fill="#101610" />
          <circle cx="62" cy="88" r="2.5" fill="#101610" />
          <circle cx="78" cy="88" r="3" fill="#101610" />
        </svg>
      )}
      <span className="text-[10px] font-bold text-base-700 mt-2">{label}</span>
    </div>
  );
}

export function WalletPage() {
  const { accountId, setAccountId } = useTerminal();
  const push = useUI((s) => s.push);
  const qc = useQueryClient();
  const nav = useNavigate();

  // Top Tabs: 'deposit' | 'withdraw' | 'transfers' | 'ledger'
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'transfers' | 'ledger'>('deposit');

  // Account queries
  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => get<Account[]>('/api/v1/accounts'),
    refetchInterval: 8000,
  });

  // Prefer LIVE account for Cashier / Real Deposits
  const liveAccount = accounts?.find((a) => a.accountType === 'LIVE');
  const selectedAccount = accounts?.find((a) => a.id === accountId) ?? liveAccount ?? accounts?.[0];
  const targetId = selectedAccount?.id;
  // Deposits and withdrawals are only allowed on LIVE accounts (backend returns 422 LIVE_ONLY otherwise)
  const isLiveSelected = selectedAccount?.accountType === 'LIVE';

  const { data: wallet } = useQuery({
    queryKey: ['wallet', targetId],
    queryFn: () => get<{ balance: number; locked: number; available: number; currency: string }>(`/api/v1/wallet/${targetId}`),
    enabled: !!targetId,
    refetchInterval: 8000,
  });

  const { data: txns } = useQuery({
    queryKey: ['wallet-txns', targetId],
    queryFn: () => get<{ items: Txn[] }>(`/api/v1/wallet/${targetId}/transactions`, { pageSize: 30 }),
    enabled: !!targetId,
    refetchInterval: 10000,
  });

  const { data: depositsList, refetch: refetchDeposits } = useQuery({
    queryKey: ['deposits-list'],
    queryFn: () => get<DepositRow[]>('/api/v1/payments'),
    refetchInterval: 10000,
  });

  const { data: withdrawalsList, refetch: refetchWithdrawals } = useQuery({
    queryKey: ['withdrawals-list'],
    queryFn: () => get<WithdrawalRow[]>('/api/v1/withdrawals'),
    refetchInterval: 10000,
  });

  // Live day-to-day USD/INR market exchange rate feed
  const { data: exchangeRateData } = useQuery({
    queryKey: ['live-exchange-rate-usd-inr'],
    queryFn: () => get<ExchangeRateResponse>('/api/v1/payments/exchange-rate'),
    refetchInterval: 30000,
  });
  const liveInrRate = exchangeRateData?.rate ?? 86.85;

  // Deposit methods actually configured on the backend
  const { data: methodsData, isLoading: methodsLoading, isError: methodsError } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: () => get<{ methods: string[] }>('/api/v1/payments/methods'),
    staleTime: 60000,
  });
  const availableMethods = DEPOSIT_METHODS.filter((m) => methodsData?.methods?.includes(m.id));

  // ─────────────────────────────────────────────────────────────
  // DEPOSIT MULTI-STEP STATE
  // ─────────────────────────────────────────────────────────────
  // step: 'FORM' (Step 1) | 'GATEWAY' (Step 2 - Next Step!) | 'CONFIRMED' (Step 3) | 'FAILED'
  const [depStep, setDepStep] = useState<'FORM' | 'GATEWAY' | 'CONFIRMED' | 'FAILED'>('FORM');
  const [selectedMethod, setSelectedMethod] = useState('');
  // Default / re-sync the selected method to the first configured one
  useEffect(() => {
    if (!availableMethods.length) {
      if (selectedMethod) setSelectedMethod('');
      return;
    }
    if (!availableMethods.some((m) => m.id === selectedMethod)) setSelectedMethod(availableMethods[0].id);
  }, [methodsData, selectedMethod]);
  const isSelectedMethodAvailable = availableMethods.some((m) => m.id === selectedMethod);
  const [depAmount, setDepAmount] = useState('100');
  const [promoCode, setPromoCode] = useState('WELCOME50');
  const [promoInput, setPromoInput] = useState('WELCOME50');
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    bonusPct: number;
    description: string;
    badge: string;
    bonusAmount: number;
    totalCapital: number;
    turnoverRequired: number;
  } | null>({
    code: 'WELCOME50',
    bonusPct: 50,
    description: '+50% Welcome Bonus on Trading Capital',
    badge: '50% BONUS',
    bonusAmount: 50,
    totalCapital: 150,
    turnoverRequired: 1750,
  });
  const [useBonus, setUseBonus] = useState(true);
  const [activeDepositOrder, setActiveDepositOrder] = useState<DepositOrder | null>(null);
  const [proofRef, setProofRef] = useState('');
  const [copied, setCopied] = useState(false);
  const [timeLeftSec, setTimeLeftSec] = useState(900); // 15 min countdown

  // PhonePe / UPI Quotex-style Cashier state
  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const [selectedUpiApp, setSelectedUpiApp] = useState<'phonepe' | 'gpay' | 'paytm' | 'generic'>('phonepe');
  const [upiSubTab, setUpiSubTab] = useState<'qr' | 'utr'>('qr');
  const [utrInput, setUtrInput] = useState('');
  const [utrError, setUtrError] = useState<string | null>(null);

  // Set when the user submits a UTR / payment reference (awaiting admin verification).
  // `credited` flips to true only when the status poll reports COMPLETED (admin approved).
  const [confirmedData, setConfirmedData] = useState<{
    amount: number;
    inrAmount?: number;
    reference: string;
    method: string;
    credited: boolean;
  } | null>(null);
  const [failedData, setFailedData] = useState<{
    reason: string;
    currentBalance: number;
  } | null>(null);

  // 15-minute countdown timer on Step 2
  useEffect(() => {
    if (depStep !== 'GATEWAY') return;
    const t = setInterval(() => {
      setTimeLeftSec((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [depStep]);

  // Background polling for deposit status: while paying (GATEWAY) and while the submitted
  // reference awaits admin verification (CONFIRMED but not yet credited).
  const isAwaitingPayment =
    !!activeDepositOrder?.depositId &&
    (depStep === 'GATEWAY' || (depStep === 'CONFIRMED' && !confirmedData?.credited));
  const { data: pollStatus } = useQuery({
    queryKey: ['deposit-status-poll', activeDepositOrder?.depositId],
    queryFn: () =>
      get<{
        depositId: string;
        status: string;
        amount: number;
        providerRef: string;
        balance: number;
      }>(`/api/v1/payments/${activeDepositOrder?.depositId}/status`),
    enabled: isAwaitingPayment,
    refetchInterval: 2500,
  });

  useEffect(() => {
    if (!isAwaitingPayment || !pollStatus) return;
    if (pollStatus.status === 'COMPLETED') {
      setConfirmedData((prev) => ({
        amount: pollStatus.amount,
        inrAmount: prev?.inrAmount ?? activeDepositOrder?.gatewayData.amountInr,
        reference: pollStatus.providerRef || prev?.reference || '',
        method: prev?.method ?? activeDepositOrder?.method ?? '',
        credited: true,
      }));
      setDepStep('CONFIRMED');
      push('ok', `Deposit verified and credited: $${pollStatus.amount.toFixed(2)} USD.`);
      ['wallet', 'accounts', 'wallet-txns', 'deposits-list'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    } else if (pollStatus.status === 'FAILED' || pollStatus.status === 'CANCELLED') {
      const wasSubmitted = depStep === 'CONFIRMED';
      setFailedData({
        reason: wasSubmitted
          ? 'Your payment could not be verified and the deposit was rejected. Contact support if you believe this is an error.'
          : 'Payment cancelled or declined by user / bank',
        currentBalance: pollStatus.balance,
      });
      setDepStep('FAILED');
      push('info', wasSubmitted
        ? 'Deposit was not approved. Your account balance was not modified.'
        : 'Payment cancelled or declined. Your account balance was not modified.');
      ['deposits-list', 'wallet', 'accounts'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    }
  }, [pollStatus?.status, isAwaitingPayment]);

  // Validate promo code against promo engine
  const validatePromo = useMutation({
    mutationFn: (codeToApply?: string) => {
      const code = (codeToApply || promoInput).trim().toUpperCase();
      return post<{
        valid: boolean;
        code: string;
        bonusPct: number;
        description: string;
        badge: string;
        bonusAmount: number;
        totalCapital: number;
        turnoverRequired: number;
      }>('/api/v1/payments/validate-promo', {
        code,
        amount: parseFloat(depAmount) || 0,
      });
    },
    onSuccess: (data) => {
      setAppliedPromo(data);
      setPromoCode(data.code);
      setPromoInput(data.code);
      setUseBonus(true);
      push('ok', `🎉 Promo code ${data.code} applied! ${data.description}`);
    },
    onError: (e) => {
      const msg = apiError(e);
      push('err', msg);
    },
  });

  // Step 1 -> Step 2: Create Deposit Order mutation
  const createDepositOrder = useMutation({
    mutationFn: () =>
      post<DepositOrder>('/api/v1/payments/create', {
        accountId: targetId,
        amount: parseFloat(depAmount),
        method: selectedMethod,
        promoCode: useBonus ? (appliedPromo?.code || promoCode) : undefined,
      }),
    onSuccess: (order) => {
      setActiveDepositOrder(order);
      setDepStep('GATEWAY'); // MOVE TO NEXT STEP!
      setSelectedUpiApp('phonepe');
      setUpiSubTab('qr');
      setConfirmedData(null);
      setUtrInput('');
      setUtrError(null);
      setProofRef('');
      setTimeLeftSec((order.gatewayData.expiryMinutes ?? 15) * 60);
      push('ok', `Deposit invoice #${order.orderRef} generated. Follow the instructions to complete payment.`);
      qc.invalidateQueries({ queryKey: ['deposits-list'] });
    },
    onError: (e) => push('err', apiError(e)),
  });

  // Verified 12-Digit NPCI Bank UTR Reconciliation Mutation
  const verifyUtrMutation = useMutation({
    mutationFn: () =>
      post<{
        depositId: string;
        status: 'PENDING_VERIFICATION';
        utr: string;
      }>(`/api/v1/payments/${activeDepositOrder?.depositId}/verify-utr`, {
        utr: utrInput,
      }),
    onSuccess: (data) => {
      setConfirmedData({
        amount: activeDepositOrder?.amount ?? 0,
        inrAmount: activeDepositOrder?.gatewayData.amountInr,
        reference: data.utr,
        method: activeDepositOrder?.method ?? 'upi_qr',
        credited: false,
      });
      setDepStep('CONFIRMED');
      push('ok', 'UTR submitted. Your balance will be credited after our team verifies the payment.');
      qc.invalidateQueries({ queryKey: ['deposits-list'] });
    },
    onError: (e) => {
      const msg = apiError(e);
      setUtrError(msg);
      push('err', msg);
    },
  });

  // Step 2 -> Fail: Cancel or Decline Payment (Balance is NEVER touched)
  const failPayment = useMutation({
    mutationFn: (reason?: string) =>
      post<{
        depositId: string;
        status: string;
        message: string;
        currentBalance: number;
        reason: string;
      }>(`/api/v1/payments/${activeDepositOrder?.depositId}/fail`, {
        reason: reason || 'Payment cancelled or declined in UPI app',
        app: selectedUpiApp || 'UPI',
      }),
    onSuccess: (data) => {
      setFailedData({
        reason: data.reason,
        currentBalance: data.currentBalance,
      });
      setDepStep('FAILED');
      push('info', 'Payment cancelled or failed. Your account balance was not modified.');
      ['deposits-list', 'wallet', 'accounts'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e) => push('err', apiError(e)),
  });

  // Step 2 -> Step 3: Generic Submit Payment Proof (TxID / Bank wire)
  const submitProof = useMutation({
    mutationFn: () =>
      post<{ depositId: string; status: 'PENDING_VERIFICATION' }>(
        `/api/v1/payments/${activeDepositOrder?.depositId}/submit-proof`,
        { reference: proofRef.trim() }
      ),
    onSuccess: () => {
      setConfirmedData({
        amount: activeDepositOrder?.amount ?? 0,
        inrAmount: activeDepositOrder?.gatewayData.amountInr,
        reference: proofRef.trim(),
        method: activeDepositOrder?.method ?? '',
        credited: false,
      });
      setDepStep('CONFIRMED');
      push('ok', 'Payment reference submitted. Your balance will be credited after our team verifies the payment.');
      qc.invalidateQueries({ queryKey: ['deposits-list'] });
    },
    onError: (e) => push('err', apiError(e)),
  });

  // Open Installed UPI App via Mobile Intent URL (mobile only); on desktop show the QR to scan
  const handleOpenUpiApp = (app: 'phonepe' | 'gpay' | 'paytm' | 'generic') => {
    setSelectedUpiApp(app);
    const gateway = activeDepositOrder?.gatewayData;
    let intentUrl = gateway?.qrPayload || '';

    if (gateway?.intents) {
      if (app === 'phonepe' && gateway.intents.phonepe) intentUrl = gateway.intents.phonepe;
      else if (app === 'gpay' && gateway.intents.gpay) intentUrl = gateway.intents.gpay;
      else if (app === 'paytm' && gateway.intents.paytm) intentUrl = gateway.intents.paytm;
      else if (gateway.intents.generic) intentUrl = gateway.intents.generic;
    }

    if (isMobile && intentUrl) {
      // Mobile Device: trigger deep link into installed PhonePe app
      window.location.href = intentUrl;
      const appName = app === 'phonepe' ? 'PhonePe' : app === 'gpay' ? 'Google Pay' : app === 'paytm' ? 'Paytm' : 'UPI';
      push('info', `Opening ${appName} app… After paying, submit your 12-digit UTR for verification.`);
    } else {
      // Desktop PC: UPI apps are mobile-only, so show the QR code to scan with a phone
      setUpiSubTab('qr');
      push('info', 'Scan the QR code with any UPI app on your phone.');
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // ─────────────────────────────────────────────────────────────
  // WITHDRAWAL MULTI-STEP STATE
  // ─────────────────────────────────────────────────────────────
  // wdStep: 'FORM' | 'REVIEW' | 'SUCCESS'
  const [wdStep, setWdStep] = useState<'FORM' | 'REVIEW' | 'SUCCESS'>('FORM');
  const [wdAmount, setWdAmount] = useState('50');
  const [wdMethod, setWdMethod] = useState<'bank' | 'upi' | 'crypto'>('bank');
  // Bank fields
  const [bankHolderName, setBankHolderName] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccNumber, setBankAccNumber] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  // UPI fields
  const [upiId, setUpiId] = useState('');
  const [upiPhone, setUpiPhone] = useState('');
  // Crypto fields
  const [cryptoAddress, setCryptoAddress] = useState('');
  const [cryptoNetwork, setCryptoNetwork] = useState('TRC20');
  const [lastWithdrawal, setLastWithdrawal] = useState<WithdrawalRow | null>(null);

  const requestWithdrawal = useMutation({
    mutationFn: () => {
      let details: Record<string, unknown> = {};
      if (wdMethod === 'bank') {
        details = { holderName: bankHolderName, bankName, accountNumber: bankAccNumber, ifsc: bankIfsc };
      } else if (wdMethod === 'upi') {
        details = { upiId, phone: upiPhone };
      } else {
        details = { network: cryptoNetwork, walletAddress: cryptoAddress };
      }
      return post<WithdrawalRow>('/api/v1/withdrawals', {
        accountId: targetId,
        amount: parseFloat(wdAmount),
        method: wdMethod,
        details,
      });
    },
    onSuccess: (w) => {
      setLastWithdrawal(w);
      setWdStep('SUCCESS');
      push('ok', `Withdrawal requested for ${fmtMoney(w.amount)}. Funds are locked in review.`);
      ['wallet', 'accounts', 'withdrawals-list'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e) => push('err', apiError(e)),
  });

  const cancelWithdrawal = useMutation({
    mutationFn: (id: string) => post(`/api/v1/withdrawals/${id}/cancel`),
    onSuccess: () => {
      push('ok', 'Withdrawal cancelled. Funds unlocked to available balance.');
      ['wallet', 'accounts', 'withdrawals-list'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e) => push('err', apiError(e)),
  });

  const availableBalance = (wallet?.available ?? 0);
  const parsedDepAmt = parseFloat(depAmount) || 0;
  const parsedWdAmt = parseFloat(wdAmount) || 0;
  const bonusPct = useBonus ? (appliedPromo ? appliedPromo.bonusPct : 30) : 0;
  const bonusAmount = (parsedDepAmt * bonusPct) / 100;
  const totalCreditAmount = parsedDepAmt + bonusAmount;

  return (
    <div className="max-w-[1140px] mx-auto p-4 md:p-6 space-y-5 select-none">
      {/* ── Top Header Bar ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-cream">Cashier & Wallet</h1>
          </div>
          <p className="text-xs text-mute mt-0.5">Manage deposits and withdrawals.</p>
        </div>

        {/* Account Selector Pill */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs text-mute font-medium">Account:</span>
          <select
            value={targetId ?? ''}
            onChange={(e) => setAccountId(e.target.value)}
            className="ax-input !w-auto !h-9 !text-xs font-bold bg-base-800 border-line"
          >
            {(accounts ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.accountType === 'LIVE' ? '🟢 Live Real' : '🔵 Practice Demo'} · {a.accountNumber} ({fmtMoney(a.balance)})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Balance Overview Banner ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-gradient-to-br from-base-900 to-base-800 p-4 rounded-md border border-line shadow-sm">
          <div className="text-[11px] font-bold text-mute uppercase tracking-wider flex items-center justify-between">
            <span>Total Account Balance</span>
            <span className={clsx('text-[9px] font-bold px-1.5 py-0.5 rounded', selectedAccount?.accountType === 'LIVE' ? 'bg-up/20 text-up' : 'bg-accent-500/20 text-accent-300')}>
              {selectedAccount?.accountType === 'LIVE' ? 'REAL' : 'DEMO'}
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-cream mt-1.5">
            {wallet ? fmtMoney(wallet.balance) : '—'}
          </div>
        </div>

        <div className="bg-gradient-to-br from-base-900 to-base-800 p-4 rounded-md border border-line shadow-sm">
          <div className="text-[11px] font-bold text-mute uppercase tracking-wider flex items-center justify-between">
            <span>Available to Trade / Withdraw</span>
            <span className="w-2 h-2 rounded-full bg-up" />
          </div>
          <div className="text-2xl font-bold font-mono text-up mt-1.5">
            {wallet ? fmtMoney(wallet.available) : '—'}
          </div>
        </div>

        <div className="bg-gradient-to-br from-base-900 to-base-800 p-4 rounded-md border border-line shadow-sm">
          <div className="text-[11px] font-bold text-mute uppercase tracking-wider flex items-center justify-between">
            <span>Locked in Review / Pending</span>
            <span className="text-[10px] text-mute font-mono">Protected</span>
          </div>
          <div className="text-2xl font-bold font-mono text-warn mt-1.5">
            {wallet ? fmtMoney(wallet.locked) : '—'}
          </div>
        </div>
      </div>

      {/* ── Cashier Tabs Bar ────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-line overflow-x-auto no-scrollbar">
        {[
          { id: 'deposit', label: 'Deposit Funds', icon: '📥', accent: 'text-up' },
          { id: 'withdraw', label: 'Withdrawal', icon: '📤', accent: 'text-warn' },
          { id: 'transfers', label: 'Transfers & Orders', icon: '📋' },
          { id: 'ledger', label: 'Wallet Ledger', icon: '📜' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id as never);
              if (tab.id === 'deposit' && depStep === 'CONFIRMED' && confirmedData?.credited) setDepStep('FORM');
              if (tab.id === 'withdraw' && wdStep === 'SUCCESS') setWdStep('FORM');
            }}
            className={clsx(
              'flex items-center gap-2 py-3 px-4 text-xs font-bold border-b-2 transition whitespace-nowrap',
              activeTab === tab.id
                ? 'border-up text-cream bg-white/[0.03]'
                : 'border-transparent text-mute hover:text-ink1'
            )}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ═════════════════════════════════════════════════════════════ */}
      {/* 1. DEPOSIT FLOW                                               */}
      {/* ═════════════════════════════════════════════════════════════ */}
      {activeTab === 'deposit' && (
        <div className="space-y-4">
          {/* Breadcrumb Steps */}
          <div className="flex items-center gap-2 text-xs font-bold text-mute">
            <span className={clsx('px-2.5 py-1 rounded-full text-[11px]', depStep === 'FORM' ? 'bg-up text-base-950 font-bold' : 'bg-base-800 text-cream')}>
              1. Method & Amount
            </span>
            <span>→</span>
            <span className={clsx('px-2.5 py-1 rounded-full text-[11px]', depStep === 'GATEWAY' ? 'bg-up text-base-950 font-bold' : 'bg-base-800 text-mute')}>
              2. Payment & Instructions
            </span>
            <span>→</span>
            <span className={clsx('px-2.5 py-1 rounded-full text-[11px]', depStep === 'CONFIRMED' ? 'bg-up text-base-950 font-bold' : 'bg-base-800 text-mute')}>
              3. Verification
            </span>
          </div>

          {/* ── STEP 1: METHOD & AMOUNT SELECTION ─────────────────────── */}
          {depStep === 'FORM' && (
            <>
          {!isLiveSelected && (
            <div className="max-w-xl mx-auto">
              <Card className="text-center py-8 px-6 space-y-3 border-warn/50">
                <h2 className="text-lg font-bold text-cream">Deposits are only available on Live accounts</h2>
                <p className="text-xs text-mute">
                  The selected account is a practice (demo) account. Switch to your Live account to continue.
                </p>
                {liveAccount ? (
                  <button
                    onClick={() => setAccountId(liveAccount.id)}
                    className="px-4 py-2.5 rounded-md bg-up hover:bg-up text-base-950 font-bold text-xs uppercase tracking-wider transition"
                  >
                    Switch to Live Account ({liveAccount.accountNumber})
                  </button>
                ) : (
                  <p className="text-xs text-warn">No Live account found. Please contact support.</p>
                )}
              </Card>
            </div>
          )}

          {isLiveSelected && methodsLoading && (
            <Card className="text-center py-8 text-xs text-mute">Loading payment methods…</Card>
          )}

          {isLiveSelected && !methodsLoading && availableMethods.length === 0 && (
            <div className="max-w-xl mx-auto">
              <Card className="text-center py-8 px-6 space-y-2 border-warn/50">
                <h2 className="text-lg font-bold text-cream">Deposits are temporarily unavailable</h2>
                <p className="text-xs text-mute">
                  {methodsError
                    ? 'We could not load the available payment methods.'
                    : 'No deposit methods are currently available.'}{' '}
                  Please contact support.
                </p>
              </Card>
            </div>
          )}

          {isLiveSelected && availableMethods.length > 0 && (
            <div className="grid lg:grid-cols-3 gap-5">
              {/* Left 2 Cols: Payment Methods Grid */}
              <div className="lg:col-span-2 space-y-4">
                <Card>
                  <SectionTitle title="Choose Payment Method" right={<span className="text-[11px] text-up font-bold">Fast & Secure</span>} />
                  
                  <div className="grid sm:grid-cols-2 gap-3 mt-3">
                    {availableMethods.map((m) => {
                      const isSel = selectedMethod === m.id;
                      return (
                        <div
                          key={m.id}
                          onClick={() => setSelectedMethod(m.id)}
                          className={clsx(
                            'p-3.5 rounded-md border transition-all cursor-pointer flex items-start gap-3 relative',
                            isSel
                              ? 'bg-up/10 border-up'
                              : 'bg-base-800/60 border-line hover:bg-base-800 hover:border-line/80'
                          )}
                        >
                          <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold shrink-0', isSel ? 'bg-up text-base-950' : 'bg-base-700 text-cream')}>
                            {m.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-cream">{m.name}</span>
                              <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-white/10 text-fog uppercase">
                                {m.badge}
                              </span>
                            </div>
                            <p className="text-[10px] text-mute mt-0.5 truncate">{m.desc}</p>
                          </div>
                          {m.recommended && (
                            <span className="absolute top-2 right-2 text-[8px] font-bold px-1 py-0.2 rounded bg-warn text-base-950 uppercase">
                              HOT
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Card>

                {/* Amount presets */}
                <Card>
                  <SectionTitle title="Select Deposit Amount" right={<span className="text-[11px] text-mute">Min: $10.00</span>} />
                  
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 mt-3">
                    {PRESET_AMOUNTS.map((amt) => {
                      const isSel = parsedDepAmt === amt;
                      return (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setDepAmount(String(amt))}
                          className={clsx(
                            'py-2 px-1 text-center rounded-lg font-mono text-xs font-semibold transition border',
                            isSel
                              ? 'bg-up text-base-950 border-up'
                              : 'bg-base-800/90 text-cream border-line hover:border-mute'
                          )}
                        >
                          ${amt}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-4">
                    <label className="text-[11px] text-mute font-bold uppercase tracking-wider block mb-1">
                      Custom Amount (USD)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-mute font-mono font-bold">$</span>
                      <input
                        type="number"
                        min="10"
                        step="1"
                        value={depAmount}
                        onChange={(e) => setDepAmount(e.target.value)}
                        className="ax-input !pl-7 !h-10 text-sm font-mono font-bold"
                        placeholder="Enter amount"
                      />
                    </div>
                  </div>
                </Card>
              </div>

              {/* Right Col: Order Summary & Promo Card */}
              <div className="space-y-4">
                <Card className="border-up/40 bg-gradient-to-b from-up/5 to-transparent">
                  <div className="flex items-center justify-between pb-3 border-b border-line">
                    <span className="text-xs font-bold text-cream uppercase tracking-wider">Deposit Summary</span>
                    <span className="text-[10px] text-up font-semibold uppercase">Step 1 of 2</span>
                  </div>

                  <div className="space-y-2.5 my-4 text-xs">
                    <div className="flex justify-between">
                      <span className="text-mute">Credit to Account:</span>
                      <span className="font-bold text-cream">{selectedAccount?.accountNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-mute">Selected Method:</span>
                      <span className="font-bold text-cream capitalize">{selectedMethod.replace(/_/g, ' ')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-mute">Deposit Amount:</span>
                      <span className="font-mono font-bold text-cream">{fmtMoney(parsedDepAmt)}</span>
                    </div>

                    {/* Quotex Deposit Promo Code Engine */}
                    <div className="p-3.5 rounded-md bg-base-800/90 border border-warn/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-warn flex items-center gap-1.5">
                          <span>🎁</span>
                          <span>Deposit Promo Code</span>
                        </span>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <span className="text-[10px] text-mute font-bold">Use Bonus</span>
                          <input
                            type="checkbox"
                            checked={useBonus}
                            onChange={(e) => setUseBonus(e.target.checked)}
                            className="accent-up cursor-pointer"
                          />
                        </label>
                      </div>

                      {useBonus && (
                        <>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={promoInput}
                              onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                              placeholder="e.g. WELCOME50"
                              className="ax-input !h-8 text-xs uppercase font-mono font-bold tracking-wider flex-1"
                            />
                            <button
                              onClick={() => validatePromo.mutate(promoInput)}
                              disabled={validatePromo.isPending || !promoInput.trim()}
                              className="h-8 px-3 rounded-lg bg-up hover:bg-up text-base-950 text-[11px] font-bold uppercase tracking-wider transition active:scale-95 disabled:opacity-50"
                            >
                              {validatePromo.isPending ? '…' : 'Apply'}
                            </button>
                          </div>

                          {/* Quick Promo Chips */}
                          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
                            {[
                              ['WELCOME50', '+50% Welcome'],
                              ['BONUS30', '+30% Booster'],
                              ['VIP100', '+100% VIP'],
                              ['RISKFREE', '+20% Bonus'],
                            ].map(([code, label]) => (
                              <button
                                key={code}
                                onClick={() => {
                                  setPromoInput(code);
                                  validatePromo.mutate(code);
                                }}
                                className={clsx(
                                  'px-2 py-0.5 rounded text-[10px] font-mono font-bold border transition whitespace-nowrap active:scale-95',
                                  appliedPromo?.code === code
                                    ? 'bg-warn/20 text-warn border-warn/50'
                                    : 'bg-white/5 text-fog hover:text-cream border-white/10 hover:border-white/20'
                                )}
                              >
                                {label}
                              </button>
                            ))}
                          </div>

                          {appliedPromo && (
                            <div className="pt-2 border-t border-white/5 space-y-1 text-[11px]">
                              <div className="flex justify-between text-mute">
                                <span>Applied Promo:</span>
                                <span className="font-bold text-warn">{appliedPromo.code} ({appliedPromo.badge})</span>
                              </div>
                              <div className="flex justify-between text-mute">
                                <span>Bonus Capital:</span>
                                <span className="font-mono font-bold text-up">+{fmtMoney(bonusAmount)}</span>
                              </div>
                              <div className="text-[9.5px] text-fog pt-1 leading-snug">
                                🛡️ {appliedPromo.description}. 35× turnover applies only to withdraw bonus; your principal and profits are withdrawable anytime.
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Live INR Conversion Box for UPI */}
                    {(selectedMethod === 'upi_qr' || selectedMethod.startsWith('upi')) && (
                      <div className="p-3 rounded-lg bg-base-800/90 border border-up/30 space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-mute flex items-center gap-1.5 font-bold">
                            <span className="w-2 h-2 rounded-full bg-up animate-pulse" />
                            Live Market Rate (Today):
                          </span>
                          <span className="font-mono font-bold text-cream">
                            1 USD = ₹{liveInrRate.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between text-[11px] pt-1.5 border-t border-white/5 items-center">
                          <span className="text-mute font-bold">Estimated UPI Payable:</span>
                          <span className="font-mono font-bold text-up text-sm">
                            ₹{Math.round(parsedDepAmt * liveInrRate).toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div className="flex justify-between text-[9px] text-mute font-medium">
                          <span>Real-time day-to-day rate</span>
                          <span className="text-up">0% Surcharge</span>
                        </div>
                      </div>
                    )}

                    <div className="pt-2 border-t border-line flex justify-between items-center">
                      <span className="font-bold text-cream">Total After Verification:</span>
                      <span className="text-base font-mono font-bold text-up">{fmtMoney(totalCreditAmount)}</span>
                    </div>
                  </div>

                  {/* Proceed to Step 2 Button */}
                  <button
                    onClick={() => createDepositOrder.mutate()}
                    disabled={createDepositOrder.isPending || parsedDepAmt < 10 || !isSelectedMethodAvailable || !isLiveSelected}
                    className="w-full py-3 rounded-md bg-up hover:bg-up text-base-950 font-bold text-xs uppercase tracking-wider transition shadow-lg active:scale-98 disabled:opacity-50"
                  >
                    {createDepositOrder.isPending ? 'Generating Gateway Invoice…' : 'Proceed to Next Step →'}
                  </button>

                  <p className="text-[10px] text-center text-mute mt-2">
                    Your balance is credited after our team verifies your payment.
                  </p>
                </Card>
              </div>
            </div>
          )}
            </>
          )}

          {/* ── STEP 2: PAYMENT GATEWAY INSTRUCTIONS (THE NEXT STEP) ───── */}
          {depStep === 'GATEWAY' && activeDepositOrder && (
            <div className="max-w-2xl mx-auto space-y-4">
              <Card className="border-up/50">
                {/* Header with Order ID & Countdown */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-line">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase text-up">Invoice #{activeDepositOrder.orderRef}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-warn/20 text-warn font-bold">AWAITING PAYMENT</span>
                    </div>
                    <div className="text-lg font-bold text-cream mt-1">
                      Pay {fmtMoney(activeDepositOrder.amount)} USD
                    </div>
                  </div>

                  <div className="bg-base-800 px-3 py-1.5 rounded-lg border border-line text-right">
                    <div className="text-[9px] text-mute uppercase font-bold">Time Remaining</div>
                    <div className="text-sm font-mono font-bold text-warn">
                      {Math.floor(timeLeftSec / 60)}:{(timeLeftSec % 60).toString().padStart(2, '0')}
                    </div>
                  </div>
                </div>

                {/* Method Specific Display */}
                <div className="py-4 space-y-4">
                  {/* If CRYPTO: Address + QR + Warning */}
                  {activeDepositOrder.gatewayData.type === 'crypto' && (
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row items-center gap-6">
                        <QrDisplay payload={activeDepositOrder.gatewayData.address ?? ''} label={`Scan ${activeDepositOrder.gatewayData.cryptoCurrency} Address`} />

                        <div className="flex-1 space-y-3 w-full">
                          <div>
                            <span className="text-[10px] font-bold text-mute uppercase">Deposit Network</span>
                            <div className="text-xs font-bold text-up mt-0.5">{activeDepositOrder.gatewayData.network}</div>
                          </div>

                          <div>
                            <span className="text-[10px] font-bold text-mute uppercase">Deposit Address</span>
                            <div className="flex items-center gap-2 mt-1">
                              <input
                                readOnly
                                value={activeDepositOrder.gatewayData.address ?? ''}
                                className="ax-input !font-mono text-xs !bg-base-950 font-bold text-ink1"
                              />
                              <button
                                onClick={() => handleCopy(activeDepositOrder.gatewayData.address ?? '')}
                                className="px-3 py-2 rounded-lg bg-base-800 hover:bg-base-700 text-xs font-bold border border-line whitespace-nowrap text-cream"
                              >
                                {copied ? '✓ Copied' : 'Copy'}
                              </button>
                            </div>
                          </div>

                          <div className="p-2.5 rounded-lg bg-warn/10 border border-warn/30 text-[11px] text-warn">
                            {activeDepositOrder.gatewayData.warning}
                          </div>
                        </div>
                      </div>

                      {/* Transaction Hash Input */}
                      <div className="pt-3 border-t border-line space-y-2">
                        <label className="text-xs font-bold text-cream block">
                          Step 2: Enter Transaction Hash (TxID) after sending:
                        </label>
                        <input
                          value={proofRef}
                          onChange={(e) => setProofRef(e.target.value)}
                          placeholder="e.g. 4a2b9f8e... (Transaction Hash from exchange)"
                          className="ax-input font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {/* If UPI / FAST QR */}
                  {activeDepositOrder.gatewayData.type === 'upi' && (
                    <div className="space-y-4">
                      {/* Amount Banner */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3.5 rounded-md bg-gradient-to-r from-base-950 via-base-900 to-base-950 border border-line gap-2">
                        <div>
                          <span className="text-[10px] font-bold text-mute uppercase tracking-wider">Pay Exact Amount (INR)</span>
                          <div className="text-2xl font-bold font-mono text-up mt-0.5">
                            ₹{activeDepositOrder.gatewayData.amountInr?.toLocaleString()}{' '}
                            <span className="text-xs text-mute font-normal font-sans">
                              (${activeDepositOrder.amount}.00 USD)
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-bold text-mute uppercase tracking-wider flex items-center gap-1 justify-end">
                            <span className="w-1.5 h-1.5 rounded-full bg-up animate-pulse" />
                            Live Exchange Rate
                          </span>
                          <div className="text-xs font-mono font-bold text-fog">
                            {activeDepositOrder.gatewayData.rate ?? `1 USD = ₹${liveInrRate.toFixed(2)} (Live Market)`}
                          </div>
                          <div className="flex items-center gap-1.5 justify-end mt-0.5">
                            <span className="text-[10px] text-up font-bold">0% Transfer Fee</span>
                            {activeDepositOrder.gatewayData.exchangeRateDate && (
                              <span className="text-[9px] text-mute font-mono">({activeDepositOrder.gatewayData.exchangeRateDate})</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Quotex-Style PhonePe & UPI Multi-Channel Cashier */}
                      <div className="space-y-4">
                        {/* Quotex Sub-Navigation Tabs */}
                        <div className="flex border-b border-line gap-1 overflow-x-auto pb-1">
                          <button
                            type="button"
                            onClick={() => setUpiSubTab('qr')}
                            className={`px-3 py-2 rounded-t-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                              upiSubTab === 'qr'
                                ? 'bg-base-800 text-cream border-t-2 border-[#5f259f] shadow-sm'
                                : 'text-mute hover:text-cream hover:bg-base-900/50'
                            }`}
                          >
                            <span>📷</span>
                            <span>UPI QR Code</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setUpiSubTab('utr')}
                            className={`px-3 py-2 rounded-t-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                              upiSubTab === 'utr'
                                ? 'bg-base-800 text-cream border-t-2 border-[#5f259f] shadow-sm'
                                : 'text-mute hover:text-cream hover:bg-base-900/50'
                            }`}
                          >
                            <span>🔍</span>
                            <span>Submit 12-Digit UTR</span>
                          </button>
                        </div>

                        {/* Mobile Device Quick Launch Banner */}
                        {isMobile && (
                          <div className="p-3 rounded-md bg-purple-950/40 border border-purple-500/30 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-[#5f259f] flex items-center justify-center text-cream font-bold text-sm">
                                पे
                              </div>
                              <div>
                                <div className="text-xs font-bold text-cream">Mobile Device Detected</div>
                                <div className="text-[10px] text-mute">Tap to launch PhonePe app installed on this phone</div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleOpenUpiApp('phonepe')}
                              className="px-3 py-1.5 rounded-lg bg-[#5f259f] hover:bg-[#6f2fb8] text-cream text-xs font-bold shadow-md transition active:scale-95"
                            >
                              Launch PhonePe →
                            </button>
                          </div>
                        )}

                        {/* TAB 1: PHONEPE QR CODE (QUOTEX DESKTOP DEFAULT) */}
                        {upiSubTab === 'qr' && (
                          <div className="p-5 rounded-lg bg-base-950 border border-line space-y-5">
                            <div className="flex flex-col md:flex-row items-center gap-6">
                              {/* QR Code with PhonePe Badge */}
                              <div className="relative p-3 bg-white rounded-lg shadow-xl flex flex-col items-center shrink-0">
                                <QrDisplay
                                  payload={activeDepositOrder.gatewayData.qrPayload ?? ''}
                                  label="Scan with PhonePe / GPay"
                                />
                                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-base-700 font-bold">
                                  <span className="w-4 h-4 rounded-full bg-[#5f259f] text-cream inline-flex items-center justify-center text-[9px] font-bold">
                                    पे
                                  </span>
                                  <span>Any UPI app</span>
                                </div>
                              </div>

                              {/* Instructions & Details */}
                              <div className="flex-1 space-y-3.5 text-xs">
                                <div>
                                  <h4 className="text-sm font-bold text-cream flex items-center gap-2">
                                    <span>Scan with PhonePe or any UPI App</span>
                                  </h4>
                                  <p className="text-mute text-xs mt-1">
                                    Use your smartphone to scan this QR code using PhonePe, Google Pay, Paytm, or BHIM.
                                  </p>
                                </div>

                                <div className="space-y-2 p-3 rounded-md bg-base-900 border border-line">
                                  <div className="flex justify-between items-center">
                                    <span className="text-mute">Amount to Pay:</span>
                                    <span className="font-mono font-bold text-up text-base">
                                      ₹{activeDepositOrder.gatewayData.amountInr?.toLocaleString()} INR
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center text-fog">
                                    <span>Deposit Amount:</span>
                                    <span className="font-bold text-cream">
                                      +${activeDepositOrder.amount.toFixed(2)} USD
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center text-fog">
                                    <span>Merchant UPI ID:</span>
                                    <div className="flex items-center gap-1.5">
                                      <code className="font-mono text-purple-300 font-bold text-[11px]">
                                        {activeDepositOrder.gatewayData.upiId}
                                      </code>
                                      <button
                                        type="button"
                                        onClick={() => handleCopy(activeDepositOrder.gatewayData.upiId ?? '')}
                                        className="text-[10px] text-mute hover:text-cream underline"
                                      >
                                        {copied ? 'Copied' : 'Copy'}
                                      </button>
                                    </div>
                                  </div>
                                </div>

                                {/* Step-by-Step Guide */}
                                <ol className="list-decimal list-inside space-y-1 text-fog text-[11px]">
                                  <li>Open <strong className="text-purple-300">PhonePe</strong> on your mobile phone</li>
                                  <li>Tap the <strong className="text-cream">QR Scanner icon</strong> at the top right</li>
                                  <li>Point camera at this screen and complete the payment in your UPI app</li>
                                  <li>Copy the 12-digit UTR / UPI Ref ID from your payment receipt and submit it in the <strong className="text-cream">Submit 12-Digit UTR</strong> tab</li>
                                  <li>Your Live balance is credited after our team verifies the payment</li>
                                </ol>
                              </div>
                            </div>

                            {/* Next step hint */}
                            <div className="p-3.5 rounded-md bg-base-900 border border-line flex items-center justify-between gap-3">
                              <div>
                                <div className="text-xs font-bold text-cream">Paid already?</div>
                                <div className="text-[10px] text-mute">
                                  Submit your 12-digit UTR so our team can verify the payment and credit your balance.
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setUpiSubTab('utr')}
                                className="px-3 py-1.5 rounded-lg bg-up/20 hover:bg-up text-up hover:text-base-950 font-bold text-[11px] transition whitespace-nowrap border border-up/50"
                              >
                                Submit UTR →
                              </button>
                            </div>
                          </div>
                        )}

                        {/* TAB 2: SUBMIT 12-DIGIT UTR */}
                        {upiSubTab === 'utr' && (
                          <div className="p-5 rounded-lg bg-base-950 border border-line space-y-4">
                            <div>
                              <h4 className="text-sm font-bold text-cream flex items-center gap-2">
                                <span>Submit 12-Digit UTR / UPI Reference</span>
                                <span className="text-[9px] px-2 py-0.5 rounded bg-warn/20 text-warn font-bold">
                                  BANK RECEIPT
                                </span>
                              </h4>
                              <p className="text-mute text-xs mt-1">
                                Already paid via your UPI or banking app? Enter the 12-digit UTR / UPI Ref ID from your payment receipt. Your Live balance is credited after our team verifies the payment.
                              </p>
                            </div>

                            <div className="space-y-3 max-w-md">
                              <div>
                                <label className="text-xs text-mute font-bold uppercase block mb-1">
                                  12-Digit Bank UTR / UPI Reference Number
                                </label>
                                <input
                                  type="text"
                                  maxLength={12}
                                  placeholder="e.g. 428901234567"
                                  value={utrInput}
                                  onChange={(e) => {
                                    setUtrInput(e.target.value.replace(/\D/g, ''));
                                    setUtrError(null);
                                  }}
                                  className="ax-input !font-mono text-sm !bg-base-900 font-bold text-cream tracking-widest"
                                />
                                {utrError && (
                                  <div className="text-xs text-down mt-1 font-bold">{utrError}</div>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => verifyUtrMutation.mutate()}
                                disabled={verifyUtrMutation.isPending || utrInput.length !== 12}
                                className="w-full py-3 px-4 rounded-md bg-up hover:bg-up disabled:opacity-40 text-base-950 font-bold text-xs uppercase tracking-wider transition shadow-lg active:scale-98 flex items-center justify-center gap-2"
                              >
                                {verifyUtrMutation.isPending ? (
                                  <>
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    <span>Submitting…</span>
                                  </>
                                ) : (
                                  <span>Submit UTR for Verification</span>
                                )}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Order Cancellation (Zero Balance Modification) */}
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => failPayment.mutate('Payment cancelled by user in cashier')}
                            disabled={failPayment.isPending}
                            className="w-full py-2.5 px-4 rounded-md bg-base-900 hover:bg-down/15 text-down font-bold text-xs border border-down/30 transition active:scale-98 flex items-center justify-center gap-1.5"
                          >
                            <span>✕</span>
                            <span>Cancel Payment Order (Leave Balance Unchanged)</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* If BANK WIRE */}
                  {activeDepositOrder.gatewayData.type === 'bank' && (
                    <div className="space-y-3">
                      <div className="bg-base-950 p-3.5 rounded-md border border-line space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-mute">Bank:</span>
                          <span className="font-bold text-cream">{activeDepositOrder.gatewayData.bankName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-mute">Beneficiary:</span>
                          <span className="font-bold text-cream">{activeDepositOrder.gatewayData.beneficiaryName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-mute">Account Number:</span>
                          <span className="font-mono font-bold text-up">{activeDepositOrder.gatewayData.accountNumber}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-mute">IFSC / Routing:</span>
                          <span className="font-mono font-bold text-cream">{activeDepositOrder.gatewayData.ifsc}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-mute">Transfer Remark / Memo:</span>
                          <span className="font-mono font-bold text-warn">{activeDepositOrder.orderRef}</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold text-cream block">
                          Enter Bank Reference / IMPS Transaction ID:
                        </label>
                        <input
                          value={proofRef}
                          onChange={(e) => setProofRef(e.target.value)}
                          placeholder="Enter your bank transfer reference"
                          className="ax-input font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}

                </div>

                {/* Step 2 Actions for non-UPI methods (or generic back button) */}
                <div className="pt-4 border-t border-line space-y-3">
                  <div className="flex gap-2">
                    {activeDepositOrder.gatewayData.type !== 'upi' ? (
                      <button
                        onClick={() => submitProof.mutate()}
                        disabled={submitProof.isPending || !proofRef.trim()}
                        className="flex-1 py-3 rounded-md bg-up hover:bg-up text-base-950 font-bold text-xs uppercase tracking-wider transition shadow-lg active:scale-98 disabled:opacity-50"
                      >
                        {submitProof.isPending ? 'Submitting…' : 'I Have Paid / Submit Reference →'}
                      </button>
                    ) : (
                      <button
                        onClick={() => setDepStep('FORM')}
                        className="flex-1 py-2.5 rounded-md bg-base-800 hover:bg-base-700 text-mute hover:text-cream font-bold text-xs border border-line transition"
                      >
                        ← Back to Payment Methods
                      </button>
                    )}
                    {activeDepositOrder.gatewayData.type !== 'upi' && (
                      <button
                        onClick={() => setDepStep('FORM')}
                        className="px-4 py-3 rounded-md bg-base-800 hover:bg-base-700 text-mute hover:text-cream font-bold text-xs border border-line"
                      >
                        Back
                      </button>
                    )}
                  </div>

                </div>
              </Card>
            </div>
          )}

          {/* ── STEP 3: SUBMITTED (AWAITING VERIFICATION) / CREDITED SCREEN ─────── */}
          {depStep === 'CONFIRMED' && (
            <div className="max-w-xl mx-auto">
              <Card
                className={clsx(
                  'text-center py-8 px-6 space-y-4',
                  confirmedData?.credited
                    ? 'border-up/60 bg-gradient-to-b from-up/5 to-transparent'
                    : 'border-warn/60 bg-gradient-to-b from-warn/5 to-transparent'
                )}
              >
                {confirmedData?.credited ? (
                  <div className="w-16 h-16 rounded-full bg-up/20 border-2 border-up flex items-center justify-center mx-auto text-3xl text-up">
                    ✓
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-full bg-warn/20 border-2 border-warn flex items-center justify-center mx-auto text-2xl text-warn">
                    ⏳
                  </div>
                )}

                <div>
                  <h2 className="text-xl font-bold text-cream">
                    {confirmedData?.credited ? 'Deposit verified and credited' : 'Payment submitted for verification'}
                  </h2>
                  <p className="text-xs text-mute mt-1">
                    {confirmedData?.credited ? (
                      <>Invoice <span className="text-cream font-mono font-bold">#{activeDepositOrder?.orderRef}</span> has been verified and credited to your Live balance.</>
                    ) : (
                      <>Invoice <span className="text-cream font-mono font-bold">#{activeDepositOrder?.orderRef}</span> is awaiting verification. Your balance has not been credited yet — it will be credited after our team verifies the payment.</>
                    )}
                  </p>
                </div>

                <div className="p-4 rounded-md bg-base-950 border border-line text-left space-y-2.5 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-mute font-sans">Payment Method:</span>
                    <span className="font-bold text-cream capitalize">{(confirmedData?.method || activeDepositOrder?.method || '').replace(/_/g, ' ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-mute font-sans">{confirmedData?.credited ? 'Amount Credited:' : 'Amount:'}</span>
                    <span className={clsx('font-bold text-sm', confirmedData?.credited ? 'text-up' : 'text-cream')}>
                      ${Number(confirmedData?.amount ?? activeDepositOrder?.amount ?? 0).toFixed(2)} USD
                      {confirmedData?.inrAmount ? (
                        <span className="text-xs text-mute ml-1 font-normal font-sans">(₹{confirmedData.inrAmount.toLocaleString()} INR)</span>
                      ) : null}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-mute font-sans">Account:</span>
                    <span className="font-bold text-cream">{selectedAccount?.accountNumber} ({selectedAccount?.accountType})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-mute font-sans">UTR / Reference:</span>
                    <span className="text-warn font-bold truncate max-w-[220px]">
                      {confirmedData?.reference || proofRef || '—'}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-line flex justify-between items-center">
                    <span className="text-mute font-sans">Status:</span>
                    <span className={clsx('font-bold', confirmedData?.credited ? 'text-up' : 'text-warn')}>
                      {confirmedData?.credited ? 'COMPLETED' : 'PENDING VERIFICATION'}
                    </span>
                  </div>
                </div>

                {!confirmedData?.credited && (
                  <p className="text-[11px] text-mute">
                    You can leave this page — the deposit status is shown under Transfers &amp; Orders.
                  </p>
                )}

                <div className="flex gap-2">
                  {confirmedData?.credited ? (
                    <button
                      onClick={() => nav('/trading')}
                      className="flex-1 py-3 rounded-md bg-up hover:bg-up text-base-950 font-bold text-xs uppercase tracking-wider transition shadow-lg active:scale-98"
                    >
                      Trade Now on Live Account →
                    </button>
                  ) : (
                    <button
                      onClick={() => setActiveTab('transfers')}
                      className="flex-1 py-3 rounded-md bg-warn hover:bg-warn text-base-950 font-bold text-xs uppercase tracking-wider transition shadow-lg active:scale-98"
                    >
                      View Deposit Status
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setDepStep('FORM');
                      setActiveDepositOrder(null);
                      setProofRef('');
                      setSelectedUpiApp('phonepe');
                      setConfirmedData(null);
                    }}
                    className="px-4 py-3 rounded-md bg-base-800 hover:bg-base-700 text-cream font-bold text-xs border border-line"
                  >
                    Make Another Deposit
                  </button>
                </div>
              </Card>
            </div>
          )}

          {/* ── STEP 3: DEPOSIT FAILED / CANCELLED SCREEN (BALANCE NOT MODIFIED) ── */}
          {depStep === 'FAILED' && (
            <div className="max-w-xl mx-auto">
              <Card className="text-center py-8 px-6 space-y-4 border-down/60 bg-gradient-to-b from-down/5 to-transparent">
                <div className="w-16 h-16 rounded-full bg-down/20 border-2 border-down flex items-center justify-center mx-auto text-3xl text-down">
                  ✕
                </div>

                <div>
                  <h2 className="text-xl font-bold text-cream">Payment Failed or Cancelled</h2>
                  <p className="text-xs text-mute mt-1">
                    {failedData?.reason || 'The transaction was cancelled or declined by your bank/UPI app.'}
                  </p>
                </div>

                <div className="p-4 rounded-md bg-base-950 border border-line text-left space-y-2.5 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-mute font-sans">Invoice Reference:</span>
                    <span className="font-bold text-cream">#{activeDepositOrder?.orderRef}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-mute font-sans">Transaction Status:</span>
                    <span className="font-bold text-down">FAILED (No Funds Debited)</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-down/10 border border-down/30 text-[11px] text-down font-sans leading-relaxed">
                    🔒 <strong>Safe Balance Guarantee:</strong> Because payment failed, your live account balance was <strong>NOT updated</strong> and remains completely safe at <strong>{fmtMoney(failedData?.currentBalance ?? wallet?.balance ?? selectedAccount?.balance ?? 0)} USD</strong>.
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setFailedData(null);
                      createDepositOrder.mutate();
                    }}
                    disabled={createDepositOrder.isPending || !isLiveSelected || !isSelectedMethodAvailable}
                    className="flex-1 py-3 rounded-md bg-base-800 hover:bg-base-700 text-cream font-bold text-xs uppercase tracking-wider transition border border-line disabled:opacity-50"
                  >
                    {createDepositOrder.isPending ? 'Creating New Order…' : 'Try Again (New Order)'}
                  </button>
                  <button
                    onClick={() => {
                      setDepStep('FORM');
                      setActiveDepositOrder(null);
                      setProofRef('');
                      setSelectedUpiApp('phonepe');
                      setFailedData(null);
                    }}
                    className="px-4 py-3 rounded-md bg-up hover:bg-up text-base-950 font-bold text-xs transition"
                  >
                    Change Method
                  </button>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════ */}
      {/* 2. WITHDRAWAL FLOW                                            */}
      {/* ═════════════════════════════════════════════════════════════ */}
      {activeTab === 'withdraw' && (
        <div className="max-w-2xl mx-auto space-y-4">
          {!isLiveSelected && (
            <div className="max-w-xl mx-auto">
              <Card className="text-center py-8 px-6 space-y-3 border-warn/50">
                <h2 className="text-lg font-bold text-cream">Withdrawals are only available on Live accounts</h2>
                <p className="text-xs text-mute">
                  The selected account is a practice (demo) account. Switch to your Live account to continue.
                </p>
                {liveAccount ? (
                  <button
                    onClick={() => setAccountId(liveAccount.id)}
                    className="px-4 py-2.5 rounded-md bg-up hover:bg-up text-base-950 font-bold text-xs uppercase tracking-wider transition"
                  >
                    Switch to Live Account ({liveAccount.accountNumber})
                  </button>
                ) : (
                  <p className="text-xs text-warn">No Live account found. Please contact support.</p>
                )}
              </Card>
            </div>
          )}

          {wdStep === 'FORM' && isLiveSelected && (
            <Card>
              <SectionTitle title="Request Real Money Withdrawal" right={<span className="text-[11px] text-up font-bold">0% Fee</span>} />

              <div className="space-y-4 mt-3">
                {/* Available balance indicator */}
                <div className="p-3 bg-base-950 rounded-md border border-line flex justify-between items-center">
                  <div>
                    <span className="text-[10px] text-mute font-bold uppercase block">Available for Withdrawal</span>
                    <span className="text-lg font-bold font-mono text-up">{fmtMoney(availableBalance)}</span>
                  </div>
                  <span className="text-xs text-mute font-mono">Min: $10.00</span>
                </div>

                {/* Amount presets */}
                <div>
                  <label className="text-xs font-bold text-cream block mb-1.5">Withdrawal Amount (USD)</label>
                  <div className="flex gap-2 mb-2">
                    {[20, 50, 100, 250, 500].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setWdAmount(String(amt))}
                        className={clsx(
                          'py-1.5 px-2.5 rounded-lg text-xs font-mono font-bold border transition',
                          parsedWdAmt === amt
                            ? 'bg-warn text-base-950 border-warn'
                            : 'bg-base-800 text-fog border-line hover:border-mute'
                        )}
                      >
                        ${amt}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setWdAmount(String(Math.floor(availableBalance)))}
                      className="py-1.5 px-2 rounded-lg text-[10px] font-bold bg-base-800 text-fog border border-line hover:text-cream"
                    >
                      All
                    </button>
                  </div>
                  <input
                    type="number"
                    min="10"
                    max={availableBalance}
                    value={wdAmount}
                    onChange={(e) => setWdAmount(e.target.value)}
                    className="ax-input font-mono text-xs font-bold"
                  />
                </div>

                {/* Withdrawal Method Selection */}
                <div>
                  <label className="text-xs font-bold text-cream block mb-1.5">Payout Method</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'bank', name: 'Bank Wire', icon: '🏦' },
                      { id: 'upi', name: 'UPI / VPA', icon: '⚡' },
                      { id: 'crypto', name: 'USDT (TRC-20)', icon: '₮' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setWdMethod(m.id as never)}
                        className={clsx(
                          'p-3 rounded-md border text-center transition',
                          wdMethod === m.id
                            ? 'bg-up/15 border-up text-cream font-bold'
                            : 'bg-base-800/80 border-line text-mute hover:text-cream'
                        )}
                      >
                        <div className="text-lg">{m.icon}</div>
                        <div className="text-xs mt-1">{m.name}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Specific Fields for Method */}
                {wdMethod === 'bank' && (
                  <div className="space-y-2.5 p-3.5 bg-base-950 rounded-md border border-line">
                    <span className="text-xs font-bold text-cream uppercase block">Bank Account Details</span>
                    <input
                      placeholder="Account Holder Full Name"
                      value={bankHolderName}
                      onChange={(e) => setBankHolderName(e.target.value)}
                      className="ax-input text-xs"
                    />
                    <input
                      placeholder="Bank Name (e.g. HDFC, Chase, Barclays)"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="ax-input text-xs"
                    />
                    <input
                      placeholder="Bank Account Number"
                      value={bankAccNumber}
                      onChange={(e) => setBankAccNumber(e.target.value)}
                      className="ax-input text-xs font-mono"
                    />
                    <input
                      placeholder="IFSC Code / Swift / Routing Number"
                      value={bankIfsc}
                      onChange={(e) => setBankIfsc(e.target.value)}
                      className="ax-input text-xs font-mono uppercase"
                    />
                  </div>
                )}

                {wdMethod === 'upi' && (
                  <div className="space-y-2.5 p-3.5 bg-base-950 rounded-md border border-line">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-cream uppercase block">UPI / VPA Details</span>
                      <span className="text-[10px] text-up font-mono font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-up animate-pulse" />
                        1 USD ≈ ₹{liveInrRate.toFixed(2)}
                      </span>
                    </div>
                    <input
                      placeholder="UPI ID (e.g. name@okhdfcbank or 9876543210@paytm)"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      className="ax-input text-xs font-mono"
                    />
                    <input
                      placeholder="Registered Phone Number"
                      value={upiPhone}
                      onChange={(e) => setUpiPhone(e.target.value)}
                      className="ax-input text-xs font-mono"
                    />
                    <div className="p-2 rounded-lg bg-base-900 border border-line flex justify-between items-center text-[11px]">
                      <span className="text-mute font-medium">Estimated INR Payout:</span>
                      <span className="font-mono font-bold text-up">
                        ≈ ₹{Math.round(parsedWdAmt * liveInrRate).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                )}

                {wdMethod === 'crypto' && (
                  <div className="space-y-2.5 p-3.5 bg-base-950 rounded-md border border-line">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-cream uppercase">USDT Wallet Address</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-up/20 text-up">TRON (TRC20)</span>
                    </div>
                    <input
                      placeholder="Enter your USDT TRC20 destination address"
                      value={cryptoAddress}
                      onChange={(e) => setCryptoAddress(e.target.value)}
                      className="ax-input text-xs font-mono"
                    />
                    <p className="text-[10px] text-warn">
                      Ensure your wallet supports TRC20 USDT. Minimum payout: $10.00.
                    </p>
                  </div>
                )}

                <button
                  onClick={() => setWdStep('REVIEW')}
                  disabled={!isLiveSelected || parsedWdAmt < 10 || parsedWdAmt > availableBalance}
                  className="w-full py-3 rounded-md bg-warn hover:bg-warn text-base-950 font-bold text-xs uppercase tracking-wider transition shadow-lg disabled:opacity-50"
                >
                  Review & Request Withdrawal →
                </button>
              </div>
            </Card>
          )}

          {/* Review Step */}
          {wdStep === 'REVIEW' && isLiveSelected && (
            <Card className="border-warn/50">
              <SectionTitle title="Confirm Withdrawal Request" />

              <div className="space-y-3 my-4 p-4 rounded-md bg-base-950 border border-line text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-mute">Debit Account:</span>
                  <span className="font-bold text-cream">{selectedAccount?.accountNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-mute">Payout Method:</span>
                  <span className="font-bold text-cream uppercase">{wdMethod}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-mute">Withdrawal Amount:</span>
                  <span className="font-bold text-warn text-sm">{fmtMoney(parsedWdAmt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-mute">Platform Fee:</span>
                  <span className="font-bold text-up">0% ($0.00 FREE)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-mute">Destination:</span>
                  <span className="font-bold text-cream truncate max-w-[220px]">
                    {wdMethod === 'bank' ? `${bankName} (${bankAccNumber})` : wdMethod === 'upi' ? upiId : cryptoAddress}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-line">
                  <span className="text-mute">Estimated Arrival:</span>
                  <span className="text-fog font-sans">15–60 minutes</span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-base-800 text-[11px] text-mute mb-4">
                ℹ️ The requested amount will be locked and protected from trading risk while under review.
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => requestWithdrawal.mutate()}
                  disabled={requestWithdrawal.isPending}
                  className="flex-1 py-3 rounded-md bg-warn hover:bg-warn text-base-950 font-bold text-xs uppercase tracking-wider transition shadow-lg"
                >
                  {requestWithdrawal.isPending ? 'Submitting Request…' : 'Confirm & Submit Withdrawal'}
                </button>
                <button
                  onClick={() => setWdStep('FORM')}
                  className="px-4 py-3 rounded-md bg-base-800 hover:bg-base-700 text-cream font-bold text-xs border border-line"
                >
                  Back
                </button>
              </div>
            </Card>
          )}

          {/* Success Step */}
          {wdStep === 'SUCCESS' && (
            <Card className="text-center py-8 px-6 space-y-4 border-warn/60">
              <div className="w-16 h-16 rounded-full bg-warn/20 border-2 border-warn flex items-center justify-center mx-auto text-2xl text-warn">
                ⏳
              </div>

              <div>
                <h2 className="text-lg font-bold text-cream">Withdrawal Request Received!</h2>
                <p className="text-xs text-mute mt-1">
                  Request #{lastWithdrawal?.id} is currently under compliance review.
                </p>
              </div>

              <div className="p-4 rounded-md bg-base-950 border border-line text-left space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-mute">Amount:</span>
                  <span className="font-bold text-cream">{fmtMoney(lastWithdrawal?.amount ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-mute">Status:</span>
                  <span className="text-warn font-bold uppercase">{lastWithdrawal?.status}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('transfers')}
                  className="flex-1 py-3 rounded-md bg-warn hover:bg-warn text-base-950 font-bold text-xs uppercase tracking-wider transition"
                >
                  View Active Transfers
                </button>
                <button
                  onClick={() => {
                    setWdStep('FORM');
                    setLastWithdrawal(null);
                  }}
                  className="px-4 py-3 rounded-md bg-base-800 hover:bg-base-700 text-cream font-bold text-xs border border-line"
                >
                  New Request
                </button>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════ */}
      {/* 3. TRANSFERS & ACTIVE REQUESTS TAB                            */}
      {/* ═════════════════════════════════════════════════════════════ */}
      {activeTab === 'transfers' && (
        <div className="space-y-5">
          {/* Active / Recent Deposits */}
          <Card className="!p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-line flex justify-between items-center">
              <SectionTitle title="Deposit Orders" right={<span className="text-[10px] text-mute">Latest 50</span>} />
            </div>
            {!depositsList?.length ? (
              <Empty title="No deposits yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      {['Amount', 'Method', 'Order / Proof Ref', 'Status', 'Date'].map((h) => (
                        <th key={h} className="ax-th">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {depositsList.map((d) => (
                      <tr key={d.id} className="ax-row">
                        <td className="ax-td font-mono font-bold text-up">{fmtMoney(d.amount)}</td>
                        <td className="ax-td uppercase text-mute font-bold">{d.provider.replace(/_/g, ' ')}</td>
                        <td className="ax-td font-mono text-[11px] text-fog max-w-[220px] truncate">
                          {d.providerRef ?? '—'}
                        </td>
                        <td className="ax-td">
                          <span className={clsx(
                            'ax-tag',
                            d.status === 'COMPLETED' ? 'bg-up/20 text-up' :
                            d.status === 'PENDING' || d.status === 'PENDING_VERIFICATION' ? 'bg-warn/20 text-warn' : 'bg-down/20 text-down'
                          )}>
                            {d.status === 'PENDING_VERIFICATION' ? 'AWAITING VERIFICATION' : d.status}
                          </span>
                        </td>
                        <td className="ax-td text-mute">{fmtTime(d.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Active / Recent Withdrawals */}
          <Card className="!p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-line flex justify-between items-center">
              <SectionTitle title="Withdrawal Requests" right={<span className="text-[10px] text-mute">Latest 50</span>} />
            </div>
            {!withdrawalsList?.length ? (
              <Empty title="No withdrawal requests yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      {['Amount', 'Method', 'Status', 'Date', 'Action'].map((h) => (
                        <th key={h} className="ax-th">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {withdrawalsList.map((w) => (
                      <tr key={w.id} className="ax-row">
                        <td className="ax-td font-mono font-bold text-warn">{fmtMoney(w.amount)}</td>
                        <td className="ax-td uppercase text-mute font-bold">{w.method}</td>
                        <td className="ax-td">
                          <span className={clsx(
                            'ax-tag',
                            w.status === 'COMPLETED' || w.status === 'APPROVED' ? 'bg-up/20 text-up' :
                            w.status === 'REQUESTED' || w.status === 'UNDER_REVIEW' ? 'bg-warn/20 text-warn' : 'bg-down/20 text-down'
                          )}>
                            {w.status}
                          </span>
                        </td>
                        <td className="ax-td text-mute">{fmtTime(w.createdAt)}</td>
                        <td className="ax-td">
                          {(w.status === 'REQUESTED' || w.status === 'UNDER_REVIEW') && (
                            <button
                              onClick={() => cancelWithdrawal.mutate(w.id)}
                              className="px-2 py-1 rounded bg-down/20 hover:bg-down text-down hover:text-cream text-[10px] font-semibold transition"
                            >
                              Cancel & Unlock
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════ */}
      {/* 4. WALLET LEDGER TAB                                          */}
      {/* ═════════════════════════════════════════════════════════════ */}
      {activeTab === 'ledger' && (
        <Card className="!p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-line flex justify-between items-center">
            <SectionTitle title="Account Ledger" right={<span className="text-[10px] text-mute">every balance movement</span>} />
          </div>
          {!txns?.items.length ? (
            <Empty title="No transactions" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-xs">
                <thead>
                  <tr>
                    {['Type', 'Amount', 'Balance after', 'Memo', 'Time'].map((h) => (
                      <th key={h} className={clsx('ax-th', h === 'Amount' && 'text-right')}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {txns.items.map((t) => (
                    <tr key={t.id} className="ax-row">
                      <td className="ax-td"><span className="ax-tag">{t.type}</span></td>
                      <td className={clsx('ax-td ax-num font-bold text-right', Number(t.amount) >= 0 ? 'text-up' : 'text-down')}>
                        {Number(t.amount) >= 0 ? `+${fmtMoney(t.amount)}` : fmtMoney(t.amount)}
                      </td>
                      <td className="ax-td ax-num text-fog">{fmtMoney(t.balanceAfter)}</td>
                      <td className="ax-td text-mute text-[11px] max-w-[280px] truncate">{t.memo ?? '—'}</td>
                      <td className="ax-td text-mute">{fmtTime(t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

    </div>
  );
}

export function TransfersPage({ kind }: { kind: 'deposits' | 'withdrawals' }) {
  const isDep = kind === 'deposits';
  const { data } = useQuery({
    queryKey: [kind],
    queryFn: () => get<Array<{ id: string; amount: number; status: string; createdAt: string; provider?: string; method?: string }>>(isDep ? '/api/v1/payments' : '/api/v1/withdrawals'),
    refetchInterval: 10000,
  });
  return (
    <div className="max-w-[860px] mx-auto p-4 select-none">
      <h1 className="text-lg font-bold tracking-tight capitalize">{kind}</h1>
      <div className="ax-panel mt-3 overflow-hidden">
        {!data?.length ? <Empty title={`No ${kind} yet`} /> : (
          <table className="w-full text-xs">
            <thead><tr>{['Amount', isDep ? 'Provider' : 'Method', 'Status', 'Date'].map((h) => <th key={h} className="ax-th">{h}</th>)}</tr></thead>
            <tbody>{data.map((r) => (
              <tr key={r.id} className="ax-row">
                <td className="ax-td ax-num font-bold text-up">{fmtMoney(r.amount)}</td>
                <td className="ax-td text-mute">{r.provider ?? r.method ?? '—'}</td>
                <td className="ax-td"><span className="ax-tag">{r.status}</span></td>
                <td className="ax-td text-mute">{fmtTime(r.createdAt)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
