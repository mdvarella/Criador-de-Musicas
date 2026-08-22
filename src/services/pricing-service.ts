import 'server-only';
import { AppError } from '@/lib/errors';
import type { Plan } from '@/types/domain';
import { getSettings, type AppSettings } from './settings-service';

/**
 * Preço (item 12 da especificação).
 *
 * O valor cobrado NUNCA vem do frontend. Esta é a única função autorizada a
 * dizer quanto custa um pedido, e ela lê exclusivamente as configurações do
 * banco.
 */

export type PriceQuote = {
  plan: Plan;
  amountCents: number;
  currency: 'BRL';
};

export function resolvePriceCents(settings: AppSettings, plan: Plan): number {
  switch (plan) {
    case 'STANDARD':
      return settings.product_price_cents;
    case 'PREMIUM':
      return settings.product_price_premium_cents;
    default:
      throw new AppError('VALIDATION_ERROR', `plano desconhecido: ${plan as string}`);
  }
}

export function assertPlanAvailable(settings: AppSettings, plan: Plan): void {
  if (!settings.available_plans.includes(plan)) {
    throw new AppError('VALIDATION_ERROR', `plano ${plan} não está disponível para venda`, {
      userMessage: 'Este plano não está disponível no momento.',
    });
  }
}

export async function quotePrice(plan: Plan = 'STANDARD'): Promise<PriceQuote> {
  const settings = await getSettings();
  assertPlanAvailable(settings, plan);

  const amountCents = resolvePriceCents(settings, plan);
  if (amountCents <= 0) {
    throw new AppError('VALIDATION_ERROR', `preço inválido configurado para o plano ${plan}`);
  }

  return { plan, amountCents, currency: 'BRL' };
}

/**
 * Confere o valor gravado no pedido antes de cobrar.
 *
 * Se o preço mudou entre a criação do pedido e o checkout, o pedido continua
 * valendo o preço que o cliente viu — mas um valor zerado ou negativo é sempre
 * recusado.
 */
export function assertChargeableAmount(amountCents: number): void {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new AppError('VALIDATION_ERROR', `valor de cobrança inválido: ${amountCents}`);
  }
}
