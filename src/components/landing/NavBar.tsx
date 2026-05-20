'use client';

// src/components/landing/NavBar.tsx
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { copy } from '@/lib/landing/copy';

const navLinks = [
  { href: '#sectores', label: copy.nav.sectors },
  { href: '#funciones', label: copy.nav.features },
  { href: '#como-funciona', label: copy.nav.howItWorks },
  { href: '#faq', label: copy.nav.faq },
];

export function NavBar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-white/10">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 text-white">
          <Image src="/icono-transparente.png" alt={copy.brand.name} width={32} height={32} priority />
          <span className="font-bold text-lg tracking-tight">{copy.brand.name}</span>
        </Link>

        {/* Desktop nav */}
        <nav aria-label="Principal" className="hidden md:flex items-center gap-8 text-sm text-slate-300">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} className="hover:text-white transition-colors">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {/* Desktop login link */}
          <Link href="/login" className="hidden sm:inline text-sm text-slate-300 hover:text-white transition-colors">
            {copy.nav.login}
          </Link>

          {/* Desktop CTA */}
          <a
            href="#solicitar-demo"
            className="hidden sm:inline bg-white text-slate-950 hover:bg-slate-100 transition-colors text-sm font-semibold px-4 py-2 rounded-lg"
          >
            {copy.nav.cta}
          </a>

          {/* Mobile hamburger */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                className="md:hidden p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Abrir menú"
              >
                <Menu className="w-5 h-5" aria-hidden="true" />
              </button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="bg-slate-950 border-white/10 text-white w-4/5 sm:max-w-xs"
            >
              <nav
                className="flex flex-col gap-1 mt-8"
                aria-label="Menú móvil"
              >
                {navLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="px-4 py-3 text-lg text-slate-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                  >
                    {link.label}
                  </a>
                ))}

                <div className="my-3 border-t border-white/10" />

                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="px-4 py-3 text-lg text-slate-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                  {copy.nav.login}
                </Link>

                <a
                  href="#solicitar-demo"
                  onClick={() => setOpen(false)}
                  className="mt-2 mx-4 bg-white text-slate-950 hover:bg-slate-100 transition-colors text-base font-semibold px-4 py-3 rounded-lg text-center"
                >
                  {copy.nav.cta}
                </a>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
