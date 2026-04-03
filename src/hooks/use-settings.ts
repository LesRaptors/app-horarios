"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_LABOR_CONSTRAINTS } from "@/lib/constants";
import type { LaborConstraints } from "@/lib/types";

export function useSettings() {
  const [constraints, setConstraints] = useState<LaborConstraints>(
    DEFAULT_LABOR_CONSTRAINTS as unknown as LaborConstraints
  );
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function fetchSettings() {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "labor_constraints")
        .single();

      if (data?.value) {
        setConstraints(data.value as unknown as LaborConstraints);
      }
      setLoading(false);
    }

    fetchSettings();
  }, []);

  const updateConstraints = async (newConstraints: LaborConstraints) => {
    const { error } = await supabase
      .from("app_settings")
      .update({ value: newConstraints as unknown as import("@/lib/supabase/database.types").Json, updated_at: new Date().toISOString() })
      .eq("key", "labor_constraints");

    if (!error) {
      setConstraints(newConstraints);
    }

    return { error };
  };

  return { constraints, loading, updateConstraints };
}
