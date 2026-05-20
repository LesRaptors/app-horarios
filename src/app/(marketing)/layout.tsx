// src/app/(marketing)/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { copy } from '@/lib/landing/copy';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const metadata: Metadata = {
  title: `${copy.brand.name} — Programación de turnos para empresas en Colombia`,
  description: copy.hero.sub,
  // Override root layout's robots: { index: false } — landing SÍ debe indexarse.
  robots: { index: true, follow: true },
  openGraph: {
    title: `${copy.brand.name} — Turnos en 2 minutos`,
    description: copy.hero.sub,
    url: 'https://tushorarios.com',
    siteName: copy.brand.name,
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: copy.brand.name }],
    locale: 'es_CO',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${copy.brand.name} — Turnos en 2 minutos`,
    description: copy.hero.sub,
    images: ['/og-image.png'],
  },
  alternates: { canonical: 'https://tushorarios.com' },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${inter.variable} font-sans antialiased`}>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-blue-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:font-semibold"
      >
        Saltar al contenido
      </a>
      {children}
    </div>
  );
}
