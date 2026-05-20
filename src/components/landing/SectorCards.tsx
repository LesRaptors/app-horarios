// src/components/landing/SectorCards.tsx
import { Stethoscope, ShoppingCart, UtensilsCrossed, Shield } from 'lucide-react';
import { SectionHeading } from './ui/SectionHeading';
import { copy } from '@/lib/landing/copy';

const icons = {
  salud: Stethoscope,
  retail: ShoppingCart,
  hoteleria: UtensilsCrossed,
  vigilancia: Shield,
} as const;

export function SectorCards() {
  return (
    <section id="sectores" className="bg-white py-20 md:py-28">
      <div className="max-w-6xl mx-auto px-6">
        <SectionHeading eyebrow={copy.sectors.eyebrow} title={copy.sectors.title} />

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {copy.sectors.items.map((s) => {
            const Icon = icons[s.key as keyof typeof icons];
            return (
              <div key={s.key} className="group rounded-xl border border-slate-200 bg-white p-6 hover:shadow-lg hover:border-blue-300 hover:-translate-y-0.5 transition-all">
                <div className="w-11 h-11 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-lg text-slate-950 mb-1">{s.title}</h3>
                <p className="text-xs text-slate-500 mb-3">{s.examples}</p>
                <p className="text-sm text-slate-600 leading-relaxed">{s.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
