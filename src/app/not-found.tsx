import Link from 'next/link';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="app-container py-20">
        <div className="card mx-auto max-w-lg p-8 text-center">
          <h1 className="text-2xl">Não encontramos essa página</h1>
          <p className="mt-3 text-ink-soft">
            Confira se o link está completo. Se você recebeu um link da sua música, ele pode ter
            sido cortado ao ser copiado.
          </p>
          <Link href="/" className="btn-primary mt-8">
            Voltar para o início
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
