import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { assertSameOrg, CrossTenantError } from "@/lib/auth/assert-same-org";
import type { Database } from "@/lib/supabase/database.types";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    // 1. Verify caller is admin or manager
    const supabase = await createServerClient();
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
      email,
      first_name,
      last_name,
      role,
      phone,
      position_id,
      location_id,
      max_hours_per_week,
    } = body;

    // 3. Invite user via email with admin client (service_role)
    const adminSupabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Validar que IDs del body pertenezcan al org del caller (defense in depth
    // contra cross-tenant injection: el admin client bypassea RLS).
    const callerOrg = callerProfile.organization_id;
    try {
      if (position_id) await assertSameOrg(adminSupabase, callerOrg, position_id, "positions");
      if (location_id) await assertSameOrg(adminSupabase, callerOrg, location_id, "locations");
    } catch (err) {
      if (err instanceof CrossTenantError) {
        return NextResponse.json({ error: "Recurso fuera de tu organización" }, { status: 403 });
      }
      throw err;
    }

    const appUrl =
      process.env.NEXT_PUBLIC_SITE_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "https://www.tushorarios.com";

    const { data: newUser, error: inviteError } =
      await adminSupabase.auth.admin.inviteUserByEmail(email, {
        data: {
          first_name,
          last_name,
          role,
          organization_id: callerProfile.organization_id,
        },
        redirectTo: `${appUrl}/auth/set-password`,
      });

    if (inviteError) {
      console.error("[invite] Supabase auth error:", inviteError.message);
      const msg = inviteError.message.toLowerCase();
      let userMessage = "Error al invitar el usuario. Por favor intenta de nuevo.";

      if (msg.includes("already been registered") || msg.includes("already exists")) {
        userMessage = "Ya existe un usuario registrado con ese correo electrónico.";
      } else if (msg.includes("invalid") && msg.includes("email")) {
        userMessage = "El formato del correo electrónico no es válido.";
      } else if (msg.includes("database error")) {
        userMessage = "No se pudo crear el usuario. Es posible que este correo ya haya sido registrado anteriormente. Contacta al administrador si el problema persiste.";
      } else if (msg.includes("rate limit") || msg.includes("too many")) {
        userMessage = "Se han enviado demasiadas invitaciones. Espera unos minutos e intenta de nuevo.";
      }

      return NextResponse.json(
        { error: userMessage },
        { status: 400 }
      );
    }

    // 4. Update profile with additional fields (trigger created basic profile)
    if (newUser?.user) {
      const updateData: Record<string, unknown> = {};
      if (phone) updateData.phone = phone;
      if (position_id) updateData.position_id = position_id;
      if (location_id) updateData.location_id = location_id;
      if (max_hours_per_week)
        updateData.max_hours_per_week = max_hours_per_week;

      if (Object.keys(updateData).length > 0) {
        await adminSupabase
          .from("profiles")
          .update(updateData)
          .eq("id", newUser.user.id);
      }
    }

    return NextResponse.json({ success: true, user_id: newUser?.user?.id });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
