import { describe, it, expect } from 'vitest';
import { grossPnl, netPnl, exceedsSlTp, feeFor } from '../src/services/pnlService';

describe('PnlCalculationService', () => {
  it('BUY profits when price rises', () => {
    expect(grossPnl({ side: 'BUY', entryPrice: 100, currentPrice: 110, quantity: 2 })).toBeCloseTo(20);
  });
  it('BUY loses when price falls', () => {
    expect(grossPnl({ side: 'BUY', entryPrice: 100, currentPrice: 90, quantity: 2 })).toBeCloseTo(-20);
  });
  it('SELL profits when price falls', () => {
    expect(grossPnl({ side: 'SELL', entryPrice: 100, currentPrice: 90, quantity: 2 })).toBeCloseTo(20);
  });
  it('SELL loses when price rises', () => {
    expect(grossPnl({ side: 'SELL', entryPrice: 100, currentPrice: 110, quantity: 2 })).toBeCloseTo(-20);
  });
  it('fees reduce net pnl', () => {
    const r = netPnl({ side: 'BUY', entryPrice: 100, currentPrice: 110, quantity: 1, feeBps: 100 });
    expect(r.fee).toBeCloseTo(1.1);
    expect(r.net).toBeCloseTo(8.9);
  });
  it('feeFor computes bps correctly', () => {
    expect(feeFor(10000, 10)).toBeCloseTo(10);
  });
  it('detects SL/TP for BUY', () => {
    expect(exceedsSlTp({ side: 'BUY', currentPrice: 90, stopLoss: 95, takeProfit: 120 })).toBe('SL');
    expect(exceedsSlTp({ side: 'BUY', currentPrice: 125, stopLoss: 95, takeProfit: 120 })).toBe('TP');
    expect(exceedsSlTp({ side: 'BUY', currentPrice: 100, stopLoss: 95, takeProfit: 120 })).toBeNull();
  });
  it('detects SL/TP for SELL', () => {
    expect(exceedsSlTp({ side: 'SELL', currentPrice: 130, stopLoss: 125, takeProfit: 90 })).toBe('SL');
    expect(exceedsSlTp({ side: 'SELL', currentPrice: 85, stopLoss: 125, takeProfit: 90 })).toBe('TP');
    expect(exceedsSlTp({ side: 'SELL', currentPrice: 100, stopLoss: 125, takeProfit: 90 })).toBeNull();
  });
});
