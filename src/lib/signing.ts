import { createHmac, timingSafeEqual } from 'node:crypto';
import { serverEnv } from './env';

/**
 * Assinatura de URLs temporárias de áudio.
 *
 * O bucket do Supabase é privado. O áudio só é servido por `/api/media/...`
 * mediante um token assinado e com validade curta, o que impede que a prévia
 * (e principalmente a música completa) vaze por compartilhamento de link.
 */

export type MediaScope = 'preview' | 'full';

function secret(): string {
  const value = serverEnv().MEDIA_SIGNING_SECRET;
  if (value.length < 16) {
    throw new Error('MEDIA_SIGNING_SECRET ausente ou curto demais (mínimo 16 caracteres).');
  }
  return value;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createMediaToken(
  generationId: string,
  scope: MediaScope,
  ttlSeconds = 60 * 30,
): string {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${generationId}.${scope}.${expiresAt}`;
  return `${expiresAt}.${sign(payload)}`;
}

export function verifyMediaToken(
  generationId: string,
  scope: MediaScope,
  token: string,
): { valid: boolean; reason?: 'malformed' | 'expired' | 'signature' } {
  const parts = token.split('.');
  if (parts.length !== 2) return { valid: false, reason: 'malformed' };

  const [expiresRaw, signature] = parts as [string, string];
  const expiresAt = Number.parseInt(expiresRaw, 10);
  if (!Number.isFinite(expiresAt)) return { valid: false, reason: 'malformed' };
  if (expiresAt * 1000 < Date.now()) return { valid: false, reason: 'expired' };

  const expected = sign(`${generationId}.${scope}.${expiresAt}`);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: 'signature' };
  }

  return { valid: true };
}

export function mediaUrl(generationId: string, scope: MediaScope, ttlSeconds?: number): string {
  const token = createMediaToken(generationId, scope, ttlSeconds);
  return `/api/media/${generationId}?scope=${scope}&token=${encodeURIComponent(token)}`;
}
