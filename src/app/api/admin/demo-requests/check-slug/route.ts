import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperAdmin } from "@/lib/auth/can-manage";
import { checkSlugAllowed } from "@/lib/onboarding/slug-validator";
import { NextRequest, NextResponse } from "next/server";
import type { UserRole } from "@/lib/types";

export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!isSuperAdmin((profile?.role ?? null) as UserRole | null)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug")?.trim() ?? "";

  const rejection = checkSlugAllowed(slug);
  if (rejection) {
    return NextResponse.json({ available: false, reason: rejection });
  }

  const adminSupabase = createAdminClient();
  const { data: existing } = await adminSupabase
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existing) {
    const { data: suggestion } = await adminSupabase.rpc("suggest_unique_slug", {
      p_name: slug,
    });
    return NextResponse.json({ available: false, reason: "taken", suggestion });
  }

  return NextResponse.json({ available: true });
}
