"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Checkbox } from "@/components/ui/checkbox";
import { sanitizeSlug, isValidSlug } from "@/lib/onboarding/slug-validator";
import { toast } from "sonner";
import { Loader2, Check, AlertCircle } from "lucide-react";
import type { Database } from "@/lib/supabase/database.types";

type DemoRequest = Database["public"]["Tables"]["demo_requests"]["Row"];

interface Props {
  lead: DemoRequest;
  onClose: () => void;
  onApproved: () => void;
}

type SlugStatus = "checking" | "available" | "taken" | "invalid";

export function ApproveDialog({ lead, onClose, onApproved }: Props) {
  const [orgName, setOrgName] = useState(lead.empresa);
  const [slug, setSlug] = useState(sanitizeSlug(lead.empresa));
  const [plan, setPlan] = useState<"trial" | "starter" | "pro" | "enterprise">(
    "trial"
  );
  const [firstName, setFirstName] = useState(
    lead.nombre?.split(" ")[0] ?? ""
  );
  const [lastName, setLastName] = useState(
    lead.nombre?.split(" ").slice(1).join(" ") ?? ""
  );
  const [email, setEmail] = useState(lead.email);
  const [sendWelcome, setSendWelcome] = useState(true);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("checking");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isValidSlug(slug)) {
      setSlugStatus("invalid");
      return;
    }
    setSlugStatus("checking");
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/demo-requests/check-slug?slug=${encodeURIComponent(slug)}`
        );
        const data = (await res.json()) as { available: boolean };
        if (data.available) setSlugStatus("available");
        else setSlugStatus("taken");
      } catch {
        setSlugStatus("invalid");
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [slug]);

  async function handleApprove() {
    if (slugStatus !== "available") {
      toast.error("El slug no está disponible");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/demo-requests/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          demo_request_id: lead.id,
          org_name: orgName,
          org_slug: slug,
          plan,
          admin_email: email,
          admin_first_name: firstName,
          admin_last_name: lastName,
          send_welcome_email: sendWelcome,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Error aprobando");
        return;
      }
      toast.success(`Org creada: ${slug}`);
      onApproved();
    } finally {
      setSubmitting(false);
    }
  }

  const isFormValid =
    orgName.trim().length >= 2 &&
    slugStatus === "available" &&
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Aprobar demo: {lead.empresa}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="org-name">Nombre empresa *</Label>
            <Input
              id="org-name"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="org-slug">Slug (URL única) *</Label>
            <div className="relative">
              <Input
                id="org-slug"
                value={slug}
                onChange={(e) => setSlug(sanitizeSlug(e.target.value))}
                aria-describedby="slug-status slug-hint"
              />
              <div className="absolute right-2 top-2.5">
                {slugStatus === "checking" && (
                  <Loader2
                    className="h-4 w-4 animate-spin text-slate-400"
                    aria-label="Verificando disponibilidad"
                  />
                )}
                {slugStatus === "available" && (
                  <Check
                    className="h-4 w-4 text-green-600"
                    aria-label="Slug disponible"
                  />
                )}
                {(slugStatus === "taken" || slugStatus === "invalid") && (
                  <AlertCircle
                    className="h-4 w-4 text-red-600"
                    aria-label="Slug no disponible"
                  />
                )}
              </div>
            </div>
            <p
              id="slug-status"
              className="mt-1 text-sm text-red-600"
              role="status"
              aria-live="polite"
            >
              {slugStatus === "taken" && "Slug en uso"}
              {slugStatus === "invalid" &&
                "Formato inválido (lowercase + guiones, 3-50 chars)"}
            </p>
            <p id="slug-hint" className="mt-1 text-xs text-slate-500">
              Se usará como subdomain en sub-proy 5
            </p>
          </div>
          <div>
            <Label>País</Label>
            <Input value="Colombia (CO)" disabled />
          </div>
          <div>
            <Label htmlFor="plan-select">Plan inicial *</Label>
            <Select
              value={plan}
              onValueChange={(v) => setPlan(v as typeof plan)}
            >
              <SelectTrigger id="plan-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="trial">Trial 30 días</SelectItem>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="border-t pt-4">
            <Label className="mb-2 block">Primer admin</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                aria-label="Nombre del admin"
                placeholder="Nombre"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
              <Input
                aria-label="Apellido del admin"
                placeholder="Apellido"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
            <Input
              className="mt-2"
              type="email"
              aria-label="Email del admin"
              placeholder="email@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="welcome"
              checked={sendWelcome}
              onCheckedChange={(c) => setSendWelcome(c === true)}
            />
            <Label htmlFor="welcome" className="text-sm">
              Enviar email de bienvenida (Resend)
            </Label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button
              onClick={handleApprove}
              disabled={submitting || !isFormValid}
            >
              {submitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Aprobar y crear
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
