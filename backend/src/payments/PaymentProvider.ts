// PaymentProvider abstraction — demo impl today; UPI/cards/crypto later via same interface.
export interface CreatePaymentInput {
  userId: string;
  accountId: string;
  amount: number;
  currency: string;
  method?: string;
}
export interface PaymentResult {
  providerRef: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  raw?: Record<string, unknown>;
}
export interface PaymentProvider {
  readonly name: string;
  createPayment(input: CreatePaymentInput): Promise<PaymentResult>;
  verifyPayment(providerRef: string): Promise<PaymentResult>;
  getPaymentStatus(providerRef: string): Promise<PaymentResult>;
  refundPayment(providerRef: string, amount?: number): Promise<PaymentResult>;
}
