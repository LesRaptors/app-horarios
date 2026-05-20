import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { assertSameOrg, CrossTenantError } from "@/lib/auth/assert-same-org";
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

    if (
      !callerProfile ||
      !["admin", "manager"].includes(callerProfile.role)
    ) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // 2. Parse body
    const body = await request.json();
    const { demo_id, target_employee_id } = body;

    if (!demo_id || !target_employee_id) {
      return NextResponse.json(
        { error: "demo_id y target_employee_id son obligatorios" },
        { status: 400 }
      );
    }

    const adminSupabase = createAdminClient();

    // Validar que ambos profiles pertenezcan al org del caller (cross-tenant guard).
    const callerOrg = callerProfile.organization_id;
    try {
      await assertSameOrg(adminSupabase, callerOrg, demo_id, "profiles");
      await assertSameOrg(adminSupabase, callerOrg, target_employee_id, "profiles");
    } catch (err) {
      if (err instanceof CrossTenantError) {
        return NextResponse.json({ error: "Empleado fuera de tu organización" }, { status: 403 });
      }
      throw err;
    }

    // 3. Verify demo exists and is_demo=true
    const { data: demoProfile, error: demoError } = await adminSupabase
      .from("profiles")
      .select("id, is_demo")
      .eq("id", demo_id)
      .single();

    if (demoError || !demoProfile) {
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

    // 4. Verify target exists and is NOT demo
    const { data: targetProfile, error: targetError } = await adminSupabase
      .from("profiles")
      .select("id, is_demo")
      .eq("id", target_employee_id)
      .single();

    if (targetError || !targetProfile) {
      return NextResponse.json(
        { error: "Empleado destino no encontrado" },
        { status: 404 }
      );
    }

    if (targetProfile.is_demo) {
      return NextResponse.json(
        { error: "El empleado destino no puede ser un demo" },
        { status: 400 }
      );
    }

    // 5. Transfer schedule entries
    const { data: updatedEntries, error: transferError } = await adminSupabase
      .from("schedule_entries")
      .update({ employee_id: target_employee_id } as Record<string, unknown>)
      .eq("employee_id", demo_id)
      .select("id");

    if (transferError) {
      console.error("[demo-transfer] Transfer error:", transferError.message);
      return NextResponse.json(
        { error: "Error al transferir turnos" },
        { status: 500 }
      );
    }

    const entriesTransferred = updatedEntries?.length ?? 0;

    // 6. Archive demo: set is_active=false
    const { error: archiveError } = await adminSupabase
      .from("profiles")
      .update({ is_active: false } as Record<string, unknown>)
      .eq("id", demo_id);

    if (archiveError) {
      console.error("[demo-transfer] Archive error:", archiveError.message);
      return NextResponse.json(
        { error: "Error al archivar empleado demo" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      entries_transferred: entriesTransferred,
    });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
