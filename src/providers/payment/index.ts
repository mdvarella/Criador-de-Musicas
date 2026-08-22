import 'server-only';
import { serverEnv } from '@/lib/env';
import { getSettings } from '@/services/settings-service';
import { MercadoPagoProvider } from './mercadopago-provider';
import { MockPaymentProvider } from './mock-provider';
import type { PaymentProvider } from './types';

export type {
  CreatePaymentInput,
  PaymentMethodKind,
  PaymentProvider,
  PaymentResult,
  WebhookVerification,
} from './types';
export { MercadoPagoProvider, mapMercadoPagoStatus } from './mercadopago-provider';
export { MockPaymentProvider } from './mock-provider';

export async function getPaymentProvider(): Promise<PaymentProvider> {
  const settings = await getSettings();

  if (serverEnv().USE_MOCK_PROVIDERS || settings.active_payment_provider === 'mock') {
    return new MockPaymentProvider();
  }

  switch (settings.active_payment_provider) {
    case 'mercadopago':
      return new MercadoPagoProvider();
    default:
      throw new Error(`PaymentProvider desconhecido: ${settings.active_payment_provider}`);
  }
}
