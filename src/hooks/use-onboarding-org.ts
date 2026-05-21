"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Lightweight hook for onboarding pages (outside the authenticated layout).
 * Fetches organization_id directly from the Supabase session + profile,
 * without requiring AuthProvider.
 */
export function useOnboardingOrg() {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();
      setOrganizationId(profile?.organization_id ?? null);
      setLoading(false);
    })();
  }, []);

  return { organizationId, loading };
}
