"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { APP_NAME } from "@/lib/constants";

const inputCls =
  "w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");

    const origin = typeof window !== "undefined" ? window.location.origin : "https://www.tushorarios.com";
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/set-password`,
    });

    if (error) {
      setStatus("error");
      setErrorMsg("No pudimos enviar el correo. Verifica tu email e intenta de nuevo.");
      return;
    }

    setStatus("sent");
  };

  return (
    <main className="min-h-screen flex flex-col bg-slate-50 font-sans antialiased">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <Link href="/" className="inline-flex items-center gap-2.5 text-slate-950">
            <Image src="/icono-transparente.png" alt={APP_NAME} width={28} height={28} priority />
            <span className="font-bold tracking-tight">{APP_NAME}</span>
          </Link>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
            {status === "sent" ? (
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 mb-4">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-950">
                  Revisa tu correo
                </h1>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Te enviamos un enlace a <strong>{email}</strong> para restablecer tu contraseña.
                </p>
                <p className="mt-3 text-xs text-slate-500">
                  Si no llega en unos minutos, revisa la carpeta de spam.
                </p>
                <Link
                  href="/login"
                  className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-950"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Volver al inicio de sesión
                </Link>
              </div>
            ) : (
              <>
                <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-50 mb-4">
                    <Image src="/icono-transparente.png" alt={APP_NAME} width={36} height={36} priority />
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950">
                    Restablece tu contraseña
                  </h1>
                  <p className="mt-1.5 text-sm text-slate-600">
                    Ingresa tu email y te enviamos un enlace para crear una nueva.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
                      Email corporativo
                    </label>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      required
                      placeholder="tu@empresa.com"
                      className={inputCls}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={status === "submitting"}
                    />
                  </div>

                  {status === "error" && errorMsg && (
                    <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5" role="alert">
                      {errorMsg}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={status === "submitting"}
                    className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold px-4 py-2.5 rounded-lg transition-colors"
                  >
                    {status === "submitting" ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Enviando…
                      </>
                    ) : (
                      <>
                        Enviar enlace de recuperación
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>

                <Link
                  href="/login"
                  className="mt-6 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-950"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Volver al inicio de sesión
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
