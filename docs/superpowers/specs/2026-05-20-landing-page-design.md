# Landing Page B2B para tushorarios.com

**Fecha:** 2026-05-20
**Sub-proyecto:** 2 de N (transformación a SaaS multi-tenant)
**Dependencias:** sub-proyecto 1 (Email Infrastructure — Resend + DNS) ✅ completado
**Bloquea:** sub-proyecto 3 (Multi-tenant data model) — la landing recoge interés mientras se ejecuta el refactor mayor

## Contexto y objetivo

La landing es la primera cara pública de Tus Horarios. Vive en `tushorarios.com` (apex) y `www.tushorarios.com`. Captura leads cualificados vía un form "Solicitar demo" que el dev (Simón) atenderá manualmente durante el período de waitlist (sub-proyecto 1 MVP scope).

**No es self-serve signup.** Es waitlist con onboarding manual. Cuando llegue suficiente tracción se construirá el signup público en un sub-proyecto futuro.

### Decisiones de diseño tomadas (brainstorming 2026-05-20)

| Decisión | Elección | Razón |
|---|---|---|
| Positioning | Mix de 3 ángulos: dolor Excel + 2 min vs 6h + cumplimiento Ley CST | Cubre los 3 motivadores principales del comprador B2B PYME Colombia |
| Target / ICP | Horizontal: Salud, Retail, Hotelería, Vigilancia | App soporta los 4 (asistencial y no asistencial). Maximiza pipeline inicial |
| Tono | Moderno y técnico (estilo Linear/Stripe Colombia) | Distintivo, profesional, evita aesthetic genérica AI |
| Hero visual | Dark hero con glow + schedule grid mock | Bold y memorable; destaca del default light de competidores colombianos |
| Estructura | Story-driven: Hero → Dolor → Solución → Sectores → Features → Cómo funciona → FAQ → CTA + form → Footer | Narrativa persuasiva (identifica dolor → muestra solución → invita a probar) |
| Hosting | Mismo Next.js project, route groups | 1 repo, 1 deploy, componentes compartidos, setup rápido |
| Form fields | 5 required (nombre, email, empresa, teléfono, sector) + mensaje opcional | Balance entre conversion (~4-6%) y cualificación útil para triagear |

## Arquitectura

```
DNS (Hostinger):
  tushorarios.com (apex) ─────┐
  www.tushorarios.com ────────┼──→ Vercel project: app-horarios
  app.tushorarios.com ────────┘     (mismo project — no se separa)

Vercel project: app-horarios (existente)
  ├─ Routes:
  │   /                       → src/app/(marketing)/page.tsx           [público]
  │   /gracias                → src/app/(marketing)/gracias/page.tsx   [público]
  │   /login                  → existente                                [público]
  │   /dashboard, etc.        → src/app/(authenticated)/...            [auth req]
  │   /api/demo-requests      → POST handler                            [público]
  │
  ├─ Middleware (src/middleware.ts + src/lib/supabase/middleware.ts):
  │   Rutas públicas: /, /gracias, /login, /auth, archivos imagen, /api/demo-requests
  │   Resto: redirect a /login si no hay sesión
  │
  └─ Env vars (ya configurados en sub-proyecto 1):
      RESEND_API_KEY (sensitive)
      RESEND_FROM_NOREPLY, RESEND_FROM_HOLA, RESEND_FROM_NOTIF
      NEXT_PUBLIC_SUPABASE_*
      SUPABASE_SERVICE_ROLE_KEY

Supabase (project ugkvuinkynvtuiutwlkd):
  Nueva tabla demo_requests (migración 038)
```

El dominio `tushorarios.com` apex y `www` se publican como records A/CNAME en Hostinger apuntando al proyecto `app-horarios` de Vercel. Esto se hace como parte del rollout de este sub-proyecto.

## Base de datos — migración 038

