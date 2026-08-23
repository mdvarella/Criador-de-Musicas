import { z } from 'zod';
import { isValidCPF } from '@/lib/format';

/**
 * Entrada do checkout.
 *
 * Repare no que este schema NÃO aceita: valor, preço ou plano. O montante é
 * lido do pedido no banco — o cliente só informa como quer pagar.
 *
 * Vive em `src/schemas/` (e não dentro da rota) para poder ser testado sem
 * subir um handler HTTP.
 */
export const checkoutSchema = z
  .object({
    publicToken: z.string().min(8).max(64),
    method: z.enum(['pix', 'card']),
    /** Token do cartão gerado pelo SDK no browser — nunca o número do cartão. */
    cardToken: z.string().max(200).optional(),
    installments: z.number().int().min(1).max(12).optional(),
    paymentMethodId: z.string().max(60).optional(),
    issuerId: z.string().max(60).optional(),
    identificationNumber: z
      .string()
      .max(20)
      .transform((v) => v.replace(/\D/g, ''))
      .optional(),
  })
  // PIX no Brasil exige o CPF do pagador. No cartão não exigimos por conta
  // própria: o Payment Brick pede o documento quando o gateway precisa dele, e
  // um campo a mais entre o cliente e a compra custa conversão.
  .refine((data) => data.method !== 'pix' || isValidCPF(data.identificationNumber ?? ''), {
    path: ['identificationNumber'],
    message: 'Informe um CPF válido para pagar com PIX.',
  });

export type CheckoutInput = z.infer<typeof checkoutSchema>;
