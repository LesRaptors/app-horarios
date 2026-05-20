# Landing Page B2B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir y publicar la landing page B2B en `tushorarios.com` / `www.tushorarios.com` con form de "Solicitar demo" funcional que persiste leads en Supabase y dispara emails vía Resend.

**Architecture:** Misma app Next.js, route group `(marketing)` para landing pública. Tabla nueva `demo_requests` con RLS (anon insert, admin select). API route `POST /api/demo-requests` valida con Zod, inserta y dispara 2 emails (al lead + al dev). DNS apex + www apuntan al proyecto Vercel existente.

**Tech Stack:** Next.js 14 App Router, React 18 server components, Tailwind 3, Radix Accordion (ya instalado), `next/font/google` Inter, Zod, react-hook-form, Lucide icons, react-email components (ya instalado), Resend SDK (ya instalado), Supabase service role.

**Spec:** [docs/superpowers/specs/2026-05-20-landing-page-design.md](../specs/2026-05-20-landing-page-design.md)

---

## File Structure

**Files this plan creates:**

```
supabase/migrations/038_demo_requests.sql              tabla + RLS + indexes
supabase/tests/demo_requests_rls_test.sql              RLS test BEGIN/ROLLBACK
src/app/(marketing)/layout.tsx                         metadata + Inter font
src/app/(marketing)/page.tsx                           landing root (compone secciones)
src/app/(marketing)/gracias/page.tsx                   thank you post-submit
src/app/api/demo-requests/route.ts                     POST handler
src/app/sitemap.ts                                     /, /login
src/app/robots.ts                                      allow all + sitemap URL
src/components/landing/NavBar.tsx                      logo + Iniciar sesión + CTA
src/components/landing/Hero.tsx                        dark con glow + schedule mock
src/components/landing/Pain.tsx                        Excel feo mockup
src/components/landing/Solution.tsx                    demo del motor
src/components/landing/SectorCards.tsx                 4 sectores
src/components/landing/Features.tsx                    6 cards
src/components/landing/HowItWorks.tsx                  3 pasos
src/components/landing/Faq.tsx                         accordion 6 preguntas
src/components/landing/DemoForm.tsx                    form 5+1 fields
src/components/landing/Footer.tsx                      logo + links + año
src/components/landing/ui/GlowBg.tsx                   background gradient mesh
src/components/landing/ui/SectionHeading.tsx           eyebrow + title + sub reusable
src/emails/demo-request-confirmation.tsx               template al lead
src/emails/demo-request-notification.tsx               template al dev
src/lib/landing/copy.ts                                copy en español Colombia
src/lib/landing/schema.ts                              Zod schemas del form
src/lib/landing/rate-limit.ts                          in-memory rate limit
public/og-image.png                                    Open Graph image (1200×630)
```

**Files this plan modifies:**

- `src/lib/supabase/middleware.ts` — agregar `/`, `/gracias` a rutas públicas
- `package.json` — agregar deps `react-hook-form`, `@hookform/resolvers`, `zod`, `framer-motion`

**Files this plan does NOT touch:** routes existentes en `(authenticated)/*`, `/login`, `/auth`, `/api/employees`, `/api/swaps`, `src/lib/resend.ts`, componentes en `src/components/shared/*`.

---

## Task 1: Migración 038 — tabla `demo_requests`

**Files:**
- Create: `supabase/migrations/038_demo_requests.sql`

- [ ] **Step 1: Crear el archivo SQL**

```sql
-- supabase/migrations/038_demo_requests.sql
-- Tabla para capturar solicitudes de demo desde la landing pública.
-- RLS: anon puede INSERT (form público), solo admin/manager SELECT/UPDATE.

BEGIN;

CREATE TABLE IF NOT EXISTS demo_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  nombre TEXT NOT NULL CHECK (length(nombre) BETWEEN 2 AND 120),
  email TEXT NOT NULL CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  empresa TEXT NOT NULL CHECK (length(empresa) BETWEEN 2 AND 120),
  telefono TEXT NOT NULL CHECK (length(telefono) BETWEEN 7 AND 30),
  sector TEXT NOT NULL CHECK (sector IN ('salud','retail','hoteleria','vigilancia','otro')),
  mensaje TEXT CHECK (mensaje IS NULL OR length(mensaje) <= 2000),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','contacted','converted','rejected')),
  ip_address INET,
  user_agent TEXT,
  contacted_at TIMESTAMPTZ,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_demo_requests_created_at ON demo_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_demo_requests_status ON demo_requests (status);
CREATE INDEX IF NOT EXISTS idx_demo_requests_email ON demo_requests (email);

ALTER TABLE demo_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY demo_requests_insert_public ON demo_requests
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY demo_requests_select_admin ON demo_requests
  FOR SELECT TO authenticated
  USING (get_user_role() IN ('admin','manager'));

CREATE POLICY demo_requests_update_admin ON demo_requests
  FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin','manager'));

COMMIT;
```

- [ ] **Step 2: Aplicar la migración**

Vía tool `mcp__plugin_supabase_supabase__apply_migration` con `name="038_demo_requests"` y el contenido SQL.

Expected: aplicada sin errores, `demo_requests` aparece en `list_tables`.

- [ ] **Step 3: Regenerar types**

Invocar skill `regen-types` (corre `mcp__plugin_supabase_supabase__generate_typescript_types` y guarda en `src/lib/supabase/database.types.ts`).

Verificar que `Database['public']['Tables']['demo_requests']` aparece en el tipo generado.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/038_demo_requests.sql src/lib/supabase/database.types.ts
git commit -m "feat(db): tabla demo_requests con RLS anon-insert + admin-select"
```

---

## Task 2: SQL test — RLS de `demo_requests`

**Files:**
- Create: `supabase/tests/demo_requests_rls_test.sql`

- [ ] **Step 1: Escribir el test**

```sql
-- supabase/tests/demo_requests_rls_test.sql
-- Verifica RLS:
--   1) anon puede INSERT
--   2) anon NO puede SELECT
--   3) admin SÍ puede SELECT
--   4) employee NO puede SELECT
-- Usa BEGIN/ROLLBACK — seguro contra prod.

BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin@test.local', '{}'),
  ('00000000-0000-0000-0000-000000000002', 'emp@test.local', '{}');

INSERT INTO profiles (id, email, full_name, role) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin@test.local', 'Admin Test', 'admin'),
  ('00000000-0000-0000-0000-000000000002', 'emp@test.local', 'Employee Test', 'employee');

-- TEST 1: anon puede INSERT
SET ROLE anon;
INSERT INTO demo_requests (nombre, email, empresa, telefono, sector)
VALUES ('Test Lead', 'test@example.com', 'Acme', '+57 300 1234567', 'salud');

-- TEST 2: anon NO puede SELECT
DO $$
DECLARE row_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count FROM demo_requests;
  IF row_count > 0 THEN
    RAISE EXCEPTION 'FAIL: anon vio % rows', row_count;
  END IF;
END $$;

-- TEST 3: admin SÍ puede SELECT
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
DO $$
DECLARE row_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count FROM demo_requests;
  IF row_count < 1 THEN
    RAISE EXCEPTION 'FAIL: admin no pudo ver demo_requests (count=%)', row_count;
  END IF;
END $$;

-- TEST 4: employee NO puede SELECT
SET request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
DO $$
DECLARE row_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count FROM demo_requests;
  IF row_count > 0 THEN
    RAISE EXCEPTION 'FAIL: employee vio % rows', row_count;
  END IF;
END $$;

RESET ROLE;
RAISE NOTICE 'Todos los tests RLS de demo_requests pasaron';

ROLLBACK;
```

- [ ] **Step 2: Ejecutar el test**

Vía `mcp__plugin_supabase_supabase__execute_sql` pasando el SQL completo.

Expected: termina con `NOTICE: Todos los tests RLS de demo_requests pasaron`. Si alguno falla, salir con EXCEPTION → arreglar la migración antes de continuar.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/demo_requests_rls_test.sql
git commit -m "test(db): RLS de demo_requests (anon insert + admin select)"
```

