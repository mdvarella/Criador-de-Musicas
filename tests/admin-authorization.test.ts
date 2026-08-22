import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors';
import { resetServerEnvCache } from '@/lib/env';

const getUser = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: async () => ({ auth: { getUser } }),
}));

const { getAdminUser, isAdminEmail, requireAdmin } = await import('@/services/admin-service');

/**
 * Autorização do painel (item 25).
 *
 * Ter sessão válida não é suficiente: o e-mail precisa estar na allowlist.
 */
describe('autorização administrativa', () => {
  beforeEach(() => {
    getUser.mockReset();
    process.env.ADMIN_ALLOWED_EMAILS = 'admin@exemplo.com.br, Chefe@Exemplo.com.br';
    resetServerEnvCache();
  });

  it('aceita e-mail da allowlist, ignorando maiúsculas e espaços', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'Admin@Exemplo.com.BR' } }, error: null });

    await expect(getAdminUser()).resolves.toEqual({ id: 'u1', email: 'admin@exemplo.com.br' });
    expect(isAdminEmail('  CHEFE@exemplo.com.br ')).toBe(true);
  });

  it('recusa usuário autenticado que não está na allowlist', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'u2', email: 'estranho@exemplo.com.br' } },
      error: null,
    });

    await expect(getAdminUser()).resolves.toBeNull();
    await expect(requireAdmin()).rejects.toBeInstanceOf(AppError);
  });

  it('recusa quando não há sessão', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(getAdminUser()).resolves.toBeNull();
  });

  it('recusa quando o Supabase devolve erro', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'jwt expired' } });
    await expect(getAdminUser()).resolves.toBeNull();
  });

  it('falha fechado quando a allowlist não está configurada', async () => {
    process.env.ADMIN_ALLOWED_EMAILS = '';
    resetServerEnvCache();
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'admin@exemplo.com.br' } }, error: null });

    // Sem allowlist, ninguém entra — nem quem tem conta válida.
    await expect(getAdminUser()).resolves.toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });

  it('requireAdmin lança UNAUTHORIZED sem vazar detalhe técnico', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    try {
      await requireAdmin();
      expect.unreachable('deveria ter lançado');
    } catch (error) {
      expect((error as AppError).code).toBe('UNAUTHORIZED');
      expect((error as AppError).status).toBe(401);
    }
  });
});
