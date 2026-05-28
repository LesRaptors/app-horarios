export type DemoOutcome = "created" | "existing_account" | "duplicate_pending";

/**
 * Decide qué hacer con un envío del formulario de demo.
 * - Si el email ya tiene cuenta -> existing_account (guiar a login/recuperar).
 * - Si no, pero ya hay una solicitud pendiente -> duplicate_pending (deduplicar).
 * - Si no -> created (insertar nueva).
 * "Tiene cuenta" tiene prioridad sobre "pendiente".
 */
export function classifyDemoSubmission(
  hasAccount: boolean,
  pendingRequestId: string | null
): DemoOutcome {
  if (hasAccount) return "existing_account";
  if (pendingRequestId) return "duplicate_pending";
  return "created";
}
