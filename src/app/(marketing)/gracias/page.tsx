// src/app/(marketing)/gracias/page.tsx
import Link from 'next/link';
import Image from 'next/image';
import { Check, ArrowLeft } from 'lucide-react';
import { copy } from '@/lib/landing/copy';

export const metadata = {
  title: `${copy.brand.name} — ${copy.gracias.h1}`,
  robots: { index: false, follow: false },
};

export default function GraciasPage() {
  return (
    <main className="min-h-screen bg-white flex flex-col">
      <header className="border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5 text-slate-950">
            <Image src="/icono-transparente.png" alt={copy.brand.name} width={28} height={28} />
            <span className="font-bold tracking-tight">{copy.brand.name}</span>
          </Link>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-xl text-center">
          <div className="w-20 h-20 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-6">
            <Check className="w-10 h-10" strokeWidth={3} />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-950 mb-4">{copy.gracias.h1}</h1>
          <p className="text-lg text-slate-600 leading-relaxed mb-8">{copy.gracias.body}</p>
          <Link href="/" className="inline-flex items-center gap-2 text-slate-700 hover:text-slate-950 font-semibold">
            <ArrowLeft className="w-4 h-4" />
            {copy.gracias.cta}
          </Link>
        </div>
      </div>
    </main>
  );
}
