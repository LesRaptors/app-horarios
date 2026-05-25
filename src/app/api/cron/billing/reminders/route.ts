import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decideDunningAction } from "@/lib/billing/dunning";
import {
  sendBillingEmail,
  sendBillingEmailToOrg,
} from "@/lib/emails/send-billing-emails";
import { processDianEmitJobs } from "@/lib/billing/dian-emit-job";

export const runtime = "nodejs";
export const maxDuration = 300;

const PAYMENT_URL = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.tushorarios.com"}/facturacion`;

/**
 * Construye el objeto `data` que espera cada plantilla de correo.
 *
 * trial-ending  → { paymentUrl, daysUntilEnd }
 * payment-failed → { paymentUrl, amountCop? }
 * pause-warning  → { paymentUrl }
 */
function buildEmailData(
  template: "trial-ending" | "payment-failed" | "pause-warning",
  daysOffset: number
): Record<string, unknown> {
  switch (template) {
    case "trial-ending":
      // daysOffset es negativo (p.ej. -3 = faltan 3 días). daysUntilEnd es positivo.
      return { paymentUrl: PAYMENT_URL, daysUntilEnd: -daysOffset };
    case "payment-failed":
      return { paymentUrl: PAYMENT_URL };
    case "pause-warning":
      return { paymentUrl: PAYMENT_URL };
  }
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Soft launch: con billing OFF el cron es no-op (no envía reminders ni pausa orgs).
  if (process.env.BILLING_ENABLED !== "true") {
    return NextResponse.json({ skipped: "billing disabled" });
  }

  const supabase = createAdminClient();
  const now = new Date();

  const { data: subs } = await supabase
    .from("subscriptions")
    .select("*, organizations!inner(name, billing_email, billing_exempt)")
    .in("status", ["trialing", "past_due"])
    .eq("organizations.billing_exempt", false);

  const emailsSent: string[] = [];
  const transitions: Record<string, number> = {};

  for (const sub of (subs as Array<Record<string, unknown>> | null) ?? []) {
    try {
      const action = decideDunningAction(
        sub as Parameters<typeof decideDunningAction>[0],
        now
      );
      if (!action) continue;

      if (action.kind === "transition") {
        await supabase
          .from("subscriptions")
          .update({ status: action.to })
          .eq("id", sub.id as string);

        if (action.to === "paused") {
          await supabase
            .from("organizations")
            .update({ status: "paused" })
            .eq("id", sub.organization_id as string);
        }

        transitions[action.to] = (transitions[action.to] ?? 0) + 1;
        continue;
      }

      // action.kind === "email"
      const { data: alreadySent } = await supabase
        .from("sent_reminders")
        .select("id")
        .eq("organization_id", sub.organization_id as string)
        .eq("template", action.template)
        .eq("days_offset", action.daysOffset)
        .maybeSingle();

      if (alreadySent) continue;

      const org = sub.organizations as {
        name: string;
        billing_email: string | null;
        billing_exempt: boolean;
      };

      const emailData = buildEmailData(action.template, action.daysOffset);

      if (org.billing_email) {
        await sendBillingEmail({
          template: action.template,
          to: org.billing_email,
          orgName: org.name,
          data: emailData,
        });
      } else {
        // billing_email no configurado: resolver el admin de la org via sendBillingEmailToOrg
        await sendBillingEmailToOrg(
          action.template,
          sub.organization_id as string,
          emailData
        );
      }

      await supabase.from("sent_reminders").insert({
        organization_id: sub.organization_id as string,
        template: action.template,
        days_offset: action.daysOffset,
      });

      emailsSent.push(`${org.name}/${action.template}`);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(
        "[cron reminders] sub failed",
        sub.id,
        errMsg
      );
    }
  }

  const dianResult = await processDianEmitJobs();

  return NextResponse.json({ emailsSent, transitions, dianResult });
}
