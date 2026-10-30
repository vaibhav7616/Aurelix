import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
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
    desc: 'Instant · Lowest fee · Tron network',
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
    desc: 'Ethereum network · Fast settlement',
    icon: 'Ξ',
  },
  {
    id: 'upi_qr',
    name: 'UPI / Fast QR',
    badge: 'INSTANT',
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
  {
    id: 'cards',
    name: 'Bank Cards',
    badge: 'VISA / MC',
    category: 'card',
    desc: 'Debit / Credit cards · 3D Secure',
    icon: '💳',
  },
];

const PRESET_AMOUNTS = [10, 25, 50, 100, 250, 500, 1000, 2500];

// SVG / Dynamic QR Code generator component
function QrDisplay({ payload, label }: { payload: string; label: string }) {
  const [imgError, setImgError] = useState(false);
  const qrUrl = payload ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(payload)}` : '';

  return (
    <div className="flex flex-col items-center justify-center p-3.5 bg-white rounded-xl shadow-lg border border-slate-200 shrink-0">
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
          <rect x="6" y="6" width="28" height="28" fill="#111827" rx="3" />
          <rect x="10" y="10" width="20" height="20" fill="#ffffff" rx="2" />
          <rect x="14" y="14" width="12" height="12" fill="#111827" rx="1.5" />
          {/* Top-right position marker */}
          <rect x="66" y="6" width="28" height="28" fill="#111827" rx="3" />
          <rect x="70" y="10" width="20" height="20" fill="#ffffff" rx="2" />
          <rect x="74" y="14" width="12" height="12" fill="#111827" rx="1.5" />
          {/* Bottom-left position marker */}
          <rect x="6" y="66" width="28" height="28" fill="#111827" rx="3" />
          <rect x="10" y="70" width="20" height="20" fill="#ffffff" rx="2" />
          <rect x="14" y="74" width="12" height="12" fill="#111827" rx="1.5" />
          {/* Simulated data pattern dots */}
          <circle cx="45" cy="15" r="3" fill="#111827" />
          <circle cx="55" cy="20" r="2.5" fill="#111827" />
          <circle cx="48" cy="28" r="3" fill="#111827" />
          <circle cx="20" cy="45" r="2.5" fill="#111827" />
          <circle cx="28" cy="52" r="3" fill="#111827" />
          <circle cx="40" cy="42" r="2.8" fill="#111827" />
          <circle cx="50" cy="50" r="3.5" fill="#00c076" />
          <circle cx="60" cy="44" r="2.5" fill="#111827" />
          <circle cx="75" cy="48" r="3" fill="#111827" />
          <circle cx="85" cy="55" r="2.5" fill="#111827" />
          <circle cx="44" cy="65" r="3" fill="#111827" />
          <circle cx="55" cy="72" r="2.5" fill="#111827" />
          <circle cx="68" cy="68" r="3" fill="#111827" />
          <circle cx="82" cy="78" r="3" fill="#111827" />
          <circle cx="48" cy="85" r="2.8" fill="#111827" />
          <circle cx="62" cy="88" r="2.5" fill="#111827" />
          <circle cx="78" cy="88" r="3" fill="#111827" />
        </svg>
      )}
      <span className="text-[10px] font-bold text-slate-700 mt-2">{label}</span>
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
  const demoAccount = accounts?.find((a) => a.accountType === 'DEMO');
  const selectedAccount = accounts?.find((a) => a.id === accountId) ?? liveAccount ?? accounts?.[0];
  const targetId = selectedAccount?.id;

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

  // ─────────────────────────────────────────────────────────────
  // DEPOSIT MULTI-STEP STATE
  // ─────────────────────────────────────────────────────────────
  // step: 'FORM' (Step 1) | 'GATEWAY' (Step 2 - Next Step!) | 'CONFIRMED' (Step 3) | 'FAILED'
  const [depStep, setDepStep] = useState<'FORM' | 'GATEWAY' | 'CONFIRMED' | 'FAILED'>('FORM');
  const [selectedMethod, setSelectedMethod] = useState('upi_qr');
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
  const [upiSubTab, setUpiSubTab] = useState<'qr' | 'collect' | 'gateway' | 'utr'>('qr');
  const [collectPhone, setCollectPhone] = useState('');
  const [collectSentMsg, setCollectSentMsg] = useState<string | null>(null);
  const [showPhonePeGatewayModal, setShowPhonePeGatewayModal] = useState(false);
  const [phonePePin, setPhonePePin] = useState('');
  const [phonePePinError, setPhonePePinError] = useState<string | null>(null);
  const [utrInput, setUtrInput] = useState('');
  const [utrError, setUtrError] = useState<string | null>(null);

  const [confirmedData, setConfirmedData] = useState<{
    amount: number;
    inrAmount?: number;
    utr: string;
    app: string;
    balance: number;
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

  // Automated background polling for deposit invoice status (Quotex real-time banking detection)
  const isAwaitingPayment = depStep === 'GATEWAY' && !!activeDepositOrder?.depositId;
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
      setConfirmedData({
        amount: pollStatus.amount,
        inrAmount: Math.round(pollStatus.amount * liveInrRate),
        utr: pollStatus.providerRef || `PhonePe-${Date.now().toString().slice(-8)}`,
        app: 'PhonePe',
        balance: pollStatus.balance,
      });
      setShowPhonePeGatewayModal(false);
      setDepStep('CONFIRMED');
      push('ok', `⚡ Payment verified by PhonePe banking network! $${pollStatus.amount.toFixed(2)} USD credited.`);
      ['wallet', 'accounts', 'wallet-txns', 'deposits-list'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    } else if (pollStatus.status === 'FAILED' || pollStatus.status === 'CANCELLED') {
      setFailedData({
        reason: 'Payment cancelled or declined by user / bank',
        currentBalance: pollStatus.balance,
      });
      setShowPhonePeGatewayModal(false);
      setDepStep('FAILED');
      push('info', 'Payment cancelled or declined. Your account balance was not modified.');
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
      setCollectSentMsg(null);
      setCollectPhone('');
      setPhonePePin('');
      setPhonePePinError(null);
      setUtrInput('');
      setUtrError(null);
      setProofRef('');
      setTimeLeftSec((order.gatewayData.expiryMinutes ?? 15) * 60);
      push('ok', `Deposit invoice #${order.orderRef} generated. Follow the instructions to complete payment.`);
      qc.invalidateQueries({ queryKey: ['deposits-list'] });
    },
    onError: (e) => push('err', apiError(e)),
  });

  // PhonePe Gateway Official PIN Authorization Mutation
  const phonePeAuthorize = useMutation({
    mutationFn: () =>
      post<{
        depositId: string;
        status: string;
        balance: number;
        amount: number;
        inrAmount: number;
        txnId: string;
        rate: string;
        app: string;
      }>(`/api/v1/payments/${activeDepositOrder?.depositId}/phonepe-authorize`, {
        pin: phonePePin,
        app: 'PHONEPE',
      }),
    onSuccess: (data) => {
      setConfirmedData({
        amount: data.amount,
        inrAmount: data.inrAmount,
        utr: data.txnId,
        app: 'PhonePe',
        balance: data.balance,
      });
      setShowPhonePeGatewayModal(false);
      setDepStep('CONFIRMED');
      push('ok', `⚡ PhonePe Payment Verified! $${data.amount.toFixed(2)} USD credited to Live balance.`);
      ['wallet', 'accounts', 'wallet-txns', 'deposits-list'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e) => {
      const msg = apiError(e);
      setPhonePePinError(msg);
      push('err', msg);
    },
  });

  // PhonePe Mobile Number Collect Request Mutation
  const phonePeCollect = useMutation({
    mutationFn: () =>
      post<{ message: string; targetIdentifier: string; inrAmount: number }>(
        `/api/v1/payments/${activeDepositOrder?.depositId}/phonepe-collect`,
        {
          phone: collectPhone,
        }
      ),
    onSuccess: (data) => {
      setCollectSentMsg(data.message);
      push('ok', 'Collect request sent to PhonePe! Open your PhonePe mobile app to approve.');
    },
    onError: (e) => push('err', apiError(e)),
  });

  // Verified 12-Digit NPCI Bank UTR Reconciliation Mutation
  const verifyUtrMutation = useMutation({
    mutationFn: () =>
      post<{
        depositId: string;
        status: string;
        balance: number;
        amount: number;
        inrAmount: number;
        utr: string;
      }>(`/api/v1/payments/${activeDepositOrder?.depositId}/verify-utr`, {
        utr: utrInput,
      }),
    onSuccess: (data) => {
      setConfirmedData({
        amount: data.amount,
        inrAmount: data.inrAmount,
        utr: data.utr,
        app: 'PhonePe',
        balance: data.balance,
      });
      setDepStep('CONFIRMED');
      push('ok', `⚡ 12-Digit UTR Verified! $${data.amount.toFixed(2)} USD credited to balance.`);
      ['wallet', 'accounts', 'wallet-txns', 'deposits-list'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
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
      post(`/api/v1/payments/${activeDepositOrder?.depositId}/submit-proof`, {
        reference: proofRef,
      }),
    onSuccess: () => {
      setDepStep('CONFIRMED');
      push('ok', 'Payment reference submitted! Verification in progress.');
      qc.invalidateQueries({ queryKey: ['deposits-list'] });
    },
    onError: (e) => push('err', apiError(e)),
  });

  // Fast-track Instant confirmation for development/testing
  const fastTrackConfirm = useMutation({
    mutationFn: (id: string) => post(`/api/v1/payments/${id}/confirm`),
    onSuccess: () => {
      push('ok', '⚡ Real Account balance credited instantly (Sandbox test)!');
      ['wallet', 'accounts', 'wallet-txns', 'deposits-list'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      setDepStep('CONFIRMED');
    },
    onError: (e) => push('err', apiError(e)),
  });

  // Open Installed UPI App via Mobile Intent URL or Launch PhonePe Gateway on Desktop
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
      push('info', `Opening ${appName} app… Authorize payment to complete deposit.`);
    } else {
      // Desktop PC: PhonePe app is mobile-only, so open PhonePe Cashier Gateway Modal / QR
      setShowPhonePeGatewayModal(true);
      setUpiSubTab('qr');
      push('info', 'Desktop detected: Opening PhonePe Payment Gateway.');
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
            <h1 className="text-xl font-black tracking-tight text-white">Cashier & Wallet</h1>
            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-[#00c076]/15 text-[#00c076] border border-[#00c076]/30">
              REAL BALANCE READY
            </span>
          </div>
          <p className="text-xs text-mute mt-0.5">Manage deposits, instant payment gateways, and withdrawals.</p>
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
        <div className="bg-gradient-to-br from-base-900 to-base-800 p-4 rounded-xl border border-line shadow-sm">
          <div className="text-[11px] font-bold text-mute uppercase tracking-wider flex items-center justify-between">
            <span>Total Account Balance</span>
            <span className={clsx('text-[9px] font-black px-1.5 py-0.5 rounded', selectedAccount?.accountType === 'LIVE' ? 'bg-[#00c076]/20 text-[#00c076]' : 'bg-accent-500/20 text-accent-300')}>
              {selectedAccount?.accountType === 'LIVE' ? 'REAL' : 'DEMO'}
            </span>
          </div>
          <div className="text-2xl font-black font-mono text-white mt-1.5">
            {wallet ? fmtMoney(wallet.balance) : '—'}
          </div>
        </div>

        <div className="bg-gradient-to-br from-base-900 to-base-800 p-4 rounded-xl border border-line shadow-sm">
          <div className="text-[11px] font-bold text-mute uppercase tracking-wider flex items-center justify-between">
            <span>Available to Trade / Withdraw</span>
            <span className="w-2 h-2 rounded-full bg-[#00c076]" />
          </div>
          <div className="text-2xl font-black font-mono text-[#00c076] mt-1.5">
            {wallet ? fmtMoney(wallet.available) : '—'}
          </div>
        </div>

        <div className="bg-gradient-to-br from-base-900 to-base-800 p-4 rounded-xl border border-line shadow-sm">
          <div className="text-[11px] font-bold text-mute uppercase tracking-wider flex items-center justify-between">
            <span>Locked in Review / Pending</span>
            <span className="text-[10px] text-mute font-mono">Protected</span>
          </div>
          <div className="text-2xl font-black font-mono text-amber-400 mt-1.5">
            {wallet ? fmtMoney(wallet.locked) : '—'}
          </div>
        </div>
      </div>

      {/* ── Cashier Tabs Bar ────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-line overflow-x-auto no-scrollbar">
        {[
          { id: 'deposit', label: 'Deposit Funds', icon: '📥', accent: 'text-[#00c076]' },
          { id: 'withdraw', label: 'Withdrawal', icon: '📤', accent: 'text-amber-400' },
          { id: 'transfers', label: 'Transfers & Orders', icon: '📋' },
          { id: 'ledger', label: 'Wallet Ledger', icon: '📜' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id as never);
              if (tab.id === 'deposit' && depStep === 'CONFIRMED') setDepStep('FORM');
              if (tab.id === 'withdraw' && wdStep === 'SUCCESS') setWdStep('FORM');
            }}
            className={clsx(
              'flex items-center gap-2 py-3 px-4 text-xs font-bold border-b-2 transition whitespace-nowrap',
              activeTab === tab.id
                ? 'border-[#00c076] text-white bg-white/[0.03]'
                : 'border-transparent text-mute hover:text-slate-200'
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
            <span className={clsx('px-2.5 py-1 rounded-full text-[11px]', depStep === 'FORM' ? 'bg-[#00c076] text-base-950 font-black' : 'bg-base-800 text-white')}>
              1. Method & Amount
            </span>
            <span>→</span>
            <span className={clsx('px-2.5 py-1 rounded-full text-[11px]', depStep === 'GATEWAY' ? 'bg-[#00c076] text-base-950 font-black' : 'bg-base-800 text-mute')}>
              2. Payment & Instructions
            </span>
            <span>→</span>
            <span className={clsx('px-2.5 py-1 rounded-full text-[11px]', depStep === 'CONFIRMED' ? 'bg-[#00c076] text-base-950 font-black' : 'bg-base-800 text-mute')}>
              3. Credited & Verified
            </span>
          </div>

          {/* ── STEP 1: METHOD & AMOUNT SELECTION ─────────────────────── */}
          {depStep === 'FORM' && (
            <div className="grid lg:grid-cols-3 gap-5">
              {/* Left 2 Cols: Payment Methods Grid */}
              <div className="lg:col-span-2 space-y-4">
                <Card>
                  <SectionTitle title="Choose Payment Method" right={<span className="text-[11px] text-[#00c076] font-bold">Fast & Secure</span>} />
                  
                  <div className="grid sm:grid-cols-2 gap-3 mt-3">
                    {DEPOSIT_METHODS.map((m) => {
                      const isSel = selectedMethod === m.id;
                      return (
                        <div
                          key={m.id}
                          onClick={() => setSelectedMethod(m.id)}
                          className={clsx(
                            'p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 relative',
                            isSel
                              ? 'bg-[#00c076]/10 border-[#00c076] shadow-[0_0_15px_rgba(0,192,118,0.15)]'
                              : 'bg-base-800/60 border-line hover:bg-base-800 hover:border-line/80'
                          )}
                        >
                          <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold shrink-0', isSel ? 'bg-[#00c076] text-base-950' : 'bg-base-700 text-white')}>
                            {m.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-white">{m.name}</span>
                              <span className="text-[8px] font-black px-1.5 py-0.2 rounded bg-white/10 text-slate-300 uppercase">
                                {m.badge}
                              </span>
                            </div>
                            <p className="text-[10px] text-mute mt-0.5 truncate">{m.desc}</p>
                          </div>
                          {m.recommended && (
                            <span className="absolute top-2 right-2 text-[8px] font-black px-1 py-0.2 rounded bg-amber-400 text-base-950 uppercase">
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
                            'py-2 px-1 text-center rounded-lg font-mono text-xs font-extrabold transition border',
                            isSel
                              ? 'bg-[#00c076] text-base-950 border-[#00c076]'
                              : 'bg-base-800/90 text-white border-line hover:border-slate-500'
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
                <Card className="border-[#00c076]/40 bg-gradient-to-b from-[#00c076]/5 to-transparent">
                  <div className="flex items-center justify-between pb-3 border-b border-line">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Deposit Summary</span>
                    <span className="text-[10px] text-[#00c076] font-extrabold uppercase">Step 1 of 2</span>
                  </div>

                  <div className="space-y-2.5 my-4 text-xs">
                    <div className="flex justify-between">
                      <span className="text-mute">Credit to Account:</span>
                      <span className="font-bold text-white">{selectedAccount?.accountNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-mute">Selected Method:</span>
                      <span className="font-bold text-white capitalize">{selectedMethod.replace(/_/g, ' ')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-mute">Deposit Amount:</span>
                      <span className="font-mono font-bold text-white">{fmtMoney(parsedDepAmt)}</span>
                    </div>

                    {/* Quotex Deposit Promo Code Engine */}
                    <div className="p-3.5 rounded-xl bg-base-800/90 border border-amber-400/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-amber-400 flex items-center gap-1.5">
                          <span>🎁</span>
                          <span>Deposit Promo Code</span>
                        </span>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <span className="text-[10px] text-mute font-bold">Use Bonus</span>
                          <input
                            type="checkbox"
                            checked={useBonus}
                            onChange={(e) => setUseBonus(e.target.checked)}
                            className="accent-[#00c076] cursor-pointer"
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
                              className="h-8 px-3 rounded-lg bg-[#00c076] hover:bg-[#00d684] text-slate-950 text-[11px] font-black uppercase tracking-wider transition active:scale-95 disabled:opacity-50"
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
                              ['RISKFREE', 'Risk-Free Trades'],
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
                                    ? 'bg-amber-400/20 text-amber-300 border-amber-400/50'
                                    : 'bg-white/5 text-slate-400 hover:text-white border-white/10 hover:border-white/20'
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
                                <span className="font-bold text-amber-400">{appliedPromo.code} ({appliedPromo.badge})</span>
                              </div>
                              <div className="flex justify-between text-mute">
                                <span>Bonus Capital:</span>
                                <span className="font-mono font-bold text-[#00c076]">+{fmtMoney(bonusAmount)}</span>
                              </div>
                              <div className="text-[9.5px] text-slate-400 pt-1 leading-snug">
                                🛡️ {appliedPromo.description}. 35× turnover applies only to withdraw bonus; your principal and profits are withdrawable anytime.
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Live INR Conversion Box for UPI */}
                    {(selectedMethod === 'upi_qr' || selectedMethod.startsWith('upi')) && (
                      <div className="p-3 rounded-lg bg-base-800/90 border border-[#00c076]/30 space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-mute flex items-center gap-1.5 font-bold">
                            <span className="w-2 h-2 rounded-full bg-[#00c076] animate-pulse" />
                            Live Market Rate (Today):
                          </span>
                          <span className="font-mono font-bold text-white">
                            1 USD = ₹{liveInrRate.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between text-[11px] pt-1.5 border-t border-white/5 items-center">
                          <span className="text-mute font-bold">Estimated UPI Payable:</span>
                          <span className="font-mono font-black text-[#00c076] text-sm">
                            ₹{Math.round(parsedDepAmt * liveInrRate).toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div className="flex justify-between text-[9px] text-mute font-medium">
                          <span>Real-time day-to-day rate</span>
                          <span className="text-[#00c076]">0% Surcharge</span>
                        </div>
                      </div>
                    )}

                    <div className="pt-2 border-t border-line flex justify-between items-center">
                      <span className="font-bold text-white">Total Credited:</span>
                      <span className="text-base font-mono font-black text-[#00c076]">{fmtMoney(totalCreditAmount)}</span>
                    </div>
                  </div>

                  {/* Proceed to Step 2 Button */}
                  <button
                    onClick={() => createDepositOrder.mutate()}
                    disabled={createDepositOrder.isPending || parsedDepAmt < 10}
                    className="w-full py-3 rounded-xl bg-[#00c076] hover:bg-[#00d684] text-base-950 font-black text-xs uppercase tracking-wider transition shadow-lg active:scale-98 disabled:opacity-50"
                  >
                    {createDepositOrder.isPending ? 'Generating Gateway Invoice…' : 'Proceed to Next Step →'}
                  </button>

                  <p className="text-[10px] text-center text-mute mt-2">
                    🔒 256-bit SSL encrypted. Real money deposit gateway.
                  </p>
                </Card>
              </div>
            </div>
          )}

          {/* ── STEP 2: PAYMENT GATEWAY INSTRUCTIONS (THE NEXT STEP) ───── */}
          {depStep === 'GATEWAY' && activeDepositOrder && (
            <div className="max-w-2xl mx-auto space-y-4">
              <Card className="border-[#00c076]/50">
                {/* Header with Order ID & Countdown */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-line">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black uppercase text-[#00c076]">Invoice #{activeDepositOrder.orderRef}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-400 font-bold">AWAITING PAYMENT</span>
                    </div>
                    <div className="text-lg font-black text-white mt-1">
                      Pay {fmtMoney(activeDepositOrder.amount)} USD
                    </div>
                  </div>

                  <div className="bg-base-800 px-3 py-1.5 rounded-lg border border-line text-right">
                    <div className="text-[9px] text-mute uppercase font-bold">Time Remaining</div>
                    <div className="text-sm font-mono font-black text-amber-400">
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
                            <div className="text-xs font-black text-[#00c076] mt-0.5">{activeDepositOrder.gatewayData.network}</div>
                          </div>

                          <div>
                            <span className="text-[10px] font-bold text-mute uppercase">Deposit Address</span>
                            <div className="flex items-center gap-2 mt-1">
                              <input
                                readOnly
                                value={activeDepositOrder.gatewayData.address ?? ''}
                                className="ax-input !font-mono text-xs !bg-base-950 font-bold text-slate-200"
                              />
                              <button
                                onClick={() => handleCopy(activeDepositOrder.gatewayData.address ?? '')}
                                className="px-3 py-2 rounded-lg bg-base-800 hover:bg-base-700 text-xs font-bold border border-line whitespace-nowrap text-white"
                              >
                                {copied ? '✓ Copied' : 'Copy'}
                              </button>
                            </div>
                          </div>

                          <div className="p-2.5 rounded-lg bg-amber-400/10 border border-amber-400/30 text-[11px] text-amber-300">
                            {activeDepositOrder.gatewayData.warning}
                          </div>
                        </div>
                      </div>

                      {/* Transaction Hash Input */}
                      <div className="pt-3 border-t border-line space-y-2">
                        <label className="text-xs font-bold text-white block">
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
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-base-950 via-base-900 to-base-950 border border-line gap-2">
                        <div>
                          <span className="text-[10px] font-bold text-mute uppercase tracking-wider">Pay Exact Amount (INR)</span>
                          <div className="text-2xl font-black font-mono text-[#00c076] mt-0.5">
                            ₹{activeDepositOrder.gatewayData.amountInr?.toLocaleString()}{' '}
                            <span className="text-xs text-mute font-normal font-sans">
                              (${activeDepositOrder.amount}.00 USD)
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-bold text-mute uppercase tracking-wider flex items-center gap-1 justify-end">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#00c076] animate-pulse" />
                            Live Exchange Rate
                          </span>
                          <div className="text-xs font-mono font-bold text-slate-300">
                            {activeDepositOrder.gatewayData.rate ?? `1 USD = ₹${liveInrRate.toFixed(2)} (Live Market)`}
                          </div>
                          <div className="flex items-center gap-1.5 justify-end mt-0.5">
                            <span className="text-[10px] text-[#00c076] font-bold">0% Transfer Fee</span>
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
                                ? 'bg-base-800 text-white border-t-2 border-[#5f259f] shadow-sm'
                                : 'text-mute hover:text-white hover:bg-base-900/50'
                            }`}
                          >
                            <span>📷</span>
                            <span>PhonePe QR Code</span>
                            <span className="text-[9px] px-1 py-0.2 rounded bg-[#00c076]/20 text-[#00c076] font-bold">
                              FASTEST
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setUpiSubTab('collect')}
                            className={`px-3 py-2 rounded-t-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                              upiSubTab === 'collect'
                                ? 'bg-base-800 text-white border-t-2 border-[#5f259f] shadow-sm'
                                : 'text-mute hover:text-white hover:bg-base-900/50'
                            }`}
                          >
                            <span>📲</span>
                            <span>PhonePe Mobile Request</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setUpiSubTab('gateway')}
                            className={`px-3 py-2 rounded-t-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                              upiSubTab === 'gateway'
                                ? 'bg-base-800 text-white border-t-2 border-[#5f259f] shadow-sm'
                                : 'text-mute hover:text-white hover:bg-base-900/50'
                            }`}
                          >
                            <span>🌐</span>
                            <span>PhonePe Web Gateway</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setUpiSubTab('utr')}
                            className={`px-3 py-2 rounded-t-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                              upiSubTab === 'utr'
                                ? 'bg-base-800 text-white border-t-2 border-[#5f259f] shadow-sm'
                                : 'text-mute hover:text-white hover:bg-base-900/50'
                            }`}
                          >
                            <span>🔍</span>
                            <span>Verify 12-Digit UTR</span>
                          </button>
                        </div>

                        {/* Mobile Device Quick Launch Banner */}
                        {isMobile && (
                          <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-500/30 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-[#5f259f] flex items-center justify-center text-white font-black text-sm">
                                पे
                              </div>
                              <div>
                                <div className="text-xs font-bold text-white">Mobile Device Detected</div>
                                <div className="text-[10px] text-mute">Tap to launch PhonePe app installed on this phone</div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleOpenUpiApp('phonepe')}
                              className="px-3 py-1.5 rounded-lg bg-[#5f259f] hover:bg-[#6f2fb8] text-white text-xs font-bold shadow-md transition active:scale-95"
                            >
                              Launch PhonePe →
                            </button>
                          </div>
                        )}

                        {/* TAB 1: PHONEPE QR CODE (QUOTEX DESKTOP DEFAULT) */}
                        {upiSubTab === 'qr' && (
                          <div className="p-5 rounded-2xl bg-base-950 border border-line space-y-5">
                            <div className="flex flex-col md:flex-row items-center gap-6">
                              {/* QR Code with PhonePe Badge */}
                              <div className="relative p-3 bg-white rounded-2xl shadow-xl flex flex-col items-center shrink-0">
                                <QrDisplay
                                  payload={activeDepositOrder.gatewayData.qrPayload ?? ''}
                                  label="Scan with PhonePe / GPay"
                                />
                                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-700 font-bold">
                                  <span className="w-4 h-4 rounded-full bg-[#5f259f] text-white inline-flex items-center justify-center text-[9px] font-black">
                                    पे
                                  </span>
                                  <span>PhonePe Verified Merchant</span>
                                </div>
                              </div>

                              {/* Instructions & Details */}
                              <div className="flex-1 space-y-3.5 text-xs">
                                <div>
                                  <h4 className="text-sm font-black text-white flex items-center gap-2">
                                    <span>Scan with PhonePe or any UPI App</span>
                                    <span className="text-[9px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">
                                      AUTO-DETECT
                                    </span>
                                  </h4>
                                  <p className="text-mute text-xs mt-1">
                                    Use your smartphone to scan this QR code using PhonePe, Google Pay, Paytm, or BHIM.
                                  </p>
                                </div>

                                <div className="space-y-2 p-3 rounded-xl bg-base-900 border border-line">
                                  <div className="flex justify-between items-center">
                                    <span className="text-mute">Amount to Pay:</span>
                                    <span className="font-mono font-black text-emerald-400 text-base">
                                      ₹{activeDepositOrder.gatewayData.amountInr?.toLocaleString()} INR
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center text-slate-400">
                                    <span>Credited to Live Balance:</span>
                                    <span className="font-bold text-white">
                                      +${activeDepositOrder.amount.toFixed(2)} USD
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center text-slate-400">
                                    <span>Merchant UPI ID:</span>
                                    <div className="flex items-center gap-1.5">
                                      <code className="font-mono text-purple-300 font-bold text-[11px]">
                                        {activeDepositOrder.gatewayData.upiId}
                                      </code>
                                      <button
                                        type="button"
                                        onClick={() => handleCopy(activeDepositOrder.gatewayData.upiId ?? '')}
                                        className="text-[10px] text-mute hover:text-white underline"
                                      >
                                        {copied ? 'Copied' : 'Copy'}
                                      </button>
                                    </div>
                                  </div>
                                </div>

                                {/* Step-by-Step Guide */}
                                <ol className="list-decimal list-inside space-y-1 text-slate-300 text-[11px]">
                                  <li>Open <strong className="text-purple-300">PhonePe</strong> on your mobile phone</li>
                                  <li>Tap the <strong className="text-white">QR Scanner icon</strong> at the top right</li>
                                  <li>Point camera at this screen and authorize payment</li>
                                  <li>Your Live account updates automatically upon bank receipt</li>
                                </ol>
                              </div>
                            </div>

                            {/* Live Radar Detection Status */}
                            <div className="p-3.5 rounded-xl bg-gradient-to-r from-purple-950/30 via-base-900 to-base-900 border border-purple-500/20 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="relative flex items-center justify-center w-8 h-8">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-20" />
                                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                                </div>
                                <div>
                                  <div className="text-xs font-bold text-white">
                                    Live Bank Listener Active
                                  </div>
                                  <div className="text-[10px] text-mute">
                                    Checking NPCI / PhonePe banking status every 2.5 seconds…
                                  </div>
                                </div>
                              </div>
                              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-1 rounded border border-emerald-500/30">
                                LIVE POLLING
                              </span>
                            </div>
                          </div>
                        )}

                        {/* TAB 2: PHONEPE MOBILE REQUEST (COLLECT) */}
                        {upiSubTab === 'collect' && (
                          <div className="p-5 rounded-2xl bg-base-950 border border-line space-y-4">
                            <div>
                              <h4 className="text-sm font-black text-white flex items-center gap-2">
                                <span>Send Collect Request to PhonePe App</span>
                                <span className="text-[9px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold">
                                  EXPRESS
                                </span>
                              </h4>
                              <p className="text-mute text-xs mt-1">
                                Enter your 10-digit mobile number registered with PhonePe. We will send a payment notification directly to your phone.
                              </p>
                            </div>

                            <div className="space-y-3 max-w-md">
                              <div>
                                <label className="text-xs text-mute font-bold uppercase block mb-1">
                                  PhonePe Mobile Number
                                </label>
                                <div className="flex items-center gap-2">
                                  <span className="px-3 py-2.5 rounded-xl bg-base-900 border border-line text-xs font-bold text-slate-300">
                                    +91
                                  </span>
                                  <input
                                    type="tel"
                                    maxLength={10}
                                    placeholder="Enter 10-digit mobile (e.g. 9876543210)"
                                    value={collectPhone}
                                    onChange={(e) => setCollectPhone(e.target.value.replace(/\D/g, ''))}
                                    className="ax-input flex-1 !font-mono text-sm !bg-base-900 font-bold text-white tracking-wider"
                                  />
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => phonePeCollect.mutate()}
                                disabled={phonePeCollect.isPending || collectPhone.length !== 10}
                                className="w-full py-3 px-4 rounded-xl bg-[#5f259f] hover:bg-[#6f2fb8] disabled:opacity-40 text-white font-black text-xs uppercase tracking-wider transition shadow-lg active:scale-98 flex items-center justify-center gap-2"
                              >
                                {phonePeCollect.isPending ? (
                                  <>
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    <span>Sending Request to PhonePe…</span>
                                  </>
                                ) : (
                                  <span>📲 Send Payment Request (₹{activeDepositOrder.gatewayData.amountInr?.toLocaleString()})</span>
                                )}
                              </button>

                              {collectSentMsg && (
                                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs space-y-1">
                                  <div className="font-bold flex items-center gap-1.5">
                                    <span>✓</span>
                                    <span>{collectSentMsg}</span>
                                  </div>
                                  <p className="text-[11px] text-emerald-400/80">
                                    Please unlock your phone, tap the PhonePe push notification or check notifications in the PhonePe app, and approve payment.
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* TAB 3: PHONEPE WEB GATEWAY */}
                        {upiSubTab === 'gateway' && (
                          <div className="p-5 rounded-2xl bg-base-950 border border-line space-y-4">
                            <div>
                              <h4 className="text-sm font-black text-white flex items-center gap-2">
                                <span>PhonePe Web Checkout Gateway</span>
                                <span className="text-[9px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold">
                                  DIRECT PORTAL
                                </span>
                              </h4>
                              <p className="text-mute text-xs mt-1">
                                Open the interactive PhonePe Web Portal to complete your transaction with two-factor authorization.
                              </p>
                            </div>

                            <div className="p-4 rounded-xl bg-gradient-to-br from-[#5f259f]/20 to-base-900 border border-[#5f259f]/30 flex flex-col sm:flex-row items-center justify-between gap-4">
                              <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-[#5f259f] flex items-center justify-center text-white font-black text-2xl shadow-md">
                                  पे
                                </div>
                                <div>
                                  <div className="text-sm font-bold text-white">PhonePe Secure Checkout</div>
                                  <div className="text-xs text-mute">
                                    Payable Amount: <span className="font-bold text-emerald-400 font-mono">₹{activeDepositOrder.gatewayData.amountInr?.toLocaleString()} INR</span> (${activeDepositOrder.amount.toFixed(2)} USD)
                                  </div>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => setShowPhonePeGatewayModal(true)}
                                className="px-5 py-3 rounded-xl bg-[#5f259f] hover:bg-[#6f2fb8] text-white font-black text-xs uppercase tracking-wider transition shadow-lg active:scale-98"
                              >
                                Launch PhonePe Gateway →
                              </button>
                            </div>
                          </div>
                        )}

                        {/* TAB 4: VERIFY 12-DIGIT UTR */}
                        {upiSubTab === 'utr' && (
                          <div className="p-5 rounded-2xl bg-base-950 border border-line space-y-4">
                            <div>
                              <h4 className="text-sm font-black text-white flex items-center gap-2">
                                <span>Manual 12-Digit NPCI UTR Verification</span>
                                <span className="text-[9px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                                  BANK RECEIPT
                                </span>
                              </h4>
                              <p className="text-mute text-xs mt-1">
                                Already transferred money via PhonePe or your banking app? Enter the 12-digit UTR / UPI Ref ID from your payment receipt to verify and credit your Live balance.
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
                                  className="ax-input !font-mono text-sm !bg-base-900 font-bold text-white tracking-widest"
                                />
                                {utrError && (
                                  <div className="text-xs text-[#ff5447] mt-1 font-bold">{utrError}</div>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => verifyUtrMutation.mutate()}
                                disabled={verifyUtrMutation.isPending || utrInput.length !== 12}
                                className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-base-950 font-black text-xs uppercase tracking-wider transition shadow-lg active:scale-98 flex items-center justify-center gap-2"
                              >
                                {verifyUtrMutation.isPending ? (
                                  <>
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    <span>Verifying with NPCI Bank Network…</span>
                                  </>
                                ) : (
                                  <span>✓ Verify UTR & Credit ${activeDepositOrder.amount.toFixed(2)} USD</span>
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
                            className="w-full py-2.5 px-4 rounded-xl bg-base-900 hover:bg-[#ff5447]/15 text-[#ff5447] font-bold text-xs border border-[#ff5447]/30 transition active:scale-98 flex items-center justify-center gap-1.5"
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
                      <div className="bg-base-950 p-3.5 rounded-xl border border-line space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-mute">Bank:</span>
                          <span className="font-bold text-white">{activeDepositOrder.gatewayData.bankName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-mute">Beneficiary:</span>
                          <span className="font-bold text-white">{activeDepositOrder.gatewayData.beneficiaryName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-mute">Account Number:</span>
                          <span className="font-mono font-bold text-[#00c076]">{activeDepositOrder.gatewayData.accountNumber}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-mute">IFSC / Routing:</span>
                          <span className="font-mono font-bold text-white">{activeDepositOrder.gatewayData.ifsc}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-mute">Transfer Remark / Memo:</span>
                          <span className="font-mono font-bold text-amber-400">{activeDepositOrder.orderRef}</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold text-white block">
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

                  {/* If CARDS */}
                  {activeDepositOrder.gatewayData.type === 'card' && (
                    <div className="space-y-3">
                      <div className="p-3 bg-base-950 rounded-xl border border-line space-y-2">
                        <input placeholder="Cardholder Name" className="ax-input text-xs" />
                        <input placeholder="Card Number (16 digits)" className="ax-input text-xs font-mono" />
                        <div className="grid grid-cols-2 gap-2">
                          <input placeholder="MM / YY" className="ax-input text-xs font-mono" />
                          <input placeholder="CVV" type="password" maxLength={4} className="ax-input text-xs font-mono" />
                        </div>
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
                        className="flex-1 py-3 rounded-xl bg-[#00c076] hover:bg-[#00d684] text-base-950 font-black text-xs uppercase tracking-wider transition shadow-lg active:scale-98 disabled:opacity-50"
                      >
                        {submitProof.isPending ? 'Verifying Reference…' : 'I Have Paid / Submit Proof →'}
                      </button>
                    ) : (
                      <button
                        onClick={() => setDepStep('FORM')}
                        className="flex-1 py-2.5 rounded-xl bg-base-800 hover:bg-base-700 text-mute hover:text-white font-bold text-xs border border-line transition"
                      >
                        ← Back to Payment Methods
                      </button>
                    )}
                    {activeDepositOrder.gatewayData.type !== 'upi' && (
                      <button
                        onClick={() => setDepStep('FORM')}
                        className="px-4 py-3 rounded-xl bg-base-800 hover:bg-base-700 text-mute hover:text-white font-bold text-xs border border-line"
                      >
                        Back
                      </button>
                    )}
                  </div>

                  {/* Fast-Track Sandbox Button for Quick Testing */}
                  <div className="p-3 rounded-lg bg-base-950 border border-dashed border-[#00c076]/40 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>⚡ Sandbox Fast-Track</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#00c076]/20 text-[#00c076] font-bold">DEV TEST</span>
                      </div>
                      <div className="text-[10px] text-mute">Simulate instant blockchain/bank confirmation to credit real balance immediately.</div>
                    </div>
                    <button
                      onClick={() => fastTrackConfirm.mutate(activeDepositOrder.depositId)}
                      disabled={fastTrackConfirm.isPending}
                      className="px-3 py-1.5 rounded-lg bg-[#00c076]/20 hover:bg-[#00c076] text-[#00c076] hover:text-base-950 font-black text-[11px] transition whitespace-nowrap border border-[#00c076]/50"
                    >
                      {fastTrackConfirm.isPending ? 'Crediting…' : 'Simulate Confirm'}
                    </button>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* ── STEP 3: DEPOSIT CONFIRMATION / VERIFICATION SCREEN ─────── */}
          {depStep === 'CONFIRMED' && (
            <div className="max-w-xl mx-auto">
              <Card className="text-center py-8 px-6 space-y-4 border-[#00c076]/60 bg-gradient-to-b from-[#00c076]/5 to-transparent">
                <div className="w-16 h-16 rounded-full bg-[#00c076]/20 border-2 border-[#00c076] flex items-center justify-center mx-auto text-3xl text-[#00c076] animate-bounce">
                  ✓
                </div>

                <div>
                  <h2 className="text-xl font-black text-white">Payment Confirmed & Balance Credited!</h2>
                  <p className="text-xs text-mute mt-1">
                    Invoice <span className="text-white font-mono font-bold">#{activeDepositOrder?.orderRef}</span> has been confirmed on the banking network.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-base-950 border border-line text-left space-y-2.5 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-mute font-sans">Payment Method:</span>
                    <span className="font-bold text-white capitalize">{confirmedData?.app || activeDepositOrder?.method?.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-mute font-sans">Amount Credited:</span>
                    <span className="font-bold text-[#00c076] text-sm">
                      +${Number(confirmedData?.amount ?? activeDepositOrder?.amount ?? 0).toFixed(2)} USD
                      {confirmedData?.inrAmount && (
                        <span className="text-xs text-mute ml-1 font-normal font-sans">(₹{confirmedData.inrAmount.toLocaleString()} INR)</span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-mute font-sans">Credit Account:</span>
                    <span className="font-bold text-white">{selectedAccount?.accountNumber} ({selectedAccount?.accountType})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-mute font-sans">Verified UTR / Ref:</span>
                    <span className="text-amber-400 font-bold truncate max-w-[220px]">
                      {confirmedData?.utr || proofRef || 'AUTOCONFIRMED'}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-line flex justify-between items-center text-sm">
                    <span className="text-white font-bold font-sans">Updated Live Balance:</span>
                    <span className="font-black text-[#00c076] text-base">
                      {fmtMoney(confirmedData?.balance ?? (wallet?.balance ? wallet.balance + (activeDepositOrder?.amount ?? 0) : selectedAccount?.balance ?? 0))}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => nav('/trading')}
                    className="flex-1 py-3 rounded-xl bg-[#00c076] hover:bg-[#00d684] text-base-950 font-black text-xs uppercase tracking-wider transition shadow-lg active:scale-98"
                  >
                    Trade Now on Live Account →
                  </button>
                  <button
                    onClick={() => {
                      setDepStep('FORM');
                      setActiveDepositOrder(null);
                      setProofRef('');
                      setSelectedUpiApp('phonepe');
                      setConfirmedData(null);
                    }}
                    className="px-4 py-3 rounded-xl bg-base-800 hover:bg-base-700 text-white font-bold text-xs border border-line"
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
              <Card className="text-center py-8 px-6 space-y-4 border-[#ff5447]/60 bg-gradient-to-b from-[#ff5447]/5 to-transparent">
                <div className="w-16 h-16 rounded-full bg-[#ff5447]/20 border-2 border-[#ff5447] flex items-center justify-center mx-auto text-3xl text-[#ff5447]">
                  ✕
                </div>

                <div>
                  <h2 className="text-xl font-black text-white">Payment Failed or Cancelled</h2>
                  <p className="text-xs text-mute mt-1">
                    {failedData?.reason || 'The transaction was cancelled or declined by your bank/UPI app.'}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-base-950 border border-line text-left space-y-2.5 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-mute font-sans">Invoice Reference:</span>
                    <span className="font-bold text-white">#{activeDepositOrder?.orderRef}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-mute font-sans">Transaction Status:</span>
                    <span className="font-bold text-[#ff5447]">FAILED (No Funds Debited)</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#ff5447]/10 border border-[#ff5447]/30 text-[11px] text-[#ff5447] font-sans leading-relaxed">
                    🔒 <strong>Safe Balance Guarantee:</strong> Because payment failed, your live account balance was <strong>NOT updated</strong> and remains completely safe at <strong>{fmtMoney(failedData?.currentBalance ?? wallet?.balance ?? selectedAccount?.balance ?? 0)} USD</strong>.
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setDepStep('GATEWAY')}
                    className="flex-1 py-3 rounded-xl bg-base-800 hover:bg-base-700 text-white font-bold text-xs uppercase tracking-wider transition border border-line"
                  >
                    Try Again with PhonePe / GPay
                  </button>
                  <button
                    onClick={() => {
                      setDepStep('FORM');
                      setActiveDepositOrder(null);
                      setProofRef('');
                      setSelectedUpiApp('phonepe');
                      setFailedData(null);
                    }}
                    className="px-4 py-3 rounded-xl bg-[#00c076] hover:bg-[#00d684] text-base-950 font-black text-xs transition"
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
          {wdStep === 'FORM' && (
            <Card>
              <SectionTitle title="Request Real Money Withdrawal" right={<span className="text-[11px] text-[#00c076] font-bold">0% Fee</span>} />

              <div className="space-y-4 mt-3">
                {/* Available balance indicator */}
                <div className="p-3 bg-base-950 rounded-xl border border-line flex justify-between items-center">
                  <div>
                    <span className="text-[10px] text-mute font-bold uppercase block">Available for Withdrawal</span>
                    <span className="text-lg font-black font-mono text-[#00c076]">{fmtMoney(availableBalance)}</span>
                  </div>
                  <span className="text-xs text-mute font-mono">Min: $10.00</span>
                </div>

                {/* Amount presets */}
                <div>
                  <label className="text-xs font-bold text-white block mb-1.5">Withdrawal Amount (USD)</label>
                  <div className="flex gap-2 mb-2">
                    {[20, 50, 100, 250, 500].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setWdAmount(String(amt))}
                        className={clsx(
                          'py-1.5 px-2.5 rounded-lg text-xs font-mono font-bold border transition',
                          parsedWdAmt === amt
                            ? 'bg-amber-400 text-base-950 border-amber-400'
                            : 'bg-base-800 text-slate-300 border-line hover:border-slate-500'
                        )}
                      >
                        ${amt}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setWdAmount(String(Math.floor(availableBalance)))}
                      className="py-1.5 px-2 rounded-lg text-[10px] font-bold bg-base-800 text-slate-300 border border-line hover:text-white"
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
                  <label className="text-xs font-bold text-white block mb-1.5">Payout Method</label>
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
                          'p-3 rounded-xl border text-center transition',
                          wdMethod === m.id
                            ? 'bg-[#00c076]/15 border-[#00c076] text-white font-bold'
                            : 'bg-base-800/80 border-line text-mute hover:text-white'
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
                  <div className="space-y-2.5 p-3.5 bg-base-950 rounded-xl border border-line">
                    <span className="text-xs font-bold text-white uppercase block">Bank Account Details</span>
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
                  <div className="space-y-2.5 p-3.5 bg-base-950 rounded-xl border border-line">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white uppercase block">UPI / VPA Details</span>
                      <span className="text-[10px] text-[#00c076] font-mono font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00c076] animate-pulse" />
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
                      <span className="font-mono font-black text-[#00c076]">
                        ≈ ₹{Math.round(parsedWdAmt * liveInrRate).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                )}

                {wdMethod === 'crypto' && (
                  <div className="space-y-2.5 p-3.5 bg-base-950 rounded-xl border border-line">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-white uppercase">USDT Wallet Address</span>
                      <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-[#00c076]/20 text-[#00c076]">TRON (TRC20)</span>
                    </div>
                    <input
                      placeholder="Enter your USDT TRC20 destination address"
                      value={cryptoAddress}
                      onChange={(e) => setCryptoAddress(e.target.value)}
                      className="ax-input text-xs font-mono"
                    />
                    <p className="text-[10px] text-amber-300">
                      Ensure your wallet supports TRC20 USDT. Minimum payout: $10.00.
                    </p>
                  </div>
                )}

                <button
                  onClick={() => setWdStep('REVIEW')}
                  disabled={parsedWdAmt < 10 || parsedWdAmt > availableBalance}
                  className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-base-950 font-black text-xs uppercase tracking-wider transition shadow-lg disabled:opacity-50"
                >
                  Review & Request Withdrawal →
                </button>
              </div>
            </Card>
          )}

          {/* Review Step */}
          {wdStep === 'REVIEW' && (
            <Card className="border-amber-400/50">
              <SectionTitle title="Confirm Withdrawal Request" />

              <div className="space-y-3 my-4 p-4 rounded-xl bg-base-950 border border-line text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-mute">Debit Account:</span>
                  <span className="font-bold text-white">{selectedAccount?.accountNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-mute">Payout Method:</span>
                  <span className="font-bold text-white uppercase">{wdMethod}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-mute">Withdrawal Amount:</span>
                  <span className="font-bold text-amber-400 text-sm">{fmtMoney(parsedWdAmt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-mute">Platform Fee:</span>
                  <span className="font-bold text-[#00c076]">0% ($0.00 FREE)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-mute">Destination:</span>
                  <span className="font-bold text-white truncate max-w-[220px]">
                    {wdMethod === 'bank' ? `${bankName} (${bankAccNumber})` : wdMethod === 'upi' ? upiId : cryptoAddress}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-line">
                  <span className="text-mute">Estimated Arrival:</span>
                  <span className="text-slate-300 font-sans">15–60 minutes</span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-base-800 text-[11px] text-mute mb-4">
                ℹ️ The requested amount will be locked and protected from trading risk while under review.
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => requestWithdrawal.mutate()}
                  disabled={requestWithdrawal.isPending}
                  className="flex-1 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-base-950 font-black text-xs uppercase tracking-wider transition shadow-lg"
                >
                  {requestWithdrawal.isPending ? 'Submitting Request…' : 'Confirm & Submit Withdrawal'}
                </button>
                <button
                  onClick={() => setWdStep('FORM')}
                  className="px-4 py-3 rounded-xl bg-base-800 hover:bg-base-700 text-white font-bold text-xs border border-line"
                >
                  Back
                </button>
              </div>
            </Card>
          )}

          {/* Success Step */}
          {wdStep === 'SUCCESS' && (
            <Card className="text-center py-8 px-6 space-y-4 border-amber-400/60">
              <div className="w-16 h-16 rounded-full bg-amber-400/20 border-2 border-amber-400 flex items-center justify-center mx-auto text-2xl text-amber-400">
                ⏳
              </div>

              <div>
                <h2 className="text-lg font-black text-white">Withdrawal Request Received!</h2>
                <p className="text-xs text-mute mt-1">
                  Request #{lastWithdrawal?.id} is currently under compliance review.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-base-950 border border-line text-left space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-mute">Amount:</span>
                  <span className="font-bold text-white">{fmtMoney(lastWithdrawal?.amount ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-mute">Status:</span>
                  <span className="text-amber-400 font-bold uppercase">{lastWithdrawal?.status}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('transfers')}
                  className="flex-1 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-base-950 font-black text-xs uppercase tracking-wider transition"
                >
                  View Active Transfers
                </button>
                <button
                  onClick={() => {
                    setWdStep('FORM');
                    setLastWithdrawal(null);
                  }}
                  className="px-4 py-3 rounded-xl bg-base-800 hover:bg-base-700 text-white font-bold text-xs border border-line"
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
                      {['Amount', 'Method', 'Order / Proof Ref', 'Status', 'Date', 'Action'].map((h) => (
                        <th key={h} className="ax-th">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {depositsList.map((d) => (
                      <tr key={d.id} className="ax-row">
                        <td className="ax-td font-mono font-bold text-[#00c076]">{fmtMoney(d.amount)}</td>
                        <td className="ax-td uppercase text-mute font-bold">{d.provider.replace(/_/g, ' ')}</td>
                        <td className="ax-td font-mono text-[11px] text-slate-300 max-w-[220px] truncate">
                          {d.providerRef ?? '—'}
                        </td>
                        <td className="ax-td">
                          <span className={clsx(
                            'ax-tag',
                            d.status === 'COMPLETED' ? 'bg-[#00c076]/20 text-[#00c076]' :
                            d.status === 'PENDING' ? 'bg-amber-400/20 text-amber-400' : 'bg-red-500/20 text-red-400'
                          )}>
                            {d.status}
                          </span>
                        </td>
                        <td className="ax-td text-mute">{fmtTime(d.createdAt)}</td>
                        <td className="ax-td">
                          {d.status === 'PENDING' && (
                            <button
                              onClick={() => fastTrackConfirm.mutate(d.id)}
                              className="px-2 py-1 rounded bg-[#00c076]/20 hover:bg-[#00c076] text-[#00c076] hover:text-base-950 text-[10px] font-extrabold transition"
                            >
                              Fast Confirm
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
                        <td className="ax-td font-mono font-bold text-amber-400">{fmtMoney(w.amount)}</td>
                        <td className="ax-td uppercase text-mute font-bold">{w.method}</td>
                        <td className="ax-td">
                          <span className={clsx(
                            'ax-tag',
                            w.status === 'COMPLETED' || w.status === 'APPROVED' ? 'bg-[#00c076]/20 text-[#00c076]' :
                            w.status === 'REQUESTED' || w.status === 'UNDER_REVIEW' ? 'bg-amber-400/20 text-amber-400' : 'bg-red-500/20 text-red-400'
                          )}>
                            {w.status}
                          </span>
                        </td>
                        <td className="ax-td text-mute">{fmtTime(w.createdAt)}</td>
                        <td className="ax-td">
                          {(w.status === 'REQUESTED' || w.status === 'UNDER_REVIEW') && (
                            <button
                              onClick={() => cancelWithdrawal.mutate(w.id)}
                              className="px-2 py-1 rounded bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white text-[10px] font-extrabold transition"
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
                      <td className={clsx('ax-td ax-num font-bold text-right', Number(t.amount) >= 0 ? 'text-[#00c076]' : 'text-[#ff5447]')}>
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

      {/* ── PHONEPE SECURE WEB GATEWAY MODAL ───────────────────────── */}
      {showPhonePeGatewayModal && activeDepositOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-base-950 border border-purple-500/40 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-[#5f259f] to-[#421772] px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-[#5f259f] font-black text-xl shadow">
                  पे
                </div>
                <div>
                  <h3 className="font-black text-base tracking-tight leading-none">PhonePe Payment Gateway</h3>
                  <span className="text-[10px] text-purple-200 tracking-wider uppercase font-semibold">
                    NPCI Verified Merchant
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPhonePeGatewayModal(false);
                  setPhonePePin('');
                  setPhonePePinError(null);
                }}
                className="w-8 h-8 rounded-lg bg-black/20 hover:bg-black/40 flex items-center justify-center text-white text-sm font-bold transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {/* Payment Summary */}
              <div className="p-4 rounded-xl bg-base-900 border border-line space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-mute">Merchant:</span>
                  <span className="font-bold text-white">{activeDepositOrder.gatewayData.payeeName}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-mute">Order Reference:</span>
                  <span className="font-mono text-purple-300 font-bold">#{activeDepositOrder.orderRef}</span>
                </div>
                <div className="pt-2 border-t border-line flex justify-between items-center">
                  <span className="text-xs text-mute font-bold">Amount to Pay:</span>
                  <span className="text-xl font-black font-mono text-emerald-400">
                    ₹{activeDepositOrder.gatewayData.amountInr?.toLocaleString()} INR
                  </span>
                </div>
              </div>

              {/* UPI PIN Entry */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 block">
                  Enter 4 or 6-Digit UPI PIN to Authorize:
                </label>
                <div className="relative">
                  <input
                    type="password"
                    maxLength={6}
                    placeholder="• • • • • •"
                    value={phonePePin}
                    onChange={(e) => {
                      setPhonePePin(e.target.value.replace(/\D/g, ''));
                      setPhonePePinError(null);
                    }}
                    className="ax-input text-center !font-mono text-2xl !tracking-[0.4em] !bg-base-900 font-bold text-white"
                  />
                </div>
                {phonePePinError && (
                  <p className="text-xs text-[#ff5447] font-bold">{phonePePinError}</p>
                )}
                <p className="text-[10px] text-mute text-center">
                  🔒 PIN is securely transmitted via PhonePe end-to-end 256-bit banking encryption.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={() => phonePeAuthorize.mutate()}
                  disabled={phonePeAuthorize.isPending || phonePePin.length < 4}
                  className="w-full py-3.5 px-4 rounded-xl bg-[#5f259f] hover:bg-[#6f2fb8] disabled:opacity-40 text-white font-black text-sm uppercase tracking-wider transition shadow-[0_0_20px_rgba(95,37,159,0.3)] active:scale-98 flex items-center justify-center gap-2"
                >
                  {phonePeAuthorize.isPending ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span>Contacting Bank Server…</span>
                    </>
                  ) : (
                    <span>Confirm Payment ₹{activeDepositOrder.gatewayData.amountInr?.toLocaleString()} →</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowPhonePeGatewayModal(false);
                    setPhonePePin('');
                    setPhonePePinError(null);
                    failPayment.mutate('Payment cancelled in PhonePe Gateway');
                  }}
                  disabled={failPayment.isPending || phonePeAuthorize.isPending}
                  className="w-full py-2.5 px-4 rounded-xl bg-transparent hover:bg-rose-500/10 text-rose-400 font-bold text-xs transition"
                >
                  Cancel and Return to Cashier
                </button>
              </div>
            </div>
          </div>
        </div>
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
                <td className="ax-td ax-num font-bold text-[#00c076]">{fmtMoney(r.amount)}</td>
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
