import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider } from "./providers";

const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000];
const MAX_ATTEMPTS = 3;
/** Tiempo tras el que un job en estado 'processing' se considera huérfano y se reintenta. */
const STALE_PROCESSING_MS = 10 * 60_000; // buffer > duración máx. de cron en Vercel

/**
 * Encola una factura para emisión DIAN asíncrona.
 * Se llama desde el webhook de Wompi cuando un pago es APPROVED.
 */
export async function enqueueDianEmitJob(invoiceId: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from("dian_emit_jobs").insert({ invoice_id: invoiceId });
}

/**
 * Procesa los trabajos pendientes de emisión DIAN.
 * Diseñado para ejecutarse desde un cron (máx. 10 jobs por run).
 * Implementa backoff exponencial con hasta MAX_ATTEMPTS reintentos.
 *
 * Recupera también jobs en estado 'processing' que llevan más de
 * STALE_PROCESSING_MS sin actualizarse (huérfanos por crash o timeout).
 * El budget de reintentos se preserva porque attempt_count sólo se
 * incrementa en el bloque catch, no al marcar 'processing'.
 */
export async function processDianEmitJobs(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();

  const { data: jobs } = await supabase
    .from("dian_emit_jobs")
    .select("*")
    .or(
      `and(status.eq.pending,next_attempt_at.lte.${nowIso}),` +
      `and(status.eq.processing,updated_at.lte.${staleBefore})`
    )
    .limit(10);

  let succeeded = 0;
  let failed = 0;

  for (const job of jobs ?? []) {
    // Marcar como en proceso (optimistic lock informal)
    await supabase
      .from("dian_emit_jobs")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", job.id);

    try {
      const { data: invoice } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", job.invoice_id)
        .single();

      const { data: org } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", (invoice as { organization_id: string })!.organization_id)
        .single();

      const provider = await getProvider((invoice as { organization_id: string })!.organization_id);
      const result = await provider.emitInvoice(invoice as Parameters<typeof provider.emitInvoice>[0], org as Parameters<typeof provider.emitInvoice>[1]);

      // Obtener el nombre del proveedor configurado para la org
      const { data: bpData } = await supabase
        .from("billing_providers")
        .select("provider")
        .eq("organization_id", (invoice as { organization_id: string })!.organization_id)
        .maybeSingle();
      const dianProvider = bpData?.provider ?? "manual";

      await supabase
        .from("invoices")
        .update({
          dian_provider: dianProvider,
          dian_invoice_id: result.externalId,
          dian_pdf_url: result.pdfUrl,
          dian_status: result.status === "accepted" ? "accepted" : "pending",
        })
        .eq("id", job.invoice_id);

      await supabase
        .from("dian_emit_jobs")
        .update({ status: "succeeded", updated_at: new Date().toISOString() })
        .eq("id", job.id);

      succeeded++;
    } catch (err: unknown) {
      const newAttempt = (job.attempt_count as number) + 1;
      const isMaxed = newAttempt >= MAX_ATTEMPTS;
      const errMsg =
        err instanceof Error ? err.message : String(err);

      await supabase
        .from("dian_emit_jobs")
        .update({
          status: isMaxed ? "failed" : "pending",
          attempt_count: newAttempt,
          next_attempt_at: isMaxed
            ? (job.next_attempt_at as string)
            : new Date(Date.now() + RETRY_DELAYS_MS[newAttempt - 1]).toISOString(),
          last_error: errMsg,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      failed++;

      if (isMaxed) {
        console.error(
          "[dian-emit-job] max attempts reached for invoice",
          job.invoice_id,
          errMsg
        );
      }
    }
  }

  return { processed: jobs?.length ?? 0, succeeded, failed };
}
