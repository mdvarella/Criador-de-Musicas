import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '@/lib/errors';
import { requireEnv, serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { amountToCents, centsToAmount } from '@/lib/money';
import type { PaymentStatus } from '@/types/domain';
import type {
  CreatePaymentInput,
  PaymentProvider,
  PaymentResult,
  WebhookVerification,
} from './types';

/**
 * PaymentProvider do Mercado Pago (Checkout API / pagamentos transparentes).
 *
 * Endpoints usados:
 *   POST /v1/payments        -> cria o pagamento (PIX ou cartão tokenizado)
 *   GET  /v1/payments/{id}   -> consulta a verdade do pagamento
 *
 * Duas regras de segurança valem mais que todo o resto deste arquivo:
 *   1. O valor cobrado vem SEMPRE do banco, nunca do frontend.
 *   2. Um pagamento só é considerado aprovado depois que o servidor consulta o
 *      GET /v1/payments/{id}. O webhook apenas avisa que algo mudou.
 */

const API_BASE = 'https://api.mercadopago.com';

/** Mapa entre o status textual do gateway e o enum do nosso domínio. */
const STATUS_MAP: Record<string, PaymentStatus> = {
  pending: 'PENDING',
  authorized: 'IN_PROCESS',
  in_process: 'IN_PROCESS',
  in_mediation: 'IN_PROCESS',
  approved: 'APPROVED',
  rejected: 'REJECTED',
  cancelled: 'CANCELLED',
  refunded: 'REFUNDED',
  charged_back: 'CHARGED_BACK',
};

export function mapMercadoPagoStatus(raw: string | null | undefined): PaymentStatus {
  if (!raw) return 'PENDING';
  return STATUS_MAP[raw.toLowerCase()] ?? 'PENDING';
}

type MercadoPagoPayment = {
  id: number | string;
  live_mode?: boolean;
  status?: string;
  status_detail?: string;
  payment_method_id?: string;
  payment_type_id?: string;
  transaction_amount?: number;
  date_approved?: string | null;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
  date_of_expiration?: string | null;
};

export class MercadoPagoProvider implements PaymentProvider {
  readonly name = 'mercadopago';
  private readonly accessToken: string;

  constructor() {
    this.accessToken = requireEnv('MERCADO_PAGO_ACCESS_TOKEN');
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    const [firstName, ...restName] = input.payer.firstName.split(' ');

    const body: Record<string, unknown> = {
      transaction_amount: centsToAmount(input.amountCents),
      description: input.description,
      external_reference: input.externalReference,
      notification_url: input.notificationUrl,
      statement_descriptor: 'MUSICA',
      payer: {
        email: input.payer.email,
        first_name: firstName || input.payer.firstName,
        last_name: restName.join(' ') || undefined,
        ...(input.payer.identificationNumber
          ? { identification: { type: 'CPF', number: input.payer.identificationNumber } }
          : {}),
      },
      metadata: { order_id: input.orderId },
    };

    if (input.method === 'pix') {
      body.payment_method_id = 'pix';
      const minutes = input.expiresInMinutes ?? 30;
      body.date_of_expiration = new Date(Date.now() + minutes * 60_000).toISOString();
    } else {
      if (!input.cardToken) {
        throw new AppError('VALIDATION_ERROR', 'pagamento com cartão exige um token do cartão');
      }
      body.token = input.cardToken;
      body.installments = input.installments ?? 1;
      if (input.paymentMethodId) body.payment_method_id = input.paymentMethodId;
      if (input.issuerId) body.issuer_id = input.issuerId;
    }

    const payment = await this.request<MercadoPagoPayment>('/v1/payments', {
      method: 'POST',
      headers: { 'X-Idempotency-Key': input.idempotencyKey },
      body: JSON.stringify(body),
    });

    logger.info('payment.created', {
      order_id: input.orderId,
      payment_id: String(payment.id),
      raw_status: payment.status,
      method: input.method,
    });

    return this.toResult(payment, input.amountCents);
  }

  async getPayment(providerPaymentId: string): Promise<PaymentResult> {
    const payment = await this.request<MercadoPagoPayment>(
      `/v1/payments/${encodeURIComponent(providerPaymentId)}`,
      { method: 'GET' },
    );
    return this.toResult(payment, amountToCents(payment.transaction_amount ?? 0));
  }

  /**
   * Validação da assinatura do webhook.
   *
   * O gateway envia `x-signature: ts=<timestamp>,v1=<hmac>` e `x-request-id`.
   * O manifesto assinado é `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
   * com HMAC-SHA256 sobre o segredo do painel. Sem essa checagem, qualquer um
   * poderia simular a aprovação de um pagamento.
   */
  verifyWebhook({ headers, url }: { headers: Headers; url: URL; rawBody: string }): WebhookVerification {
    const secret = serverEnv().MERCADO_PAGO_WEBHOOK_SECRET;
    const signature = headers.get('x-signature');
    const requestId = headers.get('x-request-id') ?? '';

    const dataId = url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? '';
    const eventType = url.searchParams.get('type') ?? url.searchParams.get('topic');

    const base: Omit<WebhookVerification, 'valid' | 'reason'> = {
      // Sem data.id não há evento aproveitável; a chave cai no request-id.
      eventKey: dataId ? `payment:${dataId}` : `request:${requestId || crypto.randomUUID()}`,
      eventType,
      resourceId: dataId || null,
    };

    if (!secret) {
      return { ...base, valid: false, reason: 'MERCADO_PAGO_WEBHOOK_SECRET não configurado' };
    }
    if (!signature) {
      return { ...base, valid: false, reason: 'header x-signature ausente' };
    }

    const parts = Object.fromEntries(
      signature.split(',').map((piece) => {
        const [key, ...rest] = piece.split('=');
        return [key?.trim() ?? '', rest.join('=').trim()];
      }),
    );

    const ts = parts.ts;
    const v1 = parts.v1;
    if (!ts || !v1) {
      return { ...base, valid: false, reason: 'x-signature sem ts ou v1' };
    }

    // O gateway normaliza ids alfanuméricos em minúsculas no manifesto.
    const normalizedId = /^[a-zA-Z0-9]+$/.test(dataId) ? dataId.toLowerCase() : dataId;
    const manifest = `id:${normalizedId};request-id:${requestId};ts:${ts};`;
    const expected = createHmac('sha256', secret).update(manifest).digest('hex');

    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(v1, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ...base, valid: false, reason: 'assinatura inválida' };
    }

    return { ...base, valid: true };
  }

  private toResult(payment: MercadoPagoPayment, fallbackAmountCents: number): PaymentResult {
    this.assertNotLive(payment);
    const transactionData = payment.point_of_interaction?.transaction_data;

    return {
      providerPaymentId: String(payment.id),
      status: mapMercadoPagoStatus(payment.status),
      rawStatus: payment.status ?? 'unknown',
      statusDetail: payment.status_detail ?? null,
      method: payment.payment_method_id ?? payment.payment_type_id ?? null,
      amountCents: payment.transaction_amount
        ? amountToCents(payment.transaction_amount)
        : fallbackAmountCents,
      approvedAt: payment.date_approved ?? null,
      liveMode: payment.live_mode ?? null,
      ...(transactionData
        ? {
            pix: {
              qrCode: transactionData.qr_code ?? null,
              qrCodeBase64: transactionData.qr_code_base64 ?? null,
              expiresAt: payment.date_of_expiration ?? null,
              ticketUrl: transactionData.ticket_url ?? null,
            },
          }
        : {}),
    };
  }

  /**
   * Recusa dinheiro de verdade enquanto a trava não for liberada.
   *
   * Um token de produção colado no ambiente por engano cobraria de uma pessoa
   * real — e não há como desfazer isso com um `git revert`. A checagem fica
   * aqui, na fronteira com o gateway, para valer tanto na criação quanto na
   * consulta do pagamento.
   */
  private assertNotLive(payment: MercadoPagoPayment): void {
    if (payment.live_mode !== true) return;
    if (serverEnv().MERCADO_PAGO_ALLOW_LIVE) return;

    throw new AppError(
      'PAYMENT_ERROR',
      `pagamento ${payment.id} veio com live_mode=true (dinheiro real) e ` +
        'MERCADO_PAGO_ALLOW_LIVE não está habilitada. Se as credenciais deveriam ser de ' +
        'teste, troque-as. Se você já está em produção, defina MERCADO_PAGO_ALLOW_LIVE=true.',
      { retryable: false },
    );
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          ...(init.headers as Record<string, string> | undefined),
        },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new AppError('PAYMENT_ERROR', `falha de rede no gateway: ${String(error)}`, {
        retryable: true,
      });
    }

    const text = await response.text();

    if (!response.ok) {
      throw new AppError(
        'PAYMENT_ERROR',
        `gateway respondeu ${response.status} em ${path}: ${text.slice(0, 400)}`,
        { retryable: response.status >= 500 },
      );
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new AppError('PAYMENT_ERROR', `resposta não-JSON do gateway em ${path}`);
    }
  }
}
