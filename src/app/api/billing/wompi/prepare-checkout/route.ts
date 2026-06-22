import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAdmin } from "@/lib/auth/can-manage";
import { resolveEffectiveOrgId } from "@/lib/auth/resolve-effective-org";
import type { UserRole } from "@/lib/types";
import { computeIntegrityHash } from "@/lib/billing/wompi/integrity-hash";
import {
  calculateIva,
  calculateTotalWithIva,
  calculateNextPeriodEnd,
  copToCents,
} from "@/lib/billing/engine";

const Schema = z.object({ planId: z.string() });
export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "no auth" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !canAdmin(profile.role as UserRole)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Org efectiva: super_admin opera sobre el tenant activo, no su propio profile.
  const callerOrg = await resolveEffectiveOrgId(supabase, {
    id: user.id,
    role: profile.role,
    organization_id: profile.organization_id,
  });
  if (!callerOrg) {
    return NextResponse.json(
      { error: "Selecciona un tenant activo para pagar" },
      { status: 400 }
    );
  }

  // Datos de facturación de la org por callerOrg (el join del profile está vacío
  // para super_admin, que tiene organization_id null en su propia fila).
  const { data: org } = await admin
    .from("organizations")
    .select("name, nit, billing_email, billing_exempt")
    .eq("id", callerOrg)
    .maybeSingle();

  if (org?.billing_exempt) {
    return NextResponse.json({ error: "Org exenta de billing" }, { status: 400 });
  }
  if (!org?.nit) {
    return NextResponse.json(
      { error: "Configura el NIT de la organización antes de pagar" },
      { status: 400 }
    );
  }

  const body = Schema.parse(await req.json());
  const { data: plan, error: planErr } = await admin
    .from("plans")
    .select("*")
    .eq("id", body.planId)
    .maybeSingle();
  if (planErr || !plan) return NextResponse.json({ error: "Plan no encontrado" }, { status: 404 });
  if (plan.contact_sales) {
    return NextResponse.json({ error: "Plan requiere contacto comercial" }, { status: 400 });
  }

  const amount = plan.price_cop;
  const iva = calculateIva(amount);
  const total = calculateTotalWithIva(amount);

  const periodStart = new Date();
  const periodEnd = calculateNextPeriodEnd(periodStart);

  // Upsert subscription draft
  const { data: existingSub } = await admin
    .from("subscriptions")
    .select("id")
    .eq("organization_id", callerOrg)
    .maybeSingle();

  let subscriptionId: string;
  if (existingSub) {
    await admin.from("subscriptions").update({ plan_id: body.planId }).eq("id", existingSub.id);
    subscriptionId = existingSub.id;
  } else {
    const { data: newSub, error: subErr } = await admin
      .from("subscriptions")
      .insert({
        organization_id: callerOrg,
        plan_id: body.planId,
        status: "trialing",
        current_period_start: periodStart.toISOString(),
        current_period_end: periodEnd.toISOString(),
      })
      .select("id")
      .single();
    if (subErr || !newSub) {
      return NextResponse.json({ error: "Failed to create subscription" }, { status: 500 });
    }
    subscriptionId = newSub.id;
  }

  // Create invoice draft
  const { data: invoice, error: invErr } = await admin
    .from("invoices")
    .insert({
      organization_id: callerOrg,
      subscription_id: subscriptionId,
      plan_id: body.planId,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      amount_cop: amount,
      iva_cop: iva,
      total_cop: total,
      status: "open",
      due_date: periodStart.toISOString(),
    })
    .select("id")
    .single();
  if (invErr || !invoice) {
    return NextResponse.json({ error: "Failed to create invoice" }, { status: 500 });
  }

  const reference = invoice.id;
  const amountInCents = copToCents(total);
  const integritySignature = computeIntegrityHash({
    reference,
    amountInCents,
    currency: "COP",
    integritySecret: process.env.WOMPI_INTEGRITY_SECRET ?? "",
  });

  return NextResponse.json({
    publicKey: process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY,
    reference,
    amountInCents,
    currency: "COP",
    signature: integritySignature,
    customerEmail: org.billing_email ?? user.email,
    redirectUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.tushorarios.com"}/facturacion?checkout=complete`,
  });
}
