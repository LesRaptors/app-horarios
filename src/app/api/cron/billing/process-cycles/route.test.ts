import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests para /api/cron/billing/process-cycles
 *
 * Estrategia:
 * - vi.mock de @/lib/supabase/admin → supabase chainable mock (patrón de dian-emit-job.test.ts)
 * - vi.mock de @/lib/billing/wompi/client → createTransaction mock
 * - CRON_SECRET forzado en process.env
 */

const createAdminClientMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

const createTransactionMock = vi.fn();

vi.mock("@/lib/billing/wompi/client", () => ({
  createTransaction: (...args: unknown[]) => createTransactionMock(...args),
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
        current.filters["or"] = filter;
        return chain;
      };
      chain.limit = (_n: number) => chain;
      chain.select = (_cols?: string) => chain;

      const resolveFor = (kind: Operation["op"]): QueryResult => {
        if (kind === "select") {
          const r = tableResponses["select"];
          if (Array.isArray(r)) {
            const key = table;
            selectCallCounters[key] = selectCallCounters[key] ?? 0;
            const idx = selectCallCounters[key];
            selectCallCounters[key]++;
            return r[idx] ?? r[r.length - 1] ?? { data: null, error: null };
          }
          return (r as QueryResult | undefined) ?? { data: null, error: null };
        }
        const r =
          tableResponses[kind as "insert" | "update" | "upsert" | "delete"];
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

function makeRequest(authHeader?: string): Request {
  return {
    headers: {
      get: (key: string) =>
        key === "authorization" ? (authHeader ?? null) : null,
    },
  } as unknown as Request;
}

async function loadRoute() {
  const mod = await import("./route");
  return { GET: mod.GET };
}

const PLAN = { id: "plan-1", price_cop: 100000 };
const PM = {
  id: "pm-1",
  provider_payment_source_id: "wompi-ps-42",
  organization_id: "org-1",
};
const INVOICE = { id: "inv-new-1" };

const makeSub = (overrides: Record<string, unknown> = {}) => ({
  id: "sub-1",
  organization_id: "org-1",
  plan_id: "plan-1",
  payment_method_id: "pm-1",
  current_period_end: "2026-05-01T08:00:00.000Z",
  status: "active",
  organizations: {
    billing_exempt: false,
    billing_email: "admin@empresa.com",
    name: "Empresa Test",
  },
  ...overrides,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetModules();
  createAdminClientMock.mockReset();
  createTransactionMock.mockReset();
  process.env.CRON_SECRET = "supersecret";
});

describe("GET /api/cron/billing/process-cycles", () => {
  it("1. header de autorización ausente/incorrecto → 401", async () => {
    const { GET } = await loadRoute();
    const res = await GET(makeRequest("Bearer wrong-secret"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  it("2. sin suscripciones vencidas → { processed:0, charged:0, failed:0, paused:0 }", async () => {
    const supabase = makeSupabaseMock({
      subscriptions: { select: { data: [], error: null } },
    });
    createAdminClientMock.mockReturnValue(supabase);

    const { GET } = await loadRoute();
    const res = await GET(makeRequest("Bearer supersecret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ processed: 0, charged: 0, failed: 0, paused: 0 });
  });

  it("3. suscripción sin payment_method_id → status past_due, results.failed++", async () => {
    const sub = makeSub({ payment_method_id: null });
    const supabase = makeSupabaseMock({
      subscriptions: {
        select: { data: [sub], error: null },
        update: { data: null, error: null },
      },
    });
    createAdminClientMock.mockReturnValue(supabase);

    const { GET } = await loadRoute();
    const res = await GET(makeRequest("Bearer supersecret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.charged).toBe(0);

    const updateOp = supabase.__ops.find(
      (o) => o.table === "subscriptions" && o.op === "update"
    );
    expect(updateOp).toBeDefined();
    expect(
      (updateOp!.payload as Record<string, unknown>).status
    ).toBe("past_due");
  });

  it("4. suscripción con tarjeta, createTransaction APPROVED → inserta factura (open) + pago (approved), results.charged++", async () => {
    const sub = makeSub();
    const supabase = makeSupabaseMock({
      subscriptions: {
        select: { data: [sub], error: null },
        update: { data: null, error: null },
      },
      plans: { select: { data: PLAN, error: null } },
      payment_methods: { select: { data: PM, error: null } },
      invoices: { insert: { data: INVOICE, error: null } },
      payments: { insert: { data: null, error: null } },
    });
    createAdminClientMock.mockReturnValue(supabase);
    createTransactionMock.mockResolvedValue({
      id: "wompi-tx-1",
      status: "APPROVED",
      reference: INVOICE.id,
    });

    const { GET } = await loadRoute();
    const res = await GET(makeRequest("Bearer supersecret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.charged).toBe(1);
    expect(body.failed).toBe(0);

    // Verifica que se creó la factura con status "open"
    const invoiceInsert = supabase.__ops.find(
      (o) => o.table === "invoices" && o.op === "insert"
    );
    expect(invoiceInsert).toBeDefined();
    expect(
      (invoiceInsert!.payload as Record<string, unknown>).status
    ).toBe("open");

    // Verifica que el pago se insertó con status "approved"
    const paymentInsert = supabase.__ops.find(
      (o) => o.table === "payments" && o.op === "insert"
    );
    expect(paymentInsert).toBeDefined();
    expect(
      (paymentInsert!.payload as Record<string, unknown>).status
    ).toBe("approved");
  });

  it("5. createTransaction lanza error → factura status failed, suscripción past_due, results.failed++", async () => {
    const sub = makeSub();
    const supabase = makeSupabaseMock({
      subscriptions: {
        select: { data: [sub], error: null },
        update: { data: null, error: null },
      },
      plans: { select: { data: PLAN, error: null } },
      payment_methods: { select: { data: PM, error: null } },
      invoices: {
        insert: { data: INVOICE, error: null },
        update: { data: null, error: null },
      },
    });
    createAdminClientMock.mockReturnValue(supabase);
    createTransactionMock.mockRejectedValue(
      new Error("Wompi /transactions 502: Bad Gateway")
    );

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const { GET } = await loadRoute();
    const res = await GET(makeRequest("Bearer supersecret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.failed).toBe(1);
    expect(body.charged).toBe(0);

    // Factura debe quedar como "failed"
    const invoiceUpdate = supabase.__ops.find(
      (o) => o.table === "invoices" && o.op === "update"
    );
    expect(invoiceUpdate).toBeDefined();
    expect(
      (invoiceUpdate!.payload as Record<string, unknown>).status
    ).toBe("failed");

    // Suscripción debe quedar "past_due"
    const subUpdate = supabase.__ops.find(
      (o) => o.table === "subscriptions" && o.op === "update"
    );
    expect(subUpdate).toBeDefined();
    expect(
      (subUpdate!.payload as Record<string, unknown>).status
    ).toBe("past_due");

    consoleErrorSpy.mockRestore();
  });

  it("6. createTransaction retorna DECLINED → pago con status declined, charged sigue en 0", async () => {
    const sub = makeSub();
    const supabase = makeSupabaseMock({
      subscriptions: {
        select: { data: [sub], error: null },
        update: { data: null, error: null },
      },
      plans: { select: { data: PLAN, error: null } },
      payment_methods: { select: { data: PM, error: null } },
      invoices: { insert: { data: INVOICE, error: null } },
      payments: { insert: { data: null, error: null } },
    });
    createAdminClientMock.mockReturnValue(supabase);
    createTransactionMock.mockResolvedValue({
      id: "wompi-tx-declined",
      status: "DECLINED",
      reference: INVOICE.id,
    });

    const { GET } = await loadRoute();
    const res = await GET(makeRequest("Bearer supersecret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.charged).toBe(0);
    expect(body.failed).toBe(0);

    // Pago insertado con status "declined"
    const paymentInsert = supabase.__ops.find(
      (o) => o.table === "payments" && o.op === "insert"
    );
    expect(paymentInsert).toBeDefined();
    expect(
      (paymentInsert!.payload as Record<string, unknown>).status
    ).toBe("declined");
  });
});
