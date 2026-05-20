// src/components/landing/HowItWorks.tsx
import { SectionHeading } from './ui/SectionHeading';
import { copy } from '@/lib/landing/copy';

export function HowItWorks() {
  return (
    <section id="como-funciona" tabIndex={-1} className="bg-white py-20 md:py-28">
      <div className="max-w-6xl mx-auto px-6">
        <SectionHeading eyebrow={copy.howItWorks.eyebrow} title={copy.howItWorks.title} />

        <div className="grid md:grid-cols-3 gap-8 md:gap-12 relative">
          <div className="hidden md:block absolute top-8 left-[16.67%] right-[16.67%] h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />

          {copy.howItWorks.steps.map((s) => (
            <div key={s.n} className="relative bg-white">
              <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold text-xl mb-5 shadow-lg shadow-blue-600/20">
                {s.n}
              </div>
              <h3 className="font-bold text-xl text-slate-950 mb-2">{s.title}</h3>
              <p className="text-base text-slate-600 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
