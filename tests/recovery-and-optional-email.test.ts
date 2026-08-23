import { beforeEach, describe, expect, it, vi } from 'vitest';
import { customerSchema } from '@/schemas/song-form';
import { recoverySchema } from '@/schemas/recovery';

/**
 * E-mail opcional e recuperação de pedido.
 *
 * Parte do público-alvo não usa e-mail. Exigi-lo excluía cliente que compraria.
 * A identidade passou a ser o WhatsApp — mas isso abre um buraco: quem fecha a
 * aba precisa de um caminho de volta, senão paga e não recebe a música.
 */

const notificationEvents: Array<{ channel: string; status: string }> = [];
let customer: { name: string; email: string | null; phone: string } | null = null;

vi.mock('@/repositories/event-repository', () => ({
  hasSentNotification: async () => false,
  recordNotificationEvent: async (input: { channel: string; status: string }) => {
    notificationEvents.push({ channel: input.channel, status: input.status });
  },
}));

vi.mock('@/repositories/order-repository', () => ({
  findOrderById: async () => ({
    id: 'order-1',
    customer_id: 'cust-1',
    public_token: 'tok',
    delivery_token: null,
    recipient_name: 'Marina',
    status: 'PREVIEW_READY',
  }),
}));

vi.mock('@/repositories/customer-repository', () => ({
  findCustomerById: async () => customer,
}));

const { sendOrderNotification } = await import('@/services/notification-service');

beforeEach(() => {
  notificationEvents.length = 0;
  customer = { name: 'Rafael', email: null, phone: '5519999991234' };
});

describe('e-mail opcional no cadastro', () => {
  const base = {
    firstName: 'Rafael',
    whatsapp: '(19) 99999-1234',
    acceptedTerms: true as const,
    marketingOptIn: false,
  };

  it('aceita cadastro sem e-mail', () => {
    const parsed = customerSchema.parse(base);
    expect(parsed.email).toBeUndefined();
    expect(parsed.whatsapp).toBe('19999991234');
  });

  it('aceita e-mail em branco como ausente', () => {
    expect(customerSchema.parse({ ...base, email: '' }).email).toBeUndefined();
  });

  it('quando informado, o e-mail continua sendo validado', () => {
    expect(customerSchema.safeParse({ ...base, email: 'nao-e-email' }).success).toBe(false);
    expect(customerSchema.parse({ ...base, email: 'RAFA@Exemplo.com' }).email).toBe(
      'rafa@exemplo.com',
    );
  });

  it('WhatsApp continua obrigatório: é a identidade do cliente', () => {
    const { whatsapp, ...withoutPhone } = base;
    void whatsapp;
    expect(customerSchema.safeParse(withoutPhone).success).toBe(false);
  });
});

describe('notificação para cliente sem e-mail', () => {
  it('registra SKIPPED em vez de falhar o pedido', async () => {
    await expect(sendOrderNotification('order-1', 'preview_ready')).resolves.toBeUndefined();

    expect(notificationEvents).toContainEqual({ channel: 'EMAIL', status: 'SKIPPED' });
  });

  it('envia normalmente quando o cliente tem e-mail', async () => {
    customer = { name: 'Rafael', email: 'rafael@exemplo.com.br', phone: '5519999991234' };

    await sendOrderNotification('order-1', 'preview_ready');

    expect(notificationEvents).toContainEqual({ channel: 'EMAIL', status: 'SENT' });
  });
});

describe('recuperação de pedido', () => {
  it('exige os dois fatos: telefone e nome do destinatário', () => {
    expect(recoverySchema.safeParse({ whatsapp: '19999991234' }).success).toBe(false);
    expect(recoverySchema.safeParse({ recipientName: 'Marina' }).success).toBe(false);
    expect(
      recoverySchema.safeParse({ whatsapp: '(19) 99999-1234', recipientName: 'Marina' }).success,
    ).toBe(true);
  });

  it('normaliza o telefone digitado com máscara', () => {
    const parsed = recoverySchema.parse({ whatsapp: '(19) 99999-1234', recipientName: ' Marina ' });
    expect(parsed.whatsapp).toBe('19999991234');
    expect(parsed.recipientName).toBe('Marina');
  });

  it('recusa telefone curto demais para ser real', () => {
    expect(recoverySchema.safeParse({ whatsapp: '123', recipientName: 'Marina' }).success).toBe(
      false,
    );
  });
});
