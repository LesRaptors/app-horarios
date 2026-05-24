import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canAdmin } from "@/lib/auth/can-manage";
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

  if (!canAdmin((profile?.role ?? null) as UserRole | null)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!profile?.organization_id) {
    return NextResponse.json({ error: "no org" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("subscriptions")
    .update({ cancel_at_period_end: true })
    .eq("organization_id", profile.organization_id)
    .select("current_period_end")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, effective: data.current_period_end });
}
