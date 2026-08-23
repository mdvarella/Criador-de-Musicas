import { z } from 'zod';

/**
 * Recuperação de pedido.
 *
 * Sem e-mail obrigatório, um cliente que fecha a aba perderia o link da música.
 * Esta é a rede de segurança: ele volta ao site e reencontra o pedido.
 *
 * Exigimos DOIS fatos — o WhatsApp e o nome de quem recebeu a música. O número
 * sozinho é enumerável, e as histórias dos clientes são íntimas: alguém varrendo
 * faixas de telefone não pode conseguir ler a história de outra pessoa. O nome
 * do destinatário não é público e só quem fez o pedido sabe.
 */
export const recoverySchema = z.object({
  whatsapp: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .pipe(z.string().min(10, 'Informe o WhatsApp com DDD.').max(13, 'Número inválido.')),
  recipientName: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1, 'Informe o nome de quem recebeu a música.').max(80)),
});

export type RecoveryInput = z.infer<typeof recoverySchema>;
