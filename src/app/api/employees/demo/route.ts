import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { assertSameOrg, CrossTenantError } from "@/lib/auth/assert-same-org";
import { canManage } from "@/lib/auth/can-manage";
import { resolveEffectiveOrgId } from "@/lib/auth/resolve-effective-org";
import { translateDbError } from "@/lib/utils";
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
    const {
      first_name,
      last_name,
      role,
      position_id,
      location_id,
      max_hours_per_week,
      contract_type_id,
    } = body;

    // 3. Validate required fields
    if (!first_name || !last_name) {
      return NextResponse.json(
        { error: "Nombre y apellido son obligatorios" },
        { status: 400 }
      );
    }

    if (!contract_type_id) {
      return NextResponse.json(
        { error: "El tipo de contrato es obligatorio" },
        { status: 400 }
      );
    }

    // Allowlist de rol: super_admin nunca es rol de empleado, y un manager no
    // puede crear un demo "admin" (lo convertiría luego a un admin real,
    // escalando por encima de su propio rol).
    const allowedRoles =
      callerProfile.role === "manager"
        ? ["employee", "manager"]
        : ["employee", "admin", "manager"];
    if (role && !allowedRoles.includes(role)) {
      return NextResponse.json(
        { error: "No puedes asignar ese rol" },
        { status: 403 }
      );
    }

    // 4. Generate UUID and insert demo profile
    const id = crypto.randomUUID();
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
        { error: "Selecciona un tenant activo para crear empleados" },
        { status: 400 }
      );
    }

    // Validar que position_id/location_id pertenezcan al org del caller.
    try {
      if (position_id) await assertSameOrg(adminSupabase, callerOrg, position_id, "positions");
      if (location_id) await assertSameOrg(adminSupabase, callerOrg, location_id, "locations");
      await assertSameOrg(adminSupabase, callerOrg, contract_type_id, "contract_types");
    } catch (err) {
      if (err instanceof CrossTenantError) {
        return NextResponse.json({ error: "Recurso fuera de tu organización" }, { status: 403 });
      }
      throw err;
    }

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
      contract_type_id,
      organization_id: callerOrg,
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
