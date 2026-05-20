// src/components/landing/Hero.tsx
import { ArrowRight, ArrowDown } from 'lucide-react';
import { GlowBg } from './ui/GlowBg';
import { copy } from '@/lib/landing/copy';

type CellType = 'day' | 'night' | 'rest' | 'empty';

const scheduleMockCells: CellType[] = [
  'day','day','rest','night','day','day','rest',
  'night','rest','day','day','night','rest','day',
  'day','day','night','rest','day','day','rest',
  'rest','day','day','night','rest','day','day',
];

function Cell({ type }: { type: CellType }) {
  const styles: Record<CellType, string> = {
    day: 'bg-blue-500/80 text-white border-blue-400/30',
    night: 'bg-indigo-500/80 text-white border-indigo-400/30',
    rest: 'bg-amber-500/20 text-amber-300 border-amber-500/20',
    empty: 'bg-slate-800/40 text-slate-500 border-white/5',
  };
  const labels: Record<CellType, string> = { day: '6-2', night: '2-10', rest: '—', empty: '' };
  return (
    <div className={`aspect-[1.6/1] rounded-md border ${styles[type]} flex items-center justify-center text-[11px] font-medium`}>
      {labels[type]}
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden text-white">
      <GlowBg />
      <div className="relative max-w-6xl mx-auto px-6 pt-16 pb-24 md:pt-24 md:pb-32">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold tracking-widest text-blue-400 uppercase mb-5">{copy.hero.eyebrow}</p>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
            {copy.hero.h1Start}
            <br />
            <span className="text-blue-400">{copy.hero.h1Accent}</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-slate-300 leading-relaxed max-w-2xl">{copy.hero.sub}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#solicitar-demo" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 transition-colors text-white px-6 py-3.5 rounded-lg font-semibold">
              {copy.hero.ctaPrimary}
              <ArrowRight className="w-4 h-4" />
            </a>
            <a href="#solucion" className="inline-flex items-center gap-2 text-slate-300 hover:text-white transition-colors px-6 py-3.5 font-semibold">
              {copy.hero.ctaSecondary}
              <ArrowDown className="w-4 h-4" aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="mt-16 md:mt-20 max-w-5xl">
          <div className="rounded-xl border border-white/10 bg-slate-900/50 backdrop-blur p-4 md:p-6 shadow-2xl">
            <div className="grid grid-cols-7 gap-1.5 mb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
                <div key={i} className="text-center py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {scheduleMockCells.map((c, i) => (<Cell key={i} type={c} />))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
