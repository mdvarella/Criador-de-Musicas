import { describe, expect, it } from 'vitest';
import {
  STORY_MAX_LENGTH,
  createOrderSchema,
  customerSchema,
  songFormSchema,
} from '@/schemas/song-form';

const validSong = {
  recipientName: 'Marina',
  relationship: 'NAMORADA',
  occasion: 'ANIVERSARIO_NAMORO',
  story:
    'A gente se conheceu em uma festa junina em Campinas, dançamos a noite inteira e desde então nunca mais nos separamos.',
  specialDetails: { city: 'Campinas' },
  musicStyle: 'ROMANTICA',
  voicePreference: 'SURPRESA',
  emotionalTone: 'ROMANTICO',
};

const validCustomer = {
  firstName: 'Rafael',
  email: 'RAFAEL@Exemplo.com.br',
  whatsapp: '(19) 99999-1234',
  acceptedTerms: true,
  marketingOptIn: false,
};

describe('validação do formulário', () => {
  it('aceita um pedido completo e normaliza os dados do cliente', () => {
    const parsed = createOrderSchema.parse({ song: validSong, customer: validCustomer });

    expect(parsed.customer.email).toBe('rafael@exemplo.com.br');
    // WhatsApp fica só com dígitos para caber no formato do gateway.
    expect(parsed.customer.whatsapp).toBe('19999991234');
  });

  it('exige uma história com conteúdo mínimo', () => {
    const result = songFormSchema.safeParse({ ...validSong, story: 'oi' });
    expect(result.success).toBe(false);
  });

  it('recusa história acima do limite de tamanho', () => {
    const result = songFormSchema.safeParse({
      ...validSong,
      story: 'a'.repeat(STORY_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it('recusa opções fora do catálogo', () => {
    expect(songFormSchema.safeParse({ ...validSong, musicStyle: 'FUNK_PROIBIDAO' }).success).toBe(
      false,
    );
    expect(songFormSchema.safeParse({ ...validSong, occasion: 'QUALQUER' }).success).toBe(false);
  });

  it('exige aceite dos termos', () => {
    const result = customerSchema.safeParse({ ...validCustomer, acceptedTerms: false });
    expect(result.success).toBe(false);
  });

  it('recusa e-mail inválido e WhatsApp curto', () => {
    expect(customerSchema.safeParse({ ...validCustomer, email: 'nao-e-email' }).success).toBe(false);
    expect(customerSchema.safeParse({ ...validCustomer, whatsapp: '1234' }).success).toBe(false);
  });

  it('não aceita preço vindo do cliente', () => {
    // Campos extras enviados pelo cliente são descartados pelo schema: preço e
    // plano são decididos exclusivamente no servidor.
    const parsed = createOrderSchema.parse({
      song: validSong,
      customer: validCustomer,
      amountCents: 1,
      plan: 'PREMIUM',
    });

    expect(parsed).not.toHaveProperty('amountCents');
    expect(parsed).not.toHaveProperty('plan');
  });
});
