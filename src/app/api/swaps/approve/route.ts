import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
    // 1. Verify caller is admin or manager
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { data: callerProfile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error("Error fetching caller profile:", profileError);
      return NextResponse.json(
        { error: "Error al verificar permisos" },
        { status: 500 }
      );
    }

    if (
      !callerProfile ||
      !["admin", "manager"].includes(callerProfile.role)
    ) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // 2. Parse body (handle parse errors explicitly)
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "JSON inválido en el cuerpo de la solicitud" },
        { status: 400 }
      );
    }

    // 3. Validate swap_id
    const { swap_id } = body as Record<string, unknown>;

    if (!swap_id) {
      return NextResponse.json(
        { error: "swap_id es requerido" },
        { status: 400 }
      );
    }

    if (typeof swap_id !== "string") {
      return NextResponse.json(
        { error: "swap_id debe ser un string" },
        { status: 400 }
      );
    }

    if (!UUID_REGEX.test(swap_id)) {
      return NextResponse.json(
        { error: "swap_id debe ser un UUID válido" },
        { status: 400 }
      );
    }

    // 4. CRITICAL: reviewer_id is ALWAYS from the session, never from the body
    const reviewer_id = user.id;

    // 5. Call the RPC via admin client
    const adminSupabase = createAdminClient();
    const { data, error: rpcError } = await adminSupabase.rpc(
      "approve_shift_swap",
      {
        p_swap_id: swap_id,
        p_reviewer_id: reviewer_id,
      }
    );

    if (rpcError) {
      console.error("RPC approve_shift_swap error:", rpcError);
      return NextResponse.json(
        { error: "Error al aprobar el intercambio" },
        { status: 500 }
      );
    }

    // 6. Check RPC-level errors (returned as JSON, not thrown)
    if (data && !data.success) {
      const statusCode = data.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: data.error }, { status: statusCode });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unhandled error in swap approval:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
