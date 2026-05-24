import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWompiWebhook, type WompiWebhookPayload } from "@/lib/billing/wompi/webhook-verify";
import { getTransaction } from "@/lib/billing/wompi/client";
import { calculateNextPeriodEnd } from "@/lib/billing/engine";

export const runtime = "nodejs";

type WompiTx = {
  id: string;
  status: string;
  amount_in_cents: number;
  reference: string;
  status_message?: string | null;
};

type InvoiceRow = {
  id: string;
  organization_id: string;
  payment_method_id: string | null;
  period_start: string;
  retry_count: number | null;
};

export async function POST(req: Request) {
  const raw = await req.text();
  let payload: WompiWebhookPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const secret = process.env.WOMPI_EVENTS_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "secret not configured" }, { status: 500 });
  }
  if (!verifyWompiWebhook(payload, secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  if (payload.event !== "transaction.updated") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const tx = payload.data.transaction as unknown as WompiTx;
  const supabase = createAdminClient();

  // Idempotencia: payment con provider_transaction_id UNIQUE
  const { data: existing } = await supabase
    .from("payments")
    .select("id, invoice_id, status")
    .eq("provider_transaction_id", tx.id)
    .maybeSingle();

  const invoiceQuery = existing
    ? await supabase.from("invoices").select("*").eq("id", existing.invoice_id).single()
    : await supabase.from("invoices").select("*").eq("id", tx.reference).single();

  const invoice = invoiceQuery.data as InvoiceRow | null;
  if (!invoice) {
    console.error("[webhook wompi] invoice not found for reference", tx.reference);
    return NextResponse.json({ ok: true, warn: "invoice not found" });
  }

  // Insert/update payment row
  if (existing) {
    await supabase
      .from("payments")
      .update({
        status: mapStatus(tx.status),
        failure_reason: tx.status_message ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("payments").insert({
      invoice_id: invoice.id,
      payment_method_id: invoice.payment_method_id ?? null,
      provider: "wompi",
      provider_transaction_id: tx.id,
      amount_cop: Math.round(tx.amount_in_cents / 100),
      status: mapStatus(tx.status),
      failure_reason: tx.status_message ?? null,
      completed_at: new Date().toISOString(),
    });
  }

  // Side effects por status
  if (tx.status === "APPROVED") {
    await supabase
      .from("invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", invoice.id);

    const fullTx = await getTransaction(tx.id).catch(() => null);
    const psId = fullTx?.data?.payment_source_id;
    if (psId) {
      const extra = fullTx?.data?.payment_method?.extra ?? {};
      const expMonthRaw = extra.exp_month ?? "0";
      const expYearRaw = extra.exp_year ?? "0";
      const expMonth = parseInt(String(expMonthRaw), 10) || null;
      const expYearShort = parseInt(String(expYearRaw), 10);
      const expYear = expYearShort ? 2000 + expYearShort : null;

      const { data: pm } = await supabase
        .from("payment_methods")
        .upsert(
          {
            organization_id: invoice.organization_id,
            provider: "wompi",
            provider_payment_source_id: String(psId),
            card_brand: extra.brand ?? null,
            card_last4: extra.last_four ?? null,
            card_exp_month: expMonth,
            card_exp_year: expYear,
            is_default: true,
          },
          { onConflict: "organization_id,provider_payment_source_id" }
        )
        .select("id")
        .single();

      if (pm) {
        await supabase
          .from("subscriptions")
          .update({
            payment_method_id: pm.id,
            status: "active",
            current_period_end: calculateNextPeriodEnd(new Date(invoice.period_start)).toISOString(),
          })
          .eq("organization_id", invoice.organization_id);
      }
    } else {
      await supabase
        .from("subscriptions")
        .update({
          status: "active",
          current_period_end: calculateNextPeriodEnd(new Date(invoice.period_start)).toISOString(),
        })
        .eq("organization_id", invoice.organization_id);
    }

    fireDianEmitJob(invoice.id).catch((e) => console.error("[dian-emit-job]", e));
    fireBillingEmail("payment-confirmed", invoice.organization_id, { invoiceId: invoice.id }).catch(
      (e) => console.error("[email]", e)
    );
  } else if (tx.status === "DECLINED" || tx.status === "ERROR" || tx.status === "VOIDED") {
    await supabase
      .from("invoices")
      .update({ status: "failed", retry_count: (invoice.retry_count ?? 0) + 1 })
      .eq("id", invoice.id);
    await supabase
      .from("subscriptions")
      .update({ status: "past_due" })
      .eq("organization_id", invoice.organization_id);
  }

  return NextResponse.json({ ok: true });
}

function mapStatus(
  wompiStatus: string
): "pending" | "approved" | "declined" | "error" | "refunded" {
  switch (wompiStatus) {
    case "APPROVED":
      return "approved";
    case "DECLINED":
      return "declined";
    case "VOIDED":
      return "refunded";
    case "ERROR":
      return "error";
    default:
      return "pending";
  }
}

async function fireDianEmitJob(_invoiceId: string): Promise<void> {
  /* Task 17 */
}

async function fireBillingEmail(
  _template: string,
  _orgId: string,
  _data: unknown
): Promise<void> {
  /* Task 18 */
}
