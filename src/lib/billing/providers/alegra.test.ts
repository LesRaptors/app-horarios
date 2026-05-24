import { describe, it, expect, vi, beforeEach } from "vitest";
import { AlegraProvider } from "./alegra";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("AlegraProvider", () => {
  it("emitInvoice ok → externalId + pdfUrl", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "ale-123", pdf: "https://alegra.com/pdf/123.pdf" }),
    } as never) as unknown as typeof fetch;

    const p = new AlegraProvider({ api_key: "k", email_user: "e@x.com" });
    const res = await p.emitInvoice(
      { id: "inv-1", amount_cop: 100000, iva_cop: 19000, total_cop: 119000, due_date: "2026-06-24", plan_id: "pro", period_start: "2026-05-24", period_end: "2026-06-24" } as never,
      { id: "org-1", legal_name: "Acme SAS", nit: "900-1", name: "Acme" } as never
    );
    expect(res.externalId).toBe("ale-123");
    expect(res.pdfUrl).toContain("alegra.com");
    expect(res.status).toBe("accepted");
  });

  it("emitInvoice 401 → throw error específico", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "Unauthorized" } as never) as unknown as typeof fetch;
    const p = new AlegraProvider({ api_key: "bad", email_user: "e@x.com" });
    await expect(p.emitInvoice({ id: "inv-1", due_date: "2026-06-24" } as never, { nit: "1", name: "X" } as never)).rejects.toThrow(/401/);
  });

  it("emitInvoice 500 → throw retryable", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "ISE" } as never) as unknown as typeof fetch;
    await expect(new AlegraProvider({ api_key: "k", email_user: "e@x.com" }).emitInvoice({ id: "x", due_date: "2026-06-24" } as never, { name: "Y" } as never)).rejects.toThrow(/500/);
  });

  it("voidInvoice ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true } as never) as unknown as typeof fetch;
    expect(await new AlegraProvider({ api_key: "k", email_user: "e" }).voidInvoice("ale-1")).toBe(true);
  });

  it("getStatus open → accepted", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "open" }) } as never) as unknown as typeof fetch;
    expect(await new AlegraProvider({ api_key: "k", email_user: "e" }).getStatus("ale-1")).toBe("accepted");
  });
});
