import Link from "next/link";
import Image from "next/image";
import { APP_NAME } from "@/lib/constants";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2.5 text-slate-950">
            <Image src="/icono-transparente.png" alt={APP_NAME} width={28} height={28} priority />
            <span className="font-bold tracking-tight">{APP_NAME}</span>
          </Link>
          <span className="text-sm text-slate-500">Configuración inicial</span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6">{children}</main>
    </div>
  );
}
