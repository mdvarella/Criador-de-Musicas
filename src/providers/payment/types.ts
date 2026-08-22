import type { PaymentStatus } from '@/types/domain';

export type PaymentMethodKind = 'pix' | 'card';

export type CreatePaymentInput = {
  orderId: string;
  /** Referência externa enviada ao gateway (usamos o token público do pedido). */
  externalReference: string;
  amountCents: number;
  currency: string;
  description: string;
  method: PaymentMethodKind;
  payer: {
    firstName: string;
    email: string;
    /** Somente dígitos, com DDI. */
    phone: string;
    /** CPF, quando o meio de pagamento exigir. */
    identificationNumber?: string;
  };
  /** Obrigatória: garante que um clique duplo não vira duas cobranças. */
  idempotencyKey: string;
  notificationUrl: string;
  /**
   * Token do cartão gerado no browser pelo SDK do gateway.
   * O servidor NUNCA recebe número de cartão, CVV ou validade.
   */
  cardToken?: string;
  installments?: number;
  paymentMethodId?: string;
  issuerId?: string;
  expiresInMinutes?: number;
};

export type PaymentResult = {
  providerPaymentId: string;
  status: PaymentStatus;
  rawStatus: string;
  statusDetail: string | null;
  method: string | null;
  amountCents: number;
  approvedAt: string | null;
  pix?: {
    qrCode: string | null;
    qrCodeBase64: string | null;
    expiresAt: string | null;
    ticketUrl: string | null;
  };
};

export type WebhookVerification = {
  valid: boolean;
  reason?: string;
  /** Chave determinística usada para idempotência do evento. */
  eventKey: string;
  eventType: string | null;
  resourceId: string | null;
};

export interface PaymentProvider {
  readonly name: string;
  createPayment(input: CreatePaymentInput): Promise<PaymentResult>;
  getPayment(providerPaymentId: string): Promise<PaymentResult>;
  /**
   * Valida a assinatura da notificação e extrai o recurso afetado.
   * Um evento não verificado nunca pode alterar o estado do pedido.
   */
  verifyWebhook(args: {
    headers: Headers;
    url: URL;
    rawBody: string;
  }): WebhookVerification;
}
