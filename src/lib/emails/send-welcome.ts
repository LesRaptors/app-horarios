import { resend, FROM_NOREPLY } from "@/lib/resend";
import WelcomeOrgAdminEmail from "@/emails/welcome-org-admin";

interface Params {
  to: string;
  firstName: string;
  orgName: string;
  trialEndsAt: string;
  setPasswordUrl: string;
}

export async function sendWelcomeEmail(params: Params) {
  return resend.emails.send({
    from: FROM_NOREPLY,
    to: params.to,
    subject: `Bienvenido a Tus Horarios, ${params.firstName}`,
    react: WelcomeOrgAdminEmail({
      firstName: params.firstName,
      orgName: params.orgName,
      trialEndsAt: params.trialEndsAt,
      setPasswordUrl: params.setPasswordUrl,
    }),
  });
}
