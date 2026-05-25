import { randomUUID } from "crypto";
import type { BillingProvider, EmitResult, Organization } from "./types";
import type { Invoice } from "../types";

export class ManualProvider implements BillingProvider {
  async emitInvoice(_invoice: Invoice, _customer: Organization): Promise<EmitResult> {
    return {
      externalId: `manual-${randomUUID()}`,
      pdfUrl: null,
      status: "pending",
    };
  }
  async voidInvoice(_externalId: string): Promise<boolean> {
    return true;
  }
  async getStatus(_externalId: string): Promise<"pending" | "accepted" | "rejected"> {
    return "pending";
  }
}
