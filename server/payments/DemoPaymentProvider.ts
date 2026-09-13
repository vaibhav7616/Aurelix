import { PaymentProvider, PaymentResult, CreatePaymentInput } from './PaymentProvider';
import { randomUUID } from 'crypto';

// DEMO provider — instantly completes deposits for development. No real money moves.
export class DemoPaymentProvider implements PaymentProvider {
  readonly name = 'demo';
  private store = new Map<string, PaymentResult>();
  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    const ref = `demo_${randomUUID().slice(0, 8)}`;
    const r: PaymentResult = { providerRef: ref, status: 'COMPLETED', raw: { ...input, simulated: true } };
    this.store.set(ref, r);
    return r;
  }
  async verifyPayment(providerRef: string): Promise<PaymentResult> {
    return this.store.get(providerRef) ?? { providerRef, status: 'PENDING' };
  }
  async getPaymentStatus(providerRef: string): Promise<PaymentResult> {
    return this.verifyPayment(providerRef);
  }
  async refundPayment(providerRef: string): Promise<PaymentResult> {
    const r: PaymentResult = { providerRef, status: 'COMPLETED', raw: { refunded: true, simulated: true } };
    this.store.set(providerRef, r);
    return r;
  }
}