```sql
-- supabase/migrations/038_demo_requests.sql
BEGIN;

CREATE TABLE IF NOT EXISTS demo_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  nombre TEXT NOT NULL CHECK (length(nombre) BETWEEN 2 AND 120),
  email TEXT NOT NULL CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  empresa TEXT NOT NULL CHECK (length(empresa) BETWEEN 2 AND 120),
  telefono TEXT NOT NULL CHECK (length(telefono) BETWEEN 7 AND 30),
  sector TEXT NOT NULL CHECK (sector IN ('salud','retail','hoteleria','vigilancia','otro')),
  mensaje TEXT CHECK (length(mensaje) <= 2000),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','contacted','converted','rejected')),
  ip_address INET,
  user_agent TEXT,
  contacted_at TIMESTAMPTZ,
  notes TEXT
);

CREATE INDEX idx_demo_requests_created_at ON demo_requests (created_at DESC);
CREATE INDEX idx_demo_requests_status ON demo_requests (status);
CREATE INDEX idx_demo_requests_email ON demo_requests (email);

-- RLS
ALTER TABLE demo_requests ENABLE ROW LEVEL SECURITY;

-- INSERT permitido a anon (form público) y authenticated
CREATE POLICY demo_requests_insert_public ON demo_requests
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- SELECT/UPDATE/DELETE solo admin/manager
CREATE POLICY demo_requests_select_admin ON demo_requests
  FOR SELECT TO authenticated
  USING (get_user_role() IN ('admin','manager'));

CREATE POLICY demo_requests_update_admin ON demo_requests
  FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin','manager'));

COMMIT;
```

**RLS rationale:** el form es público (anon), pero los datos solo los ve el admin que va a contactar. El `anon` role solo puede insertar nuevos rows, no leer otros existentes (previene scraping).

## API — POST /api/demo-requests

**Endpoint:** `src/app/api/demo-requests/route.ts`

**Request body** (validado con Zod):
```typescript
{
  nombre: string (2-120 chars)
  email: string (email format)
  empresa: string (2-120 chars)
  telefono: string (7-30 chars)
  sector: 'salud' | 'retail' | 'hoteleria' | 'vigilancia' | 'otro'
  mensaje?: string (max 2000 chars)
}
```

**Server flow:**
1. Validar body con Zod. Si falla → 400 con error.
2. Rate limit: 5 requests/hora por IP (in-memory Map; suficiente para MVP).
3. Insert row en `demo_requests` vía service role (bypassa RLS para capturar ip_address + user_agent).
4. Disparar 2 emails vía Resend (paralelo con `Promise.all`):
   - **Email 1 → al lead** (`{email}`): subject "Recibimos tu solicitud", template `src/emails/demo-request-confirmation.tsx`
   - **Email 2 → al dev** (`suv411@hotmail.com` + `hola@tushorarios.com` en CC): subject "Nueva solicitud de demo — {empresa}", template `src/emails/demo-request-notification.tsx` con todos los datos + link al Supabase row
5. Return `{ ok: true, id }` o `{ error: string }`.

**Errores no críticos:** si los emails fallan pero el insert funcionó, retorna ok=true (el dato no se pierde; el dev puede ver el row directo en Supabase). Loguea el error a console.

**Rate limit lógica:**
```typescript
const RATE_LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000; // 1 hora
const requests = new Map<string, number[]>(); // IP → timestamps

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const arr = (requests.get(ip) ?? []).filter(ts => now - ts < WINDOW_MS);
  if (arr.length >= RATE_LIMIT) return false;
  arr.push(now);
  requests.set(ip, arr);
  return true;
}
```

## Templates de email (Resend + react-email)

Carpeta `src/emails/` ya tiene `.gitkeep` (creado en sub-proyecto 1). Agregar:

**`src/emails/demo-request-confirmation.tsx`** — al lead:
- Subject: `Recibimos tu solicitud de demo de Tus Horarios`
- Body: agradecimiento + qué esperar ("te contactamos en 24h hábiles") + link al landing por si quiere ver de nuevo
- Sigue la misma identidad visual de los templates Supabase Auth (logo + brand + footer)
- Usa `@react-email/components` (`<Html>`, `<Body>`, `<Section>`, `<Button>`, etc.)

**`src/emails/demo-request-notification.tsx`** — al dev:
- Subject: `Nueva solicitud de demo — {empresa}`
- Body: tabla con todos los campos del lead, sector destacado, link al row en Supabase para editarlo y marcar `status='contacted'`
- Diseño funcional, no marketing (es para el dev)

## Componentes UI

Estructura nueva en `src/components/landing/`:

| Archivo | Responsabilidad |
|---|---|
| `NavBar.tsx` | Logo + tagline corto + "Iniciar sesión" link a `/login` |
| `Hero.tsx` | Dark con glow gradient, headline H1, sub, CTA primary, schedule grid mock (CSS puro) |
| `Pain.tsx` | "El Excel de turnos te robó las mañanas del lunes" + mockup Excel feo (CSS) |
| `Solution.tsx` | Demo visual del motor distribuyendo turnos + 3-4 bullets |
| `SectorCards.tsx` | Grid 4 cards: Salud (asistencial 12h), Retail, Hotelería, Vigilancia |
| `Features.tsx` | Grid 6 cards: Equidad Ley CST, Supernumerarios, Reglas descanso, Nómina Colombia, Festivos, Horas extra |
| `HowItWorks.tsx` | 3 pasos numerados: 1) Carga tu equipo, 2) Define necesidades, 3) Genera con un click |
| `Faq.tsx` | Accordion con 5-7 preguntas (Radix Accordion ya está) |
| `DemoForm.tsx` | Form controlado: 5 required + mensaje optional. React Hook Form + Zod resolver. Submit hace POST a `/api/demo-requests`. Loading state, success state inline (redirect a `/gracias`) |
| `Footer.tsx` | Logo + tagline + año + email contacto + links sociales (placeholder) |
| `ui/GlowBg.tsx` | Background reusable: mesh radial gradient con blur. Usado solo en hero |

