import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests para /api/cron/billing/reminders
 *
 * Estrategia:
 * - vi.mock de @/lib/supabase/admin → supabase chainable mock
 * - vi.mock de @/lib/billing/dunning → decideDunningAction mock
 * - vi.mock de @/lib/emails/send-billing-emails → sendBillingEmail + sendBillingEmailToOrg mocks
 * - vi.mock de @/lib/billing/dian-emit-job → processDianEmitJobs mock
 * - CRON_SECRET forzado en process.env
 */

const createAdminClientMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

const decideDunningActionMock = vi.fn();

vi.mock("@/lib/billing/dunning", () => ({
  decideDunningAction: (...args: unknown[]) => decideDunningActionMock(...args),
}));

const sendBillingEmailMock = vi.fn();
const sendBillingEmailToOrgMock = vi.fn();

vi.mock("@/lib/emails/send-billing-emails", () => ({
  sendBillingEmail: (...args: unknown[]) => sendBillingEmailMock(...args),
  sendBillingEmailToOrg: (...args: unknown[]) => sendBillingEmailToOrgMock(...args),
}));

const processDianEmitJobsMock = vi.fn();

vi.mock("@/lib/billing/dian-emit-job", () => ({
  processDianEmitJobs: () => processDianEmitJobsMock(),
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

const DIAN_RESULT = { processed: 0, succeeded: 0, failed: 0 };

const makeSub = (overrides: Record<string, unknown> = {}) => ({
  id: "sub-1",
  organization_id: "org-1",
  plan_id: "plan-1",
  current_period_end: "2026-06-01T08:00:00.000Z",
  status: "trialing",
  organizations: {
    name: "Empresa Test",
    billing_email: "admin@empresa.com",
    billing_exempt: false,
  },
  ...overrides,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetModules();
  createAdminClientMock.mockReset();
  decideDunningActionMock.mockReset();
  sendBillingEmailMock.mockReset();
  sendBillingEmailToOrgMock.mockReset();
  processDianEmitJobsMock.mockReset();
  processDianEmitJobsMock.mockResolvedValue(DIAN_RESULT);
  process.env.CRON_SECRET = "supersecret";
  process.env.NEXT_PUBLIC_SITE_URL = "https://www.tushorarios.com";
  process.env.BILLING_ENABLED = "true";
});

describe("GET /api/cron/billing/reminders", () => {
  it("1. header de autorización ausente/incorrecto → 401", async () => {
    const { GET } = await loadRoute();
    const res = await GET(makeRequest("Bearer wrong-secret"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  it("1b. BILLING_ENABLED != 'true' → no-op { skipped: 'billing disabled' }, no procesa DIAN", async () => {
    process.env.BILLING_ENABLED = "false";
    const { GET } = await loadRoute();
    const res = await GET(makeRequest("Bearer supersecret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe("billing disabled");
    expect(processDianEmitJobsMock).not.toHaveBeenCalled();
  });

  it("2. sin suscripciones → devuelve emailsSent vacío + transitions vacío + dianResult; processDianEmitJobs se llama igual", async () => {
    const supabase = makeSupabaseMock({
      subscriptions: { select: { data: [], error: null } },
    });
    createAdminClientMock.mockReturnValue(supabase);
    decideDunningActionMock.mockReturnValue(null);

    const { GET } = await loadRoute();
    const res = await GET(makeRequest("Bearer supersecret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.emailsSent).toEqual([]);
    expect(body.transitions).toEqual({});
    expect(body.dianResult).toEqual(DIAN_RESULT);
    expect(processDianEmitJobsMock).toHaveBeenCalledTimes(1);
  });

  it("3. dunning retorna transition → past_due → subscriptions.update con {status: 'past_due'}, counter incrementa", async () => {
    const sub = makeSub({ status: "trialing" });
    const supabase = makeSupabaseMock({
      subscriptions: {
        select: { data: [sub], error: null },
        update: { data: null, error: null },
      },
    });
    createAdminClientMock.mockReturnValue(supabase);
    decideDunningActionMock.mockReturnValue({ kind: "transition", to: "past_due" });

    const { GET } = await loadRoute();
    const res = await GET(makeRequest("Bearer supersecret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.transitions).toEqual({ past_due: 1 });
    expect(body.emailsSent).toEqual([]);

    const subUpdate = supabase.__ops.find(
      (o) => o.table === "subscriptions" && o.op === "update"
    );
    expect(subUpdate).toBeDefined();
    expect((subUpdate!.payload as Record<string, unknown>).status).toBe("past_due");

    // organizations.update NO debe llamarse (solo se llama al pausar)
    const orgUpdate = supabase.__ops.find(
      (o) => o.table === "organizations" && o.op === "update"
    );
    expect(orgUpdate).toBeUndefined();
  });

  it("4. dunning retorna transition → paused → subscriptions + organizations.status = paused", async () => {
    const sub = makeSub({ status: "past_due" });
    const supabase = makeSupabaseMock({
      subscriptions: {
        select: { data: [sub], error: null },
        update: { data: null, error: null },
      },
      organizations: {
        update: { data: null, error: null },
      },
    });
    createAdminClientMock.mockReturnValue(supabase);
    decideDunningActionMock.mockReturnValue({ kind: "transition", to: "paused" });

    const { GET } = await loadRoute();
    const res = await GET(makeRequest("Bearer supersecret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.transitions).toEqual({ paused: 1 });

    const subUpdate = supabase.__ops.find(
      (o) => o.table === "subscriptions" && o.op === "update"
    );
    expect(subUpdate).toBeDefined();
    expect((subUpdate!.payload as Record<string, unknown>).status).toBe("paused");

    const orgUpdate = supabase.__ops.find(
      (o) => o.table === "organizations" && o.op === "update"
    );
    expect(orgUpdate).toBeDefined();
    expect((orgUpdate!.payload as Record<string, unknown>).status).toBe("paused");
  });

  it("5. dunning retorna acción email, no enviado antes → sendBillingEmail + insert sent_reminders + emailsSent", async () => {
    const sub = makeSub({ status: "trialing" });
    const supabase = makeSupabaseMock({
      subscriptions: { select: { data: [sub], error: null } },
      sent_reminders: {
        select: { data: null, error: null },   // no existe aún → maybeSingle null
        insert: { data: null, error: null },
      },
    });
    createAdminClientMock.mockReturnValue(supabase);
    decideDunningActionMock.mockReturnValue({
      kind: "email",
      template: "trial-ending",
      daysOffset: -3,
    });
    sendBillingEmailMock.mockResolvedValue(undefined);

    const { GET } = await loadRoute();
    const res = await GET(makeRequest("Bearer supersecret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.emailsSent).toEqual(["Empresa Test/trial-ending"]);

    // sendBillingEmail llamado con template + to + orgName + data correctos
    expect(sendBillingEmailMock).toHaveBeenCalledOnce();
    const callArgs = sendBillingEmailMock.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.template).toBe("trial-ending");
    expect(callArgs.to).toBe("admin@empresa.com");
    expect(callArgs.orgName).toBe("Empresa Test");
    expect((callArgs.data as Record<string, unknown>).paymentUrl).toContain("/facturacion");
    expect((callArgs.data as Record<string, unknown>).daysUntilEnd).toBe(3);

    // sent_reminders.insert con los campos correctos
    const reminderInsert = supabase.__ops.find(
      (o) => o.table === "sent_reminders" && o.op === "insert"
    );
    expect(reminderInsert).toBeDefined();
    const payload = reminderInsert!.payload as Record<string, unknown>;
    expect(payload.organization_id).toBe("org-1");
    expect(payload.template).toBe("trial-ending");
    expect(payload.days_offset).toBe(-3);
  });

  it("6. dunning retorna acción email PERO ya está en sent_reminders → dedup: sendBillingEmail NO llamado", async () => {
    const sub = makeSub({ status: "past_due" });
    const supabase = makeSupabaseMock({
      subscriptions: { select: { data: [sub], error: null } },
      sent_reminders: {
        select: { data: { id: "sr-exists" }, error: null },   // ya enviado
      },
    });
    createAdminClientMock.mockReturnValue(supabase);
    decideDunningActionMock.mockReturnValue({
      kind: "email",
      template: "payment-failed",
      daysOffset: 1,
    });

    const { GET } = await loadRoute();
    const res = await GET(makeRequest("Bearer supersecret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.emailsSent).toEqual([]);
    expect(sendBillingEmailMock).not.toHaveBeenCalled();

    // No debe haber insertado un reminder
    const reminderInsert = supabase.__ops.find(
      (o) => o.table === "sent_reminders" && o.op === "insert"
    );
    expect(reminderInsert).toBeUndefined();
  });

  it("7. sendBillingEmail lanza error → catcheado, lote continúa, NO inserta sent_reminders", async () => {
    const sub = makeSub({ status: "trialing" });
    const supabase = makeSupabaseMock({
      subscriptions: { select: { data: [sub], error: null } },
      sent_reminders: {
        select: { data: null, error: null },
        insert: { data: null, error: null },
      },
    });
    createAdminClientMock.mockReturnValue(supabase);
    decideDunningActionMock.mockReturnValue({
      kind: "email",
      template: "trial-ending",
      daysOffset: -1,
    });
    sendBillingEmailMock.mockRejectedValue(new Error("Resend API 500"));

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const { GET } = await loadRoute();
    const res = await GET(makeRequest("Bearer supersecret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    // El error se catchea; emailsSent queda vacío
    expect(body.emailsSent).toEqual([]);

    // No inserta sent_reminders porque el email falló (el insert está después del await sendBillingEmail)
    const reminderInsert = supabase.__ops.find(
      (o) => o.table === "sent_reminders" && o.op === "insert"
    );
    expect(reminderInsert).toBeUndefined();

    // processDianEmitJobs se llama de todas formas al final
    expect(processDianEmitJobsMock).toHaveBeenCalledTimes(1);

    consoleErrorSpy.mockRestore();
  });

  it("8. processDianEmitJobs se invoca una vez al final y su resultado aparece en la respuesta", async () => {
    const supabase = makeSupabaseMock({
      subscriptions: { select: { data: [], error: null } },
    });
    createAdminClientMock.mockReturnValue(supabase);
    const dianResult = { processed: 3, succeeded: 2, failed: 1 };
    processDianEmitJobsMock.mockResolvedValue(dianResult);

    const { GET } = await loadRoute();
    const res = await GET(makeRequest("Bearer supersecret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dianResult).toEqual(dianResult);
    expect(processDianEmitJobsMock).toHaveBeenCalledTimes(1);
  });

  it("9. una sub lanza error en el loop → lote continúa con la siguiente sub", async () => {
    const sub1 = makeSub({ id: "sub-throws" });
    const sub2 = makeSub({
      id: "sub-2",
      organizations: {
        name: "Empresa 2",
        billing_email: "admin2@empresa.com",
        billing_exempt: false,
      },
    });
    const supabase = makeSupabaseMock({
      subscriptions: { select: { data: [sub1, sub2], error: null } },
      sent_reminders: {
        select: { data: null, error: null },
        insert: { data: null, error: null },
      },
    });
    createAdminClientMock.mockReturnValue(supabase);

    // sub1 → decideDunningAction lanza error al evaluarse
    // sub2 → acción de email válida
    decideDunningActionMock
      .mockImplementationOnce(() => {
        throw new Error("decideDunning explotó");
      })
      .mockReturnValueOnce({
        kind: "email",
        template: "payment-failed",
        daysOffset: 3,
      });

    sendBillingEmailMock.mockResolvedValue(undefined);

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const { GET } = await loadRoute();
    const res = await GET(makeRequest("Bearer supersecret"));
    expect(res.status).toBe(200);
    const body = await res.json();

    // sub2 se procesó correctamente a pesar del error en sub1
    expect(body.emailsSent).toEqual(["Empresa 2/payment-failed"]);
    expect(sendBillingEmailMock).toHaveBeenCalledTimes(1);

    consoleErrorSpy.mockRestore();
  });
});
