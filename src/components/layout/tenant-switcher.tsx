"use client";

import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useOrganizations } from "@/hooks/use-organizations";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PANEL_VALUE = "__panel__";

export function TenantSwitcher() {
  const { isSuperAdmin, activeOrg, setActiveOrg } = useAuth();
  const { orgs } = useOrganizations(isSuperAdmin);

  if (!isSuperAdmin) return null;

  async function onChange(value: string) {
    try {
      await setActiveOrg(value === PANEL_VALUE ? null : value);
      // Full reload: el panel/las páginas re-ejecutan con el tenant correcto.
      window.location.href = value === PANEL_VALUE ? "/super-admin" : "/dashboard";
    } catch {
      toast.error("No se pudo cambiar de organización");
    }
  }

  return (
    <Select
      value={activeOrg?.id ?? PANEL_VALUE}
      onValueChange={(v) => void onChange(v)}
    >
      <SelectTrigger className="w-[220px]" aria-label="Organización activa">
        <SelectValue placeholder="Elige organización" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={PANEL_VALUE}>← Panel SaaS (todas)</SelectItem>
        {orgs.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
