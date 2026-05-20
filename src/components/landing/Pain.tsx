// src/components/landing/Pain.tsx
import { X } from 'lucide-react';
import { SectionHeading } from './ui/SectionHeading';
import { copy } from '@/lib/landing/copy';

export function Pain() {
  return (
    <section className="bg-white py-20 md:py-28">
      <div className="max-w-6xl mx-auto px-6">
        <SectionHeading eyebrow={copy.pain.eyebrow} title={copy.pain.title} sub={copy.pain.body} />

        <div className="mt-12 grid md:grid-cols-2 gap-8 items-start">
          {/* Excel feo mock */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
            <div className="text-xs text-slate-500 font-semibold mb-3 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="ml-2">turnos_octubre_v17_FINAL_corregido.xlsx</span>
            </div>
            <div className="bg-white rounded border border-slate-300 overflow-x-auto">
              <div className="grid grid-cols-8 min-w-[360px] text-[10px] font-mono">
                {Array.from({ length: 8 * 12 }).map((_, i) => {
                  const isHeader = i < 8;
                  const isError = [10, 18, 27, 35, 43, 51].includes(i);
                  return (
                    <div
                      key={i}
                      className={`border-b border-r border-slate-200 px-1.5 py-1 ${isHeader ? 'bg-slate-100 font-semibold text-slate-700' : isError ? 'bg-red-50 text-red-700' : 'text-slate-600'}`}
                    >
                      {isHeader
                        ? ['', 'L', 'M', 'M', 'J', 'V', 'S', 'D'][i] ?? ''
                        : isError
                        ? '#REF!'
                        : ['6-2', '2-10', '—', ''][i % 4]}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Lista de pains */}
          <div className="space-y-4">
            {copy.pain.bullets.map((b, i) => (
              <div key={i} className="flex gap-3 items-start">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center mt-0.5">
                  <X className="w-4 h-4" />
                </div>
                <p className="text-base text-slate-700 leading-relaxed">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
