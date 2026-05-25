import { describe, it, expect } from "vitest";
import { ManualProvider } from "./manual";

describe("ManualProvider", () => {
  it("emitInvoice retorna externalId con prefijo manual-", async () => {
    const p = new ManualProvider();
    const res = await p.emitInvoice({ id: "inv-1" } as never, { id: "org-1" } as never);
    expect(res.externalId).toMatch(/^manual-/);
    expect(res.pdfUrl).toBeNull();
    expect(res.status).toBe("pending");
  });
  it("voidInvoice retorna true", async () => {
    expect(await new ManualProvider().voidInvoice("manual-1")).toBe(true);
  });
  it("getStatus retorna pending por default", async () => {
    expect(await new ManualProvider().getStatus("manual-1")).toBe("pending");
  });
});