Página `src/app/(marketing)/page.tsx` compone todo en orden. Server component por defecto, `DemoForm` y `Faq` son client components (interactividad).

Página `src/app/(marketing)/gracias/page.tsx` — pantalla post-submit con mensaje "Gracias, te contactamos en 24h" + link de vuelta a `/`.

### Copy del hero (foundational)

- **Eyebrow (badge):** `PARA EMPRESAS EN COLOMBIA`
- **H1:** "Olvida el Excel. **Programa el mes en 2 minutos**." (el "Programa el mes en 2 minutos" en color accent)
- **Subtitulo:** "Equidad real para sábados, domingos, noches y festivos. Cumple Ley 2101 y Art. 161 CST sin pensarlo."
- **CTA primary:** `Solicitar demo gratis →`
- **CTA secondary (text-only):** `Ver cómo funciona ↓` (anchor a sección Solution)

### Identidad visual

| Token | Valor |
|---|---|
| Primary | `#2563EB` (blue-600) — match con app |
| Primary hover | `#1D4ED8` (blue-700) |
| Accent en dark hero | `#60A5FA` (blue-400) — para destacar texto sobre fondo oscuro |
| Foreground light | `#020817` |
| Background light | `#FFFFFF` |
| Background muted | `#F8FAFC` |
| Border | `#E2E8F0` |
| Dark hero base | `#020617` con `radial-gradient` de `#1E3A8A` y glow `#3B82F6` |
| Font | Inter (self-hosted vía `next/font/google`) |

### Animaciones

- **Hero:** entrance fade-up de 0.6s en headline + sub + CTA, escalonado 100ms.
- **Schedule grid mock:** celdas que aparecen secuencialmente (stagger 30ms) on first viewport.
- **Sector cards:** hover scale 1.02 + shadow.
- **No** páginas con muchas animaciones agresivas — el objetivo es "modern + técnico", no "playful".
- Librería: Framer Motion (a instalar) o solo CSS keyframes si Framer agrega bulk significativo.

## SEO + Meta

### Meta tags (en `src/app/(marketing)/layout.tsx`)

```typescript
export const metadata: Metadata = {
  title: 'Tus Horarios — Programación de turnos para empresas en Colombia',
  description: 'Olvida el Excel. Programa los turnos de tu empresa en 2 minutos, con equidad real y cumplimiento de Ley CST. Para salud, retail, hotelería y vigilancia.',
  openGraph: {
    title: 'Tus Horarios — Turnos de empresa en 2 minutos',
    description: '...',
    images: ['/og-image.png'], // a generar
    locale: 'es_CO',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '...',
    description: '...',
    images: ['/og-image.png'],
  },
};
```

### Structured data (JSON-LD)

Schema.org `Organization` + `Product` + `SoftwareApplication` en el `<head>` de la landing.

### sitemap.xml + robots.txt

- `src/app/sitemap.ts` — listar `/`, `/gracias`, `/login`
- `src/app/robots.ts` — allow all, sitemap URL

## Performance

- **LCP target:** < 2.5s — hero debe ser server-rendered, no esperar JS
- **Inter font** vía `next/font/google` con `display: 'swap'` (no CLS)
- **Schedule grid mock** en CSS puro (no SVG complejo, no imagen)
- **No imágenes grandes** — todo iconografía CSS o Lucide React
- **og-image.png** debe pesar <100KB
- **Lighthouse target:** Performance >90, Accessibility >95, Best Practices >95, SEO >95
- **Bundle del marketing route:** target <100KB JS (mucho server-side)

## Testing

- **SQL test** en `supabase/tests/demo_requests_rls_test.sql`:
  - Anon puede INSERT
  - Anon NO puede SELECT
  - Authenticated con role admin SÍ puede SELECT
  - Authenticated con role employee NO puede SELECT
  - Pattern BEGIN/ROLLBACK (safe contra prod)

