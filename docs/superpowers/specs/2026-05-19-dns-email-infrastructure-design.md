# Email Infrastructure para tushorarios.com (Resend + Supabase Auth + Hostinger Email)

**Fecha:** 2026-05-19
**Sub-proyecto:** 1 de N (parte de la transformación a SaaS multi-tenant)
**Dependencias:** ninguna (este es el cimiento)
**Bloquea:** sub-proyecto 2 (landing page necesita Resend funcional para enviar el email "Solicitud recibida" y la notificación interna)

**Scope deliberadamente acotado a email.** Los registros A/CNAME que apuntan a Vercel (apex, www, wildcard) NO entran en este sub-proyecto — entran en sub-proyecto 2 (landing) y sub-proyecto 5 (subdomain routing) respectivamente, cuando exista un proyecto Vercel al cual atar el dominio. Aquí solo se publican los records de email (TXT SPF, TXT DKIM, TXT DMARC, MX).

## Contexto

App Horarios va a evolucionar de single-tenant (un cliente: Les Raptors) a SaaS multi-tenant en español Colombia bajo el dominio `tushorarios.com` (comprado en Hostinger). Este sub-proyecto monta la base de infraestructura DNS + email **antes** de tocar código de aplicación.

### Decisiones de diseño tomadas

| Decisión | Elección | Razón |
|---|---|---|
| Modelo multi-tenant | Shared DB + `organization_id` + RLS | Patrón estándar SaaS; escala a cientos de tenants en una sola DB Supabase |
| Routing tenant | Subdominio (`acme.tushorarios.com`) | Cookies aisladas por tenant + look profesional + fácil migrar a dominios custom |
| MVP scope | Waitlist (form "Solicitar demo") | Sin signup público ni billing en MVP; onboarding manual de primeros clientes |
| Registrar | Hostinger | Donde se compró el dominio; zona DNS gestionada ahí |
| Dominio de envío | Raíz `tushorarios.com` (no subdominio) | Mayor confianza visual del destinatario; volumen B2B bajo, riesgo de reputación bajo |
| Inbox | Hostinger Email (~$1-2/mes) | Buzones reales en `hola@`, `soporte@` sin pagar Google Workspace |
| Orden | Infrastructure first (este sub-proyecto antes de landing y multi-tenant) | Permite landing live en producción mientras se ejecuta el refactor mayor |

## Arquitectura

Este sub-proyecto deja **listo y funcional** lo siguiente, sin tocar el dominio del app actual:

1. **DNS records de email** publicados en Hostinger: SPF (Resend + Hostinger Email combinados), DKIM Resend, DMARC monitor, MX Hostinger
2. **Resend** verificado y autorizado para enviar desde `*@tushorarios.com`
3. **Supabase Auth** usando Resend SMTP custom (reemplaza el provider default limitado a 4 emails/hr)
4. **Hostinger Email** activo con buzones `hola@`, `soporte@`, `dmarc@`
5. **Cliente Resend en Next.js** (`src/lib/resend.ts`) + carpeta `src/emails/` lista para templates con `@react-email/components`

El app actual (`app-horarios-mauve.vercel.app`) sigue funcionando intacto para Les Raptors. La URL del app no cambia en este sub-proyecto. Resend y Supabase Auth quedan funcionando desde `noreply@tushorarios.com` aunque la app aún viva en el subdominio Vercel — eso es válido y se prueba antes de cerrar el sub-proyecto.

## DNS records — Hostinger panel (solo email)

Se publican únicamente los registros de email. Los A/CNAME que apuntan a Vercel se publicarán en sub-proyectos posteriores cuando exista un proyecto Vercel al cual atarlos.

| Type | Name | Value | TTL | Propósito |
|---|---|---|---|---|
| TXT | `@` | `v=spf1 include:_spf.mail.hostinger.com include:_spf.resend.com ~all` | 3600 | SPF combinado (Resend + Hostinger Email en una sola línea) |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@tushorarios.com; pct=100; adkim=s; aspf=s` | 3600 | DMARC monitor mode |
| TXT | `resend._domainkey` | _(valor generado por Resend al verificar el dominio)_ | 3600 | DKIM Resend |
| MX | `@` | `mx1.hostinger.com` (prio 5), `mx2.hostinger.com` (prio 10) | 3600 | Recepción Hostinger Email |

**Notas:**
- El valor DKIM se obtiene cuando agregas el dominio en el panel de Resend (paso 3 del orden de operaciones).
- Los MX exactos los confirma Hostinger al activar el plan Email.
- **SPF crítico:** solo puede haber **una** línea TXT SPF por dominio. Por eso combinamos Resend + Hostinger Email en la misma línea. Si Hostinger pre-pobló un SPF al activar el email plan, hay que editarlo (no agregar otro).

**Plan de escalamiento DMARC:** dos semanas en `p=none` recibiendo reports → revisar el buzón `dmarc@tushorarios.com` → si todo limpio, escalar a `p=quarantine`. No empezar en `quarantine` para evitar bloquear emails legítimos durante setup.

## Orden de operaciones (single sitting, ~1-1.5 horas)

```
1. Hostinger → contratar plan Email (~$1-2/mes)
   Configurar buzones: hola@tushorarios.com, soporte@tushorarios.com, dmarc@tushorarios.com
   → Hostinger entrega MX exactos a usar (mx1/mx2.hostinger.com)

