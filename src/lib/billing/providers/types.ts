import type { Invoice } from "../types";
import type { Database } from "@/lib/supabase/database.types";

export type Organization = Database["public"]["Tables"]["organizations"]["Row"];

export type EmitResult = {
  externalId: string;
  pdfUrl: string | null;
  status: "pending" | "accepted";
};

export interface BillingProvider {
  emitInvoice(invoice: Invoice, customer: Organization): Promise<EmitResult>;
  voidInvoice(externalId: string): Promise<boolean>;
  getStatus(externalId: string): Promise<"pending" | "accepted" | "rejected">;
}
