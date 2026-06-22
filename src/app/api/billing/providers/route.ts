import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAdmin } from "@/lib/auth/can-manage";
import { resolveEffectiveOrgId } from "@/lib/auth/resolve-effective-org";
import { encryptCreds } from "@/lib/billing/crypto";
import type { UserRole } from "@/lib/types";

const Schema = z.object({
  provider: z.enum(["alegra", "siigo", "facturatech", "manual"]),
  config: z.record(z.string()),
});

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
  const callerOrg = await resolveEffectiveOrgId(supabase, {
    id: user.id,
    role: profile.role,
    organization_id: profile.organization_id,
  });
  if (!callerOrg) return NextResponse.json({ data: null });

  // SELECT solo metadata; NUNCA expone config (encrypted creds)
  const { data } = await supabase
    .from("billing_providers")
    .select("provider, is_active, configured_at")
    .eq("organization_id", callerOrg)
    .maybeSingle();

  return NextResponse.json({ data });
}

export async function PUT(req: Request) {
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
  const callerOrg = await resolveEffectiveOrgId(supabase, {
    id: user.id,
    role: profile.role,
    organization_id: profile.organization_id,
  });
  if (!callerOrg) {
    return NextResponse.json(
      { error: "Selecciona un tenant activo para configurar el proveedor" },
      { status: 400 }
    );
  }

  const body = Schema.parse(await req.json());
  const encrypted = encryptCreds(body.config);

  const admin = createAdminClient();
  const { error } = await admin.from("billing_providers").upsert(
    {
      organization_id: callerOrg,
      provider: body.provider,
      config: encrypted as unknown as never,    // JSONB column stores encrypted string
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
