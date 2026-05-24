import type { BillingProvider, EmitResult, Organization } from "./types";
import type { Invoice } from "../types";

const ALEGRA_BASE = "https://api.alegra.com/api/v1";

type AlegraCreds = { api_key: string; email_user: string };

export class AlegraProvider implements BillingProvider {
  constructor(private creds: AlegraCreds) {}

  private authHeader(): string {
    const token = Buffer.from(`${this.creds.email_user}:${this.creds.api_key}`).toString("base64");
    return `Basic ${token}`;
  }

  async emitInvoice(invoice: Invoice, customer: Organization): Promise<EmitResult> {
    const body = {
      date: new Date().toISOString().slice(0, 10),
      dueDate: new Date(invoice.due_date).toISOString().slice(0, 10),
      client: {
        identification: customer.nit ?? "222222222",
        name: customer.legal_name ?? customer.name,
      },
      items: [{
        name: `Suscripción Tus Horarios — ${invoice.plan_id}`,
        price: invoice.amount_cop,
        quantity: 1,
        tax: [{ id: 1 }],
      }],
      observations: `Período ${invoice.period_start} a ${invoice.period_end}`,
    };

    const res = await fetch(`${ALEGRA_BASE}/invoices`, {
      method: "POST",
      headers: {
        "Authorization": this.authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Alegra ${res.status}: ${text}`);
    }

    const json = await res.json();
    return {
      externalId: String(json.id),
      pdfUrl: json.pdf ?? null,
      status: "accepted",
    };
  }

  async voidInvoice(externalId: string): Promise<boolean> {
    const res = await fetch(`${ALEGRA_BASE}/invoices/${externalId}/void`, {
      method: "POST",
      headers: { "Authorization": this.authHeader() },
    });
    return res.ok;
  }

  async getStatus(externalId: string): Promise<"pending" | "accepted" | "rejected"> {
    const res = await fetch(`${ALEGRA_BASE}/invoices/${externalId}`, {
      headers: { "Authorization": this.authHeader() },
    });
    if (!res.ok) return "rejected";
    const json = await res.json();
    return json.status === "open" || json.status === "closed" ? "accepted" : "pending";
  }
}
