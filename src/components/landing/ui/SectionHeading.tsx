// src/components/landing/ui/SectionHeading.tsx
interface Props {
  eyebrow: string;
  title: string;
  sub?: string;
  centered?: boolean;
  dark?: boolean;
}

export function SectionHeading({ eyebrow, title, sub, centered = true, dark = false }: Props) {
  const textColor = dark ? 'text-white' : 'text-slate-950';
  const subColor = dark ? 'text-slate-300' : 'text-slate-600';
  const align = centered ? 'text-center mx-auto' : '';

  return (
    <div className={`max-w-3xl ${align} mb-12 md:mb-16`}>
      <p className="text-xs font-semibold tracking-widest text-blue-600 uppercase mb-3">
        {eyebrow}
      </p>
      <h2 className={`text-3xl md:text-5xl font-bold tracking-tight ${textColor} mb-4`}>
        {title}
      </h2>
      {sub ? <p className={`text-lg leading-relaxed ${subColor}`}>{sub}</p> : null}
    </div>
  );
}
