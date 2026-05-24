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

  // NIT: paused eliminado (nunca se usaba). Agregamos declined y skipped
  // para observabilidad de rechazos y saltos por idempotencia.
  const results = { processed: 0, charged: 0, failed: 0, declined: 0, skipped: 0 };

  for (const sub of (subs as SubWithOrg[] | null) ?? []) {
    results.processed++;

    try {
      // IMPORTANT 2: sin método de pago → marcar past_due y continuar
      if (!sub.payment_method_id) {
        await supabase
          .from("subscriptions")
          .update({ status: "past_due" })
          .eq("id", sub.id);
        results.failed++;
        continue;
      }

      // BLOCKER (app-level): saltar si ya existe una factura "open" para este período.
      // Evita doble cobro cuando el cron reintenta antes de que el webhook avance
      // current_period_end. El índice DB invoices_one_open_per_sub es la segunda capa.
      const { data: existingOpen } = await supabase
        .from("invoices")
        .select("id")
        .eq("subscription_id", sub.id)
        .eq("status", "open")
        .limit(1)
        .maybeSingle();

      if (existingOpen) {
        // Ya hay un cobro en curso para este período; evitar doble cobro.
        results.skipped++;
        continue;
      }

      // IMPORTANT 2: verificar plan antes de usarlo
      const { data: plan } = await supabase
        .from("plans")
        .select("*")
        .eq("id", sub.plan_id)
        .single();

      if (!plan) {
        console.error("[cron process-cycles] plan no encontrado para sub", sub.id, sub.plan_id);
        results.failed++;
        continue;
      }

      // IMPORTANT 2: verificar payment_method antes de usarlo
      const { data: pm } = await supabase
        .from("payment_methods")
        .select("*")
        .eq("id", sub.payment_method_id)
        .single();

      if (!pm) {
        console.error("[cron process-cycles] payment_method no encontrado para sub", sub.id, sub.payment_method_id);
        results.failed++;
        continue;
      }

      const amount = (plan as { price_cop: number }).price_cop;
      const iva = calculateIva(amount);
      const total = calculateTotalWithIva(amount);

      // Insertar factura; capturar violación de índice único (carrera concurrente)
      const { data: invoice, error: invoiceErr } = await supabase
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

      if (invoiceErr) {
        if ((invoiceErr as { code?: string }).code === "23505") {
          // Otro proceso ganó la carrera; saltar sin reintentar.
          results.skipped++;
          continue;
        }
        console.error("[cron process-cycles] error al insertar factura para sub", sub.id, invoiceErr.message);
        results.failed++;
        continue;
      }

      // Inner try/catch para errores de la transacción Wompi — permite marcar
      // la factura como failed y poner la suscripción en past_due antes de continuar.
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
        } else if (tx.status === "DECLINED") {
          results.declined++;
        }
      } catch (txErr: unknown) {
        const errMsg = txErr instanceof Error ? txErr.message : String(txErr);
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
    } catch (err: unknown) {
      // IMPORTANT 2: cualquier error no capturado arriba no aborta el resto del lote.
      console.error("[cron process-cycles] sub failed", sub.id, err instanceof Error ? err.message : String(err));

      results.failed++;
    }
  }

  return NextResponse.json(results);
}
