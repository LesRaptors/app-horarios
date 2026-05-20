'use client';
// src/components/landing/DemoForm.tsx
import { cloneElement, isValidElement, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { ArrowRight, AlertCircle } from 'lucide-react';
import { SectionHeading } from './ui/SectionHeading';
import { copy } from '@/lib/landing/copy';
import { demoRequestSchema, type DemoRequestInput } from '@/lib/landing/schema';

type Status = 'idle' | 'submitting' | 'error';

const input =
  'w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactElement;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const inputEl = isValidElement(children)
    ? cloneElement(children as React.ReactElement<React.HTMLAttributes<HTMLElement>>, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? errorId : undefined,
      })
    : children;
  return (
    <div className="block">
      <label htmlFor={id} className="text-sm font-medium text-slate-700 mb-1.5 block">
        {label}
      </label>
      {inputEl}
      {error ? (
        <p id={errorId} className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function DemoForm() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DemoRequestInput>({
    resolver: zodResolver(demoRequestSchema),
    defaultValues: { sector: undefined, website: '' },
  });

  async function onSubmit(data: DemoRequestInput) {
    setStatus('submitting');
    setErrorMsg(null);
    try {
      const res = await fetch('/api/demo-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) throw new Error(payload.error || 'unknown');
      router.push('/gracias');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : copy.form.errorBody);
    }
  }

  return (
    <section id="solicitar-demo" tabIndex={-1} className="cv-deferred bg-white py-20 md:py-28">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeading
          eyebrow={copy.ctaFinal.eyebrow}
          title={copy.ctaFinal.title}
          sub={copy.ctaFinal.body}
        />

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="bg-slate-50 rounded-2xl border border-slate-200 p-6 md:p-8 shadow-sm"
        >
          {/* Honeypot — invisible para humanos */}
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            className="absolute left-[-9999px]"
            aria-hidden
            {...register('website')}
          />

          <div className="grid sm:grid-cols-2 gap-5">
            <Field label={copy.form.nombreLabel} error={errors.nombre?.message}>
              <input type="text" placeholder={copy.form.nombrePlaceholder} className={input} {...register('nombre')} />
            </Field>
            <Field label={copy.form.emailLabel} error={errors.email?.message}>
              <input type="email" placeholder={copy.form.emailPlaceholder} className={input} autoComplete="email" {...register('email')} />
            </Field>
            <Field label={copy.form.empresaLabel} error={errors.empresa?.message}>
              <input type="text" placeholder={copy.form.empresaPlaceholder} className={input} autoComplete="organization" {...register('empresa')} />
            </Field>
            <Field label={copy.form.telefonoLabel} error={errors.telefono?.message}>
              <input type="tel" placeholder={copy.form.telefonoPlaceholder} className={input} autoComplete="tel" {...register('telefono')} />
            </Field>
          </div>

          <div className="mt-5">
            <Field label={copy.form.sectorLabel} error={errors.sector?.message}>
              <select className={input} {...register('sector')}>
                <option value="">Selecciona…</option>
                {copy.form.sectorOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-5">
            <Field label={copy.form.mensajeLabel} error={errors.mensaje?.message}>
              <textarea
                rows={3}
                placeholder={copy.form.mensajePlaceholder}
                className={input}
                {...register('mensaje')}
              />
            </Field>
          </div>

          {status === 'error' && errorMsg ? (
            <div role="alert" aria-live="polite" className="mt-5 flex items-start gap-3 p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{copy.form.errorTitle}</p>
                <p>{errorMsg}</p>
              </div>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={status === 'submitting'}
            className="mt-6 w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold px-6 py-3.5 rounded-lg transition-colors"
          >
            {status === 'submitting' ? copy.form.submitting : copy.form.submitLabel}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </section>
  );
}