- **No Vitest** — la landing es UI, no lógica pura (sigue convención del proyecto).

- **Smoke test manual** (post-deploy):
  1. Visit `https://tushorarios.com` → ve landing
  2. Visit `https://www.tushorarios.com` → ve landing (idem)
  3. Scroll completo, verificar todas las secciones se ven bien
  4. Submit form con datos test → ver pantalla `/gracias`
  5. Verificar email 1 llega a la dirección del test
  6. Verificar email 2 llega a `suv411@hotmail.com`
  7. Verificar row en `demo_requests` en Supabase
  8. Lighthouse mobile + desktop, capturar scores
  9. Borrar row test (`status='rejected'` o DELETE manual)

## DNS — configurar en Hostinger

Records a publicar en el panel DNS de Hostinger (los TXT/MX de email del sub-proyecto 1 quedan intactos):

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `@` | `76.76.21.21` | 3600 |
| CNAME | `www` | `cname.vercel-dns.com` | 3600 |

**Wildcard `*.tushorarios.com`** se deja para sub-proyecto 5 (subdomain routing). En este sub-proyecto solo apex + www.

En Vercel → app-horarios → Settings → Domains → agregar `tushorarios.com` y `www.tushorarios.com`. Vercel emitirá certs SSL automáticamente. Configurar `tushorarios.com` como dominio canónico (redirige `www` → apex, o viceversa — preferencia del dev).

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Form abuse / spam | Rate limit 5/hora por IP + Honeypot field oculto (bots lo llenan, humanos no). Si llegan muchos spam reales, considerar Cloudflare Turnstile en un sub-proyecto futuro |
| Email del lead va a spam | Resend domain ya verificado (sub-proyecto 1). Templates HTML válidos, no subject suspicioso |
| Landing rompe la app actual (mismo project) | Route groups `(marketing)` aíslan. Middleware solo agrega 2 paths públicos. Build sigue siendo 1, no fragmenta |
| LCP alto por glow background | Glow es CSS puro con `radial-gradient`, no imagen pesada. Verificar en Lighthouse |
| Dominio nuevo afecta reputación de envío | DMARC ya en monitor (`p=none`). DKIM + SPF correctos. Reputación se construye con el tiempo |
| ip_address violando GDPR/Habeas Data Colombia | Solo se almacena para anti-abuse. Política de retención: borrar después de 90 días vía cron job futuro. En footer agregar link a política de privacidad (placeholder por ahora) |

## Lo que NO está en este sub-proyecto (scope-out)

- **Signup público / self-serve onboarding** — sub-proyecto futuro tras conseguir 10-20 demos
- **Pricing público** — no hay precios todavía; landing dice "Solicitar demo" no "Probar gratis"
- **Multi-tenant data model** — sub-proyecto 3
- **Subdomain routing** (`*.tushorarios.com`) — sub-proyecto 5
- **Wildcard SSL** — junto con subdomain routing
- **Testimonios reales** — no hay clientes todavía. Si más adelante hay, agregar sección entre Sectores y Features
- **Logo bar de clientes** — idem, sin clientes no hay logos
- **Blog / contenido SEO orgánico** — sub-proyecto futuro
- **Página de privacidad / términos** — placeholder URL en footer, página real cuando tengamos texto legal aprobado
- **Cloudflare Turnstile / hCaptcha** — solo si spam se vuelve problema real
- **A/B testing del hero** — defer hasta tener tráfico significativo
- **Analytics (Vercel Analytics o Posthog)** — habilitar Vercel Analytics si está en el plan, sino skip

## Estimación

- ~12 componentes nuevos + 2 pages + 1 layout
- 1 migración SQL (+ 1 SQL test)
- 1 API route con validación + email
- 2 templates email
- Middleware: 2 líneas de cambio (agregar rutas públicas)
- DNS: 2 records nuevos en Hostinger
- Vercel: agregar 2 dominios
- 6-8 commits estimados
- Implementación: 2-3 sesiones de trabajo (8-12h efectivas)

## Referencias

- Sub-proyecto 1 spec: [`2026-05-19-dns-email-infrastructure-design.md`](./2026-05-19-dns-email-infrastructure-design.md)
- Sub-proyecto 1 plan: [`../plans/2026-05-19-dns-email-infrastructure.md`](../plans/2026-05-19-dns-email-infrastructure.md)
- Cliente Resend: `src/lib/resend.ts`
- Middleware: `src/middleware.ts`
- React Email docs: https://react.email/docs
- Vercel Next.js best practices: skill `vercel:nextjs`
- Frontend design skill: `frontend-design:frontend-design`