---

## Task 3: Instalar dependencias

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install**

```bash
cd "/Users/usuario/App Horarios"
npm install react-hook-form @hookform/resolvers zod framer-motion
```

Expected: agregadas a `dependencies`, sin nuevos errores ni vulnerabilities críticas.

- [ ] **Step 2: Verificar build**

```bash
npm run build 2>&1 | tail -5
```

Expected: build completa.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(landing): instalar react-hook-form + zod + framer-motion"
```

---

## Task 4: Copy y schemas del landing

**Files:**
- Create: `src/lib/landing/copy.ts`
- Create: `src/lib/landing/schema.ts`

- [ ] **Step 1: Crear `copy.ts` con todo el texto**

```typescript
// src/lib/landing/copy.ts
// Single source of truth para todo el copy del landing.
// Todo en español Colombia, tuteo.

export const copy = {
  brand: {
    name: 'Tus Horarios',
    tagline: 'Programación de turnos para empresas en Colombia.',
  },
  nav: {
    features: 'Funciones',
    sectors: 'Sectores',
    howItWorks: 'Cómo funciona',
    faq: 'Preguntas',
    login: 'Iniciar sesión',
    cta: 'Solicitar demo',
  },
  hero: {
    eyebrow: 'PARA EMPRESAS EN COLOMBIA',
    h1Start: 'Olvida el Excel.',
    h1Accent: 'Programa el mes en 2 minutos.',
    sub: 'Equidad real para sábados, domingos, noches y festivos. Cumple Ley 2101 y Art. 161 CST sin pensarlo.',
    ctaPrimary: 'Solicitar demo gratis',
    ctaSecondary: 'Ver cómo funciona',
  },
  pain: {
    eyebrow: 'EL PROBLEMA',
    title: 'El Excel de turnos te robó las mañanas del lunes.',
    body: 'Cada inicio de mes, el mismo ritual: pestañas infinitas, fórmulas que se rompen, alguien siempre molesto por su asignación. Errores que terminan en demandas laborales por mala distribución.',
    bullets: [
      'Horas de cuadre manual, mes a mes',
      'Equidad imposible de probar entre empleados',
      'Riesgo de incumplir Ley 2101 (44h) y Art. 161 CST',
      'Sin trazabilidad de quién tomó qué turno y por qué',
    ],
  },
  solution: {
    eyebrow: 'LA SOLUCIÓN',
    title: 'Un motor que distribuye con equidad real.',
    body: 'Cargas tu equipo, defines necesidades por sede, y el algoritmo arma el mes equilibrando sábados, domingos, noches y festivos entre todos. Cumple el código sustantivo del trabajo automáticamente.',
    bullets: [
      'Genera el cuadro completo en menos de 2 minutos',
      'Distribuye sábados/domingos/noches con desviación < 1 turno',
      'Respeta descansos mínimos (12h entre turnos, 24h tras noche)',
      'Marca horas extra para tu aprobación antes de publicar',
    ],
  },
  sectors: {
    eyebrow: 'PARA TU SECTOR',
    title: 'Diseñado para cómo trabaja Colombia.',
    items: [
      { key: 'salud',       title: 'Salud',                     examples: 'Clínicas, hospitales, IPS, odontologías', body: 'Personal asistencial 12h/día (Decreto 1042/1978). Turnos 24/7 cubiertos con equidad. Reglas de descanso post-nocturno automáticas.' },
      { key: 'retail',      title: 'Retail',                    examples: 'Supermercados, tiendas, ferreterías',     body: 'Cubre horas pico de fines de semana sin pagar extras de más. Aprobación inline de overtime cuando el algoritmo lo necesite.' },
      { key: 'hoteleria',   title: 'Hotelería y restaurantes',  examples: 'Hoteles, restaurantes, bares',            body: 'Turnos partidos, festivos balanceados, rotación equitativa de fines de semana. Reduce rotación por turnos injustos.' },
      { key: 'vigilancia',  title: 'Vigilancia y aseo',         examples: 'Seguridad, vigilancia, aseo industrial',  body: 'Turnos 12×12 o 24×24, supernumerarios para cubrir incapacidades, trazabilidad SuperVigilancia.' },
    ],
  },
  features: {
    eyebrow: 'FUNCIONES',
    title: 'Todo lo que necesitas para programar turnos en serio.',
    items: [
      { title: 'Equidad Ley CST',     body: 'Algoritmo que cumple Ley 2101 (44h semanales) y Art. 161 CST (descanso semanal obligatorio) sin pensar.' },
      { title: 'Supernumerarios',     body: 'Empleados comodín que cubren múltiples posiciones cuando alguien se enferma o se va de vacaciones.' },
      { title: 'Reglas de descanso',  body: 'Ciclos 4×3, rotaciones de findes, post-nocturno, máximo de noches consecutivas. Configurables por empleado.' },
      { title: 'Nómina Colombia',     body: 'Cesantías, primas, intereses, vacaciones, recargos dominicales y nocturnos. UVT actualizado.' },
      { title: 'Festivos automáticos',body: 'Calendario colombiano 2026–2028 pre-cargado. Recargo del 175% aplicado automáticamente.' },
      { title: 'Horas extra controladas', body: 'Motor identifica cuándo se necesitan extras y las marca para aprobación del gerente antes de publicar.' },
    ],
  },
  howItWorks: {
    eyebrow: 'CÓMO FUNCIONA',
    title: 'Tres pasos para acabar con el Excel.',
    steps: [
      { n: '01', title: 'Carga tu equipo',       body: 'Importa empleados, sedes y posiciones. Define tipo de contrato y reglas de descanso por persona.' },
      { n: '02', title: 'Define las necesidades',body: 'Cuántas personas necesitas por sede, posición y turno. El motor entiende los patrones semanales.' },
      { n: '03', title: 'Genera con un click',   body: 'El algoritmo arma el cuadro completo del mes en menos de 2 minutos, balanceando con equidad.' },
    ],
  },
  faq: {
    eyebrow: 'PREGUNTAS FRECUENTES',
    title: '¿Aún tienes dudas?',
    items: [
      { q: '¿En cuánto tiempo puedo empezar a usar Tus Horarios?', a: 'Después de la demo, el setup inicial toma 1–2 días. Te ayudamos con la carga de empleados, configuración de sedes y reglas de tu sector. La primera generación de turnos puede correr esa misma semana.' },
      { q: '¿Cumple toda la normativa colombiana?', a: 'Sí. El motor implementa Ley 2101 (44h semanales), Art. 161 CST (descanso semanal obligatorio), Decreto 1042/1978 (12h asistencial), Art. 179 CST (descanso compensatorio por dominicales). Festivos nacionales 2026–2028 pre-cargados.' },
      { q: '¿Funciona si tengo varias sedes?', a: 'Sí, el producto está pensado para empresas multi-sede (3–10 sedes típico). Cada sede tiene sus propias necesidades, posiciones y empleados, pero el reporte se ve consolidado.' },
      { q: '¿Y la nómina?', a: 'Calculamos cesantías, intereses, prima, vacaciones, recargos dominicales y nocturnos, retención en la fuente con UVT actualizado, ARL y aportes a seguridad social. Generamos comprobante de pago (colilla) para cada empleado.' },
      { q: '¿Qué pasa si necesito horas extra?', a: 'El motor identifica automáticamente cuándo no logra cubrir con la jornada normal y marca esas asignaciones como "extras pendientes" para tu aprobación. Tú apruebas (o rechazas) en bulk antes de publicar el cuadro.' },
      { q: '¿Cómo manejan vacaciones, incapacidades o cambios de último momento?', a: 'Registras ausencias (con o sin justificación) en la app. El motor las respeta al generar. Para emergencias, tienes empleados marcados como "supernumerarios" que pueden cubrir múltiples posiciones.' },
    ],
  },
  ctaFinal: {
    eyebrow: '¿LISTO PARA EMPEZAR?',
    title: 'Solicita una demo personalizada',
    body: 'Te mostramos el producto con tus datos reales, sin compromiso. Toma 30 minutos por videollamada. Te contactamos en menos de 24 horas hábiles.',
  },
  form: {
    nombreLabel: 'Nombre y apellido',
    nombrePlaceholder: 'Simón Urrego',
    emailLabel: 'Email corporativo',
    emailPlaceholder: 'simon@empresa.com',
    empresaLabel: 'Empresa',
    empresaPlaceholder: 'Mi Clínica S.A.S.',
    telefonoLabel: 'Teléfono',
    telefonoPlaceholder: '+57 300 1234567',
    sectorLabel: 'Sector',
    sectorOptions: [
      { value: 'salud',      label: 'Salud' },
      { value: 'retail',     label: 'Retail' },
      { value: 'hoteleria',  label: 'Hotelería' },
      { value: 'vigilancia', label: 'Vigilancia' },
      { value: 'otro',       label: 'Otro' },
    ],
    mensajeLabel: 'Mensaje (opcional)',
    mensajePlaceholder: 'Cuéntanos brevemente cómo manejas los turnos hoy.',
    submitLabel: 'Solicitar demo gratis',
    submitting: 'Enviando…',
    successTitle: '¡Recibimos tu solicitud!',
    successBody: 'Te contactamos en las próximas 24 horas hábiles.',
    errorTitle: 'No pudimos enviar tu solicitud',
    errorBody: 'Algo salió mal. Intenta de nuevo o escríbenos directo a hola@tushorarios.com.',
  },
  gracias: {
    h1: '¡Gracias!',
    body: 'Recibimos tu solicitud de demo. Te contactamos en menos de 24 horas hábiles desde hola@tushorarios.com. Mientras tanto, puedes revisar tu correo — te enviamos una confirmación.',
    cta: 'Volver al inicio',
  },
  footer: {
    tagline: 'Programación de turnos para empresas en Colombia.',
    contactLabel: 'Contacto',
    contactEmail: 'hola@tushorarios.com',
    rights: '© {year} Tus Horarios. Todos los derechos reservados.',
    privacyLabel: 'Política de privacidad',
    termsLabel: 'Términos y condiciones',
  },
} as const;
```

- [ ] **Step 2: Crear `schema.ts` con Zod**

```typescript
// src/lib/landing/schema.ts
import { z } from 'zod';

