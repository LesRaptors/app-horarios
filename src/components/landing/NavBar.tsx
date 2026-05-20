// src/components/landing/NavBar.tsx
import Link from 'next/link';
import Image from 'next/image';
import { copy } from '@/lib/landing/copy';

export function NavBar() {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-white/10">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 text-white">
          <Image src="/icono-transparente.png" alt={copy.brand.name} width={32} height={32} priority />
          <span className="font-bold text-lg tracking-tight">{copy.brand.name}</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm text-slate-300">
          <a href="#sectores" className="hover:text-white transition-colors">{copy.nav.sectors}</a>
          <a href="#funciones" className="hover:text-white transition-colors">{copy.nav.features}</a>
          <a href="#como-funciona" className="hover:text-white transition-colors">{copy.nav.howItWorks}</a>
          <a href="#faq" className="hover:text-white transition-colors">{copy.nav.faq}</a>
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/login" className="hidden sm:inline text-sm text-slate-300 hover:text-white transition-colors">
            {copy.nav.login}
          </Link>
          <a href="#solicitar-demo" className="bg-white text-slate-950 hover:bg-slate-100 transition-colors text-sm font-semibold px-4 py-2 rounded-lg">
            {copy.nav.cta}
          </a>
        </div>
      </div>
    </header>
  );
}
