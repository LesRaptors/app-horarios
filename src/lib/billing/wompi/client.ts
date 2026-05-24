const WOMPI_BASE =
  process.env.VERCEL_ENV === "production"
    ? "https://production.wompi.co/v1"
    : "https://sandbox.wompi.co/v1";

export type AcceptanceTokens = {
  acceptance_token: string;
  accept_personal_auth: string;
  terms_url: string;
  privacy_url: string;
};

export async function getAcceptanceTokens(): Promise<AcceptanceTokens> {
  const publicKey = process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY;
  if (!publicKey) throw new Error("NEXT_PUBLIC_WOMPI_PUBLIC_KEY not set");
  const res = await fetch(`${WOMPI_BASE}/merchants/${publicKey}`);
  if (!res.ok) throw new Error(`Wompi /merchants ${res.status}`);
  const json = await res.json();
  return {
    acceptance_token: json.data.presigned_acceptance.acceptance_token,
    accept_personal_auth: json.data.presigned_personal_data_auth.acceptance_token,
    terms_url: json.data.presigned_acceptance.permalink,
    privacy_url: json.data.presigned_personal_data_auth.permalink,
  };
}

export type ChargeInput = {
  paymentSourceId: string;
  amountInCents: number;
  currency: "COP";
  reference: string;
  customerEmail: string;
  recurrent: boolean;
};

export type WompiTransactionStatus = "APPROVED" | "DECLINED" | "PENDING" | "ERROR" | "VOIDED";

export async function createTransaction(input: ChargeInput): Promise<{
  id: string;
  status: WompiTransactionStatus;
  reference: string;
}> {
  const privateKey = process.env.WOMPI_PRIVATE_KEY;
  if (!privateKey) throw new Error("WOMPI_PRIVATE_KEY not set");

  const res = await fetch(`${WOMPI_BASE}/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${privateKey}`,
    },
    body: JSON.stringify({
      amount_in_cents: input.amountInCents,
      currency: input.currency,
      reference: input.reference,
      payment_source_id: input.paymentSourceId,
      customer_email: input.customerEmail,
      payment_method: { type: "CARD", installments: 1 },
      recurrent: input.recurrent,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Wompi /transactions ${res.status}: ${text}`);
  }

  const json = await res.json();
  return { id: json.data.id, status: json.data.status, reference: json.data.reference };
}

export async function getTransaction(transactionId: string) {
  const privateKey = process.env.WOMPI_PRIVATE_KEY;
  if (!privateKey) throw new Error("WOMPI_PRIVATE_KEY not set");
  const res = await fetch(`${WOMPI_BASE}/transactions/${transactionId}`, {
    headers: { "Authorization": `Bearer ${privateKey}` },
  });
  if (!res.ok) throw new Error(`Wompi /transactions/${transactionId} ${res.status}`);
  return res.json();
}
