-- =============================================================================
-- 055: profiles_select permite SIEMPRE leer la propia fila (id = auth.uid())
-- =============================================================================
-- Bug encontrado en smoke E2E del sub-proyecto 7: cuando un super_admin opera
-- con un tenant activo, is_super_admin()=false y get_user_org_id()=<tenant>,
-- pero su propio profile tiene organization_id=NULL → la policy
-- profiles_select (is_super_admin() OR organization_id = get_user_org_id())
-- evalúa false y el super_admin NO puede leer su propia fila. El AuthContext
-- queda sin profile → sidebar vacío y toda la app rota en modo operación.
--
-- Fix: añadir `id = auth.uid()` — todo usuario puede ver su propia fila
-- (estándar y seguro: solo expone la fila propia, no otras). Resuelve el caso
-- del super_admin operando sin afectar el aislamiento de tenants.
-- =============================================================================

BEGIN;

ALTER POLICY profiles_select ON public.profiles
  USING (
    is_super_admin()
    OR organization_id = get_user_org_id()
    OR id = auth.uid()
  );

COMMIT;
