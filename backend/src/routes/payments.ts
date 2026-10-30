import { Router, Response } from 'express';
import { prisma } from '../config/database';
import { ah } from '../utils/asyncHandler';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { notify } from '../services/notificationService';
import { audit } from '../services/auditService';
import { emitToUser } from '../websocket/socketServer';
import { getLiveUsdInrRate, getCurrentUsdInrRate } from '../services/exchangeRateService';
import { depositSettings, availableMethods, normalizeMethod, type DepositMethod } from '../payments/depositMethods';
import { getProvider } from '../services/marketService';

const r = Router();

export interface PromoRule {
  code: string;
  bonusPct: number;
  minAmount: number;
  description: string;
  badge: string;
}

export const PROMO_RULES: Record<string, PromoRule> = {
  WELCOME50: { code: 'WELCOME50', bonusPct: 50, minAmount: 15, description: '+50% Welcome Bonus on Trading Capital', badge: '50% BONUS' },
  BONUS30: { code: 'BONUS30', bonusPct: 30, minAmount: 10, description: '+30% Deposit Booster', badge: '30% BONUS' },
  START30: { code: 'START30', bonusPct: 30, minAmount: 10, description: '+30% Starter Pack Bonus', badge: '30% BONUS' },
  VIP100: { code: 'VIP100', bonusPct: 100, minAmount: 100, description: '+100% VIP Capital Match', badge: '100% MATCH' },
  RISKFREE: { code: 'RISKFREE', bonusPct: 20, minAmount: 25, description: '+20% Deposit Bonus', badge: '20% BONUS' },
};

// Live exchange rate endpoint (accessible for cashier previews and conversion calculators)
r.get('/exchange-rate', ah(async (_req, res) => {
  const rateInfo = await getLiveUsdInrRate();
  res.json({ success: true, data: rateInfo, error: null });
}));

// Promo code validator for Cashier
r.post('/validate-promo', ah(async (req, res) => {
  const { code, amount } = req.body as { code?: string; amount?: number };
  const cleanCode = String(code ?? '').trim().toUpperCase();
  const parsedAmt = Number(amount ?? 0);

  const promo = PROMO_RULES[cleanCode];
  if (!promo) {
    res.status(400).json({
      success: false,
      data: null,
      error: { code: 'INVALID_PROMO', message: `Promo code "${cleanCode}" is invalid or expired.` },
    });
    return;
  }

  if (parsedAmt > 0 && parsedAmt < promo.minAmount) {
    res.status(400).json({
      success: false,
      data: null,
      error: { code: 'MIN_AMOUNT_NOT_MET', message: `Promo code ${promo.code} requires a minimum deposit of $${promo.minAmount.toFixed(2)}.` },
    });
    return;
  }

  const bonusAmount = (parsedAmt * promo.bonusPct) / 100;
  const totalCapital = parsedAmt + bonusAmount;

  res.json({
    success: true,
    data: {
      valid: true,
      code: promo.code,
      bonusPct: promo.bonusPct,
      minAmount: promo.minAmount,
      description: promo.description,
      badge: promo.badge,
      bonusAmount: Math.round(bonusAmount * 100) / 100,
      totalCapital: Math.round(totalCapital * 100) / 100,
      turnoverRequired: Math.round(bonusAmount * 35),
    },
    error: null,
  });
}));

r.use(requireAuth);

// Deposit methods that are configured and can be used right now
r.get('/methods', ah(async (_req, res) => {
  res.json({ success: true, data: { methods: availableMethods(depositSettings()) }, error: null });
}));

// 1. List user's deposits
r.get('/', ah(async (req: AuthedRequest, res) => {
  const deps = await prisma.deposit.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ success: true, data: deps, error: null });
}));