2. Resend → resend.com → crear cuenta gratis (3.000 emails/mes free, 100/día)
   Settings → Domains → Add Domain → tushorarios.com
   → Resend muestra 3 registros: DKIM TXT (resend._domainkey) + SPF segment + DMARC sugerido
   → Crear API key con scope "Sending access" (NO "Full access") → guardar para los pasos 4 y 6

3. Hostinger panel DNS → publicar TODOS los registros de la sección "DNS records" en una sola visita
   ATENCIÓN al merge de SPF: una sola línea TXT en @ que incluya Resend Y Hostinger
   Si Hostinger ya pre-pobló un SPF al activar email, editar esa línea (no agregar otra)

4. Esperar propagación 5-30 min
   Verificar en Resend ("Verified" verde en el dashboard del dominio)
   Verificar con mxtoolbox.com (SPF Lookup, DKIM Lookup, DMARC Lookup) — los 3 deben dar Valid

5. Supabase Dashboard (project ugkvuinkynvtuiutwlkd) → Authentication → SMTP Settings
   Enable Custom SMTP con la config exacta de la sección "Supabase Auth SMTP" más abajo
   Botón "Send test email" → confirmar entrega a suv411@hotmail.com (el inbox personal del dev)
   (Opcional pero recomendado: editar Email Templates con branding "Tus Horarios" en español)

6. Vercel → app-horarios project → Settings → Environment Variables
   Agregar las 4 env vars de la sección "Variables de entorno" en los 3 environments (Production + Preview + Development)
   Marcar la API key como sensitive (encrypted)

7. Local → instalar deps + scaffold cliente Resend
   npm install resend @react-email/components
   Crear src/lib/resend.ts (singleton, ~5 líneas)
   Crear src/emails/.gitkeep (carpeta vacía; templates se agregan en sub-proyectos posteriores)
   Actualizar .env.example con los 4 nombres (valores vacíos)

8. Verificación end-to-end (los 11 items del Plan de verificación más abajo)
   Si algo falla, debug y re-ejecutar el item específico
```

## Supabase Auth SMTP — configuración exacta

En Supabase Dashboard del proyecto `ugkvuinkynvtuiutwlkd` → Authentication → SMTP Settings:

```
Enable Custom SMTP: ON
Host:           smtp.resend.com
Port:           465 (SSL)
Username:       resend
Password:       <RESEND_API_KEY>
Sender email:   noreply@tushorarios.com
Sender name:    Tus Horarios
```

**Emails afectados** (todos pasan a salir vía Resend con remitente `noreply@tushorarios.com`):
- Signup confirmation (cuando se cree signup público en sub-proyecto futuro)
- Password reset
- Magic link
- **Invite** — usado actualmente en `src/app/api/employees/invite/route.ts` para invitar empleados reales

**Plantillas de Supabase Auth:** los HTML templates en Authentication → Email Templates pueden editarse para usar branding "Tus Horarios" y español neutro. Recomendado pero opcional para este sub-proyecto.

## Cliente transaccional propio — código a crear

### Archivos nuevos

**`src/lib/resend.ts`** — singleton del SDK:
```typescript
import { Resend } from 'resend';

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY is not set');
}

export const resend = new Resend(process.env.RESEND_API_KEY);
```

**`src/emails/`** — carpeta vacía con `.gitkeep`, donde irán templates JSX con `@react-email/components` a medida que aparezcan necesidades reales en sub-proyectos posteriores. Ejemplos esperados:
- `demo-request-confirmation.tsx` (al usuario que solicitó demo)
- `demo-request-notification.tsx` (a Simón cuando alguien solicita demo)
- `new-shift-notification.tsx` (a empleado cuando se le asigna turno)
- `overtime-approved.tsx` (cuando manager aprueba sus horas extra)

### Patrón de uso esperado

```typescript
import { resend } from '@/lib/resend';
import { DemoRequestNotification } from '@/emails/demo-request-notification';

const { data, error } = await resend.emails.send({
  from: 'Tus Horarios <hola@tushorarios.com>',
  to: 'suv411@hotmail.com',
  reply_to: 'hola@tushorarios.com',
  subject: 'Nueva solicitud de demo — Acme S.A.S.',
  react: <DemoRequestNotification {...payload} />,
});

