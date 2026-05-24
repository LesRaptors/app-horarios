import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTransaction } from "@/lib/billing/wompi/client";
import {
  calculateNextPeriodEnd,
  copToCents,
  calculateIva,
  calculateTotalWithIva,
} from "@/lib/billing/engine";

export const runtime = "nodejs";
export const maxDuration = 300;

type OrgJoin = {
  billing_exempt: boolean | null;
  billing_email: string | null;
  name: string;
};

type SubWithOrg = {
  id: string;
  organization_id: string;
  plan_id: string;
  payment_method_id: string | null;
  current_period_end: string;
  status: string;
  organizations: OrgJoin;
};

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();

  const { data: subs } = await supabase
    .from("subscriptions")
    .select("*, organizations!inner(billing_exempt, billing_email, name)")
    .lte("current_period_end", now.toISOString())
    .in("status", ["active", "trialing"])
    .eq("organizations.billing_exempt", false);

  const results = { processed: 0, charged: 0, failed: 0, paused: 0 };

  for (const sub of (subs as SubWithOrg[] | null) ?? []) {
    results.processed++;

    if (!sub.payment_method_id) {
      await supabase
        .from("subscriptions")
        .update({ status: "past_due" })
        .eq("id", sub.id);
      results.failed++;
      continue;
    }

    const { data: plan } = await supabase
      .from("plans")
      .select("*")
      .eq("id", sub.plan_id)
      .single();

    const { data: pm } = await supabase
      .from("payment_methods")
      .select("*")
      .eq("id", sub.payment_method_id)
      .single();

    const amount = (plan as { price_cop: number }).price_cop;
    const iva = calculateIva(amount);
    const total = calculateTotalWithIva(amount);

    const { data: invoice } = await supabase
      .from("invoices")
      .insert({
        organization_id: sub.organization_id,
        subscription_id: sub.id,
        plan_id: sub.plan_id,
        period_start: now.toISOString(),
        period_end: calculateNextPeriodEnd(now).toISOString(),
        amount_cop: amount,
        iva_cop: iva,
        total_cop: total,
        status: "open",
        due_date: now.toISOString(),
      })
      .select("id")
      .single();

    try {
      const tx = await createTransaction({
        paymentSourceId: (pm as { provider_payment_source_id: string })
          .provider_payment_source_id,
        amountInCents: copToCents(total),
        currency: "COP",
        reference: (invoice as { id: string }).id,
        customerEmail:
          sub.organizations.billing_email ?? "billing@tushorarios.com",
        recurrent: true,
      });

      const paymentStatus =
        tx.status === "APPROVED"
          ? "approved"
          : tx.status === "DECLINED"
            ? "declined"
            : "pending";

      await supabase.from("payments").insert({
        invoice_id: (invoice as { id: string }).id,
        payment_method_id: (pm as { id: string }).id,
        provider: "wompi",
        provider_transaction_id: tx.id,
        amount_cop: total,
        status: paymentStatus,
      });

      if (tx.status === "APPROVED") {
        results.charged++;
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[cron process-cycles] charge failed", errMsg);

      await supabase
        .from("invoices")
        .update({ status: "failed" })
        .eq("id", (invoice as { id: string }).id);

      await supabase
        .from("subscriptions")
        .update({ status: "past_due" })
        .eq("id", sub.id);

      results.failed++;
    }
  }

  return NextResponse.json(results);
}
