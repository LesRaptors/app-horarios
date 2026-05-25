import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canAdmin } from "@/lib/auth/can-manage";
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

  if (!canAdmin((profile?.role ?? null) as UserRole | null)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!profile?.organization_id) return NextResponse.json({ data: [] });

  const { data } = await supabase
    .from("invoices")
    .select("id, plan_id, period_start, period_end, amount_cop, iva_cop, total_cop, status, paid_at, dian_pdf_url, dian_status, created_at")
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: false })
    .limit(100);

  return NextResponse.json({ data });
}
