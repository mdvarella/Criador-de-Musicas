import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createMediaToken, mediaUrl, verifyMediaToken } from '@/lib/signing';

const findOrderById = vi.fn();

vi.mock('@/repositories/order-repository', () => ({
  findOrderById: (id: string) => findOrderById(id),
}));

const { getOrderForMedia } = await import('@/services/media-authorization');

/**
 * Proteção da prévia e da música completa (item 11 da especificação).
 */
describe('token assinado de mídia', () => {
  it('valida um token recém-emitido', () => {
    const token = createMediaToken('gen-1', 'preview');
    expect(verifyMediaToken('gen-1', 'preview', token).valid).toBe(true);
  });

  it('recusa o token de outra geração', () => {
    const token = createMediaToken('gen-1', 'preview');
    expect(verifyMediaToken('gen-2', 'preview', token).valid).toBe(false);
  });

  it('recusa um token de prévia usado para a música completa', () => {
    const token = createMediaToken('gen-1', 'preview');
    const result = verifyMediaToken('gen-1', 'full', token);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('signature');
  });

  it('recusa token expirado', () => {
    const token = createMediaToken('gen-1', 'full', -10);
    expect(verifyMediaToken('gen-1', 'full', token)).toEqual({ valid: false, reason: 'expired' });
  });

  it('recusa token adulterado', () => {
    const token = createMediaToken('gen-1', 'full');
    const [expires] = token.split('.');
    expect(verifyMediaToken('gen-1', 'full', `${expires}.assinaturafalsa`).valid).toBe(false);
  });

  it('monta uma URL sem expor o caminho no storage', () => {
    const url = mediaUrl('gen-1', 'preview');
    expect(url.startsWith('/api/media/gen-1?scope=preview&token=')).toBe(true);
    expect(url).not.toContain('orders/');
  });
});

describe('autorização de acesso ao áudio', () => {
  beforeEach(() => {
    findOrderById.mockReset();
  });

  it('libera a prévia de um pedido ativo', async () => {
    findOrderById.mockResolvedValue({ id: 'o1', status: 'PREVIEW_READY' });

    await expect(
      getOrderForMedia({ generationOrderId: 'o1', generationType: 'PREVIEW', scope: 'preview' }),
    ).resolves.toBe(true);
  });

  it('BLOQUEIA a música completa antes do pagamento', async () => {
    for (const status of ['PREVIEW_READY', 'AWAITING_PAYMENT', 'PAYMENT_PROCESSING', 'PAID']) {
      findOrderById.mockResolvedValue({ id: 'o1', status });

      await expect(
        getOrderForMedia({ generationOrderId: 'o1', generationType: 'FULL', scope: 'full' }),
      ).resolves.toBe(false);
    }
  });

  it('libera a música completa apenas após a produção terminar', async () => {
    for (const status of ['FULL_SONG_READY', 'DELIVERY_PENDING', 'DELIVERED']) {
      findOrderById.mockResolvedValue({ id: 'o1', status });

      await expect(
        getOrderForMedia({ generationOrderId: 'o1', generationType: 'FULL', scope: 'full' }),
      ).resolves.toBe(true);
    }
  });

  it('recusa quando o escopo do token não bate com o tipo da geração', async () => {
    findOrderById.mockResolvedValue({ id: 'o1', status: 'DELIVERED' });

    await expect(
      getOrderForMedia({ generationOrderId: 'o1', generationType: 'FULL', scope: 'preview' }),
    ).resolves.toBe(false);
  });

  it('bloqueia a prévia de pedido cancelado ou estornado', async () => {
    for (const status of ['CANCELLED', 'REFUNDED']) {
      findOrderById.mockResolvedValue({ id: 'o1', status });

      await expect(
        getOrderForMedia({ generationOrderId: 'o1', generationType: 'PREVIEW', scope: 'preview' }),
      ).resolves.toBe(false);
    }
  });

  it('recusa pedido inexistente', async () => {
    findOrderById.mockResolvedValue(null);

    await expect(
      getOrderForMedia({ generationOrderId: 'sumiu', generationType: 'PREVIEW', scope: 'preview' }),
    ).resolves.toBe(false);
  });
});
