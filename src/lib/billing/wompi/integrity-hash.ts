import { createHash } from "crypto";

export function computeIntegrityHash(input: {
  reference: string;
  amountInCents: number;
  currency: "COP";
  integritySecret: string;
  expirationDate?: string;
}): string {
  const parts = [
    input.reference,
    input.amountInCents.toString(),
    input.currency,
    input.expirationDate,
    input.integritySecret,
  ].filter(Boolean);
  return createHash("sha256").update(parts.join("")).digest("hex");
}
