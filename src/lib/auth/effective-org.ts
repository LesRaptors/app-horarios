/**
 * Org efectiva para escrituras/scoping en el cliente.
 * - Usuario normal: su propia organization_id.
 * - super_admin (organization_id null): la org activa seleccionada, o null si está en el panel.
 */
export function computeEffectiveOrgId(
  ownOrgId: string | null,
  activeOrgId: string | null
): string | null {
  return ownOrgId ?? activeOrgId;
}
