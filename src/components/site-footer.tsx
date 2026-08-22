import Link from 'next/link';
import { brand } from '@/lib/brand';

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-cream-deep bg-white/60 py-10">
      <div className="app-container flex flex-col gap-6 text-sm text-ink-soft sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-base text-ink">
            {brand.name}
          </p>
          <p className="mt-1 max-w-sm">{brand.tagline}</p>
        </div>

        <nav className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/privacidade" className="hover:text-wine-600">
            Privacidade
          </Link>
          <Link href="/termos" className="hover:text-wine-600">
            Termos de uso
          </Link>
          {brand.supportEmail ? (
            <a href={`mailto:${brand.supportEmail}`} className="hover:text-wine-600">
              Falar com a gente
            </a>
          ) : null}
        </nav>
      </div>

      <div className="app-container mt-6 text-xs text-ink-soft/70">
        © {new Date().getFullYear()} {brand.name}. Cada música é criada exclusivamente a partir da
        história enviada por você.
      </div>
    </footer>
  );
}
