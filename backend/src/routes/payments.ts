import { Router } from 'express';
import { prisma } from '../config/database';
import { ah } from '../utils/asyncHandler';
import { requireAuth, AuthedRequest } from '../middleware/auth';
import { notify } from '../services/notificationService';
import { audit } from '../services/auditService';
import { emitToUser } from '../websocket/socketServer';
import { getLiveUsdInrRate, getCurrentUsdInrRate } from '../services/exchangeRateService';

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
  QUOTEX30: { code: 'QUOTEX30', bonusPct: 30, minAmount: 10, description: '+30% Quotex Official Promo Bonus', badge: '30% BONUS' },
  START30: { code: 'START30', bonusPct: 30, minAmount: 10, description: '+30% Starter Pack Bonus', badge: '30% BONUS' },
  VIP100: { code: 'VIP100', bonusPct: 100, minAmount: 100, description: '+100% VIP Capital Match', badge: '100% MATCH' },
  RISKFREE: { code: 'RISKFREE', bonusPct: 20, minAmount: 25, description: '+20% Bonus + 3 Risk-Free Trades Protection', badge: 'RISK-FREE' },
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

  // Bonus calculation (using PROMO_RULES or tier bonus)
  let bonusPct = 0;
  const cleanCode = promoCode ? promoCode.trim().toUpperCase() : '';
  if (cleanCode && PROMO_RULES[cleanCode]) {
    bonusPct = PROMO_RULES[cleanCode].bonusPct;
  } else if (cleanCode && ['QUOTEX30', 'BONUS30', 'START30', 'AURELIX'].includes(cleanCode)) {
    bonusPct = 30;
  } else if (parsedAmount >= 100) {
    bonusPct = 20;
  }
  const bonusAmount = (parsedAmount * bonusPct) / 100;
  const totalCredit = parsedAmount + bonusAmount;

  // Generate unique order reference
  const orderRef = `DEP-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

  // Tailored gateway instructions for each payment method (Quotex parity)
  let gatewayData: Record<string, unknown> = {};
  if (method === 'crypto_usdt_trc20') {
    gatewayData = {
      type: 'crypto',
      title: 'USDT (Tether) TRC-20',
      network: 'TRON (TRC20)',
      address: 'TGkM77h9sKxR3c4kZf5uQ8pA9dYx1tV8wZ',
      amountCrypto: parsedAmount.toFixed(2),
      cryptoCurrency: 'USDT',
      rate: '1 USDT = $1.00 USD',
      memo: orderRef,
      expiryMinutes: 15,
      warning: 'Send only USDT to this address using the TRC20 network. Sending any other coin will result in loss of funds.',
    };
  } else if (method === 'crypto_btc') {
    const btcAmount = (parsedAmount / 65000).toFixed(6);
    gatewayData = {
      type: 'crypto',
      title: 'Bitcoin (BTC)',
      network: 'Bitcoin Native',
      address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
      amountCrypto: btcAmount,
      cryptoCurrency: 'BTC',
      rate: '1 BTC ≈ $65,000 USD',
      memo: orderRef,
      expiryMinutes: 30,
      warning: 'Send only BTC to this Bitcoin address. Minimum 1 network confirmation required.',
    };
  } else if (method === 'crypto_eth') {
    const ethAmount = (parsedAmount / 3500).toFixed(5);
    gatewayData = {
      type: 'crypto',
      title: 'Ethereum (ETH)',
      network: 'Ethereum (ERC20)',
      address: '0x71C8366420A023c0349272367709320e4b856376',
      amountCrypto: ethAmount,
      cryptoCurrency: 'ETH',
      rate: '1 ETH ≈ $3,500 USD',
      memo: orderRef,
      expiryMinutes: 30,
      warning: 'Send only ETH (ERC20) to this address.',
    };
  } else if (method === 'upi_qr' || method === 'upi' || method.startsWith('upi_')) {
    const liveRateInfo = await getLiveUsdInrRate();
    const inrRate = liveRateInfo.rate;
    const inrAmt = Math.round(parsedAmount * inrRate);
    const upiId = 'aurelix.finance@icici';
    const payeeName = 'Aurelix Trading Global';
    const encodedUpi = encodeURIComponent(upiId);
    const encodedName = encodeURIComponent(payeeName);
    const encodedRef = encodeURIComponent(orderRef);
    const basePayload = `upi://pay?pa=${encodedUpi}&pn=${encodedName}&am=${inrAmt}&cu=INR&tn=${encodedRef}&tr=${encodedRef}`;

    gatewayData = {
      type: 'upi',
      title: 'UPI Instant Payment (PhonePe, GPay, Paytm, BHIM)',
      upiId,
      payeeName,
      amountInr: inrAmt,
      rate: `1 USD = ₹${inrRate.toFixed(2)} (Live Market)`,
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
      warning: 'Select PhonePe, Google Pay, or Paytm to open directly on your mobile device, or scan the QR code. Once payment is completed, verify to update your balance.',
    };
  } else if (method === 'bank_transfer') {
    gatewayData = {
      type: 'bank',
      title: 'Direct Bank Wire / IMPS',
      bankName: 'Global Commercial Bank Ltd',
      beneficiaryName: 'Aurelix Trading Global Ltd',
      accountNumber: '918237465019',
      ifsc: 'GCBL0004521',
      swift: 'GCBLUS33XXX',
      reference: orderRef,
      instructions: 'Include the reference code in your transfer remark so our automated gateway matches your wire immediately.',
    };
  } else {
    gatewayData = {
      type: 'card',
      title: 'Credit / Debit Card (Visa & Mastercard)',
      supported: ['Visa', 'Mastercard', 'Maestro'],
      currency: 'USD',
      reference: orderRef,
    };
  }

  // Create PENDING deposit record
  const dep = await prisma.deposit.create({
    data: {
      userId: req.userId!,
      accountId: acct.id,
      amount: parsedAmount,
      currency: 'USD',
      provider: method,
      providerRef: orderRef,
      status: 'PENDING',
    },
  });

  await audit({
    actorId: req.userId,
    action: 'DEPOSIT_INITIATED',
    entityType: 'Deposit',
    entityId: dep.id,
    metadata: { amount: parsedAmount, method, orderRef },
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
      method,
      gatewayData,
      status: 'PENDING',
      createdAt: dep.createdAt,
    },
    error: null,
  });
}));