export const demoRequestSchema = z.object({
  nombre: z.string().trim().min(2, 'Mínimo 2 caracteres').max(120, 'Máximo 120 caracteres'),
  email: z.string().trim().email('Email inválido').max(254, 'Email demasiado largo'),
  empresa: z.string().trim().min(2, 'Mínimo 2 caracteres').max(120, 'Máximo 120 caracteres'),
  telefono: z.string().trim().min(7, 'Teléfono inválido').max(30, 'Teléfono demasiado largo'),
  sector: z.enum(['salud', 'retail', 'hoteleria', 'vigilancia', 'otro']),
  mensaje: z.string().trim().max(2000, 'Máximo 2000 caracteres').optional().or(z.literal('')),
  // Honeypot: campo oculto que humanos no llenan; bots sí. Debe llegar vacío.
  website: z.string().max(0, 'spam detected').optional().or(z.literal('')),
});

export type DemoRequestInput = z.infer<typeof demoRequestSchema>;
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/landing/copy.ts src/lib/landing/schema.ts
git commit -m "feat(landing): copy en español Colombia + schema Zod del form"
```

---

## Task 5: Rate limit helper

**Files:**
- Create: `src/lib/landing/rate-limit.ts`

- [ ] **Step 1: Crear el archivo**

```typescript
// src/lib/landing/rate-limit.ts
// Rate limit in-memory para form público. 5 requests por IP por hora.
// Suficiente para MVP. Migrar a Redis/Upstash si tráfico crece.

const RATE_LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;

const requests = new Map<string, number[]>();

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const arr = (requests.get(ip) ?? []).filter((ts) => now - ts < WINDOW_MS);

  if (arr.length >= RATE_LIMIT) {
    const oldest = Math.min(...arr);
    const retryAfterSeconds = Math.ceil((oldest + WINDOW_MS - now) / 1000);
    requests.set(ip, arr);
    return { allowed: false, retryAfterSeconds };
  }

  arr.push(now);
  requests.set(ip, arr);
  return { allowed: true };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/landing/rate-limit.ts
git commit -m "feat(landing): rate limit in-memory 5 req/hora por IP"
```

---

## Task 6: Email templates con react-email

**Files:**
- Create: `src/emails/demo-request-confirmation.tsx`
- Create: `src/emails/demo-request-notification.tsx`

- [ ] **Step 1: Template de confirmación al lead**

```tsx
// src/emails/demo-request-confirmation.tsx
import { Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Text } from '@react-email/components';

interface Props { nombre: string; empresa: string; }

const LOGO = 'https://app-horarios-mauve.vercel.app/icono-transparente.png';

