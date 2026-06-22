import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const VALID_TYPES: EmailOtpType[] = [
  "invite",
  "recovery",
  "signup",
  "magiclink",
  "email",
  "email_change",
];

/**
 * Confirmación de enlaces de email iniciados por el servidor (invite, recovery,
 * resend-access). Usa el flujo token_hash + verifyOtp en vez de PKCE.
 *
 * Por qué: `@supabase/ssr` usa PKCE por defecto, que requiere un `code_verifier`
 * guardado por el navegador que INICIÓ el flujo. Las invitaciones y los
 * `resetPasswordForEmail` disparados desde el servidor (admin) no crean ningún
 * verifier en el navegador del destinatario, así que `exchangeCodeForSession`
 * fallaba con "PKCE code verifier not found", peor aún cross-device (móvil).
 *
 * `verifyOtp({ type, token_hash })` no necesita verifier y establece la sesión
 * en cookies (server client), así que funciona en cualquier dispositivo.
 *
 * Las plantillas de email en Supabase deben apuntar a:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/auth/set-password
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const typeParam = searchParams.get("type");
  const type = (VALID_TYPES as string[]).includes(typeParam ?? "")
    ? (typeParam as EmailOtpType)
    : null;
  const next = sanitizeNext(searchParams.get("next"));

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      // La sesión quedó en cookies; set-password/getUser la verá.
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  // Enlace inválido o expirado → set-password muestra el estado "expirado".
  return NextResponse.redirect(
    new URL("/auth/set-password#error_code=otp_expired&error=access_denied", request.url)
  );
}

/** Solo permite paths internos (evita open-redirect). */
function sanitizeNext(raw: string | null): string {
  if (!raw) return "/auth/set-password";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/auth/set-password";
  return raw;
}
