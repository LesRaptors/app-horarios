import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
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
      .select("role")
      .eq("id", user.id)
      .single();

    if (
      !callerProfile ||
      !["admin", "manager"].includes(callerProfile.role)
    ) {
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

    // 4. Create auth user via invite
    const { data: newUser, error: inviteError } =
      await adminSupabase.auth.admin.inviteUserByEmail(email, {
        data: {
          first_name: demoProfile.first_name,
          last_name: demoProfile.last_name,
          role: demoProfile.role,
        },
      });

    if (inviteError || !newUser?.user) {
      console.error("[demo-convert] Invite error:", inviteError?.message);
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
        p_real_id: newUser.user.id,
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
      user_id: newUser.user.id,
      entries_migrated: result.entries_migrated,
    });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