if (error) {
  console.error('Resend error:', error);
}
```

## Variables de entorno

**`.env.local`** (no commiteado, ya en `.gitignore`) + Vercel project settings (Production, Preview, Development):

```bash
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
RESEND_FROM_NOREPLY=noreply@tushorarios.com
RESEND_FROM_HOLA=hola@tushorarios.com
RESEND_FROM_NOTIF=notificaciones@tushorarios.com
```

`RESEND_API_KEY` también se pega en Supabase Dashboard como password del SMTP (no se referencia desde código del app).

Actualizar `.env.example` con los mismos nombres pero valores vacíos para que el README quede correcto.

## Plan de verificación

| # | Item | Comando / Lugar | Resultado esperado |
|---|---|---|---|
| 1 | SPF | `dig TXT tushorarios.com +short` | Una sola línea, incluye `_spf.resend.com` y `_spf.mail.hostinger.com` |
| 2 | DKIM | mxtoolbox.com/SuperTool → DKIM Lookup `tushorarios.com:resend` | Valid, key visible |
| 3 | DMARC | mxtoolbox.com DMARC Lookup | Valid syntax, `p=none`, `rua` configurado |
| 4 | MX | `dig MX tushorarios.com +short` | mx1.hostinger.com prio 5, mx2 prio 10 |
| 5 | Resend domain verify | Dashboard Resend → Domains | Status "Verified" verde |
| 6 | Supabase SMTP | Authentication → SMTP → botón "Send test email" | Llega a tu inbox personal, `From: noreply@tushorarios.com` |
| 7 | Hostinger Email recepción | Enviar email desde Gmail externo a `hola@tushorarios.com` | Llega al webmail Hostinger |
| 8 | Hostinger Email envío | Responder desde el webmail a un email externo | Llega al destinatario sin marca spam |
| 9 | Cliente Resend transaccional | API route temporal `/api/test-email` → `resend.emails.send({ from: 'noreply@tushorarios.com', ... })` | Returns `{ id }`, email entregado, log limpio |
| 10 | Supabase Auth flow real | Invitar empleado de prueba vía `/employees` → "Invitar" | Email llega vía Resend (verificable en Resend dashboard "Emails" tab con remitente `noreply@tushorarios.com`) |
| 11 | Env vars en Vercel | Vercel dashboard → Settings → Env Vars | Las 4 variables presentes en Production + Preview + Development |

**Criterio de done:** los 11 items verificados manualmente, sin errores. La API route temporal `/api/test-email` se borra después del item 9 (no debe mergearse a main).

## Lo que NO está en este sub-proyecto (scope-out explícito)

- **Apuntar tushorarios.com a Vercel** (records A/CNAME apex + www): sub-proyecto 2, cuando exista la landing.
- **Wildcard `*.tushorarios.com` apuntando a Vercel** (CNAME + attachment): sub-proyecto 5, cuando exista el middleware de subdomain routing.
- **Landing page**: sub-proyecto 2.
- **Templates de email finos**: se agregan a medida que aparezcan en sub-proyectos posteriores. Carpeta `src/emails/` queda vacía con `.gitkeep`.
- **Inbound email parsing** (Resend Inbound): futuro.
- **Marketing emails / newsletter**: cuando exista, irá en subdominio aparte `marketing.tushorarios.com` con su propia verificación Resend, para aislar reputación de transaccional.
- **DMARC escalación a `p=quarantine` o `p=reject`**: se hace ~2 semanas después de monitor mode, fuera del scope inicial.
- **Branding de templates Supabase Auth**: opcional, recomendado pero no bloqueante.
- **Cambio del current production URL** de Les Raptors: se hace en el sub-proyecto multi-tenant (mover de `app-horarios-mauve.vercel.app` a `lesraptors.tushorarios.com`).

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Propagación DNS lenta | Ejecutar el paso DNS al inicio del sitting (5-30 min de wait) y aprovechar para preparar el código de `src/lib/resend.ts` mientras |
| SPF múltiple inválido (max 1 TXT SPF por dominio) | Una sola línea TXT en `@` combinando includes — explícito en la tabla de DNS records. Si Hostinger pre-pobló un SPF al activar email, editarlo (no agregar otro) |
| DKIM falla por copy-paste con espacios | Pegar como string única sin saltos; verificar con mxtoolbox antes de seguir |
| Resend rate-limit free tier (3.000/mes, 100/día) | Suficiente para MVP waitlist; upgrade a Pro ($20/mes 50k emails) cuando crezca |
| Olvidar variables en Vercel preview/dev | Marcar las 4 env vars en los 3 environments al crearlas |
| API key de Resend leaked | Generar key con scope mínimo ("Sending access"), no "Full access"; rotar si se sospecha |
| Romper emails de invite existentes (`/api/employees/invite`) al cambiar SMTP | Hacer item 10 del plan de verificación (invite real) antes de declarar done; si falla, revertir SMTP en Supabase y debuggear con un email a un buzón controlado |
| Cambio de provider rompe templates de Supabase | Los HTML templates default de Supabase Auth siguen funcionando con cualquier SMTP. Solo cambia el remitente. No tocar templates en este sub-proyecto |

## Referencias

- Resend docs: https://resend.com/docs (consultar vía Context7 MCP cuando se necesite)
- Vercel domain setup: skill `vercel:deployments-cicd`
- Vercel env vars: skill `vercel:env-vars`
- Supabase SMTP: https://supabase.com/docs/guides/auth/auth-smtp
- React Email components: https://react.email/docs
