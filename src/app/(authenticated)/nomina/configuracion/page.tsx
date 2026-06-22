"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { canAdmin } from "@/lib/auth/can-manage";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { PayrollSettingsTable } from "@/components/nomina/payroll-settings-table";
import { PayrollSettingForm } from "@/components/nomina/payroll-setting-form";
import type { PayrollSettings } from "@/lib/types";

export default function PayrollSettingsPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const supabase = createClient();

  const [rows, setRows] = useState<PayrollSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("payroll_settings")
      .select("*")
      .order("period_start", { ascending: true });
    setRows((data ?? []) as PayrollSettings[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    if (authLoading || !profile) return;
    if (!canAdmin(profile.role)) router.replace("/dashboard");
  }, [profile, authLoading, router]);

  if (authLoading || !profile) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!canAdmin(profile.role)) return null;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Configuración de nómina</h1>
          <p className="text-muted-foreground">
            Estos valores son de ley (Mintrabajo). Editá solo cuando un decreto los cambie.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo período
        </Button>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <PayrollSettingsTable rows={rows} onChanged={fetchRows} />
      )}

      <PayrollSettingForm
        initial={null}
        open={open}
        onOpenChange={setOpen}
        onSaved={fetchRows}
      />
    </div>
  );
}
