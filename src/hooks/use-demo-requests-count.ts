"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const POLL_INTERVAL_MS = 60_000;

/**
 * Conteo de demo_requests con status='new'. Polling cada 60s + refresco al
 * recuperar foco. Solo dispara queries si `enabled=true` (super_admin) para
 * no gastar requests en usuarios sin acceso.
 *
 * RLS demo_requests_select_admin permite SELECT a super_admin/admin/manager.
 * Si la query falla (no autorizado, DB down), retorna 0 silenciosamente.
 */
export function useDemoRequestsCount(enabled: boolean): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const supabase = createClient();
    let cancelled = false;

    const fetchCount = async () => {
      const { count: result } = await supabase
        .from("demo_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "new");
      if (!cancelled) setCount(result ?? 0);
    };

    fetchCount();
    const intervalId = setInterval(fetchCount, POLL_INTERVAL_MS);
    const onFocus = () => fetchCount();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled]);

  return count;
}
