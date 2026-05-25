import { createHash, timingSafeEqual } from "crypto";

export type WompiWebhookPayload = {
  event: string;
  data: { transaction: Record<string, unknown> };
  timestamp: number;
  signature: { properties: string[]; checksum: string };
  environment?: string;
  sent_at?: string;
};

const REPLAY_WINDOW_DAYS = 30;

function getNested(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>(
    (acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined),
    obj
  );
}

export function verifyWompiWebhook(payload: WompiWebhookPayload, eventsSecret: string): boolean {
  if (!payload?.signature?.checksum || typeof payload?.timestamp !== "number") return false;

  // Anti-replay
  const ageMs = Date.now() - payload.timestamp * 1000;
  if (ageMs > REPLAY_WINDOW_DAYS * 24 * 60 * 60 * 1000) return false;

  const values: string[] = [];
  for (const prop of payload.signature.properties) {
    // properties son rutas tipo "transaction.id" — desde data.transaction.*
    // Wompi pasa el path completo. Si empieza con "transaction.", buscar bajo data.
    const val = getNested(payload.data, prop);
    if (val === undefined || val === null) return false;
    values.push(String(val));
  }
  values.push(String(payload.timestamp));
  values.push(eventsSecret);

  const computed = createHash("sha256").update(values.join("")).digest("hex");

  // timingSafeEqual requiere mismo length; las strings hex de sha256 son siempre 64
  if (computed.length !== payload.signature.checksum.length) return false;
  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(payload.signature.checksum));
  } catch {
    return false;
  }
}
