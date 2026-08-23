import { AppError } from '@/lib/errors';
import type { PaymentStatus } from '@/types/domain';
import type {
  CreatePaymentInput,
  PaymentProvider,
  PaymentResult,
  WebhookVerification,
} from './types';

/**
 * Gateway de desenvolvimento.
 *
 * Cria pagamentos em memória e permite aprová-los manualmente pelo painel ou
 * pelo seed, para exercitar o fluxo pós-pagamento sem gateway real.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  private static store = new Map<string, PaymentResult>();

  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    const id = `mock_${input.idempotencyKey.slice(0, 12)}`;

    const existing = MockPaymentProvider.store.get(id);
    if (existing) return existing;

    const result: PaymentResult = {
      providerPaymentId: id,
      status: 'PENDING',
      rawStatus: 'pending',
      statusDetail: 'pending_waiting_transfer',
      method: input.method,
      amountCents: input.amountCents,
      approvedAt: null,
      liveMode: false,
      pix: {
        qrCode: `00020126MOCKPIX${id}5204000053039865802BR`,
        qrCodeBase64: null,
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        ticketUrl: null,
      },
    };

    MockPaymentProvider.store.set(id, result);
    return result;
  }

  async getPayment(providerPaymentId: string): Promise<PaymentResult> {
    const found = MockPaymentProvider.store.get(providerPaymentId);
    if (!found) {
      throw new AppError('NOT_FOUND', `pagamento simulado ${providerPaymentId} não existe`);
    }
    return found;
  }

  /** Atalho de desenvolvimento: força um status no pagamento simulado. */
  static setStatus(providerPaymentId: string, status: PaymentStatus): void {
    const current = MockPaymentProvider.store.get(providerPaymentId);
    if (!current) return;
    MockPaymentProvider.store.set(providerPaymentId, {
      ...current,
      status,
      rawStatus: status.toLowerCase(),
      approvedAt: status === 'APPROVED' ? new Date().toISOString() : current.approvedAt,
    });
  }

  verifyWebhook({ url }: { headers: Headers; url: URL; rawBody: string }): WebhookVerification {
    const dataId = url.searchParams.get('data.id') ?? '';
    return {
      valid: true,
      eventKey: `payment:${dataId}`,
      eventType: url.searchParams.get('type'),
      resourceId: dataId || null,
    };
  }
}
