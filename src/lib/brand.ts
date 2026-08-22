import { publicEnv } from './env';

/**
 * Identidade do produto em um único lugar. Trocar o nome comercial é uma
 * mudança de variável de ambiente, nunca uma busca-e-substitui no código.
 */
export const brand = {
  name: publicEnv.brandName,
  tagline: publicEnv.brandTagline,
  supportEmail: publicEnv.supportEmail,
  supportWhatsapp: publicEnv.supportWhatsapp,
  appUrl: publicEnv.appUrl.replace(/\/$/, ''),
} as const;

export function absoluteUrl(path: string): string {
  return `${brand.appUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

export function whatsappLink(message: string): string {
  if (!brand.supportWhatsapp) return '';
  return `https://wa.me/${brand.supportWhatsapp}?text=${encodeURIComponent(message)}`;
}
