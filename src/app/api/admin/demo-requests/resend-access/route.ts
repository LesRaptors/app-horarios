import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/auth/can-manage";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { UserRole } from "@/lib/types";

const Schema = z.object({ email: z.string().email() });

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { data: caller } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!isSuperAdmin((caller?.role ?? null) as UserRole | null)) {
    return NextResponse.json({ error: "Solo super_admin" }, { status: 403 });
  }

  const parse = Schema.safeParse(await request.json());
  if (!parse.success) return NextResponse.json({ error: "Email inválido" }, { status: 400 });

  const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.tushorarios.com";
  const admin = createAdminClient();
  const { error } = await admin.auth.resetPasswordForEmail(parse.data.email, {
    redirectTo: `${appUrl}/auth/set-password`,
  });
  if (error) {
    console.error("[resend-access] error:", error);
    return NextResponse.json({ error: "No se pudo reenviar el acceso" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
