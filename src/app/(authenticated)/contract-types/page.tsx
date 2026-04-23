"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { translateDbError } from "@/lib/utils";
import { ContractTypeForm } from "./contract-type-form";
import type { ContractType } from "@/lib/types";

type Row = ContractType & { employee_count: number };

export default function ContractTypesPage() {
  const supabase = createClient();
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ContractType | null>(null);
  const [deleting, setDeleting] = useState<ContractType | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && profile && profile.role !== "admin") {
      router.push("/dashboard");
    }
  }, [profile, authLoading, router]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [typesRes, empsRes] = await Promise.all([
      supabase.from("contract_types").select("*").order("name"),
      supabase.from("profiles").select("contract_type_id"),
    ]);

    if (typesRes.error) {
      toast.error(
        translateDbError(typesRes.error.message, "Error al cargar tipos de contrato")
      );
      setItems([]);
      setLoading(false);
      return;
    }

    const counts: Record<string, number> = {};
    for (const e of empsRes.data ?? []) {
      const id = e.contract_type_id;
      if (!id) continue;
      counts[id] = (counts[id] ?? 0) + 1;
    }

    setItems(
      (typesRes.data ?? []).map((t) => ({
        ...t,
        employee_count: counts[t.id] ?? 0,
      }))
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (!authLoading && profile?.role === "admin") {
      fetchData();
    }
  }, [authLoading, profile, fetchData]);

  async function handleDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    const { error } = await supabase
      .from("contract_types")
      .delete()
      .eq("id", deleting.id);

    if (error) {
      toast.error(translateDbError(error.message, "Error al eliminar"));
    } else {
      toast.success("Tipo eliminado");
      fetchData();
    }
    setDeleteLoading(false);
    setDeleting(null);
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (profile?.role !== "admin") return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tipos de contrato"
        description="Define plantillas de contrato con caps trimestrales y targets mensuales"
        action={{
          label: "Nuevo tipo",
          onClick: () => {
            setEditing(null);
            setFormOpen(true);
          },
        }}
      />

      <DataTable<Row>
        data={items}
        loading={loading}
        keyAccessor={(r) => r.id}
        emptyMessage="No hay tipos de contrato creados aún."
        columns={[
          {
            header: "Nombre",
            cell: (r) => <span className="font-medium">{r.name}</span>,
          },
          {
            header: "Empleados",
            cell: (r) => r.employee_count,
          },
          {
            header: "Max dom/trim",
            cell: (r) => r.max_sundays_per_quarter,
          },
          {
            header: "Max fest/trim",
            cell: (r) => r.max_holidays_per_quarter,
          },
          {
            header: "Target sáb/mes",
            cell: (r) => r.target_saturdays_per_month ?? "—",
          },
          {
            header: "Target noches/mes",
            cell: (r) => r.target_nights_per_month ?? "—",
          },
          {
            header: "Horas/sem",
            cell: (r) => r.target_hours_per_week ?? "—",
          },
          {
            header: "Acciones",
            className: "w-28",
            cell: (r) => (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setEditing(r);
                    setFormOpen(true);
                  }}
                  aria-label="Editar"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleting(r)}
                  disabled={r.employee_count > 0}
                  aria-label="Eliminar"
                  title={
                    r.employee_count > 0
                      ? "No se puede eliminar: hay empleados usando este tipo"
                      : "Eliminar"
                  }
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ),
          },
        ]}
      />

      <ContractTypeForm
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        onSaved={fetchData}
      />

      <DeleteDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        onConfirm={handleDelete}
        loading={deleteLoading}
        title={deleting ? `¿Eliminar "${deleting.name}"?` : "¿Eliminar tipo?"}
        description="Esta acción no se puede deshacer. Si hay empleados usando este tipo, la eliminación será rechazada."
      />
    </div>
  );
}
