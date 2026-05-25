import { resend, FROM_NOTIF } from "@/lib/resend";
import { createAdminClient } from "@/lib/supabase/admin";
import BillingTrialEndingEmail from "@/emails/billing-trial-ending";
import BillingPaymentFailedEmail from "@/emails/billing-payment-failed";
import BillingPauseWarningEmail from "@/emails/billing-pause-warning";
import BillingPaymentConfirmedEmail from "@/emails/billing-payment-confirmed";

export type BillingEmailTemplate =
  | "trial-ending"
  | "payment-failed"
  | "pause-warning"
  | "payment-confirmed";

export async function sendBillingEmail(args: {
  template: BillingEmailTemplate;
  to: string;
  orgName: string;
  data: Record<string, unknown>;
}): Promise<void> {
  const subject = subjectFor(args.template);
  const react = componentFor(args.template, args.orgName, args.data);
  await resend.emails.send({
    from: `Tus Horarios <${FROM_NOTIF}>`,
    to: args.to,
    subject,
    react,
  });
}

function subjectFor(t: BillingEmailTemplate): string {
  switch (t) {
    case "trial-ending":
      return "Tu trial de Tus Horarios vence pronto";
    case "payment-failed":
      return "No pudimos cobrar tu suscripción";
    case "pause-warning":
      return "Tu suscripción se pausará en 2 días";
    case "payment-confirmed":
      return "Pago confirmado — Tus Horarios";
  }
}

function componentFor(
  t: BillingEmailTemplate,
  orgName: string,
  data: Record<string, unknown>
) {
  const baseProps = { orgName, ...data };
  switch (t) {
    case "trial-ending":
      return BillingTrialEndingEmail(baseProps as never);
    case "payment-failed":
      return BillingPaymentFailedEmail(baseProps as never);
    case "pause-warning":
      return BillingPauseWarningEmail(baseProps as never);
    case "payment-confirmed":
      return BillingPaymentConfirmedEmail(baseProps as never);
  }
}

/**
 * Resuelve el email del admin de la organización y envía el correo de billing.
 *
 * Estrategia de resolución: profiles.email del primer perfil con role='admin'
 * en la organización. profiles.email espeja auth.users.email y siempre está
 * presente (NOT NULL en el esquema).
 */
export async function sendBillingEmailToOrg(
  template: BillingEmailTemplate,
  organizationId: string,
  data: Record<string, unknown> = {}
): Promise<void> {
  const supabase = createAdminClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .single();

  // Admin de la org (rol 'admin'); fallback: cualquier perfil de la org
  const { data: admin } = await supabase
    .from("profiles")
    .select("email")
    .eq("organization_id", organizationId)
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  if (!admin?.email) {
    console.error(
      "[send-billing-email] no admin email for org",
      organizationId
    );
    return;
  }

  await sendBillingEmail({
    template,
    to: admin.email,
    orgName: org?.name ?? "tu organización",
    data,
  });
}
