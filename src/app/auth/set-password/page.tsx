"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { AppLogo } from "@/components/shared/app-logo";
import { APP_NAME } from "@/lib/constants";

type Status = "checking" | "ready" | "error" | "expired";

export default function SetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
          "No encontramos una sesión válida. El enlace puede haber expirado — pídele a tu administrador que te invite de nuevo."
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
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="flex justify-center">
            <AppLogo size={56} />
          </div>
          <CardTitle>{APP_NAME}</CardTitle>
          <CardDescription>
            Establece tu contraseña para terminar de activar tu cuenta
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === "checking" && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {status === "expired" && (
            <div className="space-y-3 text-sm">
              <p>El enlace de invitación expiró o ya fue utilizado.</p>
              <p className="text-muted-foreground">
                Pídele a tu administrador que te invite de nuevo desde la sección
                de empleados.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/login")}
              >
                Ir al inicio de sesión
              </Button>
            </div>
          )}

          {status === "error" && (
            <div className="space-y-3 text-sm">
              <p className="text-destructive">{errorMsg}</p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/login")}
              >
                Ir al inicio de sesión
              </Button>
            </div>
          )}

          {status === "ready" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Nueva contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Mínimo 8 caracteres.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirmar contraseña</Label>
                <Input
                  id="confirm"
                  type="password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={submitting}
                />
              </div>
              {errorMsg && (
                <p className="text-sm text-destructive">{errorMsg}</p>
              )}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar contraseña y entrar
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
