import { SettingsForm } from '@/features/admin/components/settings-form';
import { requireAdmin } from '@/services/admin-service';
import { getSettings } from '@/services/settings-service';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  await requireAdmin();
  const settings = await getSettings({ fresh: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">Configurações</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Estes valores governam preço, prévia, providers e limites de geração. Nada disso está
          fixo no código: mudar aqui vale imediatamente, sem novo deploy.
        </p>
      </div>

      <SettingsForm settings={settings} />
    </div>
  );
}
