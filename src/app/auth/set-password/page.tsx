"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { APP_NAME } from "@/lib/constants";

type Status = "checking" | "ready" | "error" | "expired";

const inputCls =
  "w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

export default function SetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      }
    >
      <SetPasswordInner />
    </Suspense>
  );
}

function SetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [status, setStatus] = useState<Status>("checking");
  const [errorMsg, setErrorMsg] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const code = searchParams.get("code");
      const hashError = typeof window !== "undefined" ? window.location.hash : "";

      if (hashError.includes("error_code=otp_expired")) {
        if (!cancelled) {
          setStatus("expired");
        }
        return;
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (error) {
          setErrorMsg(error.message);
          setStatus("error");
          return;
        }
      }

      const { data } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!data.user) {
        setStatus("error");
        setErrorMsg(
          "No encontramos una sesión válida. El enlace puede haber expirado — solicita uno nuevo."
        );
        return;
      }

      setStatus("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (password.length < 8) {
      setErrorMsg("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setErrorMsg("Las contraseñas no coinciden.");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
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
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-50 mb-4">
                <Image src="/icono-transparente.png" alt={APP_NAME} width={36} height={36} priority />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-950">
                Establece tu contraseña
              </h1>
              <p className="mt-1.5 text-sm text-slate-600">
                Crea una contraseña para acceder a {APP_NAME}.
              </p>
            </div>

            {status === "checking" && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            )}

            {status === "expired" && (
              <div className="space-y-4">
                <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                  El enlace expiró o ya fue utilizado.
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Si te invitaron, pídele a tu administrador que reenvíe la invitación.
                  Si era una recuperación de contraseña, solicita un nuevo enlace.
                </p>
                <div className="flex flex-col gap-2">
                  <Link
                    href="/forgot-password"
                    className="w-full text-center px-4 py-2.5 rounded-lg border border-slate-300 hover:border-slate-400 hover:bg-slate-50 transition-colors text-sm font-semibold text-slate-700"
                  >
                    Solicitar nuevo enlace
                  </Link>
                  <Link
                    href="/login"
                    className="w-full text-center px-4 py-2.5 rounded-lg text-sm font-semibold text-slate-600 hover:text-slate-950"
                  >
                    Ir al inicio de sesión
                  </Link>
                </div>
              </div>
            )}

            {status === "error" && (
              <div className="space-y-4">
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                  {errorMsg}
                </div>
                <Link
                  href="/login"
                  className="w-full inline-flex items-center justify-center text-center px-4 py-2.5 rounded-lg border border-slate-300 hover:border-slate-400 hover:bg-slate-50 transition-colors text-sm font-semibold text-slate-700"
                >
                  Ir al inicio de sesión
                </Link>
              </div>
            )}

            {status === "ready" && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Nueva contraseña
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={8}
                      placeholder="Mínimo 8 caracteres"
                      className={`${inputCls} pr-11`}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={submitting}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                      aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="confirm" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Confirmar contraseña
                  </label>
                  <div className="relative">
                    <input
                      id="confirm"
                      type={showConfirm ? "text" : "password"}
                      required
                      minLength={8}
                      placeholder="Repite tu contraseña"
                      className={`${inputCls} pr-11`}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      disabled={submitting}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                      aria-label={showConfirm ? "Ocultar contraseña" : "Mostrar contraseña"}
                    >
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {errorMsg && (
                  <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5" role="alert">
                    {errorMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold px-4 py-2.5 rounded-lg transition-colors"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Guardando…
                    </>
                  ) : (
                    <>
                      Guardar y entrar
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
