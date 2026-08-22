import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminSignOutButton } from '@/features/admin/components/admin-sign-out-button';
import { brand } from '@/lib/brand';
import { getAdminUser } from '@/services/admin-service';

export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/admin', label: 'Visão geral' },
  { href: '/admin/pedidos', label: 'Pedidos' },
  { href: '/admin/configuracoes', label: 'Configurações' },
];

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  // Guarda única de todo o painel. Cada página ainda consulta os dados pela
  // service role, mas só chega aqui quem já passou por esta checagem.
  const user = await getAdminUser();
  if (!user) redirect('/admin/login');

  return (
    <div className="min-h-screen bg-cream">
      <header className="border-b border-cream-deep bg-white">
        <div className="app-container flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <span className="font-display text-lg">{brand.name}</span>
            <nav className="flex gap-4 text-sm">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-ink-soft hover:text-wine-700"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3 text-sm text-ink-soft">
            <span className="hidden sm:inline">{user.email}</span>
            <AdminSignOutButton />
          </div>
        </div>
      </header>

      <main className="app-container py-8">{children}</main>
    </div>
  );
}
