'use client';
// src/components/landing/Faq.tsx
import * as Accordion from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';
import { SectionHeading } from './ui/SectionHeading';
import { copy } from '@/lib/landing/copy';

export function Faq() {
  return (
    <section id="faq" tabIndex={-1} className="bg-slate-50 py-20 md:py-28">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeading eyebrow={copy.faq.eyebrow} title={copy.faq.title} />

        <Accordion.Root type="single" collapsible className="space-y-3">
          {copy.faq.items.map((item, i) => (
            <Accordion.Item key={i} value={`item-${i}`} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <Accordion.Header>
                <Accordion.Trigger className="w-full px-6 py-5 flex items-center justify-between gap-4 text-left hover:bg-slate-50 transition-colors group">
                  <span className="font-semibold text-base text-slate-950">{item.q}</span>
                  <ChevronDown className="w-5 h-5 text-slate-400 shrink-0 group-data-[state=open]:rotate-180 transition-transform" />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                <div className="px-6 pb-5 pt-1 text-slate-600 leading-relaxed">{item.a}</div>
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      </div>
    </section>
  );
}
