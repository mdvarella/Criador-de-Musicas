import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

export function LegalPage({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main className="app-container py-10 sm:py-16">
        <article className="mx-auto w-full max-w-2xl">
          <h1 className="text-3xl sm:text-4xl">{title}</h1>
          <p className="mt-2 text-sm text-ink-soft">Última atualização: {updatedAt}</p>
          <div className="mt-8 space-y-6 text-ink-soft [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-ink">
            {children}
          </div>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
