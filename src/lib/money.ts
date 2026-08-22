/**
 * Dinheiro do produto é sempre inteiro em centavos.
 * Nada de float em cálculo de cobrança.
 */

export function centsToBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

/** Mercado Pago recebe `transaction_amount` como número decimal em reais. */
export function centsToAmount(cents: number): number {
  return Math.round(cents) / 100;
}

export function amountToCents(amount: number): number {
  return Math.round(amount * 100);
}

export function formatUSD(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4,
  }).format(value);
}