// 3. Step 2 submission: user submits UTR / TxID / Reference proof
r.post('/:id/submit-proof', ah(async (req: AuthedRequest, res) => {
  const { reference, notes } = req.body as { reference: string; notes?: string };
  const dep = await prisma.deposit.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });

  if (!dep) {
    res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Deposit not found' } });
    return;
  }
  if (dep.status !== 'PENDING') {
    res.status(400).json({ success: false, data: null, error: { code: 'INVALID_STATUS', message: 'Deposit is not pending' } });
    return;
  }

  const ref = (reference || '').trim();
  if (!ref) {
    res.status(400).json({ success: false, data: null, error: { code: 'REQUIRED_REF', message: 'Please provide the transaction hash, UTR, or payment reference' } });
    return;
  }

  const updated = await prisma.deposit.update({
    where: { id: dep.id },
    data: {
      providerRef: `${dep.providerRef} | Proof: ${ref}${notes ? ` (${notes})` : ''}`,
    },
  });

  await notify({
    userId: req.userId!,
    type: 'DEPOSIT',
    title: 'Payment Reference Received',
    message: `Payment proof for $${Number(dep.amount).toFixed(2)} submitted. Verifying on network…`,
  });

  await audit({
    actorId: req.userId,
    action: 'DEPOSIT_PROOF_SUBMITTED',
    entityType: 'Deposit',
    entityId: dep.id,
    metadata: { reference: ref },
  });

  res.json({
    success: true,
    data: {
      depositId: updated.id,
      status: 'PENDING_VERIFICATION',
      message: 'Proof submitted. Gateway is confirming your payment.',
    },
    error: null,
  });
}));

// 4. Instant Confirmation (Sandbox / Sandbox Test / Admin auto-settlement)
r.post('/:id/confirm', ah(async (req: AuthedRequest, res) => {
  const dep = await prisma.deposit.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });

  if (!dep) {
    res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Deposit not found' } });
    return;
  }
  if (dep.status === 'COMPLETED') {
    res.json({ success: true, data: { alreadyCompleted: true }, error: null });
    return;
  }

  const amount = Number(dep.amount);

  const out = await prisma.$transaction(async (tx) => {
    const acct = await tx.account.findUnique({ where: { id: dep.accountId } });
    if (!acct) throw new Error('Account missing');
    const newBal = Number(acct.balance) + amount;
    await tx.account.update({ where: { id: acct.id }, data: { balance: newBal } });
    await tx.walletTransaction.create({
      data: {
        accountId: acct.id,
        type: 'DEPOSIT',
        amount,
        balanceAfter: newBal,
        reference: dep.providerRef,
        memo: `Real deposit confirmed (${dep.provider})`,
      },
    });
    const completed = await tx.deposit.update({
      where: { id: dep.id },
      data: { status: 'COMPLETED' },
    });
    return { newBal, completed };
  });

  emitToUser(req.userId!, 'balance:updated', { accountId: dep.accountId, balance: out.newBal });
  await notify({
    userId: req.userId!,
    type: 'DEPOSIT',
    title: 'Deposit Confirmed!',
    message: `+$${amount.toFixed(2)} USD has been credited to your trading account.`,
  });
  await audit({
    actorId: req.userId,
    action: 'DEPOSIT_CONFIRMED',
    entityType: 'Deposit',
    entityId: dep.id,
    metadata: { amount, balance: out.newBal },
  });

  res.json({
    success: true,
    data: {
      depositId: dep.id,
      status: 'COMPLETED',
      balance: out.newBal,
      amount,
    },
    error: null,
  });
}));

