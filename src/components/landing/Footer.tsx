// src/components/landing/Footer.tsx
import Link from 'next/link';
import Image from 'next/image';
import { copy } from '@/lib/landing/copy';

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-slate-950 text-slate-400 py-12 border-t border-white/5">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col md:flex-row gap-8 md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <Image src="/icono-transparente.png" alt={copy.brand.name} width={32} height={32} />
            <div>
              <p className="font-bold text-white text-lg">{copy.brand.name}</p>
              <p className="text-sm">{copy.footer.tagline}</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-6 text-sm">
            <div>
              <p className="font-semibold text-white mb-2">{copy.footer.contactLabel}</p>
              <a href={`mailto:${copy.footer.contactEmail}`} className="hover:text-white transition-colors">
                {copy.footer.contactEmail}
              </a>
            </div>
            <div>
              <p className="font-semibold text-white mb-2">Legal</p>
              <div className="flex flex-col gap-1">
                <Link href="/privacidad" className="hover:text-white transition-colors">{copy.footer.privacyLabel}</Link>
                <Link href="/terminos" className="hover:text-white transition-colors">{copy.footer.termsLabel}</Link>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/5 text-xs text-slate-500">
          {copy.footer.rights.replace('{year}', String(year))}
        </div>
      </div>
    </footer>
  );
}
