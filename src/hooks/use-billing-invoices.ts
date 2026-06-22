"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Invoice } from "@/lib/billing/types";

export function useBillingInvoices(enabled: boolean): {
  invoices: Invoice[];
  loading: boolean;
} {
  const { effectiveOrgId } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled || !effectiveOrgId) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from("invoices")
        .select("*")
        .eq("organization_id", effectiveOrgId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (!cancelled) {
        setInvoices((data as Invoice[]) ?? []);
        setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [enabled, effectiveOrgId]);

  return { invoices, loading };
}