// 2. Initialize a multi-step deposit order (Step 1 -> Step 2)
r.post('/create', ah(async (req: AuthedRequest, res) => {
  const { accountId, amount, method, promoCode } = req.body as {
    accountId: string;
    amount: number;
    method: string;
    promoCode?: string;
  };

  const parsedAmount = parseFloat(String(amount));
  if (!Number.isFinite(parsedAmount) || parsedAmount < 10) {
    res.status(400).json({ success: false, data: null, error: { code: 'INVALID_AMOUNT', message: 'Minimum deposit amount is $10.00' } });
    return;
  }

  const acct = await prisma.account.findFirst({ where: { id: accountId, userId: req.userId! } });
  if (!acct) {
    res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Account not found' } });
    return;
  }
  if (acct.accountType !== 'LIVE') {
    res.status(422).json({ success: false, data: null, error: { code: 'LIVE_ONLY', message: 'Deposits go to your live account — demo accounts are refilled for free' } });
    return;
  }
  const settings = depositSettings();
  const chosen = normalizeMethod(String(method ?? ''));
  if (!availableMethods(settings).includes(chosen as DepositMethod)) {
    res.status(400).json({ success: false, data: null, error: { code: 'METHOD_UNAVAILABLE', message: 'This deposit method is not available right now' } });
    return;
  }

  // Bonus calculation (using PROMO_RULES or tier bonus)
  let bonusPct = 0;
  const cleanCode = promoCode ? promoCode.trim().toUpperCase() : '';
  if (cleanCode && PROMO_RULES[cleanCode]) {
    bonusPct = PROMO_RULES[cleanCode].bonusPct;
  } else if (cleanCode && ['BONUS30', 'START30', 'AURELIX'].includes(cleanCode)) {
    bonusPct = 30;
  } else if (parsedAmount >= 100) {
    bonusPct = 20;
  }
  const bonusAmount = (parsedAmount * bonusPct) / 100;
  const totalCredit = parsedAmount + bonusAmount;

  // Generate unique order reference
  const orderRef = `DEP-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

  // Payment instructions — destination details come from System settings (see payments/depositMethods.ts)
  let gatewayData: Record<string, unknown>;
  if (chosen.startsWith('crypto_')) {
    const coin = chosen === 'crypto_btc' ? { title: 'Bitcoin (BTC)', network: 'Bitcoin', cur: 'BTC', sym: 'BTC/USD', dp: 8 }
      : chosen === 'crypto_eth' ? { title: 'Ethereum (ETH)', network: 'Ethereum (ERC20)', cur: 'ETH', sym: 'ETH/USD', dp: 6 }
      : { title: 'USDT (Tether) TRC-20', network: 'TRON (TRC20)', cur: 'USDT', sym: null, dp: 2 };
    // USDT is pegged 1:1; BTC/ETH are converted at the live market price
    const px = coin.sym ? (await getProvider().getTick(coin.sym).catch(() => null))?.mid : 1;
    if (!px) {
      res.status(503).json({ success: false, data: null, error: { code: 'RATE_UNAVAILABLE', message: `${coin.cur} price is unavailable right now — try again shortly` } });
      return;
    }
    gatewayData = {
      type: 'crypto',
      title: coin.title,
      network: coin.network,
      address: settings[`deposit.${chosen.replace('_', '.')}`],
      amountCrypto: (parsedAmount / px).toFixed(coin.dp),
      cryptoCurrency: coin.cur,
      rate: `1 ${coin.cur} = $${px.toLocaleString('en-US', { maximumFractionDigits: 2 })} USD`,
      memo: orderRef,
      expiryMinutes: 30,
      warning: `Send only ${coin.cur} on the ${coin.network} network to this address. Sending another coin or network will lose the funds. After sending, submit the transaction hash — your balance is credited once the payment is confirmed.`,
    };
  } else if (chosen === 'upi_qr') {
    const liveRateInfo = await getLiveUsdInrRate();
    const inrRate = liveRateInfo.rate;
    const inrAmt = Math.round(parsedAmount * inrRate);
    const upiId = settings['deposit.upi.vpa'];
    const payeeName = settings['deposit.upi.payee'];
    const encodedUpi = encodeURIComponent(upiId);
    const encodedName = encodeURIComponent(payeeName);
    const encodedRef = encodeURIComponent(orderRef);
    const basePayload = `upi://pay?pa=${encodedUpi}&pn=${encodedName}&am=${inrAmt}&cu=INR&tn=${encodedRef}&tr=${encodedRef}`;
    gatewayData = {
      type: 'upi',
      title: 'UPI (PhonePe, Google Pay, Paytm, BHIM)',
      upiId,
      payeeName,
      amountInr: inrAmt,
      rate: `1 USD = ₹${inrRate.toFixed(2)}`,
      exchangeRate: inrRate,
      exchangeRateDate: liveRateInfo.date,
      exchangeRateSource: liveRateInfo.source,
      qrPayload: basePayload,
      memo: orderRef,
      expiryMinutes: 15,
      intents: {
        phonepe: `phonepe://pay?pa=${encodedUpi}&pn=${encodedName}&am=${inrAmt}&cu=INR&tn=${encodedRef}&tr=${encodedRef}`,
        gpay: `tez://upi/pay?pa=${encodedUpi}&pn=${encodedName}&am=${inrAmt}&cu=INR&tn=${encodedRef}&tr=${encodedRef}`,
        paytm: `paytmmp://pay?pa=${encodedUpi}&pn=${encodedName}&am=${inrAmt}&cu=INR&tn=${encodedRef}&tr=${encodedRef}`,
        bhim: basePayload,
        generic: basePayload,
      },
      warning: `Pay exactly ₹${inrAmt.toLocaleString('en-IN')} by scanning the QR or opening your UPI app, then enter the 12-digit UTR from the app. Your balance is credited once the payment is confirmed.`,
    };
  } else {
    gatewayData = {
      type: 'bank',
      title: 'Bank transfer (IMPS / NEFT / RTGS)',
      bankName: settings['deposit.bank.name'],
      beneficiaryName: settings['deposit.bank.beneficiary'],
      accountNumber: settings['deposit.bank.account'],
      ifsc: settings['deposit.bank.ifsc'],
      ...(settings['deposit.bank.swift'] ? { swift: settings['deposit.bank.swift'] } : {}),
      reference: orderRef,
      instructions: 'Put the reference code in the transfer remarks, then submit the bank reference (UTR). Your balance is credited once the payment is confirmed.',
    };
  }

  // Create PENDING deposit record
  const dep = await prisma.deposit.create({
    data: {
      userId: req.userId!,
      accountId: acct.id,
      amount: parsedAmount,
      currency: 'USD',
      provider: chosen,
      providerRef: orderRef,
      status: 'PENDING',
    },
  });

  await audit({
    actorId: req.userId,
    action: 'DEPOSIT_INITIATED',
    entityType: 'Deposit',
    entityId: dep.id,
    metadata: { amount: parsedAmount, method: chosen, orderRef },
  });

  res.status(201).json({
    success: true,
    data: {
      depositId: dep.id,
      orderRef,
      amount: parsedAmount,
      bonusPct,
      bonusAmount,
      totalCredit,
      method: chosen,
      gatewayData,
      status: 'PENDING',
      createdAt: dep.createdAt,
    },
    error: null,
  });
}));

