import Link from 'next/link';
import { brand } from '@/lib/brand';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-cream-deep bg-cream/85 backdrop-blur">
      <div className="app-container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span aria-hidden className="text-xl">
            🎵
          </span>
          <span className="font-display text-lg">{brand.name}</span>
        </Link>

        <Link href="/criar" className="btn-ghost hidden text-sm sm:inline-flex">
          Criar minha música
        </Link>
      </div>
    </header>
  );
}
