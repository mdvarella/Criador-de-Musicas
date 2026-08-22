import { describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { amountToCents, centsToAmount, centsToBRL } from '@/lib/money';
import {
  assertChargeableAmount,
  assertPlanAvailable,
  resolvePriceCents,
} from '@/services/pricing-service';
import { DEFAULT_SETTINGS } from '@/services/settings-service';

/**
 * Preço é a parte do sistema onde um erro custa dinheiro de verdade.
 */
describe('cálculo do preço', () => {
  it('lê o preço do plano a partir da configuração', () => {
    const settings = { ...DEFAULT_SETTINGS, product_price_cents: 4990 };
    expect(resolvePriceCents(settings, 'STANDARD')).toBe(4990);
  });

  it('usa o preço próprio do plano PREMIUM', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      product_price_cents: 4990,
      product_price_premium_cents: 9990,
    };
    expect(resolvePriceCents(settings, 'PREMIUM')).toBe(9990);
  });

  it('recusa um plano que não está à venda', () => {
    const settings = { ...DEFAULT_SETTINGS, available_plans: ['STANDARD'] };
    expect(() => assertPlanAvailable(settings, 'PREMIUM')).toThrow(AppError);
    expect(() => assertPlanAvailable(settings, 'STANDARD')).not.toThrow();
  });

  it('recusa valores de cobrança inválidos', () => {
    expect(() => assertChargeableAmount(0)).toThrow(AppError);
    expect(() => assertChargeableAmount(-100)).toThrow(AppError);
    expect(() => assertChargeableAmount(49.9)).toThrow(AppError);
    expect(() => assertChargeableAmount(4990)).not.toThrow();
  });

  it('converte centavos para reais sem erro de ponto flutuante', () => {
    expect(centsToAmount(4990)).toBe(49.9);
    expect(centsToAmount(1)).toBe(0.01);
    expect(amountToCents(49.9)).toBe(4990);
    // Ida e volta em um valor problemático em float.
    expect(amountToCents(centsToAmount(1070))).toBe(1070);
  });

  it('formata em reais no padrão brasileiro', () => {
    expect(centsToBRL(4990).replace(/ /g, ' ')).toBe('R$ 49,90');
  });
});
