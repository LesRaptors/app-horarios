"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  billing_exempt: boolean;
  current_plan_id: string;
  onboarding_completed_at: string;
  subscription_status: string;
  employee_count: number;
  location_count: number;
}

/**
 * Lista todas las organizaciones con métricas vía RPC list_owner_organizations.
 * Usa SECURITY DEFINER (raw super_admin check) para sortear las RLS
 * tenant-aware que filtrarían a 1 org cuando hay tenant activo.
 *
 * Solo dispara queries si `enabled=true` para no gastar requests en
 * usuarios sin acceso.
 */
export function useOrganizations(enabled: boolean) {
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("list_owner_organizations");
    if (error) {
      setOrgs([]);
    } else {
      setOrgs(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [enabled, load]);

  return { orgs, loading, reload: load };
}
