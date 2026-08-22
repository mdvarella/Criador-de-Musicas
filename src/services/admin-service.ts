import 'server-only';
import { AppError } from '@/lib/errors';
import { adminAllowedEmails } from '@/lib/env';
import { logger } from '@/lib/logger';
import { supabaseServer } from '@/lib/supabase/server';

/**
 * Autorização do painel (item 25 da especificação).
 *
 * Duas condições precisam valer ao mesmo tempo:
 *   1. sessão válida no Supabase Auth;
 *   2. e-mail presente em ADMIN_ALLOWED_EMAILS.
 *
 * Não basta ter conta: a lista de e-mails é a autorização. Sem ela configurada,
 * o painel fica fechado — falhar fechado é o comportamento certo aqui.
 */

export type AdminUser = { id: string; email: string };

export async function getAdminUser(): Promise<AdminUser | null> {
  const allowed = adminAllowedEmails();
  if (allowed.length === 0) {
    logger.warn('admin.no_allowlist_configured');
    return null;
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user?.email) return null;

  const email = data.user.email.toLowerCase();
  if (!allowed.includes(email)) {
    logger.warn('admin.email_not_allowed', { email });
    return null;
  }

  return { id: data.user.id, email };
}

export async function requireAdmin(): Promise<AdminUser> {
  const user = await getAdminUser();
  if (!user) throw new AppError('UNAUTHORIZED', 'acesso administrativo negado');
  return user;
}

export function isAdminEmail(email: string): boolean {
  return adminAllowedEmails().includes(email.trim().toLowerCase());
}
