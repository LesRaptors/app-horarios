import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
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
    const { swap_id, reviewer_id } = body;

    if (!swap_id) {
      return NextResponse.json(
        { error: "swap_id es requerido" },
        { status: 400 }
      );
    }

    // 3. Use admin client for cross-user operations
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 4. Fetch the swap request with entries
    const { data: swap, error: swapError } = await adminSupabase
      .from("shift_swap_requests")
      .select("*")
      .eq("id", swap_id)
      .single();

    if (swapError || !swap) {
      return NextResponse.json(
        { error: "Solicitud de intercambio no encontrada" },
        { status: 404 }
      );
    }

    if (swap.status !== "accepted") {
      return NextResponse.json(
        { error: "Solo se pueden aprobar intercambios aceptados" },
        { status: 400 }
      );
    }

    // 5. Swap employee_id in both schedule entries
    const { error: swap1Error } = await adminSupabase
      .from("schedule_entries")
      .update({ employee_id: swap.target_id })
      .eq("id", swap.requester_entry_id);

    if (swap1Error) {
      return NextResponse.json(
        { error: "Error al actualizar turno del solicitante: " + swap1Error.message },
        { status: 500 }
      );
    }

    const { error: swap2Error } = await adminSupabase
      .from("schedule_entries")
      .update({ employee_id: swap.requester_id })
      .eq("id", swap.target_entry_id);

    if (swap2Error) {
      return NextResponse.json(
        { error: "Error al actualizar turno del destino: " + swap2Error.message },
        { status: 500 }
      );
    }

    // 6. Update swap status to approved
    const { error: updateError } = await adminSupabase
      .from("shift_swap_requests")
      .update({
        status: "approved",
        reviewed_by: reviewer_id || user.id,
      })
      .eq("id", swap_id);

    if (updateError) {
      return NextResponse.json(
        { error: "Error al actualizar estado: " + updateError.message },
        { status: 500 }
      );
    }

    // 7. Create notifications for both employees
    await adminSupabase.from("notifications").insert([
      {
        user_id: swap.requester_id,
        title: "Intercambio aprobado",
        message: "Tu solicitud de intercambio de turno ha sido aprobada.",
        type: "swap_request",
        link: "/requests",
      },
      {
        user_id: swap.target_id,
        title: "Intercambio aprobado",
        message: "El intercambio de turno ha sido aprobado por el manager.",
        type: "swap_request",
        link: "/requests",
      },
    ]);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
