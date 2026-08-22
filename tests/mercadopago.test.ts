import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MercadoPagoProvider, mapMercadoPagoStatus } from '@/providers/payment/mercadopago-provider';

const SECRET = 'webhook-secret-de-teste';

function signedRequest(options: {
  dataId: string;
  requestId: string;
  ts?: string;
  secret?: string;
  type?: string;
}) {
  const ts = options.ts ?? '1700000000';
  const manifest = `id:${options.dataId.toLowerCase()};request-id:${options.requestId};ts:${ts};`;
  const v1 = createHmac('sha256', options.secret ?? SECRET).update(manifest).digest('hex');

  return {
    headers: new Headers({
      'x-signature': `ts=${ts},v1=${v1}`,
      'x-request-id': options.requestId,
    }),
    url: new URL(
      `https://exemplo.com.br/api/webhooks/mercadopago?type=${options.type ?? 'payment'}&data.id=${options.dataId}`,
    ),
    rawBody: JSON.stringify({ action: 'payment.updated', data: { id: options.dataId } }),
  };
}

describe('assinatura do webhook do gateway', () => {
  it('aceita uma notificação assinada corretamente', () => {
    const provider = new MercadoPagoProvider();
    const result = provider.verifyWebhook(signedRequest({ dataId: '12345', requestId: 'req-1' }));

    expect(result.valid).toBe(true);
    expect(result.resourceId).toBe('12345');
    expect(result.eventKey).toBe('payment:12345');
  });

  it('recusa assinatura feita com outro segredo', () => {
    const provider = new MercadoPagoProvider();
    const result = provider.verifyWebhook(
      signedRequest({ dataId: '12345', requestId: 'req-1', secret: 'segredo-errado' }),
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('assinatura inválida');
  });

  it('recusa quando o data.id não é o assinado (tentativa de troca de pedido)', () => {
    const provider = new MercadoPagoProvider();
    const request = signedRequest({ dataId: '12345', requestId: 'req-1' });
    request.url.searchParams.set('data.id', '99999');

    expect(provider.verifyWebhook(request).valid).toBe(false);
  });

  it('recusa notificação sem cabeçalho de assinatura', () => {
    const provider = new MercadoPagoProvider();
    const request = signedRequest({ dataId: '12345', requestId: 'req-1' });
    request.headers.delete('x-signature');

    const result = provider.verifyWebhook(request);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('header x-signature ausente');
  });

  it('recusa x-signature sem ts ou v1', () => {
    const provider = new MercadoPagoProvider();
    const request = signedRequest({ dataId: '12345', requestId: 'req-1' });
    request.headers.set('x-signature', 'v1=abc');

    expect(provider.verifyWebhook(request).reason).toBe('x-signature sem ts ou v1');
  });

  it('normaliza id alfanumérico em minúsculas no manifesto', () => {
    const provider = new MercadoPagoProvider();
    // Assinado com o id em minúsculas, recebido em maiúsculas: deve validar.
    const request = signedRequest({ dataId: 'ABC123', requestId: 'req-1' });
    expect(provider.verifyWebhook(request).valid).toBe(true);
  });

  it('gera a mesma chave de evento para reentregas do mesmo pagamento', () => {
    const provider = new MercadoPagoProvider();
    const first = provider.verifyWebhook(signedRequest({ dataId: '777', requestId: 'req-a' }));
    const second = provider.verifyWebhook(signedRequest({ dataId: '777', requestId: 'req-b' }));

    // request-id muda a cada entrega; a chave de idempotência não pode mudar.
    expect(first.eventKey).toBe(second.eventKey);
  });
});

describe('tradução do status do gateway', () => {
  it('mapeia os status conhecidos', () => {
    expect(mapMercadoPagoStatus('approved')).toBe('APPROVED');
    expect(mapMercadoPagoStatus('pending')).toBe('PENDING');
    expect(mapMercadoPagoStatus('in_process')).toBe('IN_PROCESS');
    expect(mapMercadoPagoStatus('rejected')).toBe('REJECTED');
    expect(mapMercadoPagoStatus('refunded')).toBe('REFUNDED');
    expect(mapMercadoPagoStatus('charged_back')).toBe('CHARGED_BACK');
  });

  it('trata status desconhecido como pendente, nunca como aprovado', () => {
    expect(mapMercadoPagoStatus('status_novo_do_gateway')).toBe('PENDING');
    expect(mapMercadoPagoStatus(null)).toBe('PENDING');
    expect(mapMercadoPagoStatus(undefined)).toBe('PENDING');
  });
});
