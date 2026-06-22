import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canAdmin } from "@/lib/auth/can-manage";
import { resolveEffectiveOrgId } from "@/lib/auth/resolve-effective-org";
import type { UserRole } from "@/lib/types";

export const runtime = "nodejs";

export async function POST() {
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
  if (!callerOrg) {
    return NextResponse.json(
      { error: "Selecciona un tenant activo para cancelar la suscripción" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("subscriptions")
    .update({ cancel_at_period_end: true })
    .eq("organization_id", callerOrg)
    .select("current_period_end")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, effective: data.current_period_end });
}
