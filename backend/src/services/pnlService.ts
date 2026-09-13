// PnlCalculationService — single source of truth for P/L math.
export interface PnlInput {
  side: 'BUY' | 'SELL';
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  feeBps?: number; // applied on notional at open+close estimate
}

export function grossPnl({ side, entryPrice, currentPrice, quantity }: PnlInput): number {
  const diff = side === 'BUY' ? currentPrice - entryPrice : entryPrice - currentPrice;
  return diff * quantity;
}

export function feeFor(amount: number, feeBps: number): number {
  return (amount * feeBps) / 10_000;
}

/** Net P/L after round-trip fees (open fee + estimated close fee). */
export function netPnl(input: PnlInput): { gross: number; fee: number; net: number } {
  const gross = grossPnl(input);
  const bps = input.feeBps ?? 0;
  const notional = input.currentPrice * input.quantity;
  const fee = feeFor(notional, bps);
  return { gross, fee, net: gross - fee };
}

export function exceedsSlTp(params: {
  side: 'BUY' | 'SELL';
  currentPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
}): 'SL' | 'TP' | null {
  const { side, currentPrice, stopLoss, takeProfit } = params;
  if (side === 'BUY') {
    if (stopLoss != null && currentPrice <= stopLoss) return 'SL';
    if (takeProfit != null && currentPrice >= takeProfit) return 'TP';
  } else {
    if (stopLoss != null && currentPrice >= stopLoss) return 'SL';
    if (takeProfit != null && currentPrice <= takeProfit) return 'TP';
  }
  return null;
}
