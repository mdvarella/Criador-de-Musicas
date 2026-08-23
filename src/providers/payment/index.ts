import 'server-only';
import { serverEnv } from '@/lib/env';
import { getSettings } from '@/services/settings-service';
import { logProviderChoice } from '../resolution-log';
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

  if (serverEnv().USE_MOCK_PROVIDERS) {
    logProviderChoice('payment', 'mock', 'USE_MOCK_PROVIDERS');
    return new MockPaymentProvider();
  }

  switch (settings.active_payment_provider) {
    case 'mock':
      logProviderChoice('payment', 'mock', 'configuração active_*_provider');
      return new MockPaymentProvider();
    case 'mercadopago':
      logProviderChoice('payment', 'mercadopago', 'provider configurado');
      return new MercadoPagoProvider();
    default:
      throw new Error(`PaymentProvider desconhecido: ${settings.active_payment_provider}`);
  }
}
