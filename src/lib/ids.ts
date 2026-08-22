import { randomBytes, randomUUID } from 'node:crypto';

const ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789'; // sem 0/1/l/o para leitura humana

/**
 * Token opaco para URLs de pedido. 20 caracteres do alfabeto acima dão ~99 bits
 * de entropia: inviável de adivinhar por força bruta, mesmo sem autenticação.
 */
export function generateToken(length = 20): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

export function generateRequestId(): string {
  return randomUUID();
}

/** Chave de idempotência exigida pelo Mercado Pago em cada criação de pagamento. */
export function generateIdempotencyKey(): string {
  return randomUUID();
}
