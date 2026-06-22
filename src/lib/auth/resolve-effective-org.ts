import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Resuelve la org efectiva del caller para escrituras server-side (rutas API).
 *
 * - Usuario normal (admin/manager/employee): su propia `organization_id`.
 * - super_admin: la org activa en `super_admin_active_org` (el tenant en el que
 *   opera vía el tenant-switcher). Devuelve `null` si no tiene tenant activo
 *   (está en el panel super_admin).
 *
 * Es el equivalente server-side de `computeEffectiveOrgId` (cliente): un
 * super_admin tiene `organization_id = null` en su propio profile, así que las
 * rutas que insertan filas org-scoped NO pueden usar `callerProfile.organization_id`
 * directo — violarían el CHECK `profiles_org_required` / el trigger handle_new_user.
 *
 * Funciona tanto con el admin client (service_role, que bypassa RLS) como con el
 * client autenticado del usuario: el self-read de `super_admin_active_org` pasa la
 * policy `saao_self` (USING user_id = auth.uid()), así que el super_admin siempre
 * puede leer su propia fila.
 */
export async function resolveEffectiveOrgId(
  adminSupabase: SupabaseClient<Database>,
  caller: { id: string; role: string; organization_id: string | null }
): Promise<string | null> {
  if (caller.role !== "super_admin") {
    return caller.organization_id;
  }

  const { data } = await adminSupabase
    .from("super_admin_active_org")
    .select("active_org_id")
    .eq("user_id", caller.id)
    .maybeSingle();

  return data?.active_org_id ?? null;
}
