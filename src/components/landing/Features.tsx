// src/components/landing/Features.tsx
import { Scale, Users2, Moon, Wallet, CalendarDays, Clock4 } from 'lucide-react';
import { SectionHeading } from './ui/SectionHeading';
import { copy } from '@/lib/landing/copy';

const icons = [Scale, Users2, Moon, Wallet, CalendarDays, Clock4];

export function Features() {
  return (
    <section id="funciones" className="bg-slate-50 py-20 md:py-28">
      <div className="max-w-6xl mx-auto px-6">
        <SectionHeading eyebrow={copy.features.eyebrow} title={copy.features.title} />

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {copy.features.items.map((f, i) => {
            const Icon = icons[i] ?? Scale;
            return (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-6 hover:shadow-md transition-shadow">
                <div className="w-11 h-11 rounded-lg bg-blue-600/10 text-blue-600 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-lg text-slate-950 mb-2">{f.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{f.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
