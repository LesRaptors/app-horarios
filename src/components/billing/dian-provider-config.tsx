"use client";
import { useEffect, useId, useState } from "react";
import { CheckCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { DianProviderName } from "@/lib/billing/types";

interface ProviderInfo {
  provider: DianProviderName;
  is_active: boolean;
  configured_at: string;
}

interface GetProvidersResponse {
  data: ProviderInfo | null;
}

const PROVIDER_LABELS: Record<DianProviderName, string> = {
  alegra: "Alegra",
  siigo: "Siigo",
  facturatech: "FacturaTech",
  manual: "Manual (sin integración DIAN)",
};

interface FormErrors {
  email_user?: string;
  api_key?: string;
}

export function DianProviderConfig() {
  const [current, setCurrent] = useState<ProviderInfo | null>(null);
  const [loadingCurrent, setLoadingCurrent] = useState(true);
  const [editing, setEditing] = useState(false);

  // Form state
  const [provider, setProvider] = useState<DianProviderName>("alegra");
  const [emailUser, setEmailUser] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const emailId = useId();
  const apiKeyId = useId();
  const emailErrorId = `${emailId}-error`;
  const apiKeyErrorId = `${apiKeyId}-error`;

  const fetchCurrent = async () => {
    setLoadingCurrent(true);
    try {
      const res = await fetch("/api/billing/providers");
      if (!res.ok) return;
      const body = (await res.json()) as GetProvidersResponse;
      setCurrent(body.data ?? null);
      if (!body.data) setEditing(true);
    } catch {
      // silently fall through to empty state
    } finally {
      setLoadingCurrent(false);
    }
  };

  useEffect(() => {
    void fetchCurrent();
  }, []);

  const validate = (): boolean => {
    const next: FormErrors = {};
    if (provider !== "manual") {
      if (!emailUser.trim()) next.email_user = "El email es obligatorio.";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailUser.trim()))
        next.email_user = "Ingresa un email válido.";
      if (!apiKey.trim()) next.api_key = "La API key es obligatoria.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;

    const config: Record<string, string> =
      provider === "manual" ? {} : { email_user: emailUser.trim(), api_key: apiKey.trim() };

    setSubmitting(true);
    try {
      const res = await fetch("/api/billing/providers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, config }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error((body as { error?: string }).error ?? "Error al guardar la configuración.");
        return;
      }
      toast.success("Proveedor DIAN configurado correctamente.");
      setEditing(false);
      setEmailUser("");
      setApiKey("");
      setErrors({});
      await fetchCurrent();
    } catch {
      toast.error("Error inesperado al guardar la configuración.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingCurrent) {
    return (
      <div className="space-y-2">
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (current && !editing) {
    const configuredDate = new Date(current.configured_at).toLocaleDateString("es-CO", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
          <CheckCircle className="h-5 w-5" aria-hidden />
          <span className="font-medium">Conectado</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Proveedor: <strong>{PROVIDER_LABELS[current.provider]}</strong>
        </p>
        <p className="text-sm text-muted-foreground">
          Configurado el {configuredDate}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => {
            setProvider(current.provider);
            setEditing(true);
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
          Cambiar proveedor
        </Button>
      </div>
    );
  }

  const needsCreds = provider !== "manual";

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="dian-provider-select">Proveedor DIAN</Label>
        <Select
          value={provider}
          onValueChange={(v) => {
            setProvider(v as DianProviderName);
            setErrors({});
          }}
        >
          <SelectTrigger id="dian-provider-select" className="w-full">
            <SelectValue placeholder="Selecciona un proveedor" />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(PROVIDER_LABELS) as [DianProviderName, string][]).map(
              ([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
      </div>

      {needsCreds && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor={emailId}>
              Email de usuario <span aria-hidden>*</span>
            </Label>
            <Input
              id={emailId}
              type="email"
              autoComplete="username"
              value={emailUser}
              onChange={(e) => {
                setEmailUser(e.target.value);
                if (errors.email_user) setErrors((prev) => ({ ...prev, email_user: undefined }));
              }}
              aria-required="true"
              aria-invalid={errors.email_user ? true : undefined}
              aria-describedby={errors.email_user ? emailErrorId : undefined}
              className={errors.email_user ? "border-destructive focus-visible:ring-destructive" : ""}
            />
            {errors.email_user && (
              <p id={emailErrorId} className="text-sm text-destructive" role="alert">
                {errors.email_user}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={apiKeyId}>
              API Key <span aria-hidden>*</span>
            </Label>
            <Input
              id={apiKeyId}
              type="password"
              autoComplete="current-password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                if (errors.api_key) setErrors((prev) => ({ ...prev, api_key: undefined }));
              }}
              aria-required="true"
              aria-invalid={errors.api_key ? true : undefined}
              aria-describedby={errors.api_key ? apiKeyErrorId : undefined}
              className={errors.api_key ? "border-destructive focus-visible:ring-destructive" : ""}
            />
            {errors.api_key && (
              <p id={apiKeyErrorId} className="text-sm text-destructive" role="alert">
                {errors.api_key}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Las credenciales se almacenan cifradas y nunca se muestran de nuevo.
            </p>
          </div>
        </>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Guardando..." : "Guardar configuración"}
        </Button>
        {current && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setEditing(false);
              setErrors({});
              setEmailUser("");
              setApiKey("");
            }}
          >
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
