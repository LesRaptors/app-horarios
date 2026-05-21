import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic =
    path === "/" ||
    path === "/gracias" ||
    path === "/forgot-password" ||
    path.startsWith("/login") ||
    path.startsWith("/auth");

  // Si no hay usuario y no está en una ruta pública, redirigir a login
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Si hay usuario y está en /login, redirigir a dashboard
  if (user && path.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Onboarding redirect: si el user tiene org sin onboarding_completed_at,
  // forzar a /onboarding/<step>. Super_admin bypasses (puede ir a /dashboard directo).
  if (user && !path.startsWith("/onboarding") && !path.startsWith("/auth") && !isPublic) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, organization_id")
      .eq("id", user.id)
      .single();

    if (profile && profile.role !== "super_admin" && profile.organization_id) {
      const { data: org } = await supabase
        .from("organizations")
        .select("onboarding_completed_at, onboarding_step")
        .eq("id", profile.organization_id)
        .single();

      if (org && !org.onboarding_completed_at) {
        const step = org.onboarding_step ?? "empresa";
        const url = request.nextUrl.clone();
        url.pathname = `/onboarding/${step}`;
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}
