import { redirect } from 'next/navigation';
import { AdminLoginForm } from '@/features/admin/components/admin-login-form';
import { getAdminUser } from '@/services/admin-service';

export const dynamic = 'force-dynamic';

export default async function AdminLoginPage() {
  const user = await getAdminUser();
  if (user) redirect('/admin');

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-5">
      <div className="card w-full max-w-sm p-8">
        <h1 className="text-2xl">Painel</h1>
        <p className="mt-2 mb-6 text-sm text-ink-soft">
          Acesso restrito à equipe.
        </p>
        <AdminLoginForm />
      </div>
    </main>
  );
}
