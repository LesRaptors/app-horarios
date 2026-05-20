"use client";

import { useEffect } from "react";

/**
 * Detecta tokens de recovery/invite que Supabase Auth deja en el fragment
 * cuando el redirect_to no apunta a una página específica (e.g. cuando se
 * dispara "Send password recovery" desde el dashboard de Supabase y el Site
 * URL es solo el origin sin path).
 *
 * Redirige a /auth/set-password preservando el fragment para que el SDK
 * de Supabase pueda procesar el token y establecer la sesión.
 */
export function RecoveryTokenRedirect() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash || !hash.includes("access_token=")) return;
    if (!hash.includes("type=recovery") && !hash.includes("type=invite") && !hash.includes("type=signup")) return;
    window.location.replace(`/auth/set-password${hash}`);
  }, []);
  return null;
}
