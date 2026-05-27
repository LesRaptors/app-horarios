"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useOrganizations } from "@/hooks/use-organizations";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const SUBSCRIPTION_LABELS: Record<string, string> = {
  trialing: "En prueba",
  active: "Activa",
  past_due: "Morosa",
  paused: "Pausada",
  canceled: "Cancelada",
};

export default function SuperAdminPage() {
  const router = useRouter();
  const { loading: authLoading, isSuperAdmin, activeOrgId, setActiveOrg } =
    useAuth();

  // Design decision: entering the panel = platform mode → clear a pre-existing
  // active tenant. This must run ONCE on mount (after auth loads), NOT react to
  // activeOrgId: otherwise it would undo the tenant that `enter()` sets right
  // before navigating to /dashboard (race → R11 bounces back to the panel).
  const didClearOnMount = useRef(false);
  useEffect(() => {
    if (authLoading || didClearOnMount.current) return;
    didClearOnMount.current = true;
    if (isSuperAdmin && activeOrgId) void setActiveOrg(null);
  }, [authLoading, isSuperAdmin, activeOrgId, setActiveOrg]);

  const { orgs, loading } = useOrganizations(isSuperAdmin && !authLoading);

  async function enter(orgId: string) {
    try {
      await setActiveOrg(orgId);
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error("No se pudo cambiar de organización");
    }
  }

  if (authLoading) return <div className="p-6">Cargando…</div>;

  if (!isSuperAdmin) {
    return (
      <div className="p-6">No tienes acceso a esta sección.</div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Organizaciones"
        description="Panel de plataforma — gestión cross-org"
      />

      <DataTable
        data={orgs}
        loading={loading}
        keyAccessor={(org) => org.id}
        emptyMessage="No hay organizaciones registradas."
        columns={[
          {
            header: "Organización",
            cell: (org) => (
              <div>
                <span className="font-medium">{org.name}</span>
                <br />
                <span className="text-xs text-muted-foreground">{org.slug}</span>
              </div>
            ),
          },
          {
            header: "Empleados",
            cell: (org) => org.employee_count,
          },
          {
            header: "Sedes",
            cell: (org) => org.location_count,
          },
          {
            header: "Suscripción",
            cell: (org) =>
              org.billing_exempt
                ? "Exenta"
                : (SUBSCRIPTION_LABELS[org.subscription_status] ?? "—"),
          },
          {
            header: "Onboarding",
            cell: (org) =>
              org.onboarding_completed_at ? "Completo" : "Pendiente",
          },
          {
            header: "Acción",
            cell: (org) => (
              <Button
                size="sm"
                aria-label={`Trabajar en ${org.name}`}
                onClick={() => void enter(org.id)}
              >
                Trabajar en esta org
              </Button>
            ),
          },
        ]}
      />
    </div>
  );
}
