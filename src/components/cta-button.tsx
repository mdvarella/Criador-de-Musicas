'use client';

import Link from 'next/link';
import { track } from '@/lib/analytics';

type Props = {
  children: React.ReactNode;
  href?: string;
  location: string;
  className?: string;
};

/** CTA principal. Cada clique alimenta o funil (`create_song_clicked`). */
export function CtaButton({ children, href = '/criar', location, className }: Props) {
  return (
    <Link
      href={href}
      className={className ?? 'btn-primary text-base'}
      onClick={() => track('create_song_clicked', { location })}
    >
      {children}
    </Link>
  );
}
