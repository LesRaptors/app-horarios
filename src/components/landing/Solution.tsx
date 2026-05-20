// src/components/landing/Solution.tsx
import { Check } from 'lucide-react';
import { SectionHeading } from './ui/SectionHeading';
import { copy } from '@/lib/landing/copy';

const SOL_GRID: Array<'day' | 'night' | 'rest'> = [
  'day','day','rest','night','day','day','rest',
  'night','rest','day','day','night','rest','day',
  'day','day','night','rest','day','day','rest',
  'rest','day','day','night','rest','day','day',
];

export function Solution() {
  const styles = {
    day: 'bg-blue-100 text-blue-800 border-blue-200',
    night: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    rest: 'bg-amber-50 text-amber-700 border-amber-200',
  } as const;
  const labels = { day: '6-2', night: '2-10', rest: '—' } as const;

  return (
    <section id="solucion" className="bg-slate-50 py-20 md:py-28">
      <div className="max-w-6xl mx-auto px-6">
        <SectionHeading eyebrow={copy.solution.eyebrow} title={copy.solution.title} sub={copy.solution.body} />

        <div className="mt-12 grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-4">
            {copy.solution.bullets.map((b, i) => (
              <div key={i} className="flex gap-3 items-start">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mt-0.5">
                  <Check className="w-4 h-4" />
                </div>
                <p className="text-base text-slate-700 leading-relaxed">{b}</p>
              </div>
            ))}
          </div>

          {/* Schedule grid limpio (after) */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-md">
            <div className="text-xs text-slate-500 font-semibold mb-3 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-600" />
              <span className="ml-1">Cuadro Octubre · Tus Horarios</span>
              <span className="ml-auto text-emerald-600 font-semibold">Equidad ±0.5</span>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1.5 text-[10px] font-semibold text-slate-500 uppercase">
              {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
                <div key={i} className="text-center">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {SOL_GRID.map((t, i) => (
                <div key={i} className={`aspect-[1.5/1] rounded border ${styles[t]} flex items-center justify-center text-[10px] font-medium`}>
                  {labels[t]}
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span>Generado en 1.8 segundos</span>
              <span className="text-emerald-600 font-semibold">100% CST</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
