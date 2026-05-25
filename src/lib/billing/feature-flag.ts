/**
 * Feature flag de billing (sub-proyecto 6). Soft launch: arranca en false en prod.
 * NEXT_PUBLIC_ para que sea legible client-side (sidebar, página, banner).
 * El middleware R10 usa la variante server-only BILLING_ENABLED (mismo valor).
 */
export function isBillingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_BILLING_ENABLED === "true";
}