export default function DemoRequestConfirmationEmail({ nombre, empresa }: Props) {
  return (
    <Html lang="es-CO">
      <Head />
      <Preview>Recibimos tu solicitud de demo de Tus Horarios</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            <Img src={LOGO} alt="Tus Horarios" width="40" height="40" />
            <Text style={brand}>Tus Horarios</Text>
          </Section>
          <Section style={content}>
            <Heading style={h1}>¡Recibimos tu solicitud!</Heading>
            <Text style={p}>Hola {nombre},</Text>
            <Text style={p}>
              Gracias por interesarte en <strong>Tus Horarios</strong>. Recibimos tu solicitud de demo para <strong>{empresa}</strong> y te contactaremos en las próximas <strong>24 horas hábiles</strong>.
            </Text>
            <Text style={p}>
              La demo dura 30 minutos por videollamada. Si quieres adelantar, puedes responder este correo con los días y horas que te queden mejor.
            </Text>
            <Button style={button} href="https://tushorarios.com">Volver a tushorarios.com</Button>
          </Section>
          <Section style={footer}>
            <Text style={footerText}>Tus Horarios — Programación de turnos para empresas en Colombia.</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body = { backgroundColor: '#F1F5F9', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" };
const container = { maxWidth: '600px', margin: '40px auto', backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', overflow: 'hidden' };
const header = { padding: '32px 40px 24px', borderBottom: '1px solid #E2E8F0' };
const brand = { fontSize: '20px', fontWeight: 700, color: '#020817', display: 'inline-block', marginLeft: '10px', verticalAlign: 'middle' };
const content = { padding: '32px 40px' };
const h1 = { fontSize: '24px', fontWeight: 700, color: '#020817', margin: '0 0 16px' };
const p = { fontSize: '16px', lineHeight: '1.6', color: '#020817', margin: '0 0 16px' };
const button = { backgroundColor: '#2563EB', color: '#FFFFFF', textDecoration: 'none', fontSize: '16px', fontWeight: 600, padding: '14px 32px', borderRadius: '8px', display: 'inline-block', marginTop: '8px' };
const footer = { padding: '24px 40px', backgroundColor: '#F8FAFC', borderTop: '1px solid #E2E8F0' };
const footerText = { fontSize: '13px', color: '#64748B', margin: 0, textAlign: 'center' as const };
```

- [ ] **Step 2: Template de notificación al dev**

```tsx
// src/emails/demo-request-notification.tsx
import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from '@react-email/components';

interface Props {
  id: string;
  nombre: string;
  email: string;
  empresa: string;
  telefono: string;
  sector: string;
  mensaje?: string;
  supabaseUrl: string;
}

export default function DemoRequestNotificationEmail({ id, nombre, email, empresa, telefono, sector, mensaje, supabaseUrl }: Props) {
  const editorUrl = `${supabaseUrl}/project/ugkvuinkynvtuiutwlkd/editor/demo_requests?filter=id::uuid::eq.${id}`;

  return (
    <Html lang="es-CO">
      <Head />
      <Preview>Nueva solicitud de demo — {empresa}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={h1}>Nueva solicitud de demo</Heading>
          <Section style={card}>
            <Row label="Empresa" value={empresa} />
            <Row label="Nombre" value={nombre} />
            <Row label="Email" value={email} />
            <Row label="Teléfono" value={telefono} />
            <Row label="Sector" value={sector} />
            {mensaje ? (
              <>
                <Hr style={hr} />
                <Text style={label}>Mensaje:</Text>
                <Text style={p}>{mensaje}</Text>
              </>
            ) : null}
          </Section>
          <Section style={{ marginTop: '24px' }}>
            <Link href={editorUrl} style={linkBtn}>→ Abrir en Supabase</Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Section style={{ marginBottom: '8px' }}>
      <Text style={labelInline}>{label}: </Text>
      <Text style={valueInline}>{value}</Text>
    </Section>
  );
}

const body = { backgroundColor: '#F1F5F9', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", padding: '20px' };
const container = { maxWidth: '600px', margin: '20px auto', backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '32px' };
const h1 = { fontSize: '20px', fontWeight: 700, color: '#020817', margin: '0 0 24px' };
const card = { backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '20px' };
const label = { fontSize: '13px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 4px' };
const labelInline = { fontSize: '13px', fontWeight: 600, color: '#64748B', display: 'inline' };
const valueInline = { fontSize: '14px', color: '#020817', display: 'inline' };
const p = { fontSize: '14px', lineHeight: '1.6', color: '#020817', margin: '0', whiteSpace: 'pre-wrap' as const };
const hr = { border: 'none', borderTop: '1px solid #E2E8F0', margin: '16px 0' };
const linkBtn = { color: '#2563EB', fontSize: '14px', fontWeight: 600, textDecoration: 'none' };
```

- [ ] **Step 3: Commit**

```bash
git add src/emails/demo-request-confirmation.tsx src/emails/demo-request-notification.tsx
git commit -m "feat(emails): templates confirmación lead + notificación dev"
```

---

## Task 7: API route `POST /api/demo-requests`

**Files:**
- Create: `src/app/api/demo-requests/route.ts`

- [ ] **Step 1: Crear el handler**

```typescript
// src/app/api/demo-requests/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resend, FROM_NOREPLY, FROM_HOLA } from '@/lib/resend';
import { demoRequestSchema } from '@/lib/landing/schema';
import { checkRateLimit } from '@/lib/landing/rate-limit';
import DemoRequestConfirmationEmail from '@/emails/demo-request-confirmation';
import DemoRequestNotificationEmail from '@/emails/demo-request-notification';

export const runtime = 'nodejs';

function getClientIP(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  const rateLimit = checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Demasiadas solicitudes. Intenta más tarde.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds ?? 3600) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = demoRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Honeypot — si el campo `website` está lleno, fingimos éxito (sin alertar al bot).
  if (parsed.data.website && parsed.data.website.length > 0) {
    console.warn('[demo-requests] honeypot triggered from', ip);
    return NextResponse.json({ ok: true });
  }

  const { nombre, email, empresa, telefono, sector, mensaje } = parsed.data;
  const userAgent = request.headers.get('user-agent') ?? null;

  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .from('demo_requests')
    .insert({
      nombre,
      email,
      empresa,
      telefono,
      sector,
      mensaje: mensaje || null,
      ip_address: ip === 'unknown' ? null : ip,
      user_agent: userAgent,
    })
    .select('id')
    .single();

  if (error || !row) {
    console.error('[demo-requests] insert failed', error);
    return NextResponse.json({ error: 'No pudimos guardar tu solicitud. Intenta de nuevo.' }, { status: 500 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

  const results = await Promise.allSettled([
    resend.emails.send({
      from: `Tus Horarios <${FROM_NOREPLY}>`,
      to: email,
      reply_to: FROM_HOLA,
      subject: 'Recibimos tu solicitud de demo de Tus Horarios',
      react: DemoRequestConfirmationEmail({ nombre, empresa }),
    }),
    resend.emails.send({
      from: `Tus Horarios <${FROM_HOLA}>`,
      to: ['suv411@hotmail.com', FROM_HOLA],
      reply_to: email,
      subject: `Nueva solicitud de demo — ${empresa}`,
      react: DemoRequestNotificationEmail({
        id: row.id,
        nombre, email, empresa, telefono, sector, mensaje,
        supabaseUrl,
      }),
    }),
  ]);

  results.forEach((r, idx) => {
    if (r.status === 'rejected') {
      console.error(`[demo-requests] email ${idx === 0 ? 'confirmation' : 'notification'} failed`, r.reason);
    }
  });

  return NextResponse.json({ ok: true, id: row.id });
}
```

- [ ] **Step 2: Verificar build**

```bash
npm run build 2>&1 | tail -10
```

Expected: build limpio. Si falla por tipos del schema, regenerar `database.types.ts` (Task 1 Step 3).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/demo-requests/route.ts
git commit -m "feat(landing): POST /api/demo-requests valida + insert + emails"
```

---

## Task 8: Middleware — abrir rutas públicas

**Files:**
- Modify: `src/lib/supabase/middleware.ts`

- [ ] **Step 1: Leer el archivo actual**

```bash
cat src/lib/supabase/middleware.ts
```

Identificar la línea: `const isPublic = path.startsWith("/login") || path.startsWith("/auth");`

- [ ] **Step 2: Reemplazar esa línea**

Cambiar a:

```typescript
  const isPublic =
    path === '/' ||
    path === '/gracias' ||
    path.startsWith('/login') ||
    path.startsWith('/auth');
```

(El `/api/demo-requests` ya está excluido por el matcher de Next.js — el middleware no corre para `/api/*`.)

- [ ] **Step 3: Verificar build**

```bash
npm run build 2>&1 | tail -5
```

Expected: limpio.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/middleware.ts
git commit -m "feat(landing): abrir / y /gracias en middleware"
```

---

## Task 9: `GlowBg` component

**Files:**
- Create: `src/components/landing/ui/GlowBg.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
// src/components/landing/ui/GlowBg.tsx
// Background reutilizable: gradient mesh oscuro con glow azul.

export function GlowBg({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`absolute inset-0 overflow-hidden ${className}`}
      style={{
        background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #1E3A8A 0%, #0F172A 45%, #020617 100%)',
      }}
    >
      <div
        className="absolute"
        style={{
          top: '-10%', right: '5%', width: '60%', height: '70%',
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.35), transparent 60%)',
          filter: 'blur(40px)',
        }}
      />
      <div
        className="absolute"
        style={{
          bottom: '-20%', left: '-10%', width: '70%', height: '60%',
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.2), transparent 60%)',
          filter: 'blur(60px)',
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/landing/ui/GlowBg.tsx
git commit -m "feat(landing): GlowBg component"
```

---

## Task 10: `SectionHeading` reusable

**Files:**
- Create: `src/components/landing/ui/SectionHeading.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
// src/components/landing/ui/SectionHeading.tsx
interface Props {
  eyebrow: string;
  title: string;
  sub?: string;
  centered?: boolean;
  dark?: boolean;
}

export function SectionHeading({ eyebrow, title, sub, centered = true, dark = false }: Props) {
  const textColor = dark ? 'text-white' : 'text-slate-950';
  const subColor = dark ? 'text-slate-300' : 'text-slate-600';
  const align = centered ? 'text-center mx-auto' : '';

  return (
    <div className={`max-w-3xl ${align} mb-12 md:mb-16`}>
      <p className="text-xs font-semibold tracking-widest text-blue-600 uppercase mb-3">
        {eyebrow}
      </p>
      <h2 className={`text-3xl md:text-5xl font-bold tracking-tight ${textColor} mb-4`}>
        {title}
      </h2>
      {sub ? <p className={`text-lg leading-relaxed ${subColor}`}>{sub}</p> : null}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/landing/ui/SectionHeading.tsx
git commit -m "feat(landing): SectionHeading reusable"
```

---

## Task 11: `NavBar`

**Files:**
- Create: `src/components/landing/NavBar.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
// src/components/landing/NavBar.tsx
import Link from 'next/link';
import Image from 'next/image';
import { copy } from '@/lib/landing/copy';

export function NavBar() {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-white/10">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 text-white">
          <Image src="/icono-transparente.png" alt={copy.brand.name} width={32} height={32} priority />
          <span className="font-bold text-lg tracking-tight">{copy.brand.name}</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm text-slate-300">
          <a href="#sectores" className="hover:text-white transition-colors">{copy.nav.sectors}</a>
          <a href="#funciones" className="hover:text-white transition-colors">{copy.nav.features}</a>
          <a href="#como-funciona" className="hover:text-white transition-colors">{copy.nav.howItWorks}</a>
          <a href="#faq" className="hover:text-white transition-colors">{copy.nav.faq}</a>
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/login" className="hidden sm:inline text-sm text-slate-300 hover:text-white transition-colors">
            {copy.nav.login}
          </Link>
          <a href="#solicitar-demo" className="bg-white text-slate-950 hover:bg-slate-100 transition-colors text-sm font-semibold px-4 py-2 rounded-lg">
            {copy.nav.cta}
          </a>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/landing/NavBar.tsx
git commit -m "feat(landing): NavBar sticky con anchors + CTAs"
```

---

## Task 12: `Hero` con schedule grid mock

**Files:**
- Create: `src/components/landing/Hero.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
// src/components/landing/Hero.tsx
import { ArrowRight } from 'lucide-react';
import { GlowBg } from './ui/GlowBg';
import { copy } from '@/lib/landing/copy';

type CellType = 'day' | 'night' | 'rest' | 'empty';

const scheduleMockCells: CellType[] = [
  'day','day','rest','night','day','day','rest',
  'night','rest','day','day','night','rest','day',
  'day','day','night','rest','day','day','rest',
  'rest','day','day','night','rest','day','day',
];

function Cell({ type }: { type: CellType }) {
  const styles: Record<CellType, string> = {
    day: 'bg-blue-500/80 text-white border-blue-400/30',
    night: 'bg-indigo-500/80 text-white border-indigo-400/30',
    rest: 'bg-amber-500/20 text-amber-300 border-amber-500/20',
    empty: 'bg-slate-800/40 text-slate-500 border-white/5',
  };
  const labels: Record<CellType, string> = { day: '6-2', night: '2-10', rest: '—', empty: '' };
  return (
    <div className={`aspect-[1.6/1] rounded-md border ${styles[type]} flex items-center justify-center text-[11px] font-medium`}>
      {labels[type]}
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden text-white">
      <GlowBg />
      <div className="relative max-w-6xl mx-auto px-6 pt-16 pb-24 md:pt-24 md:pb-32">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold tracking-widest text-blue-400 uppercase mb-5">{copy.hero.eyebrow}</p>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
            {copy.hero.h1Start}
            <br />
            <span className="text-blue-400">{copy.hero.h1Accent}</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-slate-300 leading-relaxed max-w-2xl">{copy.hero.sub}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#solicitar-demo" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 transition-colors text-white px-6 py-3.5 rounded-lg font-semibold">
              {copy.hero.ctaPrimary}
              <ArrowRight className="w-4 h-4" />
            </a>
            <a href="#solucion" className="inline-flex items-center gap-2 text-slate-300 hover:text-white transition-colors px-6 py-3.5 font-semibold">
              {copy.hero.ctaSecondary} ↓
            </a>
          </div>
        </div>

        <div className="mt-16 md:mt-20 max-w-5xl">
          <div className="rounded-xl border border-white/10 bg-slate-900/50 backdrop-blur p-4 md:p-6 shadow-2xl">
            <div className="grid grid-cols-7 gap-1.5 mb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
                <div key={i} className="text-center py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {scheduleMockCells.map((c, i) => (<Cell key={i} type={c} />))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/landing/Hero.tsx
git commit -m "feat(landing): Hero dark con glow + schedule grid mock"
```

---

## Task 13: `Pain` section

**Files:**
- Create: `src/components/landing/Pain.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
// src/components/landing/Pain.tsx
import { X } from 'lucide-react';
import { SectionHeading } from './ui/SectionHeading';
import { copy } from '@/lib/landing/copy';

export function Pain() {
  return (
    <section className="bg-white py-20 md:py-28">
      <div className="max-w-6xl mx-auto px-6">
        <SectionHeading eyebrow={copy.pain.eyebrow} title={copy.pain.title} sub={copy.pain.body} />

        <div className="mt-12 grid md:grid-cols-2 gap-8 items-start">
          {/* Excel feo mock */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
            <div className="text-xs text-slate-500 font-semibold mb-3 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="ml-2">turnos_octubre_v17_FINAL_corregido.xlsx</span>
            </div>
            <div className="bg-white rounded border border-slate-300 overflow-hidden">
              <div className="grid grid-cols-8 text-[10px] font-mono">
                {Array.from({ length: 8 * 12 }).map((_, i) => {
                  const isHeader = i < 8;
                  const isError = [10, 18, 27, 35, 43, 51].includes(i);
                  return (
                    <div
                      key={i}
                      className={`border-b border-r border-slate-200 px-1.5 py-1 ${isHeader ? 'bg-slate-100 font-semibold text-slate-700' : isError ? 'bg-red-50 text-red-700' : 'text-slate-600'}`}
                    >
                      {isHeader
                        ? ['', 'L', 'M', 'M', 'J', 'V', 'S', 'D'][i] ?? ''
                        : isError
                        ? '#REF!'
                        : ['6-2', '2-10', '—', ''][i % 4]}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Lista de pains */}
          <div className="space-y-4">
            {copy.pain.bullets.map((b, i) => (
              <div key={i} className="flex gap-3 items-start">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center mt-0.5">
                  <X className="w-4 h-4" />
                </div>
                <p className="text-base text-slate-700 leading-relaxed">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/landing/Pain.tsx
git commit -m "feat(landing): Pain section con mockup Excel feo + bullets"
```

---

## Task 14: `Solution` section

**Files:**
- Create: `src/components/landing/Solution.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
// src/components/landing/Solution.tsx
import { Check } from 'lucide-react';
import { SectionHeading } from './ui/SectionHeading';
import { copy } from '@/lib/landing/copy';

const SOL_GRID: Array<'day' | 'night' | 'rest'> = [
  'day','day','rest','night','day','day','rest',
  'night','rest','day','day','night','rest','day',
  'day','day','night','rest','day','day','rest',
  'rest','day','day','night','rest','day','day',
];

export function Solution() {
  const styles = {
    day: 'bg-blue-100 text-blue-800 border-blue-200',
    night: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    rest: 'bg-amber-50 text-amber-700 border-amber-200',
  } as const;
  const labels = { day: '6-2', night: '2-10', rest: '—' } as const;

  return (
    <section id="solucion" className="bg-slate-50 py-20 md:py-28">
      <div className="max-w-6xl mx-auto px-6">
        <SectionHeading eyebrow={copy.solution.eyebrow} title={copy.solution.title} sub={copy.solution.body} />

        <div className="mt-12 grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-4">
            {copy.solution.bullets.map((b, i) => (
              <div key={i} className="flex gap-3 items-start">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mt-0.5">
                  <Check className="w-4 h-4" />
                </div>
                <p className="text-base text-slate-700 leading-relaxed">{b}</p>
              </div>
            ))}
          </div>

          {/* Schedule grid limpio (after) */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-md">
            <div className="text-xs text-slate-500 font-semibold mb-3 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-600" />
              <span className="ml-1">Cuadro Octubre · Tus Horarios</span>
              <span className="ml-auto text-emerald-600 font-semibold">Equidad ±0.5</span>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1.5 text-[10px] font-semibold text-slate-500 uppercase">
              {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
                <div key={i} className="text-center">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {SOL_GRID.map((t, i) => (
                <div key={i} className={`aspect-[1.5/1] rounded border ${styles[t]} flex items-center justify-center text-[10px] font-medium`}>
                  {labels[t]}
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span>Generado en 1.8 segundos</span>
              <span className="text-emerald-600 font-semibold">100% CST</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/landing/Solution.tsx
git commit -m "feat(landing): Solution section con grid limpio + bullets"
```

---

## Task 15: `SectorCards`

**Files:**
- Create: `src/components/landing/SectorCards.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
// src/components/landing/SectorCards.tsx
import { Stethoscope, ShoppingCart, UtensilsCrossed, Shield } from 'lucide-react';
import { SectionHeading } from './ui/SectionHeading';
import { copy } from '@/lib/landing/copy';

const icons = {
  salud: Stethoscope,
  retail: ShoppingCart,
  hoteleria: UtensilsCrossed,
  vigilancia: Shield,
} as const;

export function SectorCards() {
  return (
    <section id="sectores" className="bg-white py-20 md:py-28">
      <div className="max-w-6xl mx-auto px-6">
        <SectionHeading eyebrow={copy.sectors.eyebrow} title={copy.sectors.title} />

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {copy.sectors.items.map((s) => {
            const Icon = icons[s.key as keyof typeof icons];
            return (
              <div key={s.key} className="group rounded-xl border border-slate-200 bg-white p-6 hover:shadow-lg hover:border-blue-300 hover:-translate-y-0.5 transition-all">
                <div className="w-11 h-11 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-lg text-slate-950 mb-1">{s.title}</h3>
                <p className="text-xs text-slate-500 mb-3">{s.examples}</p>
                <p className="text-sm text-slate-600 leading-relaxed">{s.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/landing/SectorCards.tsx
git commit -m "feat(landing): SectorCards (4 sectores)"
```

---

## Task 16: `Features`

**Files:**
- Create: `src/components/landing/Features.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
// src/components/landing/Features.tsx
import { Scale, Users2, Moon, Wallet, CalendarDays, Clock4 } from 'lucide-react';
import { SectionHeading } from './ui/SectionHeading';
import { copy } from '@/lib/landing/copy';

const icons = [Scale, Users2, Moon, Wallet, CalendarDays, Clock4];

export function Features() {
  return (
    <section id="funciones" className="bg-slate-50 py-20 md:py-28">
      <div className="max-w-6xl mx-auto px-6">
        <SectionHeading eyebrow={copy.features.eyebrow} title={copy.features.title} />

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {copy.features.items.map((f, i) => {
            const Icon = icons[i] ?? Scale;
            return (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-6 hover:shadow-md transition-shadow">
                <div className="w-11 h-11 rounded-lg bg-blue-600/10 text-blue-600 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-lg text-slate-950 mb-2">{f.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{f.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/landing/Features.tsx
git commit -m "feat(landing): Features grid (6 cards)"
```

---

## Task 17: `HowItWorks`

**Files:**
- Create: `src/components/landing/HowItWorks.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
// src/components/landing/HowItWorks.tsx
import { SectionHeading } from './ui/SectionHeading';
import { copy } from '@/lib/landing/copy';

export function HowItWorks() {
  return (
    <section id="como-funciona" className="bg-white py-20 md:py-28">
      <div className="max-w-6xl mx-auto px-6">
        <SectionHeading eyebrow={copy.howItWorks.eyebrow} title={copy.howItWorks.title} />

        <div className="grid md:grid-cols-3 gap-8 md:gap-12 relative">
          <div className="hidden md:block absolute top-8 left-[16.67%] right-[16.67%] h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />

          {copy.howItWorks.steps.map((s) => (
            <div key={s.n} className="relative bg-white">
              <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold text-xl mb-5 shadow-lg shadow-blue-600/20">
                {s.n}
              </div>
              <h3 className="font-bold text-xl text-slate-950 mb-2">{s.title}</h3>
              <p className="text-base text-slate-600 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/landing/HowItWorks.tsx
git commit -m "feat(landing): HowItWorks (3 pasos)"
```

---

## Task 18: `Faq` con accordion

**Files:**
- Create: `src/components/landing/Faq.tsx`

- [ ] **Step 1: Verificar que `tailwind.config.ts` tiene animaciones accordion**

```bash
grep -E "accordion-(up|down)" tailwind.config.ts
```

Expected: aparece en `keyframes` y `animation`. Si no, agregar:

```typescript
// dentro de theme.extend.keyframes:
'accordion-down': {
  from: { height: '0' },
  to: { height: 'var(--radix-accordion-content-height)' },
},
'accordion-up': {
  from: { height: 'var(--radix-accordion-content-height)' },
  to: { height: '0' },
},

// dentro de theme.extend.animation:
'accordion-down': 'accordion-down 0.2s ease-out',
'accordion-up': 'accordion-up 0.2s ease-out',
```

- [ ] **Step 2: Crear el componente**

```tsx
'use client';
// src/components/landing/Faq.tsx
import * as Accordion from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';
import { SectionHeading } from './ui/SectionHeading';
import { copy } from '@/lib/landing/copy';

export function Faq() {
  return (
    <section id="faq" className="bg-slate-50 py-20 md:py-28">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeading eyebrow={copy.faq.eyebrow} title={copy.faq.title} />

        <Accordion.Root type="single" collapsible className="space-y-3">
          {copy.faq.items.map((item, i) => (
            <Accordion.Item key={i} value={`item-${i}`} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <Accordion.Header>
                <Accordion.Trigger className="w-full px-6 py-5 flex items-center justify-between gap-4 text-left hover:bg-slate-50 transition-colors group">
                  <span className="font-semibold text-base text-slate-950">{item.q}</span>
                  <ChevronDown className="w-5 h-5 text-slate-400 shrink-0 group-data-[state=open]:rotate-180 transition-transform" />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                <div className="px-6 pb-5 pt-1 text-slate-600 leading-relaxed">{item.a}</div>
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/Faq.tsx tailwind.config.ts
git commit -m "feat(landing): Faq con Radix Accordion (6 preguntas)"
```

---

## Task 19: `DemoForm` con react-hook-form + Zod

**Files:**
- Create: `src/components/landing/DemoForm.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
'use client';
// src/components/landing/DemoForm.tsx
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { ArrowRight, AlertCircle } from 'lucide-react';
import { SectionHeading } from './ui/SectionHeading';
import { copy } from '@/lib/landing/copy';
import { demoRequestSchema, type DemoRequestInput } from '@/lib/landing/schema';

type Status = 'idle' | 'submitting' | 'error';

const input = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700 mb-1.5 block">{label}</span>
      {children}
      {error ? <p className="mt-1.5 text-xs text-red-600">{error}</p> : null}
    </label>
  );
}

export function DemoForm() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<DemoRequestInput>({
    resolver: zodResolver(demoRequestSchema),
    defaultValues: { sector: undefined, website: '' },
  });

  async function onSubmit(data: DemoRequestInput) {
    setStatus('submitting');
    setErrorMsg(null);
    try {
      const res = await fetch('/api/demo-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) throw new Error(payload.error || 'unknown');
      router.push('/gracias');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : copy.form.errorBody);
    }
  }

  return (
    <section id="solicitar-demo" className="bg-white py-20 md:py-28">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeading eyebrow={copy.ctaFinal.eyebrow} title={copy.ctaFinal.title} sub={copy.ctaFinal.body} />

        <form onSubmit={handleSubmit(onSubmit)} className="bg-slate-50 rounded-2xl border border-slate-200 p-6 md:p-8 shadow-sm">
          {/* Honeypot — invisible para humanos */}
          <input type="text" tabIndex={-1} autoComplete="off" className="absolute left-[-9999px]" aria-hidden {...register('website')} />

          <div className="grid sm:grid-cols-2 gap-5">
            <Field label={copy.form.nombreLabel} error={errors.nombre?.message}>
              <input type="text" placeholder={copy.form.nombrePlaceholder} className={input} {...register('nombre')} />
            </Field>
            <Field label={copy.form.emailLabel} error={errors.email?.message}>
              <input type="email" placeholder={copy.form.emailPlaceholder} className={input} autoComplete="email" {...register('email')} />
            </Field>
            <Field label={copy.form.empresaLabel} error={errors.empresa?.message}>
              <input type="text" placeholder={copy.form.empresaPlaceholder} className={input} autoComplete="organization" {...register('empresa')} />
            </Field>
            <Field label={copy.form.telefonoLabel} error={errors.telefono?.message}>
              <input type="tel" placeholder={copy.form.telefonoPlaceholder} className={input} autoComplete="tel" {...register('telefono')} />
            </Field>
          </div>

          <div className="mt-5">
            <Field label={copy.form.sectorLabel} error={errors.sector?.message}>
              <select className={input} {...register('sector')}>
                <option value="">Selecciona…</option>
                {copy.form.sectorOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-5">
            <Field label={copy.form.mensajeLabel} error={errors.mensaje?.message}>
              <textarea rows={3} placeholder={copy.form.mensajePlaceholder} className={input} {...register('mensaje')} />
            </Field>
          </div>

          {status === 'error' && errorMsg ? (
            <div className="mt-5 flex items-start gap-3 p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{copy.form.errorTitle}</p>
                <p>{errorMsg}</p>
              </div>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={status === 'submitting'}
            className="mt-6 w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold px-6 py-3.5 rounded-lg transition-colors"
          >
            {status === 'submitting' ? copy.form.submitting : copy.form.submitLabel}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/landing/DemoForm.tsx
git commit -m "feat(landing): DemoForm con react-hook-form + Zod + honeypot"
```

---

## Task 20: `Footer`

**Files:**
- Create: `src/components/landing/Footer.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
// src/components/landing/Footer.tsx
import Link from 'next/link';
import Image from 'next/image';
import { copy } from '@/lib/landing/copy';

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-slate-950 text-slate-400 py-12 border-t border-white/5">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col md:flex-row gap-8 md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <Image src="/icono-transparente.png" alt={copy.brand.name} width={32} height={32} />
            <div>
              <p className="font-bold text-white text-lg">{copy.brand.name}</p>
              <p className="text-sm">{copy.footer.tagline}</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-6 text-sm">
            <div>
              <p className="font-semibold text-white mb-2">{copy.footer.contactLabel}</p>
              <a href={`mailto:${copy.footer.contactEmail}`} className="hover:text-white transition-colors">
                {copy.footer.contactEmail}
              </a>
            </div>
            <div>
              <p className="font-semibold text-white mb-2">Legal</p>
              <div className="flex flex-col gap-1">
                <Link href="/privacidad" className="hover:text-white transition-colors">{copy.footer.privacyLabel}</Link>
                <Link href="/terminos" className="hover:text-white transition-colors">{copy.footer.termsLabel}</Link>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/5 text-xs text-slate-500">
          {copy.footer.rights.replace('{year}', String(year))}
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/landing/Footer.tsx
git commit -m "feat(landing): Footer (logo + contacto + legal + año)"
```

---

## Task 21: Layout marketing + `page.tsx` orquestador

**Files:**
- Create: `src/app/(marketing)/layout.tsx`
- Create: `src/app/(marketing)/page.tsx`

- [ ] **Step 1: Crear el layout con metadata + Inter font**

```tsx
// src/app/(marketing)/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { copy } from '@/lib/landing/copy';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const metadata: Metadata = {
  title: `${copy.brand.name} — Programación de turnos para empresas en Colombia`,
  description: copy.hero.sub,
  openGraph: {
    title: `${copy.brand.name} — Turnos en 2 minutos`,
    description: copy.hero.sub,
    url: 'https://tushorarios.com',
    siteName: copy.brand.name,
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: copy.brand.name }],
    locale: 'es_CO',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${copy.brand.name} — Turnos en 2 minutos`,
    description: copy.hero.sub,
    images: ['/og-image.png'],
  },
  alternates: { canonical: 'https://tushorarios.com' },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${inter.variable} font-sans antialiased`}>{children}</div>;
}
```

(Nota: JSON-LD structured data se difiere — se puede agregar en una pasada de polish SEO posterior si se necesita. OpenGraph + canonical + Twitter cubren la mayoría de necesidades.)

- [ ] **Step 2: Crear `page.tsx`**

```tsx
// src/app/(marketing)/page.tsx
import { NavBar } from '@/components/landing/NavBar';
import { Hero } from '@/components/landing/Hero';
import { Pain } from '@/components/landing/Pain';
import { Solution } from '@/components/landing/Solution';
import { SectorCards } from '@/components/landing/SectorCards';
import { Features } from '@/components/landing/Features';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { Faq } from '@/components/landing/Faq';
import { DemoForm } from '@/components/landing/DemoForm';
import { Footer } from '@/components/landing/Footer';

export default function LandingPage() {
  return (
    <main className="bg-white">
      <NavBar />
      <Hero />
      <Pain />
      <Solution />
      <SectorCards />
      <Features />
      <HowItWorks />
      <Faq />
      <DemoForm />
      <Footer />
    </main>
  );
}
```

- [ ] **Step 3: Verificar build**

```bash
npm run build 2>&1 | tail -15
```

Expected: `/` aparece en el listado de rutas, build limpio.

- [ ] **Step 4: Commit**

```bash
git add 'src/app/(marketing)/'
git commit -m "feat(landing): layout marketing + page.tsx orquestador"
```

---

## Task 22: `/gracias` page

**Files:**
- Create: `src/app/(marketing)/gracias/page.tsx`

- [ ] **Step 1: Crear la página**

```tsx
// src/app/(marketing)/gracias/page.tsx
import Link from 'next/link';
import Image from 'next/image';
import { Check, ArrowLeft } from 'lucide-react';
import { copy } from '@/lib/landing/copy';

export const metadata = {
  title: `${copy.brand.name} — ${copy.gracias.h1}`,
  robots: { index: false, follow: false },
};

export default function GraciasPage() {
  return (
    <main className="min-h-screen bg-white flex flex-col">
      <header className="border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5 text-slate-950">
            <Image src="/icono-transparente.png" alt={copy.brand.name} width={28} height={28} />
            <span className="font-bold tracking-tight">{copy.brand.name}</span>
          </Link>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-xl text-center">
          <div className="w-20 h-20 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-6">
            <Check className="w-10 h-10" strokeWidth={3} />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-950 mb-4">{copy.gracias.h1}</h1>
          <p className="text-lg text-slate-600 leading-relaxed mb-8">{copy.gracias.body}</p>
          <Link href="/" className="inline-flex items-center gap-2 text-slate-700 hover:text-slate-950 font-semibold">
            <ArrowLeft className="w-4 h-4" />
            {copy.gracias.cta}
          </Link>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add 'src/app/(marketing)/gracias/page.tsx'
git commit -m "feat(landing): /gracias page (post-submit confirmation)"
```

---

## Task 23: `sitemap.ts` + `robots.ts`

**Files:**
- Create: `src/app/sitemap.ts`
- Create: `src/app/robots.ts`

- [ ] **Step 1: Crear sitemap**

```typescript
// src/app/sitemap.ts
import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://tushorarios.com';
  return [
    { url: `${base}/`,      lastModified: new Date(), priority: 1.0, changeFrequency: 'weekly' },
    { url: `${base}/login`, lastModified: new Date(), priority: 0.5, changeFrequency: 'yearly' },
  ];
}
```

- [ ] **Step 2: Crear robots**

```typescript
// src/app/robots.ts
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/dashboard/'] },
    sitemap: 'https://tushorarios.com/sitemap.xml',
    host: 'https://tushorarios.com',
  };
}
```

- [ ] **Step 3: Verificar build**

```bash
npm run build 2>&1 | grep -E "(sitemap|robots)"
```

Expected: ambos aparecen.

- [ ] **Step 4: Commit**

```bash
git add src/app/sitemap.ts src/app/robots.ts
git commit -m "feat(landing): sitemap.xml + robots.txt"
```

---

## Task 24: OG image

**Files:**
- Create: `public/og-image.png` (1200×630)

- [ ] **Step 1: Generar OG image con Python+PIL**

```bash
cd "/Users/usuario/App Horarios"
python3 -c "
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
img = Image.new('RGB', (W, H), '#020617')
draw = ImageDraw.Draw(img)

# Mesh background con dos círculos blurred
for cx, cy, r, color in [(900, 150, 280, (37, 99, 235, 90)), (200, 500, 240, (99, 102, 241, 60))]:
    overlay = Image.new('RGBA', (W, H), (0,0,0,0))
    od = ImageDraw.Draw(overlay)
    od.ellipse([cx-r,cy-r,cx+r,cy+r], fill=color)
    # blur cheap: superponer múltiples
    for _ in range(8):
        img.paste(overlay, mask=overlay.split()[3])

try:
    font_big = ImageFont.truetype('/System/Library/Fonts/SFNS.ttf', 76)
    font_accent = ImageFont.truetype('/System/Library/Fonts/SFNS.ttf', 76)
    font_sub = ImageFont.truetype('/System/Library/Fonts/SFNS.ttf', 28)
    font_brand = ImageFont.truetype('/System/Library/Fonts/SFNS.ttf', 32)
except:
    font_big = font_accent = font_sub = font_brand = ImageFont.load_default()

draw.text((80, 130), 'Tus Horarios', fill='#94A3B8', font=font_brand)
draw.text((80, 220), 'Olvida el Excel.', fill='white', font=font_big)
draw.text((80, 320), 'Programa el mes en', fill='white', font=font_big)
draw.text((80, 420), '2 minutos.', fill='#60A5FA', font=font_accent)
draw.text((80, 540), 'tushorarios.com  |  Para empresas en Colombia', fill='#64748B', font=font_sub)

img.save('public/og-image.png', 'PNG', optimize=True)
print('OG image generated:', img.size)
"
```

Si PIL no está instalado: `pip3 install Pillow`. Si las fuentes del sistema fallan, usa la default (queda menos bonita pero funciona).

- [ ] **Step 2: Verificar**

```bash
ls -la public/og-image.png && file public/og-image.png
```

Expected: archivo <500KB, PNG 1200×630.

- [ ] **Step 3: Commit**

```bash
git add public/og-image.png
git commit -m "feat(landing): OG image (1200×630)"
```

---

## Task 25: Push + configurar DNS apex + www

**No code changes** salvo el push. External panel work.

- [ ] **Step 1: Push de todos los commits**

```bash
cd "/Users/usuario/App Horarios"
git push origin main
```

Expected: todos los commits del sub-proyecto 2 en main, Vercel inicia un deploy automático.

- [ ] **Step 2: Esperar el deploy de Vercel**

```bash
until [ "$(vercel ls 2>&1 | grep -m1 'app-horarios.*Ready' | wc -l)" -gt 0 ]; do sleep 10; done && echo "Deploy ready"
```

O verificar en https://vercel.com/simons-projects-8b4b1e1c/app-horarios/deployments — el latest debe estar "Ready".

- [ ] **Step 3: Agregar dominios en Vercel**

Ir a https://vercel.com/simons-projects-8b4b1e1c/app-horarios/settings/domains.

Click "Add" y agregar:
1. `tushorarios.com`
2. `www.tushorarios.com`

Vercel mostrará los DNS records a publicar.

- [ ] **Step 4: Publicar records en Hostinger DNS**

Ir a `https://hpanel.hostinger.com/domain/tushorarios.com/dns`. Agregar:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `@` | `76.76.21.21` | 3600 |
| CNAME | `www` | `cname.vercel-dns.com` | 3600 |

⚠️ **NO tocar** los records de email del sub-proyecto 1 (TXT SPF/DKIM/DMARC, MX).

- [ ] **Step 5: Esperar propagación + verificar**

```bash
until [ "$(dig tushorarios.com +short 2>/dev/null)" = "76.76.21.21" ]; do sleep 10; done && echo "DNS propagated" && dig www.tushorarios.com +short
```

Expected después de 5-30 min:
- `tushorarios.com` → `76.76.21.21`
- `www.tushorarios.com` → `cname.vercel-dns.com.`

En Vercel los dominios deben aparecer "Valid Configuration" en verde.

- [ ] **Step 6: Configurar redirect www → apex (canonical)**

En Vercel → Settings → Domains → click el menú de `www.tushorarios.com` → "Redirect to" → seleccionar `tushorarios.com` con "Permanent (308)".

Esto evita contenido duplicado SEO.

- [ ] **Step 7: Verificar SSL**

```bash
curl -sI https://tushorarios.com | head -3
curl -sI https://www.tushorarios.com | head -3
```

Expected: `https://tushorarios.com` retorna 200, `https://www.tushorarios.com` retorna 308 redirect a apex.

---

## Task 26: Smoke test end-to-end

**No code changes. Validation only.**

- [ ] **Step 1: Visit `https://tushorarios.com` en Chrome**

Recorrer scroll completo:
- Hero (dark con glow, headline visible, CTA "Solicitar demo gratis")
- Pain (Excel mock + 4 bullets)
- Solution (grid limpio + 4 bullets)
- Sectores (4 cards: Salud / Retail / Hotelería / Vigilancia)
- Features (6 cards)
- Cómo funciona (3 pasos con línea)
- FAQ (expandir al menos 2)
- Form

Console debe estar limpia, sin layout shift visible.

- [ ] **Step 2: Submit form con datos test**

Llenar:
- Nombre: `Test E2E`
- Email: `suv411+landingtest@hotmail.com`
- Empresa: `Test E2E S.A.S.`
- Teléfono: `+57 300 1234567`
- Sector: Salud
- Mensaje: `Test desde smoke E2E`

Click "Solicitar demo gratis". Expected:
- Botón pasa a "Enviando…"
- Redirect a `/gracias` (verde, mensaje "¡Gracias!")
- En Hotmail llega email "Recibimos tu solicitud de demo de Tus Horarios" (revisar Junk)
- En Hotmail también llega "Nueva solicitud de demo — Test E2E S.A.S." con la tabla
- Verificar row nuevo en `demo_requests` en Supabase via MCP query

- [ ] **Step 3: Probar rate limit**

Volver a `/` y enviar el form 6 veces seguidas. Las primeras 5 deben pasar, la 6ta debe retornar 429.

- [ ] **Step 4: Lighthouse audit**

Chrome DevTools → Lighthouse → Mobile + Desktop. Targets:
- Performance ≥ 90
- Accessibility ≥ 95
- Best Practices ≥ 95
- SEO ≥ 95

Si Performance < 90, abrir ticket de optimización para sub-proyecto siguiente (no bloquea).

- [ ] **Step 5: Verificar OG image al compartir**

Pegar `https://tushorarios.com` en WhatsApp Web o https://www.opengraph.xyz. La preview debe mostrar la OG image con headline en azul/blanco.

- [ ] **Step 6: Cleanup test rows**

Via `mcp__plugin_supabase_supabase__execute_sql`:

```sql
DELETE FROM demo_requests WHERE empresa LIKE 'Test E2E%';
```

Expected: 1+ row deleted.

---

## Sub-proyecto 2 completado cuando:

- ✅ `https://tushorarios.com` y `https://www.tushorarios.com` sirven la landing
- ✅ El form persiste en `demo_requests` con todos los campos correctos
- ✅ Los 2 emails (lead + dev) llegan vía Resend
- ✅ Lighthouse ≥ 90 (performance), ≥ 95 (a11y/BP/SEO)
- ✅ RLS verificado (anon insert, admin select, employee no select)
- ✅ Rate limit funciona (6ta request → 429)
- ✅ Sitemap.xml + robots.txt accesibles
- ✅ OG image renderiza al compartir
- ✅ App actual sigue funcionando intacta en `app-horarios-mauve.vercel.app/login`
- ✅ Redirect www → apex (308) configurado en Vercel

**Siguiente sub-proyecto:** Multi-tenant data model (sub-proyecto 3). Cuando llegues a 10-20 demos via la landing y tengas claridad de los primeros clientes, arranca el refactor mayor del schema agregando `organization_id` a las 27 tablas + RLS rewrite.
