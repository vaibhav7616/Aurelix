import { env } from '../config/env';
import { DemoPaymentProvider } from './DemoPaymentProvider';
import { PaymentProvider } from './PaymentProvider';

let provider: PaymentProvider | null = null;
export function getPaymentProvider(): PaymentProvider {
  if (!provider) {
    // Future: switch on env.PAYMENT_PROVIDER for upi/card/crypto providers
    provider = new DemoPaymentProvider();
    void env;
  }
  return provider;
}
