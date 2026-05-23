import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import type { Database } from "./database.types";
import { extractSubdomain, isProdRootDomain } from "@/lib/tenant-resolver";

export async function createClient() {
  const cookieStore = await cookies();
  // Mismo cookie scope que middleware: `.tushorarios.com` en prod, host actual
  // en dev/preview. Consistencia evita cookie shadowing entre middleware
  // y server-component / API-route refreshes.
  const headerList = await headers();
  const host = headerList.get("host") ?? "";
  const { rootDomain } = extractSubdomain(host);
  const cookieDomain = isProdRootDomain(rootDomain)
    ? ".tushorarios.com"
    : undefined;

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              const withDomain = cookieDomain
                ? { ...options, domain: cookieDomain }
                : options;
              cookieStore.set(name, value, withDomain);
            });
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  );
}