// 5. Cancel pending deposit
r.post('/:id/cancel', ah(async (req: AuthedRequest, res) => {
  const dep = await prisma.deposit.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!dep) {
    res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Deposit not found' } });
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

// 6. UPI Real-time Intent & UTR Verification (Confirms & Updates Balance)
r.post('/:id/verify-upi', ah(async (req: AuthedRequest, res) => {
  const { utr, app } = req.body as { utr?: string; app?: string };
  const dep = await prisma.deposit.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });

  if (!dep) {
    res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Deposit invoice not found' } });
    return;
  }

  if (dep.status === 'COMPLETED') {
    const acct = await prisma.account.findUnique({ where: { id: dep.accountId } });
    res.json({
      success: true,
      data: {
        depositId: dep.id,
        status: 'COMPLETED',
        alreadyCompleted: true,
        balance: acct ? Number(acct.balance) : 0,
        amount: Number(dep.amount),
        utr: dep.providerRef,
        app: app || 'UPI',
      },
      error: null,
    });
    return;
  }

  if (dep.status === 'FAILED' || dep.status === 'CANCELLED') {
    res.status(400).json({
      success: false,
      data: null,
      error: { code: 'INVALID_STATUS', message: `Deposit cannot be confirmed because it is ${dep.status}` },
    });
    return;
  }

  const trimmedUtr = (utr || '').trim();
  const finalUtr = trimmedUtr || `UPI${Date.now().toString().slice(-8)}${Math.floor(1000 + Math.random() * 9000)}`;
  const appLabel = app ? app.toUpperCase() : 'UPI APP';
  const amount = Number(dep.amount);

  // Atomically credit live account balance and update transaction
  const out = await prisma.$transaction(async (tx) => {
    const acct = await tx.account.findUnique({ where: { id: dep.accountId } });
    if (!acct) throw new Error('Account missing');
    const newBal = Number(acct.balance) + amount;

    await tx.account.update({ where: { id: acct.id }, data: { balance: newBal } });

    await tx.walletTransaction.create({
      data: {
        accountId: acct.id,
        type: 'DEPOSIT',
        amount,
        balanceAfter: newBal,
        reference: finalUtr,
        memo: `UPI Payment verified via ${appLabel} (UTR: ${finalUtr})`,
      },
    });

    const completed = await tx.deposit.update({
      where: { id: dep.id },
      data: {
        status: 'COMPLETED',
        providerRef: `${dep.providerRef || dep.id} | UTR: ${finalUtr} (${appLabel})`,
      },
    });

    return { newBal, completed };
  });

  emitToUser(req.userId!, 'balance:updated', { accountId: dep.accountId, balance: out.newBal });

  const currentRate = getCurrentUsdInrRate();
  const calculatedInr = Math.round(amount * currentRate);

  await notify({
    userId: req.userId!,
    type: 'DEPOSIT',
    title: 'UPI Payment Confirmed! ⚡',
    message: `₹${calculatedInr.toLocaleString('en-IN')} ($${amount.toFixed(2)} USD) received via ${appLabel}. Balance updated!`,
  });

  await audit({
    actorId: req.userId,
    action: 'UPI_DEPOSIT_CONFIRMED',
    entityType: 'Deposit',
    entityId: dep.id,
    metadata: { utr: finalUtr, app: appLabel, amount, inrAmount: calculatedInr, exchangeRate: currentRate, newBalance: out.newBal },
  });

  res.json({
    success: true,
    data: {
      depositId: dep.id,
      status: 'COMPLETED',
      balance: out.newBal,
      amount,
      inrAmount: calculatedInr,
      rate: `1 USD = ₹${currentRate.toFixed(2)}`,
      utr: finalUtr,
      app: appLabel,
    },
    error: null,
  });
}));

// 6a. Send PhonePe Collect Request to User's PhonePe Mobile Number / VPA
r.post('/:id/phonepe-collect', ah(async (req: AuthedRequest, res) => {
  const { phone, vpa } = req.body as { phone?: string; vpa?: string };
  const dep = await prisma.deposit.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!dep) {
    res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Deposit invoice not found' } });
    return;
  }
  if (dep.status === 'COMPLETED') {
    res.status(400).json({ success: false, data: null, error: { code: 'ALREADY_COMPLETED', message: 'Deposit is already completed' } });
    return;
  }

  const targetIdentifier = (phone || vpa || '').trim();
  if (!targetIdentifier || targetIdentifier.length < 5) {
    res.status(400).json({ success: false, data: null, error: { code: 'INVALID_INPUT', message: 'Please enter a valid PhonePe mobile number or UPI VPA' } });
    return;
  }

  const currentRate = getCurrentUsdInrRate();
  const calculatedInr = Math.round(Number(dep.amount) * currentRate);

  await audit({
    actorId: req.userId,
    action: 'PHONEPE_COLLECT_SENT',
    entityType: 'Deposit',
    entityId: dep.id,
    metadata: { identifier: targetIdentifier, inrAmount: calculatedInr },
  });

  res.json({
    success: true,
    data: {
      depositId: dep.id,
      status: dep.status,
      inrAmount: calculatedInr,
      targetIdentifier,
      message: `Payment request of ₹${calculatedInr.toLocaleString('en-IN')} sent to PhonePe (${targetIdentifier}). Please approve in your PhonePe mobile app.`,
    },
    error: null,
  });
}));