// 3. User submits the payment reference (UTR / tx hash / bank reference).
// This NEVER credits the balance: the deposit stays PENDING until an admin has checked the
// money actually arrived (admin → Deposits → approve). Shared by submit-proof, verify-utr, verify-upi.
async function recordProof(req: AuthedRequest, res: Response, reference: string, kind: string) {
  const dep = await prisma.deposit.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!dep) { res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Deposit not found' } }); return; }
  if (dep.status !== 'PENDING') { res.status(400).json({ success: false, data: null, error: { code: 'INVALID_STATUS', message: `Deposit is ${dep.status.toLowerCase()}` } }); return; }
  if (dep.proofRef) { res.status(409).json({ success: false, data: null, error: { code: 'PROOF_EXISTS', message: 'A payment reference was already submitted for this deposit' } }); return; }
  try {
    // conditional: only a PENDING deposit without proof can take this reference
    const n = await prisma.deposit.updateMany({ where: { id: dep.id, status: 'PENDING', proofRef: null }, data: { proofRef: reference } });
    if (!n.count) { res.status(409).json({ success: false, data: null, error: { code: 'INVALID_STATUS', message: 'Deposit changed — refresh and try again' } }); return; }
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') {
      res.status(409).json({ success: false, data: null, error: { code: 'DUPLICATE_REFERENCE', message: 'This payment reference was already used for another deposit' } });
      return;
    }
    throw e;
  }
  await notify({ userId: req.userId!, type: 'DEPOSIT', title: 'Payment reference received', message: `$${Number(dep.amount).toFixed(2)} deposit — we are verifying your payment. Your balance is credited once it is confirmed.` });
  await audit({ actorId: req.userId, action: 'DEPOSIT_PROOF_SUBMITTED', entityType: 'Deposit', entityId: dep.id, metadata: { reference, kind } });
  res.json({ success: true, data: { depositId: dep.id, status: 'PENDING_VERIFICATION', utr: reference, reference }, error: null });
}

