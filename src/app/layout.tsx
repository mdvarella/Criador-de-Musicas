import type { Metadata, Viewport } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import { brand } from '@/lib/brand';
import { AnalyticsProvider } from '@/components/analytics-provider';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(brand.appUrl),
  title: {
    default: `${brand.name} — ${brand.tagline}`,
    template: `%s · ${brand.name}`,
  },
  description:
    'Conte sua história e receba uma música personalizada, feita para emocionar quem você ama.',
  openGraph: {
    title: `${brand.name} — ${brand.tagline}`,
    description: 'Um presente que ninguém mais pode dar: a sua história virando música.',
    type: 'website',
    locale: 'pt_BR',
    siteName: brand.name,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#7c2450',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${playfair.variable}`}>
      <body>
        <AnalyticsProvider />
        {children}
      </body>
    </html>
  );
}
