import { describe, expect, it, vi } from 'vitest';

/**
 * O contador de rate limit é infraestrutura auxiliar: quando ele falha — banco
 * fora do ar, credencial ausente — a requisição precisa seguir. Do contrário
 * uma indisponibilidade do contador derrubaria a venda inteira.
 */
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: () => {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL ausente');
  },
}));

const { RATE_LIMITS, checkRateLimit, clientIpFrom, enforceRateLimit } = await import(
  '@/lib/rate-limit'
);

describe('rate limit', () => {
  it('libera a requisição quando o contador está indisponível', async () => {
    const result = await checkRateLimit(RATE_LIMITS.createOrder, '203.0.113.10');
    expect(result.allowed).toBe(true);
  });

  it('não lança quando o contador está indisponível', async () => {
    await expect(enforceRateLimit(RATE_LIMITS.createPayment, '203.0.113.10')).resolves.toBeUndefined();
  });

  it('extrai o primeiro IP da cadeia de proxies', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.10, 70.41.3.18' });
    expect(clientIpFrom(headers)).toBe('203.0.113.10');
  });

  it('cai para x-real-ip e depois para unknown', () => {
    expect(clientIpFrom(new Headers({ 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.7');
    expect(clientIpFrom(new Headers())).toBe('unknown');
  });
});
