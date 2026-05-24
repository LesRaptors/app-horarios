import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests para dian-emit-job.ts
 *
 * Estrategia de mocks:
 * - vi.mock de @/lib/supabase/admin → supabase chainable mock
 * - vi.mock de ./providers → getProvider mock que devuelve un BillingProvider stub
 *
 * Se usa vi.useFakeTimers() + vi.setSystemTime() para controlar Date.now()
 * en las aserciones de next_attempt_at.
 */

const createAdminClientMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

const getProviderMock = vi.fn();

vi.mock("./providers", () => ({
  getProvider: (...args: unknown[]) => getProviderMock(...args),
}));

// ─── Chainable Supabase mock ────────────────────────────────────────────────

type QueryResult = { data?: unknown; error?: unknown };
type TableResponses = {
  select?: QueryResult | QueryResult[];
  insert?: QueryResult;
  update?: QueryResult;
  upsert?: QueryResult;
  delete?: QueryResult;
};

type Operation = {
  table: string;
  op: "select" | "insert" | "update" | "upsert" | "delete";
  payload?: unknown;
  filters: Record<string, unknown>;
};

function makeSupabaseMock(responses: Record<string, TableResponses>) {
  const ops: Operation[] = [];
  const selectCallCounters: Record<string, number> = {};

  function from(table: string) {
    const tableResponses = responses[table] ?? {};

    function builder(op: Operation["op"], payload?: unknown) {
      ops.push({ table, op, payload, filters: {} });
      const current = ops[ops.length - 1];

      const chain: Record<string, unknown> = {};

      const passThrough = (key: string) => (col: string, val: unknown) => {
        current.filters[`${key}:${col}`] = val;
        return chain;
      };

      chain.eq = passThrough("eq");
      chain.neq = passThrough("neq");
      chain.in = passThrough("in");
      chain.lte = passThrough("lte");
      chain.or = (filter: string) => {
        current.filters["or"] = filter; // PostgREST logical-operator nesting
        return chain;
      };
      chain.limit = (_n: number) => chain;
      chain.select = (_cols?: string) => chain;

      const resolveFor = (kind: Operation["op"]): QueryResult => {
        if (kind === "select") {
          // Soporta múltiples respuestas select en secuencia
          const r = tableResponses["select"];
          if (Array.isArray(r)) {
            const key = table;
            selectCallCounters[key] = (selectCallCounters[key] ?? 0);
            const idx = selectCallCounters[key];
            selectCallCounters[key]++;
            return r[idx] ?? r[r.length - 1] ?? { data: null, error: null };
          }
          if (typeof r === "function") return (r as (f: Record<string, unknown>) => QueryResult)(current.filters);
          return r ?? { data: null, error: null };
        }
        const r = tableResponses[kind as "insert" | "update" | "upsert" | "delete"];
        if (typeof r === "function") return (r as (f: Record<string, unknown>) => QueryResult)(current.filters);
        return (r as QueryResult | undefined) ?? { data: null, error: null };
      };

      chain.maybeSingle = () => Promise.resolve(resolveFor(op));
      chain.single = () => Promise.resolve(resolveFor(op));
      chain.then = (onFulfilled: (v: QueryResult) => unknown) =>
        Promise.resolve(resolveFor(op)).then(onFulfilled);

      return chain;
    }

    return {
      select: (_cols?: string) => builder("select"),
      insert: (payload: unknown) => builder("insert", payload),
      update: (payload: unknown) => builder("update", payload),
      upsert: (payload: unknown, _opts?: unknown) => builder("upsert", payload),
      delete: () => builder("delete"),
    };
  }

  return { from, __ops: ops };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function loadModule() {
  const mod = await import("./dian-emit-job");
  return { enqueueDianEmitJob: mod.enqueueDianEmitJob, processDianEmitJobs: mod.processDianEmitJobs };
}

function makeProvider(overrides: Partial<{ emitInvoice: () => Promise<unknown> }> = {}) {
  return {
    emitInvoice: vi.fn().mockResolvedValue({
      externalId: "ext-123",
      pdfUrl: "https://example.com/invoice.pdf",
      status: "accepted",
    }),
    voidInvoice: vi.fn().mockResolvedValue(true),
    getStatus: vi.fn().mockResolvedValue("accepted"),
    ...overrides,
  };
}

const FIXED_NOW = new Date("2026-05-24T10:00:00.000Z");

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetModules();
  createAdminClientMock.mockReset();
  getProviderMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("enqueueDianEmitJob", () => {
  it("1. inserta en dian_emit_jobs con el invoice_id dado", async () => {
    const supabase = makeSupabaseMock({
      dian_emit_jobs: { insert: { data: null, error: null } },
    });
    createAdminClientMock.mockReturnValue(supabase);

    const { enqueueDianEmitJob } = await loadModule();
    await enqueueDianEmitJob("inv-abc");

    const insertOp = supabase.__ops.find((o) => o.table === "dian_emit_jobs" && o.op === "insert");
    expect(insertOp).toBeDefined();
    expect((insertOp!.payload as Record<string, unknown>).invoice_id).toBe("inv-abc");
  });
});

describe("processDianEmitJobs", () => {
  it("2. cola vacía → retorna { processed: 0, succeeded: 0, failed: 0 }", async () => {
    const supabase = makeSupabaseMock({
      dian_emit_jobs: { select: { data: [], error: null } },
    });
    createAdminClientMock.mockReturnValue(supabase);

    const { processDianEmitJobs } = await loadModule();
    const result = await processDianEmitJobs();

    expect(result).toEqual({ processed: 0, succeeded: 0, failed: 0 });
  });

  it("3. un job pending → llama emitInvoice, actualiza invoice con dian_*, marca job succeeded", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);

    const job = {
      id: "job-1",
      invoice_id: "inv-1",
      status: "pending",
      attempt_count: 0,
      next_attempt_at: new Date(FIXED_NOW.getTime() - 1000).toISOString(),
    };
    const invoice = { id: "inv-1", organization_id: "org-1" };
    const org = { id: "org-1", name: "Test Org" };
    const billingProvider = { provider: "alegra" };

    const supabase = makeSupabaseMock({
      dian_emit_jobs: {
        select: { data: [job], error: null },
        update: { data: null, error: null },
      },
      invoices: {
        select: { data: invoice, error: null },
        update: { data: null, error: null },
      },
      organizations: { select: { data: org, error: null } },
      billing_providers: { select: { data: billingProvider, error: null } },
    });
    createAdminClientMock.mockReturnValue(supabase);

    const provider = makeProvider();
    getProviderMock.mockResolvedValue(provider);

    const { processDianEmitJobs } = await loadModule();
    const result = await processDianEmitJobs();

    expect(result).toEqual({ processed: 1, succeeded: 1, failed: 0 });

    // Verificar que emitInvoice fue llamado
    expect(provider.emitInvoice).toHaveBeenCalledOnce();

    const ops = supabase.__ops;

    // Invoice debe actualizarse con dian_invoice_id, dian_pdf_url, dian_status
    const invoiceUpdate = ops.find((o) => o.table === "invoices" && o.op === "update");
    expect(invoiceUpdate).toBeDefined();
    const invPayload = invoiceUpdate!.payload as Record<string, unknown>;
    expect(invPayload.dian_invoice_id).toBe("ext-123");
    expect(invPayload.dian_pdf_url).toBe("https://example.com/invoice.pdf");
    expect(invPayload.dian_status).toBe("accepted");

    // Job debe marcarse succeeded
    const jobUpdates = ops.filter((o) => o.table === "dian_emit_jobs" && o.op === "update");
    const succeededUpdate = jobUpdates.find(
      (u) => (u.payload as Record<string, unknown>).status === "succeeded"
    );
    expect(succeededUpdate).toBeDefined();
  });

  it("4. provider lanza error en intento 1 → status pending, attempt_count=1, next_attempt_at +60s, last_error registrado", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);

    const job = {
      id: "job-fail-1",
      invoice_id: "inv-fail-1",
      status: "pending",
      attempt_count: 0,
      next_attempt_at: FIXED_NOW.toISOString(),
    };
    const invoice = { id: "inv-fail-1", organization_id: "org-fail" };
    const org = { id: "org-fail", name: "Fail Org" };

    const supabase = makeSupabaseMock({
      dian_emit_jobs: {
        select: { data: [job], error: null },
        update: { data: null, error: null },
      },
      invoices: { select: { data: invoice, error: null } },
      organizations: { select: { data: org, error: null } },
      billing_providers: { select: { data: null, error: null } },
    });
    createAdminClientMock.mockReturnValue(supabase);

    const provider = makeProvider({
      emitInvoice: vi.fn().mockRejectedValue(new Error("timeout conectando Alegra")),
    });
    getProviderMock.mockResolvedValue(provider);

    const { processDianEmitJobs } = await loadModule();
    const result = await processDianEmitJobs();

    expect(result).toEqual({ processed: 1, succeeded: 0, failed: 1 });

    const ops = supabase.__ops;
    const jobUpdates = ops.filter((o) => o.table === "dian_emit_jobs" && o.op === "update");
    // Último update (después del error)
    const retryUpdate = jobUpdates[jobUpdates.length - 1];
    const retryPayload = retryUpdate!.payload as Record<string, unknown>;

    expect(retryPayload.status).toBe("pending");
    expect(retryPayload.attempt_count).toBe(1);
    expect(retryPayload.last_error).toBe("timeout conectando Alegra");

    // next_attempt_at debe estar ~60s en el futuro
    const expectedNextAttempt = new Date(FIXED_NOW.getTime() + 60_000).toISOString();
    expect(retryPayload.next_attempt_at).toBe(expectedNextAttempt);
  });

  it("5. provider lanza error en intento 2 → attempt_count=2, next_attempt_at +5min", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);

    const job = {
      id: "job-fail-2",
      invoice_id: "inv-fail-2",
      status: "pending",
      attempt_count: 1, // ya intentó una vez
      next_attempt_at: FIXED_NOW.toISOString(),
    };
    const invoice = { id: "inv-fail-2", organization_id: "org-fail-2" };
    const org = { id: "org-fail-2", name: "Fail Org 2" };

    const supabase = makeSupabaseMock({
      dian_emit_jobs: {
        select: { data: [job], error: null },
        update: { data: null, error: null },
      },
      invoices: { select: { data: invoice, error: null } },
      organizations: { select: { data: org, error: null } },
      billing_providers: { select: { data: null, error: null } },
    });
    createAdminClientMock.mockReturnValue(supabase);

    const provider = makeProvider({
      emitInvoice: vi.fn().mockRejectedValue(new Error("error 2")),
    });
    getProviderMock.mockResolvedValue(provider);

    const { processDianEmitJobs } = await loadModule();
    const result = await processDianEmitJobs();

    expect(result.failed).toBe(1);

    const ops = supabase.__ops;
    const jobUpdates = ops.filter((o) => o.table === "dian_emit_jobs" && o.op === "update");
    const retryUpdate = jobUpdates[jobUpdates.length - 1];
    const retryPayload = retryUpdate!.payload as Record<string, unknown>;

    expect(retryPayload.attempt_count).toBe(2);
    // 5 * 60_000 = 300_000 ms = 5 minutos
    const expectedNextAttempt = new Date(FIXED_NOW.getTime() + 5 * 60_000).toISOString();
    expect(retryPayload.next_attempt_at).toBe(expectedNextAttempt);
    expect(retryPayload.status).toBe("pending");
  });

  it("6. provider lanza error en intento 3 → status=failed, attempt_count=3, console.error invocado", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const job = {
      id: "job-fail-3",
      invoice_id: "inv-fail-3",
      status: "pending",
      attempt_count: 2, // ya intentó 2 veces
      next_attempt_at: FIXED_NOW.toISOString(),
    };
    const invoice = { id: "inv-fail-3", organization_id: "org-fail-3" };
    const org = { id: "org-fail-3", name: "Fail Org 3" };

    const supabase = makeSupabaseMock({
      dian_emit_jobs: {
        select: { data: [job], error: null },
        update: { data: null, error: null },
      },
      invoices: { select: { data: invoice, error: null } },
      organizations: { select: { data: org, error: null } },
      billing_providers: { select: { data: null, error: null } },
    });
    createAdminClientMock.mockReturnValue(supabase);

    const provider = makeProvider({
      emitInvoice: vi.fn().mockRejectedValue(new Error("error definitivo")),
    });
    getProviderMock.mockResolvedValue(provider);

    const { processDianEmitJobs } = await loadModule();
    const result = await processDianEmitJobs();

    expect(result.failed).toBe(1);

    const ops = supabase.__ops;
    const jobUpdates = ops.filter((o) => o.table === "dian_emit_jobs" && o.op === "update");
    const finalUpdate = jobUpdates[jobUpdates.length - 1];
    const finalPayload = finalUpdate!.payload as Record<string, unknown>;

    expect(finalPayload.status).toBe("failed");
    expect(finalPayload.attempt_count).toBe(3);

    // console.error debe haberse llamado con el mensaje esperado (incluye errMsg)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[dian-emit-job] max attempts reached for invoice",
      "inv-fail-3",
      "error definitivo"
    );

    consoleErrorSpy.mockRestore();
  });

  it("7. provider devuelve status=accepted → invoice.dian_status=accepted", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);

    const job = {
      id: "job-accepted",
      invoice_id: "inv-accepted",
      status: "pending",
      attempt_count: 0,
      next_attempt_at: FIXED_NOW.toISOString(),
    };
    const invoice = { id: "inv-accepted", organization_id: "org-accepted" };
    const org = { id: "org-accepted", name: "Accepted Org" };

    const supabase = makeSupabaseMock({
      dian_emit_jobs: {
        select: { data: [job], error: null },
        update: { data: null, error: null },
      },
      invoices: {
        select: { data: invoice, error: null },
        update: { data: null, error: null },
      },
      organizations: { select: { data: org, error: null } },
      billing_providers: { select: { data: { provider: "alegra" }, error: null } },
    });
    createAdminClientMock.mockReturnValue(supabase);

    const provider = makeProvider({
      emitInvoice: vi.fn().mockResolvedValue({ externalId: "ext-acc", pdfUrl: null, status: "accepted" }),
    });
    getProviderMock.mockResolvedValue(provider);

    const { processDianEmitJobs } = await loadModule();
    await processDianEmitJobs();

    const ops = supabase.__ops;
    const invoiceUpdate = ops.find((o) => o.table === "invoices" && o.op === "update");
    expect((invoiceUpdate!.payload as Record<string, unknown>).dian_status).toBe("accepted");
  });

  it("8. provider devuelve status=pending → invoice.dian_status=pending", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);

    const job = {
      id: "job-pending-dian",
      invoice_id: "inv-pending-dian",
      status: "pending",
      attempt_count: 0,
      next_attempt_at: FIXED_NOW.toISOString(),
    };
    const invoice = { id: "inv-pending-dian", organization_id: "org-pending-dian" };
    const org = { id: "org-pending-dian", name: "Pending Dian Org" };

    const supabase = makeSupabaseMock({
      dian_emit_jobs: {
        select: { data: [job], error: null },
        update: { data: null, error: null },
      },
      invoices: {
        select: { data: invoice, error: null },
        update: { data: null, error: null },
      },
      organizations: { select: { data: org, error: null } },
      billing_providers: { select: { data: { provider: "manual" }, error: null } },
    });
    createAdminClientMock.mockReturnValue(supabase);

    const provider = makeProvider({
      emitInvoice: vi.fn().mockResolvedValue({ externalId: "ext-pend", pdfUrl: null, status: "pending" }),
    });
    getProviderMock.mockResolvedValue(provider);

    const { processDianEmitJobs } = await loadModule();
    await processDianEmitJobs();

    const ops = supabase.__ops;
    const invoiceUpdate = ops.find((o) => o.table === "invoices" && o.op === "update");
    expect((invoiceUpdate!.payload as Record<string, unknown>).dian_status).toBe("pending");
  });

  it("9. el filtro de selección incluye jobs pending vencidos y processing huérfanos (>10min)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);

    const supabase = makeSupabaseMock({
      dian_emit_jobs: { select: { data: [], error: null } },
    });
    createAdminClientMock.mockReturnValue(supabase);

    const { processDianEmitJobs } = await loadModule();
    await processDianEmitJobs();

    const selectOp = supabase.__ops.find((o) => o.table === "dian_emit_jobs" && o.op === "select");
    expect(selectOp).toBeDefined();
    const orFilter = selectOp!.filters["or"] as string;

    const nowIso = FIXED_NOW.toISOString();
    const staleBefore = new Date(FIXED_NOW.getTime() - 10 * 60_000).toISOString();
    // Cláusula 1: pending cuyo next_attempt_at ya venció
    expect(orFilter).toContain(`and(status.eq.pending,next_attempt_at.lte.${nowIso})`);
    // Cláusula 2: processing huérfano (updated_at más viejo que el buffer de 10min)
    expect(orFilter).toContain(`and(status.eq.processing,updated_at.lte.${staleBefore})`);
  });

  it("10. un job processing huérfano devuelto por el query se reprocesa por el happy path (preserva attempt_count)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);

    // Job que quedó atascado en 'processing' (crash previo). attempt_count sigue en 0.
    const staleJob = {
      id: "job-stale",
      invoice_id: "inv-stale",
      status: "processing",
      attempt_count: 0,
      next_attempt_at: new Date(FIXED_NOW.getTime() - 60_000).toISOString(),
    };
    const invoice = { id: "inv-stale", organization_id: "org-stale" };
    const org = { id: "org-stale", name: "Stale Org" };

    const supabase = makeSupabaseMock({
      dian_emit_jobs: {
        select: { data: [staleJob], error: null },
        update: { data: null, error: null },
      },
      invoices: {
        select: { data: invoice, error: null },
        update: { data: null, error: null },
      },
      organizations: { select: { data: org, error: null } },
      billing_providers: { select: { data: { provider: "alegra" }, error: null } },
    });
    createAdminClientMock.mockReturnValue(supabase);

    const provider = makeProvider();
    getProviderMock.mockResolvedValue(provider);

    const { processDianEmitJobs } = await loadModule();
    const result = await processDianEmitJobs();

    expect(result).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect(provider.emitInvoice).toHaveBeenCalledOnce();

    const jobUpdates = supabase.__ops.filter((o) => o.table === "dian_emit_jobs" && o.op === "update");
    const succeededUpdate = jobUpdates.find(
      (u) => (u.payload as Record<string, unknown>).status === "succeeded"
    );
    expect(succeededUpdate).toBeDefined();
  });
});