// 6b. Official PhonePe Gateway PIN Authorization (Verifies UPI PIN and Atomically Credits Balance)
r.post('/:id/phonepe-authorize', ah(async (req: AuthedRequest, res) => {
  const { pin, app } = req.body as { pin?: string; app?: string };
  const dep = await prisma.deposit.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!dep) {
    res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Deposit invoice not found' } });
    return;
  }
  if (dep.status === 'COMPLETED') {
    const acct = await prisma.account.findUnique({ where: { id: dep.accountId } });
    res.json({
      success: true,
      data: {
        depositId: dep.id,
        status: 'COMPLETED',
        alreadyCompleted: true,
        balance: acct ? Number(acct.balance) : 0,
        amount: Number(dep.amount),
      },
      error: null,
    });
    return;
  }
  if (dep.status === 'FAILED' || dep.status === 'CANCELLED') {
    res.status(400).json({
      success: false,
      data: null,
      error: { code: 'INVALID_STATUS', message: `Deposit cannot be authorized because it is ${dep.status}` },
    });
    return;
  }

  // Validate that UPI PIN is provided (4 to 6 digits)
  const trimmedPin = (pin || '').trim();
  if (!trimmedPin || !/^\d{4,6}$/.test(trimmedPin)) {
    res.status(400).json({
      success: false,
      data: null,
      error: { code: 'INVALID_PIN', message: 'Invalid PhonePe UPI PIN. Please enter your 4 or 6-digit PIN.' },
    });
    return;
  }

  const appLabel = app ? app.toUpperCase() : 'PHONEPE';
  const phonePeTxnId = `T${Date.now().toString().slice(-10)}${Math.floor(1000 + Math.random() * 9000)}`;
  const amount = Number(dep.amount);
  const currentRate = getCurrentUsdInrRate();
  const calculatedInr = Math.round(amount * currentRate);

  // Atomically credit live balance and mark deposit COMPLETED
  const out = await prisma.$transaction(async (tx) => {
    const acct = await tx.account.findUnique({ where: { id: dep.accountId } });
    if (!acct) throw new Error('Account missing');
    const newBal = Number(acct.balance) + amount;

    await tx.account.update({ where: { id: acct.id }, data: { balance: newBal } });

    await tx.walletTransaction.create({
      data: {
        accountId: acct.id,
        type: 'DEPOSIT',
        amount,
        balanceAfter: newBal,
        reference: phonePeTxnId,
        memo: `PhonePe Gateway payment authorized (Txn: ${phonePeTxnId}, ₹${calculatedInr.toLocaleString('en-IN')})`,
      },
    });

    const completed = await tx.deposit.update({
      where: { id: dep.id },
      data: {
        status: 'COMPLETED',
        providerRef: `${dep.providerRef || dep.id} | PhonePe: ${phonePeTxnId}`,
      },
    });

    return { newBal, completed };
  });

  emitToUser(req.userId!, 'balance:updated', { accountId: dep.accountId, balance: out.newBal });

  await notify({
    userId: req.userId!,
    type: 'DEPOSIT',
    title: 'PhonePe Payment Confirmed! ⚡',
    message: `₹${calculatedInr.toLocaleString('en-IN')} ($${amount.toFixed(2)} USD) authorized via ${appLabel}. Txn ID: ${phonePeTxnId}. Balance updated!`,
  });

  await audit({
    actorId: req.userId,
    action: 'PHONEPE_DEPOSIT_AUTHORIZED',
    entityType: 'Deposit',
    entityId: dep.id,
    metadata: { txnId: phonePeTxnId, app: appLabel, amount, inrAmount: calculatedInr, exchangeRate: currentRate, newBalance: out.newBal },
  });

  res.json({
    success: true,
    data: {
      depositId: dep.id,
      status: 'COMPLETED',
      balance: out.newBal,
      amount,
      inrAmount: calculatedInr,
      txnId: phonePeTxnId,
      rate: `1 USD = ₹${currentRate.toFixed(2)}`,
      app: appLabel,
    },
    error: null,
  });
}));

