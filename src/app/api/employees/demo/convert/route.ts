import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { canManage } from "@/lib/auth/can-manage";
import { resolveEffectiveOrgId } from "@/lib/auth/resolve-effective-org";
import type { UserRole } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    // 1. Verify caller is admin or manager
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role, organization_id")
      .eq("id", user.id)
      .single();

    if (!callerProfile || !canManage(callerProfile.role as UserRole)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // 2. Parse body
    const body = await request.json();
    const { demo_id, email } = body;

    if (!demo_id || !email) {
      return NextResponse.json(
        { error: "demo_id y email son obligatorios" },
        { status: 400 }
      );
    }

    const adminSupabase = createAdminClient();

    // Resolver org efectiva: un super_admin opera sobre el tenant activo
    // (super_admin_active_org), no sobre su propio profile (organization_id null).
    const callerOrg = await resolveEffectiveOrgId(adminSupabase, {
      id: user.id,
      role: callerProfile.role,
      organization_id: callerProfile.organization_id,
    });
    if (!callerOrg) {
      return NextResponse.json(
        { error: "Selecciona un tenant activo para convertir empleados" },
        { status: 400 }
      );
    }

    // 3. Fetch demo profile to verify is_demo=true
    const { data: demoProfile, error: fetchError } = await adminSupabase
      .from("profiles")
      .select("*")
      .eq("id", demo_id)
      .single();

    if (fetchError || !demoProfile) {
      return NextResponse.json(
        { error: "Empleado demo no encontrado" },
        { status: 404 }
      );
    }

    if (!demoProfile.is_demo) {
      return NextResponse.json(
        { error: "El empleado no es un demo" },
        { status: 400 }
      );
    }

    // Cross-tenant guard: el demo debe pertenecer al org efectivo del caller.
    if (demoProfile.organization_id !== callerOrg) {
      return NextResponse.json(
        { error: "Empleado fuera de tu organización" },
        { status: 403 }
      );
    }

    // 4. Create auth user via invite (con organization_id + redirectTo a tushorarios.com)
    const appUrl =
      process.env.NEXT_PUBLIC_SITE_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "https://www.tushorarios.com";

    let realUserId: string | null = null;
    try {
      const { data: newUser, error: inviteError } =
        await adminSupabase.auth.admin.inviteUserByEmail(email, {
          data: {
            first_name: demoProfile.first_name,
            last_name: demoProfile.last_name,
            role: demoProfile.role,
            organization_id: callerOrg,
          },
          redirectTo: `${appUrl}/auth/set-password`,
        });
      if (inviteError) {
        console.error("[demo-convert] Invite error:", inviteError.message);
        return NextResponse.json(
          { error: "Error al invitar al usuario" },
          { status: 400 }
        );
      }
      realUserId = newUser?.user?.id ?? null;
    } catch (e) {
      // El envío SMTP puede tardar y abortar el cliente aunque GoTrue ya haya
      // creado el usuario (su profile lo crea el trigger handle_new_user). Lo
      // buscamos por email antes de fallar, para no dejar la conversión a medias.
      console.error(
        "[demo-convert] invite threw (posible timeout SMTP):",
        e instanceof Error ? e.message : e
      );
      const { data: existing } = await adminSupabase
        .from("profiles")
        .select("id")
        .ilike("email", email)
        .eq("is_demo", false)
        .maybeSingle();
      realUserId = (existing as { id: string } | null)?.id ?? null;
    }

    if (!realUserId) {
      return NextResponse.json(
        { error: "Error al invitar al usuario" },
        { status: 400 }
      );
    }

    // 5. Call RPC to convert demo to real
    const rpcFn = adminSupabase.rpc as Function;
    const { data: rpcResult, error: rpcError } = await rpcFn(
      "convert_demo_to_real",
      {
        p_demo_id: demo_id,
        p_real_id: realUserId,
      }
    );

    if (rpcError) {
      console.error("[demo-convert] RPC error:", rpcError.message);
      return NextResponse.json(
        { error: "Error al convertir empleado demo" },
        { status: 500 }
      );
    }

    const result = rpcResult as { success: boolean; entries_migrated?: number; error?: string };

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Error al convertir empleado demo" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      user_id: realUserId,
      entries_migrated: result.entries_migrated,
    });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
