import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Mocks de dependencias.
 *
 * Importante: `vi.mock` se hoistea al top del módulo. Para poder controlar
 * el comportamiento por test, exponemos funciones mock referenciables.
 */

const verifyWompiWebhookMock = vi.fn();
const getTransactionMock = vi.fn();
const createAdminClientMock = vi.fn();

vi.mock("@/lib/billing/wompi/webhook-verify", () => ({
  verifyWompiWebhook: (...args: unknown[]) => verifyWompiWebhookMock(...args),
}));

vi.mock("@/lib/billing/wompi/client", () => ({
  getTransaction: (...args: unknown[]) => getTransactionMock(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

/**
 * Construye un mock de Supabase chainable que registra todas las operaciones
 * y devuelve respuestas configurables por tabla.
 *
 * `responses` es un mapa table -> { select?, insert?, update?, upsert? }
 * donde cada valor es lo que se debe devolver al evaluar la promise final.
 */
type QueryResult = { data?: unknown; error?: unknown };
type TableResponses = {
  select?: QueryResult | ((filter: Record<string, unknown>) => QueryResult);
  insert?: QueryResult;
  update?: QueryResult;
  upsert?: QueryResult;
};

type Operation = {
  table: string;
  op: "select" | "insert" | "update" | "upsert" | "delete";
  payload?: unknown;
  filters: Record<string, unknown>;
};

function makeSupabaseMock(responses: Record<string, TableResponses>) {
  const ops: Operation[] = [];

  function from(table: string) {
    const tableResponses = responses[table] ?? {};

    function builder(op: Operation["op"], payload?: unknown) {
      ops.push({ table, op, payload, filters: {} });
      const current = ops[ops.length - 1];

      const chain: Record<string, unknown> = {};

      // Filtros que sólo registran y devuelven el chain
      const passThrough = (key: string) => (col: string, val: unknown) => {
        current.filters[`${key}:${col}`] = val;
        return chain;
      };

      chain.eq = passThrough("eq");
      chain.neq = passThrough("neq");
      chain.in = passThrough("in");

      chain.select = (_cols?: string) => chain;

      // Terminadores
      const resolveFor = (kind: Operation["op"]): QueryResult => {
        const r = tableResponses[kind as "select" | "insert" | "update" | "upsert"];
        if (typeof r === "function") return r(current.filters);
        return r ?? { data: null, error: null };
      };

      chain.maybeSingle = () => Promise.resolve(resolveFor(op));
      chain.single = () => Promise.resolve(resolveFor(op));
      // Cuando se hace `.update(...).eq(...)` sin terminador explícito,
      // el await lo dispara via `then`.
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

/**
 * Carga la ruta POST con los mocks ya configurados.
 * Importa dinámicamente para que los vi.mock surtan efecto antes.
 */
async function loadRoute() {
  const mod = await import("./route");
  return mod.POST;
}

function makeRequest(body: unknown): Request {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("http://localhost/api/webhooks/wompi", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw,
  });
}

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    event: "transaction.updated",
    timestamp: Math.floor(Date.now() / 1000),
    signature: { properties: [], checksum: "x".repeat(64) },
    data: {
      transaction: {
        id: "wompi-tx-1",
        status: "APPROVED",
        amount_in_cents: 11900000,
        reference: "invoice-uuid-1",
        status_message: null,
        ...((overrides.tx as object) ?? {}),
      },
    },
    ...overrides,
  };
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  verifyWompiWebhookMock.mockReset();
  getTransactionMock.mockReset();
  createAdminClientMock.mockReset();
  process.env.WOMPI_EVENTS_SECRET = "test-secret";
  // Reset module cache so re-importing ./route picks up fresh mocks
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("POST /api/webhooks/wompi", () => {
  it("1. body inválido (JSON malformado) → 400", async () => {
    const POST = await loadRoute();
    const req = new Request("http://localhost/api/webhooks/wompi", {
      method: "POST",
      body: "{not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid json/i);
  });

  it("2. WOMPI_EVENTS_SECRET ausente → 500", async () => {
    delete process.env.WOMPI_EVENTS_SECRET;
    const POST = await loadRoute();
    const res = await POST(makeRequest(basePayload()));
    expect(res.status).toBe(500);
  });

  it("3. firma inválida → 401", async () => {
    verifyWompiWebhookMock.mockReturnValue(false);
    const POST = await loadRoute();
    const res = await POST(makeRequest(basePayload()));
    expect(res.status).toBe(401);
  });

  it("4. evento distinto de transaction.updated → 200 ignored", async () => {
    verifyWompiWebhookMock.mockReturnValue(true);
    const POST = await loadRoute();
    const res = await POST(makeRequest(basePayload({ event: "nexus.event.foo" })));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ignored).toBe(true);
  });

  it("5. invoice no encontrada → 200 con warn", async () => {
    verifyWompiWebhookMock.mockReturnValue(true);
    const supabase = makeSupabaseMock({
      payments: { select: { data: null, error: null } },
      invoices: { select: { data: null, error: null } },
    });
    createAdminClientMock.mockReturnValue(supabase);

    const POST = await loadRoute();
    const res = await POST(makeRequest(basePayload()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.warn).toMatch(/invoice not found/i);
  });

  it("6. APPROVED + first charge (payment_source_id) → invoice paid + payment_method upsert + sub activa con periodo extendido", async () => {
    verifyWompiWebhookMock.mockReturnValue(true);
    const invoice = {
      id: "inv-1",
      organization_id: "org-1",
      payment_method_id: null,
      period_start: "2026-05-01T00:00:00Z",
      retry_count: 0,
    };
    const supabase = makeSupabaseMock({
      payments: {
        select: { data: null, error: null },
        insert: { data: null, error: null },
      },
      invoices: {
        select: { data: invoice, error: null },
        update: { data: null, error: null },
      },
      payment_methods: {
        upsert: { data: { id: "pm-1" }, error: null },
      },
      subscriptions: {
        update: { data: null, error: null },
      },
    });
    createAdminClientMock.mockReturnValue(supabase);

    getTransactionMock.mockResolvedValue({
      data: {
        payment_source_id: 7777,
        payment_method: {
          extra: { brand: "VISA", last_four: "4242", exp_month: "12", exp_year: "30" },
        },
      },
    });

    const POST = await loadRoute();
    const res = await POST(makeRequest(basePayload()));
    expect(res.status).toBe(200);

    const ops = supabase.__ops;
    const invoiceUpdate = ops.find((o) => o.table === "invoices" && o.op === "update");
    expect(invoiceUpdate).toBeDefined();
    expect((invoiceUpdate!.payload as Record<string, unknown>).status).toBe("paid");

    const pmUpsert = ops.find((o) => o.table === "payment_methods" && o.op === "upsert");
    expect(pmUpsert).toBeDefined();
    expect((pmUpsert!.payload as Record<string, unknown>).provider_payment_source_id).toBe("7777");
    expect((pmUpsert!.payload as Record<string, unknown>).card_last4).toBe("4242");

    const subUpdate = ops.find((o) => o.table === "subscriptions" && o.op === "update");
    expect(subUpdate).toBeDefined();
    const subPayload = subUpdate!.payload as Record<string, unknown>;
    expect(subPayload.status).toBe("active");
    expect(subPayload.payment_method_id).toBe("pm-1");
    expect(typeof subPayload.current_period_end).toBe("string");
  });

  it("7. APPROVED + recurring (sin payment_source_id) → invoice paid + sub solo extiende periodo", async () => {
    verifyWompiWebhookMock.mockReturnValue(true);
    const invoice = {
      id: "inv-2",
      organization_id: "org-2",
      payment_method_id: "pm-existing",
      period_start: "2026-05-01T00:00:00Z",
      retry_count: 0,
    };
    const supabase = makeSupabaseMock({
      payments: {
        select: { data: null, error: null },
        insert: { data: null, error: null },
      },
      invoices: {
        select: { data: invoice, error: null },
        update: { data: null, error: null },
      },
      subscriptions: {
        update: { data: null, error: null },
      },
    });
    createAdminClientMock.mockReturnValue(supabase);

    // Sin payment_source_id en la respuesta de Wompi
    getTransactionMock.mockResolvedValue({ data: {} });

    const POST = await loadRoute();
    const res = await POST(makeRequest(basePayload()));
    expect(res.status).toBe(200);

    const ops = supabase.__ops;
    const pmUpsert = ops.find((o) => o.table === "payment_methods" && o.op === "upsert");
    expect(pmUpsert).toBeUndefined();

    const subUpdate = ops.find((o) => o.table === "subscriptions" && o.op === "update");
    expect(subUpdate).toBeDefined();
    const subPayload = subUpdate!.payload as Record<string, unknown>;
    expect(subPayload.status).toBe("active");
    expect(subPayload).not.toHaveProperty("payment_method_id");
  });

  it("8. DECLINED → invoice failed + retry_count++ + sub past_due", async () => {
    verifyWompiWebhookMock.mockReturnValue(true);
    const invoice = {
      id: "inv-3",
      organization_id: "org-3",
      payment_method_id: null,
      period_start: "2026-05-01T00:00:00Z",
      retry_count: 2,
    };
    const supabase = makeSupabaseMock({
      payments: {
        select: { data: null, error: null },
        insert: { data: null, error: null },
      },
      invoices: {
        select: { data: invoice, error: null },
        update: { data: null, error: null },
      },
      subscriptions: {
        update: { data: null, error: null },
      },
    });
    createAdminClientMock.mockReturnValue(supabase);

    const res = await (await loadRoute())(
      makeRequest(basePayload({ tx: { status: "DECLINED", status_message: "rejected by bank" } }))
    );
    expect(res.status).toBe(200);

    const ops = supabase.__ops;
    const invoiceUpdate = ops.find((o) => o.table === "invoices" && o.op === "update");
    expect(invoiceUpdate).toBeDefined();
    const invPayload = invoiceUpdate!.payload as Record<string, unknown>;
    expect(invPayload.status).toBe("failed");
    expect(invPayload.retry_count).toBe(3);

    const subUpdate = ops.find((o) => o.table === "subscriptions" && o.op === "update");
    expect((subUpdate!.payload as Record<string, unknown>).status).toBe("past_due");
  });

  it("9. ERROR → mismo side-effect que DECLINED", async () => {
    verifyWompiWebhookMock.mockReturnValue(true);
    const invoice = {
      id: "inv-4",
      organization_id: "org-4",
      payment_method_id: null,
      period_start: "2026-05-01T00:00:00Z",
      retry_count: 0,
    };
    const supabase = makeSupabaseMock({
      payments: { select: { data: null, error: null }, insert: { data: null, error: null } },
      invoices: { select: { data: invoice, error: null }, update: { data: null, error: null } },
      subscriptions: { update: { data: null, error: null } },
    });
    createAdminClientMock.mockReturnValue(supabase);

    const res = await (await loadRoute())(makeRequest(basePayload({ tx: { status: "ERROR" } })));
    expect(res.status).toBe(200);

    const ops = supabase.__ops;
    expect((ops.find((o) => o.table === "invoices" && o.op === "update")!.payload as Record<string, unknown>).status).toBe(
      "failed"
    );
    expect((ops.find((o) => o.table === "subscriptions" && o.op === "update")!.payload as Record<string, unknown>).status).toBe(
      "past_due"
    );
  });

  it("10. VOIDED → mismo side-effect que DECLINED", async () => {
    verifyWompiWebhookMock.mockReturnValue(true);
    const invoice = {
      id: "inv-5",
      organization_id: "org-5",
      payment_method_id: null,
      period_start: "2026-05-01T00:00:00Z",
      retry_count: 1,
    };
    const supabase = makeSupabaseMock({
      payments: { select: { data: null, error: null }, insert: { data: null, error: null } },
      invoices: { select: { data: invoice, error: null }, update: { data: null, error: null } },
      subscriptions: { update: { data: null, error: null } },
    });
    createAdminClientMock.mockReturnValue(supabase);

    const res = await (await loadRoute())(makeRequest(basePayload({ tx: { status: "VOIDED" } })));
    expect(res.status).toBe(200);

    const ops = supabase.__ops;
    const invPayload = ops.find((o) => o.table === "invoices" && o.op === "update")!.payload as Record<string, unknown>;
    expect(invPayload.status).toBe("failed");
    expect(invPayload.retry_count).toBe(2);
  });

  it("11. idempotencia: mismo provider_transaction_id → UPDATE, no INSERT", async () => {
    verifyWompiWebhookMock.mockReturnValue(true);
    const existingPayment = { id: "pay-existing", invoice_id: "inv-6", status: "pending" };
    const invoice = {
      id: "inv-6",
      organization_id: "org-6",
      payment_method_id: null,
      period_start: "2026-05-01T00:00:00Z",
      retry_count: 0,
    };
    const supabase = makeSupabaseMock({
      payments: {
        select: { data: existingPayment, error: null },
        update: { data: null, error: null },
        // insert no debe llamarse
      },
      invoices: { select: { data: invoice, error: null }, update: { data: null, error: null } },
      payment_methods: { upsert: { data: { id: "pm-x" }, error: null } },
      subscriptions: { update: { data: null, error: null } },
    });
    createAdminClientMock.mockReturnValue(supabase);

    getTransactionMock.mockResolvedValue({ data: {} });

    const res = await (await loadRoute())(makeRequest(basePayload()));
    expect(res.status).toBe(200);

    const ops = supabase.__ops;
    const paymentInsert = ops.find((o) => o.table === "payments" && o.op === "insert");
    const paymentUpdate = ops.find((o) => o.table === "payments" && o.op === "update");
    expect(paymentInsert).toBeUndefined();
    expect(paymentUpdate).toBeDefined();
    expect(paymentUpdate!.filters["eq:id"]).toBe("pay-existing");
  });
});
