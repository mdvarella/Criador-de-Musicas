import { describe, expect, it } from 'vitest';
import { formatCPF, isValidCPF } from '@/lib/format';

/**
 * CPF no PIX.
 *
 * O gateway exige o documento do pagador para criar uma cobrança PIX. Validar
 * antes de chamar a rede evita uma recusa que o cliente veria como "não deu
 * certo", sem saber o motivo. No cartão não exigimos: o Payment Brick pede o
 * documento quando o próprio gateway precisa dele, e um campo a mais no
 * checkout custa conversão.
 */
describe('validação de CPF', () => {
  it('aceita CPFs com dígitos verificadores corretos', () => {
    expect(isValidCPF('529.982.247-25')).toBe(true);
    expect(isValidCPF('52998224725')).toBe(true);
  });

  it('recusa dígito verificador errado', () => {
    expect(isValidCPF('529.982.247-26')).toBe(false);
    expect(isValidCPF('111.111.111-12')).toBe(false);
  });

  it('recusa sequências repetidas, que passariam no cálculo', () => {
    for (const repeated of ['00000000000', '11111111111', '99999999999']) {
      expect(isValidCPF(repeated)).toBe(false);
    }
  });

  it('recusa tamanho incorreto e entrada vazia', () => {
    expect(isValidCPF('')).toBe(false);
    expect(isValidCPF('123')).toBe(false);
    expect(isValidCPF('529982247250')).toBe(false);
  });

  it('formata progressivamente enquanto o cliente digita', () => {
    expect(formatCPF('529')).toBe('529');
    expect(formatCPF('529982')).toBe('529.982');
    expect(formatCPF('529982247')).toBe('529.982.247');
    expect(formatCPF('52998224725')).toBe('529.982.247-25');
  });

  it('ignora o excedente além de 11 dígitos', () => {
    expect(formatCPF('5299822472599999')).toBe('529.982.247-25');
  });
});

describe('schema do checkout', () => {
  const base = { publicToken: 'tok_publico_123', cardToken: 'card_tok' };

  it('PIX exige CPF válido', async () => {
    const { checkoutSchema } = await import('@/schemas/checkout');

    expect(checkoutSchema.safeParse({ ...base, method: 'pix' }).success).toBe(false);
    expect(
      checkoutSchema.safeParse({ ...base, method: 'pix', identificationNumber: '111' }).success,
    ).toBe(false);
    expect(
      checkoutSchema.safeParse({
        ...base,
        method: 'pix',
        identificationNumber: '529.982.247-25',
      }).success,
    ).toBe(true);
  });

  it('cartão NÃO exige CPF', async () => {
    const { checkoutSchema } = await import('@/schemas/checkout');

    expect(checkoutSchema.safeParse({ ...base, method: 'card' }).success).toBe(true);
  });

  it('normaliza o CPF para apenas dígitos antes de chegar ao gateway', async () => {
    const { checkoutSchema } = await import('@/schemas/checkout');

    const parsed = checkoutSchema.parse({
      ...base,
      method: 'pix',
      identificationNumber: '529.982.247-25',
    });

    expect(parsed.identificationNumber).toBe('52998224725');
  });

  it('continua recusando valor enviado pelo cliente', async () => {
    const { checkoutSchema } = await import('@/schemas/checkout');

    const parsed = checkoutSchema.parse({
      ...base,
      method: 'card',
      amountCents: 1,
      plan: 'PREMIUM',
    });

    expect(parsed).not.toHaveProperty('amountCents');
    expect(parsed).not.toHaveProperty('plan');
  });
});
