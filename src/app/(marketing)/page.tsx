// src/app/(marketing)/page.tsx
import { NavBar } from '@/components/landing/NavBar';
import { Hero } from '@/components/landing/Hero';
import { Pain } from '@/components/landing/Pain';
import { Solution } from '@/components/landing/Solution';
import { SectorCards } from '@/components/landing/SectorCards';
import { Features } from '@/components/landing/Features';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { Faq } from '@/components/landing/Faq';
import { DemoForm } from '@/components/landing/DemoForm';
import { Footer } from '@/components/landing/Footer';

export default function LandingPage() {
  return (
    <main id="contenido" tabIndex={-1} className="bg-white">
      <NavBar />
      <Hero />
      <Pain />
      <Solution />
      <SectorCards />
      <Features />
      <HowItWorks />
      <Faq />
      <DemoForm />
      <Footer />
    </main>
  );
}
