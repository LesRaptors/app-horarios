import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/auth/can-manage";
import { sendWelcomeEmail } from "@/lib/emails/send-welcome";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { UserRole } from "@/lib/types";

const ApproveSchema = z.object({
  demo_request_id: z.string().uuid(),
  org_name: z.string().min(2).max(100),
  org_slug: z.string().regex(/^[a-z0-9-]+$/).min(3).max(50),
  plan: z.enum(["trial", "starter", "pro", "enterprise"]),
  admin_email: z.string().email(),
  admin_first_name: z.string().min(1).max(50),
  admin_last_name: z.string().min(1).max(50),
  send_welcome_email: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  try {
    // 1. Verify caller = super_admin
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

    if (!isSuperAdmin((callerProfile?.role ?? null) as UserRole | null)) {
      return NextResponse.json(
        { error: "Solo super_admin puede aprobar" },
        { status: 403 }
      );
    }

    // 2. Validate body
    const body = await request.json();
    const parse = ApproveSchema.safeParse(body);
    if (!parse.success) {
      return NextResponse.json(
        { error: parse.error.issues[0]?.message ?? "Body inválido" },
        { status: 400 }
      );
    }
    const {
      demo_request_id,
      org_name,
      org_slug,
      plan,
      admin_email,
      admin_first_name,
      admin_last_name,
      send_welcome_email,
    } = parse.data;

    const adminSupabase = createAdminClient();

    // 3. RPC atómica (p_approver_id explícito — service_role no tiene auth.uid())
    const { data: rpcResult, error: rpcError } = await adminSupabase.rpc(
      "approve_demo_request",
      {
        p_demo_request_id: demo_request_id,
        p_org_name: org_name,
        p_org_slug: org_slug,
        p_plan: plan,
        p_admin_email: admin_email,
        p_admin_first_name: admin_first_name,
        p_admin_last_name: admin_last_name,
        p_approver_id: user.id,
      }
    );

    if (rpcError) {
      console.error("[approve] RPC error:", rpcError);
      if (rpcError.code === "23505") {
        return NextResponse.json(
          { error: "El slug ya está en uso" },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "Error creando organización" },
        { status: 500 }
      );
    }

    const result = rpcResult as {
      success: boolean;
      organization_id: string;
      trial_ends_at: string;
    };
    const { organization_id, trial_ends_at } = result;

    // 4. Auth invite
    const appUrl =
      process.env.NEXT_PUBLIC_SITE_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "https://www.tushorarios.com";

    const { data: newUser, error: inviteError } =
      await adminSupabase.auth.admin.inviteUserByEmail(admin_email, {
        data: {
          first_name: admin_first_name,
          last_name: admin_last_name,
          role: "admin",
          organization_id,
        },
        redirectTo: `${appUrl}/auth/set-password`,
      });

    if (inviteError) {
      // Rollback: pausar org para revisión manual
      await adminSupabase
        .from("organizations")
        .update({ status: "paused" })
        .eq("id", organization_id);
      return NextResponse.json(
        {
          error: `Org creada pero falló invite: ${inviteError.message}. Org marcada como paused.`,
          organization_id,
        },
        { status: 500 }
      );
    }

    // 5. Welcome email (opcional)
    if (send_welcome_email) {
      try {
        await sendWelcomeEmail({
          to: admin_email,
          firstName: admin_first_name,
          orgName: org_name,
          trialEndsAt: trial_ends_at,
          setPasswordUrl: `${appUrl}/auth/set-password`,
        });
        await adminSupabase
          .from("organizations")
          .update({ welcome_email_sent_at: new Date().toISOString() })
          .eq("id", organization_id);
      } catch (err) {
        console.error("[approve] welcome email failed:", err);
        // NO fatal — auth invite ya se envió
      }
    }

    return NextResponse.json({
      success: true,
      organization_id,
      user_id: newUser?.user?.id,
      trial_ends_at,
    });
  } catch (err) {
    console.error("[approve] unexpected:", err);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
