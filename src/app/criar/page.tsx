import type { Metadata } from 'next';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { SongWizard } from '@/features/songs/components/song-wizard';
import { getSettings } from '@/services/settings-service';

export const metadata: Metadata = {
  title: 'Criar minha música',
  description: 'Conte sua história e receba uma música feita só para ela.',
  robots: { index: false },
};

export const dynamic = 'force-dynamic';

export default async function CreateSongPage() {
  const settings = await getSettings();

  if (settings.maintenance_mode) {
    return (
      <>
        <SiteHeader />
        <main className="app-container py-20">
          <div className="card mx-auto max-w-lg p-8 text-center">
            <h1 className="text-2xl">Voltamos em instantes 💛</h1>
            <p className="mt-3 text-ink-soft">
              Estamos fazendo um ajuste rápido para deixar tudo perfeito. Tente novamente em alguns
              minutos.
            </p>
          </div>
        </main>
        <SiteFooter />
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <main className="app-container py-10 sm:py-14">
        <SongWizard />
      </main>
      <SiteFooter />
    </>
  );
}
