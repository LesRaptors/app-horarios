"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { isSuperAdmin } from "@/lib/auth/can-manage";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ApproveDialog } from "./approve-dialog";
import { toast } from "sonner";
import type { Database } from "@/lib/supabase/database.types";
import type { UserRole } from "@/lib/types";

type DemoRequest = Database["public"]["Tables"]["demo_requests"]["Row"];

const STATUS_LABELS: Record<string, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  scheduled: "Agendado",
  approved: "Aprobado",
  rejected: "Rechazado",
  spam: "Spam",
};

export default function DemoRequestsPage() {
  const { profile, loading: authLoading } = useAuth();
  const [requests, setRequests] = useState<DemoRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [selectedLead, setSelectedLead] = useState<DemoRequest | null>(null);
  const [emailsWithAccount, setEmailsWithAccount] = useState<Set<string>>(new Set());
  const supabase = createClient();

  const loadRequests = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("demo_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (statusFilter === "pending") {
      query = query.in("status", ["new", "contacted", "scheduled"]);
    } else if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;
    if (error) toast.error("Error cargando solicitudes");
    setRequests((data ?? []) as DemoRequest[]);
    const emails = (data ?? []).map((r) => (r.email ?? "").toLowerCase()).filter(Boolean);
    if (emails.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("email").in("email", emails);
      setEmailsWithAccount(new Set((profs ?? []).map((p) => (p.email ?? "").toLowerCase())));
    } else {
      setEmailsWithAccount(new Set());
    }
    setLoading(false);
  }, [supabase, statusFilter]);

  useEffect(() => {
    if (authLoading) return;
    if (!isSuperAdmin((profile?.role ?? null) as UserRole | null)) return;
    void loadRequests();
  }, [authLoading, profile?.role, loadRequests]);

  async function markStatus(id: string, status: string) {
    const patch: { status: string; contacted_at?: string } = { status };
    if (status === "contacted") patch.contacted_at = new Date().toISOString();
    const { error } = await supabase.from("demo_requests").update(patch).eq("id", id);
    if (error) {
      toast.error("Error actualizando");
    } else {
      toast.success("Estado actualizado");
      void loadRequests();
    }
  }

  async function resendAccess(email: string) {
    const res = await fetch("/api/admin/demo-requests/resend-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) toast.success("Acceso reenviado (la persona recibirá un email)");
    else toast.error("No se pudo reenviar el acceso");
  }

  if (authLoading) return <div className="p-6">Cargando…</div>;
  if (!isSuperAdmin((profile?.role ?? null) as UserRole | null)) {
    return <div className="p-6">No tienes permisos para ver esta página.</div>;
  }

  const filters = [
    { value: "pending", label: "Pendientes" },
    { value: "all", label: "Todos" },
    { value: "approved", label: "Aprobados" },
    { value: "rejected", label: "Rechazados" },
  ];

  return (
    <div className="p-6">
      <PageHeader
        title="Solicitudes de demo"
        description="Gestiona y aprueba leads del landing"
      />

      <div
        className="my-4 flex gap-2"
        role="tablist"
        aria-label="Filtrar por estado"
      >
        {filters.map((f) => (
          <Button
            key={f.value}
            variant={statusFilter === f.value ? "default" : "outline"}
            size="sm"
            role="tab"
            aria-selected={statusFilter === f.value}
            onClick={() => setStatusFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <DataTable
        data={requests}
        loading={loading}
        keyAccessor={(r) => r.id}
        emptyMessage="No hay solicitudes."
        columns={[
          {
            header: "Fecha",
            cell: (r) =>
              new Date(r.created_at).toLocaleDateString("es-CO"),
          },
          { header: "Empresa", cell: (r) => r.empresa },
          { header: "Email", cell: (r) => r.email },
          { header: "Sector", cell: (r) => r.sector },
          {
            header: "Estado",
            cell: (r) => (
              <span className="capitalize">
                {STATUS_LABELS[r.status ?? ""] ?? r.status}
              </span>
            ),
          },
          {
            header: "Acciones",
            cell: (r) => {
              const pending = ["new", "contacted", "scheduled"].includes(r.status ?? "");
              const hasAccount = emailsWithAccount.has((r.email ?? "").toLowerCase());
              if (pending && hasAccount) {
                return (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Ya tiene cuenta
                    </span>
                    <Button size="sm" variant="outline" aria-label={`Reenviar acceso a ${r.email}`} onClick={() => resendAccess(r.email ?? "")}>
                      Reenviar acceso
                    </Button>
                    <Button size="sm" variant="outline" aria-label={`Descartar solicitud de ${r.empresa}`} onClick={() => markStatus(r.id, "spam")}>
                      Descartar
                    </Button>
                  </div>
                );
              }
              if (pending) {
                return (
                  <div className="flex gap-2">
                    <Button size="sm" aria-label={`Aprobar ${r.empresa}`} onClick={() => setSelectedLead(r)}>Aprobar</Button>
                    {r.status !== "contacted" && (
                      <Button size="sm" variant="outline" aria-label={`Marcar ${r.empresa} como contactado`} onClick={() => markStatus(r.id, "contacted")}>Contactado</Button>
                    )}
                    <Button size="sm" variant="outline" aria-label={`Rechazar ${r.empresa}`} onClick={() => markStatus(r.id, "rejected")}>Rechazar</Button>
                  </div>
                );
              }
              if (r.status === "approved" && r.approved_org_id) {
                return <span className="text-sm text-slate-500">&rarr; Org creada</span>;
              }
              return <span className="text-sm text-slate-400">—</span>;
            },
          },
        ]}
      />

      {selectedLead && (
        <ApproveDialog
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onApproved={() => {
            setSelectedLead(null);
            void loadRequests();
          }}
        />
      )}
    </div>
  );
}