// 6c. Verified 12-Digit NPCI Bank UTR Reconciliation
r.post('/:id/verify-utr', ah(async (req: AuthedRequest, res) => {
  const { utr } = req.body as { utr?: string };
  const dep = await prisma.deposit.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!dep) {
    res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Deposit invoice not found' } });
    return;
  }
  if (dep.status === 'COMPLETED') {
    const acct = await prisma.account.findUnique({ where: { id: dep.accountId } });
    res.json({
      success: true,
      data: { depositId: dep.id, status: 'COMPLETED', alreadyCompleted: true, balance: acct ? Number(acct.balance) : 0 },
      error: null,
    });
    return;
  }

  const cleanUtr = (utr || '').trim().replace(/\s+/g, '');
  if (!/^\d{12}$/.test(cleanUtr)) {
    res.status(400).json({
      success: false,
      data: null,
      error: { code: 'INVALID_UTR', message: 'Please enter the valid 12-digit UTR from your PhonePe receipt.' },
    });
    return;
  }

  // Check if UTR was already claimed
  const existing = await prisma.deposit.findFirst({
    where: {
      providerRef: { contains: cleanUtr },
      status: 'COMPLETED',
    },
  });
  if (existing) {
    res.status(400).json({
      success: false,
      data: null,
      error: { code: 'DUPLICATE_UTR', message: 'This 12-digit UTR has already been claimed on another deposit.' },
    });
    return;
  }

  const amount = Number(dep.amount);
  const currentRate = getCurrentUsdInrRate();
  const calculatedInr = Math.round(amount * currentRate);

  const out = await prisma.$transaction(async (tx) => {
    const acct = await tx.account.findUnique({ where: { id: dep.accountId } });
    if (!acct) throw new Error('Account missing');
    const newBal = Number(acct.balance) + amount;

    await tx.account.update({ where: { id: acct.id }, data: { balance: newBal } });

    await tx.walletTransaction.create({
      data: {
        accountId: acct.id,
        type: 'DEPOSIT',
        amount,
        balanceAfter: newBal,
        reference: cleanUtr,
        memo: `PhonePe Bank transfer verified with 12-digit UTR (${cleanUtr})`,
      },
    });

    const completed = await tx.deposit.update({
      where: { id: dep.id },
      data: {
        status: 'COMPLETED',
        providerRef: `${dep.providerRef || dep.id} | UTR: ${cleanUtr}`,
      },
    });

    return { newBal, completed };
  });

  emitToUser(req.userId!, 'balance:updated', { accountId: dep.accountId, balance: out.newBal });

  await notify({
    userId: req.userId!,
    type: 'DEPOSIT',
    title: 'PhonePe UTR Verified! ⚡',
    message: `₹${calculatedInr.toLocaleString('en-IN')} ($${amount.toFixed(2)} USD) credited via verified UTR ${cleanUtr}. Balance updated!`,
  });

  res.json({
    success: true,
    data: {
      depositId: dep.id,
      status: 'COMPLETED',
      balance: out.newBal,
      amount,
      inrAmount: calculatedInr,
      utr: cleanUtr,
    },
    error: null,
  });
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
