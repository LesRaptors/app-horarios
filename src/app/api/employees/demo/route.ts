import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { translateDbError } from "@/lib/utils";
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
    const {
      first_name,
      last_name,
      role,
      position_id,
      location_id,
      max_hours_per_week,
    } = body;

    // 3. Validate required fields
    if (!first_name || !last_name) {
      return NextResponse.json(
        { error: "Nombre y apellido son obligatorios" },
        { status: 400 }
      );
    }

    // 4. Generate UUID and insert demo profile
    const id = crypto.randomUUID();
    const adminSupabase = createAdminClient();

    const insertData = {
      id,
      email: `demo-${id}@placeholder.local`,
      first_name,
      last_name,
      role: role || "employee",
      is_demo: true,
      is_active: true,
      position_id: position_id || null,
      location_id: location_id || null,
      max_hours_per_week: max_hours_per_week || null,
      organization_id: callerProfile.organization_id,
    } as Record<string, unknown>;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (adminSupabase
      .from("profiles") as any)
      .insert(insertData);

    if (insertError) {
      console.error("[demo] Insert error:", insertError);
      return NextResponse.json(
        {
          error: translateDbError(insertError.message, "Error al crear empleado demo"),
          detail: insertError.message,
          code: insertError.code,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, employee_id: id });
  } catch (err) {
    console.error("[demo] Unexpected error:", err);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
