import { createAdminClient } from "@/lib/supabase/admin";
import { decryptCreds } from "../crypto";
import { AlegraProvider } from "./alegra";
import { ManualProvider } from "./manual";
import type { BillingProvider } from "./types";
import type { DianProviderName } from "../types";

/**
 * Devuelve el adapter DIAN configurado para una org. Si no hay config o
 * la config está inactiva, retorna ManualProvider (default seguro).
 *
 * Las credenciales en billing_providers.config están cifradas AES-256-GCM
 * con BILLING_CREDS_ENC_KEY — solo el server las descifra. Nunca exponer
 * a cliente.
 */
export async function getProvider(orgId: string): Promise<BillingProvider> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("billing_providers")
    .select("provider, config, is_active")
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!data || !data.is_active) return new ManualProvider();

  switch (data.provider as DianProviderName) {
    case "alegra": {
      const creds = decryptCreds(data.config as unknown as string);
      return new AlegraProvider({
        api_key: creds.api_key ?? "",
        email_user: creds.email_user ?? "",
      });
    }
    case "manual":
      return new ManualProvider();
    default:
      throw new Error(`Unsupported DIAN provider: ${data.provider}`);
  }
}

export type { BillingProvider, EmitResult, Organization } from "./types";
