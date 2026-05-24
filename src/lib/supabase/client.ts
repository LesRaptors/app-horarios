import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { PROD_ROOT_DOMAIN } from "@/lib/tenant-resolver";

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  if (!client) {
    // Cookie scope `.tushorarios.com` cuando estamos en host de producción.
    // Sin esto, signInWithPassword setea cookie host-only desde el browser
    // (`smoke-r7.tushorarios.com` o `tushorarios.com` solamente), y la sesión
    // NO se comparte cross-subdomain. R6/R7 del middleware quedan rotas
    // funcionalmente aunque la lógica sea correcta. Detección runtime porque
    // NODE_ENV no distingue preview deploys del production real.
    const host =
      typeof window !== "undefined" ? window.location.hostname : "";
    const useTenantCookie =
      host === PROD_ROOT_DOMAIN || host.endsWith("." + PROD_ROOT_DOMAIN);

    client = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      useTenantCookie
        ? {
            cookieOptions: {
              domain: "." + PROD_ROOT_DOMAIN,
              path: "/",
              sameSite: "lax",
              secure: true,
            },
          }
        : undefined
    );
  }
  return client;
}
