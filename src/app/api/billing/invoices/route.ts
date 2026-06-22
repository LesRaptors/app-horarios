import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canAdmin } from "@/lib/auth/can-manage";
import { resolveEffectiveOrgId } from "@/lib/auth/resolve-effective-org";
import type { UserRole } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "no auth" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !canAdmin(profile.role as UserRole | null)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // Org efectiva: super_admin opera sobre el tenant activo (super_admin_active_org).
  const callerOrg = await resolveEffectiveOrgId(supabase, {
    id: user.id,
    role: profile.role,
    organization_id: profile.organization_id,
  });
  if (!callerOrg) return NextResponse.json({ data: [] });

  const { data } = await supabase
    .from("invoices")
    .select("id, plan_id, period_start, period_end, amount_cop, iva_cop, total_cop, status, paid_at, dian_pdf_url, dian_status, created_at")
    .eq("organization_id", callerOrg)
    .order("created_at", { ascending: false })
    .limit(100);

  return NextResponse.json({ data });
}