r.post('/:id/submit-proof', ah(async (req: AuthedRequest, res) => {
  const ref = String((req.body as { reference?: string }).reference ?? '').trim();
  if (ref.length < 6 || ref.length > 128) {
    res.status(400).json({ success: false, data: null, error: { code: 'REQUIRED_REF', message: 'Enter the transaction hash, UTR or bank reference of your payment' } });
    return;
  }
  await recordProof(req, res, ref, 'reference');
}));

// UPI: the 12-digit UTR from the user's banking app
const verifyUtr = ah(async (req: AuthedRequest, res) => {
  const utr = String((req.body as { utr?: string }).utr ?? '').replace(/\s+/g, '');
  if (!/^\d{12}$/.test(utr)) {
    res.status(400).json({ success: false, data: null, error: { code: 'INVALID_UTR', message: 'Enter the 12-digit UTR / reference number from your UPI app' } });
    return;
  }
  await recordProof(req, res, utr, 'utr');
});
r.post('/:id/verify-utr', verifyUtr);
r.post('/:id/verify-upi', verifyUtr);

// 5. Cancel pending deposit
r.post('/:id/cancel', ah(async (req: AuthedRequest, res) => {
  const dep = await prisma.deposit.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!dep) {
    res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Deposit not found' } });
    return;
  }
  if (dep.proofRef) {
    res.status(400).json({ success: false, data: null, error: { code: 'UNDER_REVIEW', message: 'Payment reference already submitted — this deposit is being verified' } });
    return;
  }
  if (dep.status === 'COMPLETED') {
    res.status(400).json({ success: false, data: null, error: { code: 'ALREADY_COMPLETED', message: 'Completed deposits cannot be cancelled' } });
    return;
  }

  const updated = await prisma.deposit.update({
    where: { id: dep.id },
    data: { status: 'CANCELLED' },
  });

  res.json({ success: true, data: updated, error: null });
}));

// 7. UPI Payment Failure / Rejection (Balance is NOT updated)
r.post('/:id/fail', ah(async (req: AuthedRequest, res) => {
  const { reason, app } = req.body as { reason?: string; app?: string };
  const dep = await prisma.deposit.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });

  if (!dep) {
    res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Deposit invoice not found' } });
    return;
  }

  if (dep.proofRef) {
    res.status(400).json({ success: false, data: null, error: { code: 'UNDER_REVIEW', message: 'Payment reference already submitted — this deposit is being verified' } });
    return;
  }
  if (dep.status === 'COMPLETED') {
    res.status(400).json({ success: false, data: null, error: { code: 'ALREADY_COMPLETED', message: 'Completed deposits cannot be marked as failed' } });
    return;
  }

  const updated = await prisma.deposit.update({
    where: { id: dep.id },
    data: {
      status: 'FAILED',
      providerRef: `${dep.providerRef || ''} | FAILED: ${reason || 'Payment cancelled or declined by user/bank'}`,
    },
  });

  // CRITICAL: Account balance is NOT credited or modified
  const currentAcct = await prisma.account.findUnique({ where: { id: dep.accountId } });

  await notify({
    userId: req.userId!,
    type: 'DEPOSIT',
    title: 'UPI Deposit Failed',
    message: `Payment of $${Number(dep.amount).toFixed(2)} was cancelled or declined. Your account balance was not modified.`,
  });

  await audit({
    actorId: req.userId,
    action: 'UPI_DEPOSIT_FAILED',
    entityType: 'Deposit',
    entityId: dep.id,
    metadata: { reason, app, depositId: dep.id },
  });

  res.json({
    success: true,
    data: {
      depositId: updated.id,
      status: 'FAILED',
      message: 'Payment failed. Account balance was not modified.',
      currentBalance: currentAcct ? Number(currentAcct.balance) : 0,
      reason: reason || 'Transaction declined by bank or cancelled',
    },
    error: null,
  });
}));

// 8. Check Deposit Status
r.get('/:id/status', ah(async (req: AuthedRequest, res) => {
  const dep = await prisma.deposit.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!dep) {
    res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Deposit not found' } });
    return;
  }
  const acct = await prisma.account.findUnique({ where: { id: dep.accountId } });
  res.json({
    success: true,
    data: {
      depositId: dep.id,
      status: dep.status,
      amount: Number(dep.amount),
      provider: dep.provider,
      providerRef: dep.providerRef,
      balance: acct ? Number(acct.balance) : 0,
    },
    error: null,
  });
}));

export default r;
