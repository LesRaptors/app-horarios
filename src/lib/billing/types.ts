import type { Database } from "@/lib/supabase/database.types";

export type Plan = Database["public"]["Tables"]["plans"]["Row"];
export type Subscription = Database["public"]["Tables"]["subscriptions"]["Row"];
export type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
export type Payment = Database["public"]["Tables"]["payments"]["Row"];
export type PaymentMethod = Database["public"]["Tables"]["payment_methods"]["Row"];
export type BillingProviderRow = Database["public"]["Tables"]["billing_providers"]["Row"];

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "paused" | "canceled";
export type InvoiceStatus = "draft" | "open" | "paid" | "failed" | "void";
export type PaymentStatus = "pending" | "approved" | "declined" | "error" | "refunded";
export type DianProviderName = "alegra" | "siigo" | "facturatech" | "manual";

export const IVA_RATE = 0.19;                  // 19% Colombia
export const GRACE_DAYS = 7;
export const TRIAL_REMINDER_DAYS_BEFORE = [3, 1];      // T-3, T-1
export const PAST_DUE_REMINDER_DAYS = [1, 3, 5];        // T+1, T+3, T+5
