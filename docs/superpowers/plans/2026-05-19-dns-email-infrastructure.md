# Email Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Note:** This plan is mostly external configuration (Hostinger panel, Resend dashboard, Supabase dashboard, Vercel UI). Only Tasks 7-8 and Task 11 touch the codebase. Subagents cannot operate external GUIs — the human dev (Simón) executes Tasks 1-6 and 9-10 manually; a subagent can be dispatched for Tasks 7-8 and 11 if desired.

**Goal:** Activar el envío y recepción de correos para `tushorarios.com` (Resend para envío + Supabase Auth SMTP custom + Hostinger Email para inbox) y dejar el cliente Resend listo en el proyecto Next.js para correos transaccionales.

**Architecture:** Records DNS de email (SPF/DKIM/DMARC/MX) publicados en Hostinger. Resend autorizado para enviar desde `*@tushorarios.com`. Supabase Auth re-configurado para usar SMTP de Resend (reemplaza el provider default limitado a 4 emails/hora). Singleton del SDK Resend en `src/lib/resend.ts` consumible desde API routes. Los registros A/CNAME que apuntan a Vercel se difieren a sub-proyectos posteriores.

**Tech Stack:** Resend (SDK + dashboard), `@react-email/components` (templates JSX, instalado pero sin templates aún), Supabase Auth (SMTP custom), Hostinger Email (~$1-2/mes), Hostinger DNS, Vercel Environment Variables.

**Spec:** [docs/superpowers/specs/2026-05-19-dns-email-infrastructure-design.md](../specs/2026-05-19-dns-email-infrastructure-design.md)

---

## File Structure

**Files this plan creates:**
- `src/lib/resend.ts` — singleton del SDK Resend (~10 líneas)
- `src/emails/.gitkeep` — placeholder de la carpeta donde irán templates futuros
- `.env.local` (local, no commiteado) — 4 variables nuevas
- `src/app/api/test-email/route.ts` — **TEMPORAL**, se borra en Task 11

**Files this plan modifies:**
- `.env.example` — agregar las 4 variables con valores vacíos
- `package.json` — `resend` y `@react-email/components` como dependencies

**Files this plan does NOT touch:**
- Cualquier archivo del app actual (middleware, contexts, schedule, etc.)
- Migraciones de Supabase
- Configuración de Next.js o Tailwind

---

## Task 1: Activar plan de email en Hostinger

**No code changes. External panel work only.**

- [ ] **Step 1:** Login en Hostinger → Hosting / Dominios → seleccionar `tushorarios.com` → tab **"Correos electrónicos"** o **"Email"**.

- [ ] **Step 2:** Si no hay plan activo, contratar el plan **Business Email** o similar (~$0.99-1.99/mes). Confirmar pago.

- [ ] **Step 3:** Crear las siguientes cuentas de correo (todas en el mismo dominio):
  - `hola@tushorarios.com` (contacto general)
  - `soporte@tushorarios.com` (soporte clientes)
  - `dmarc@tushorarios.com` (recepción de DMARC reports — buzón al que llegarán los XMLs de Gmail/Microsoft sobre tus emails)
  - `noreply@tushorarios.com` (remitente del Supabase Auth — no requiere buzón real pero crearlo permite recibir bounces si los hay)

- [ ] **Step 4:** Anotar los registros **MX** exactos que muestra Hostinger (típicamente `mx1.hostinger.com` priority 5, `mx2.hostinger.com` priority 10 — pero confirmar).

- [ ] **Step 5 — Verificación:** Login al webmail de Hostinger con `hola@tushorarios.com` → confirmar que abre la bandeja vacía sin errores.

**Output esperado:** plan activo, 4 buzones creados, MX records anotados para el Task 3.

---

## Task 2: Crear cuenta Resend + agregar dominio + obtener API key

**No code changes. External panel work only.**

- [ ] **Step 1:** Ir a https://resend.com → Sign up (puede ser con GitHub o email). Cuenta gratis incluye 3.000 emails/mes y 100/día — más que suficiente para MVP waitlist.

- [ ] **Step 2:** Dashboard → **Domains** → "Add Domain" → ingresar `tushorarios.com` → selecciona región **"us-east-1"** o la más cercana (no aplica latencia significativa, default OK).

- [ ] **Step 3:** Resend muestra una pantalla con 3-4 registros DNS a copiar:
  - **TXT** `resend._domainkey` con la public key DKIM (string largo)
  - **TXT** SPF segment (sólo el `include:_spf.resend.com`, que tú vas a combinar con Hostinger en una línea sola — ver Task 3)
  - **TXT** DMARC sugerido (opcional, usaremos el de la spec con `dmarc@` mailbox)
  - Posiblemente **MX** o **TXT** adicional para tracking de bounces (revisar; si Resend pide MX y conflictúa con Hostinger Email MX, **usar el MX de Hostinger** y aceptar que las métricas de bounce de Resend serán menos precisas)

  Copiar TODOS los valores a un archivo temporal de notas.

- [ ] **Step 4:** Dashboard → **API Keys** → "Create API Key":
  - Name: `tushorarios-production`
  - Permission: **"Sending access"** (NO "Full access" — principio de menor privilegio)
  - Domain: `tushorarios.com`
  - Copy & save (Resend solo muestra la key UNA VEZ). Guardar en password manager.

- [ ] **Step 5 — Verificación:** Dashboard → Domains → debe mostrar `tushorarios.com` con status **"Not Started"** (rojo o gris). Se vuelve verde después del Task 4.

**Output esperado:** API key guardada, DKIM record + SPF segment de Resend anotados para Task 3.

---

## Task 3: Publicar records DNS en Hostinger

**No code changes. External panel work only.** Crítico hacerlo en una sola sesión para evitar múltiples ciclos de propagación.

- [ ] **Step 1:** En Hostinger → Dominio `tushorarios.com` → **DNS / Nameservers** o **Zona DNS** (el nombre varía).

- [ ] **Step 2:** Verificar si Hostinger pre-pobló un registro **TXT SPF** al activar el plan email. Si existe, **EDITARLO** (no agregar otro — solo puede haber 1 SPF por dominio). El valor final debe ser:
  ```
  v=spf1 include:_spf.mail.hostinger.com include:_spf.resend.com ~all
  ```
  Si no existe, crear nuevo registro TXT en `@` con ese valor.

- [ ] **Step 3:** Agregar registro **TXT** para DKIM Resend:
  - Type: TXT
  - Host/Name: `resend._domainkey`
  - Value: _(la string larga que Resend te dio en Task 2)_
  - TTL: 3600

- [ ] **Step 4:** Agregar registro **TXT** para DMARC:
  - Type: TXT
  - Host/Name: `_dmarc`
  - Value: `v=DMARC1; p=none; rua=mailto:dmarc@tushorarios.com; pct=100; adkim=s; aspf=s`
  - TTL: 3600

- [ ] **Step 5:** Verificar que los registros **MX** de Hostinger Email están publicados (deberían haberse creado automáticamente al activar el plan en Task 1; si no, agregarlos manualmente):
  - Type: MX, Host: `@`, Value: `mx1.hostinger.com`, Priority: 5, TTL: 3600
  - Type: MX, Host: `@`, Value: `mx2.hostinger.com`, Priority: 10, TTL: 3600

- [ ] **Step 6 — Verificación:** El panel de Hostinger debe mostrar los registros publicados sin errores de syntax. No cerrar la sesión todavía — algunos paneles requieren botón "Guardar".

**Output esperado:** 4 registros publicados (TXT SPF, TXT DKIM, TXT DMARC, MX). Empieza ventana de propagación 5-30 min.

---

## Task 4: Esperar propagación + verificar con `dig` y mxtoolbox

**Verification only — confirmar que el DNS propagó antes de seguir.**

- [ ] **Step 1:** Esperar 5 minutos. Ejecutar:
  ```bash
  dig TXT tushorarios.com +short
  ```
  Expected: una línea con el SPF: `"v=spf1 include:_spf.mail.hostinger.com include:_spf.resend.com ~all"`. Si vacío, esperar 5 min más y reintentar.

- [ ] **Step 2:** Verificar DKIM Resend:
  ```bash
  dig TXT resend._domainkey.tushorarios.com +short
  ```
  Expected: una string larga que empieza con `"v=DKIM1; k=rsa; p=..."`.

- [ ] **Step 3:** Verificar DMARC:
  ```bash
  dig TXT _dmarc.tushorarios.com +short
  ```
  Expected: `"v=DMARC1; p=none; rua=mailto:dmarc@tushorarios.com; pct=100; adkim=s; aspf=s"`.

- [ ] **Step 4:** Verificar MX:
  ```bash
  dig MX tushorarios.com +short
  ```
  Expected: `5 mx1.hostinger.com.` y `10 mx2.hostinger.com.`.

- [ ] **Step 5:** Abrir https://mxtoolbox.com/SuperTool.aspx y ejecutar:
  - **SPF Lookup** para `tushorarios.com` → Valid syntax, includes válidos
  - **DKIM Lookup** para `tushorarios.com:resend` → Valid, public key visible
  - **DMARC Lookup** para `tushorarios.com` → Valid, `p=none`

- [ ] **Step 6:** Volver al dashboard de Resend → Domains → click "Verify DNS Records". Status debe cambiar a **"Verified"** (verde). Si dice "Pending" o "Failed", revisar cuál record falta y volver al Task 3.

**Output esperado:** los 5 verifications pasan, Resend marca el dominio como Verified.

**Si falla:** lo más común es que el SPF tenga 2 líneas TXT en `@` (debe ser una sola con includes combinados). Editar y esperar otros 5-10 min.

---

## Task 5: Configurar Supabase Auth SMTP custom

**No code changes. Supabase dashboard work only.**

- [ ] **Step 1:** Ir a https://supabase.com/dashboard/project/ugkvuinkynvtuiutwlkd/auth/providers → scroll abajo → sección **"SMTP Settings"**.

- [ ] **Step 2:** Toggle **"Enable Custom SMTP"** ON. Llenar campos:
  ```
  Host:           smtp.resend.com
  Port:           465
  Username:       resend
  Password:       <RESEND_API_KEY_DE_TASK_2>
  Sender email:   noreply@tushorarios.com
  Sender name:    Tus Horarios
  ```

- [ ] **Step 3:** Click **"Save"** (botón al final de la sección).

- [ ] **Step 4 — Verificación:** Click botón **"Send test email"** (puede aparecer como un input que pide tu email destino). Enviar a `suv411@hotmail.com`. Esperar ~30 segundos.

- [ ] **Step 5:** Abrir Hotmail → verificar email recibido con:
  - **From:** `Tus Horarios <noreply@tushorarios.com>`
  - **Subject:** algo tipo "Test email from Supabase"
  - **Body:** texto de prueba

  Si llega a spam → marcar como "No spam" (esto sucede porque el dominio es nuevo y aún no tiene reputación). Si no llega en absoluto → debug en el siguiente Step.

- [ ] **Step 6 — Debug (solo si falla):**
  - Dashboard Resend → tab **"Emails"** → buscar el envío. Debe aparecer con estado **"Delivered"**, **"Bounced"** o **"Pending"**.
  - Si "Bounced": revisar el código de error de bounce (típicamente DKIM o SPF mal configurados — volver a Task 3 con la corrección específica).
  - Si no aparece en absoluto en Resend: Supabase no está enviando vía Resend — revisar credenciales SMTP en Step 2.

**Output esperado:** email de prueba recibido en hotmail con remitente `noreply@tushorarios.com`. Resend dashboard muestra el envío como "Delivered".

---

## Task 6: Agregar environment variables a Vercel

**No code changes. Vercel dashboard work only.**

- [ ] **Step 1:** Ir a https://vercel.com/lesraptors/app-horarios/settings/environment-variables (ajustar el path según el team/project real).

- [ ] **Step 2:** Agregar la primera variable, marcando los 3 environments:
  - **Key:** `RESEND_API_KEY`
  - **Value:** _(la API key de Task 2)_
  - **Environments:** ☑ Production ☑ Preview ☑ Development
  - **Sensitive:** ☑ ON (encripta el valor; Vercel lo oculta en la UI)
  - Click "Save"

- [ ] **Step 3:** Repetir el Step 2 con las otras 3 variables (no sensitive, son solo emails públicos):
  - `RESEND_FROM_NOREPLY` = `noreply@tushorarios.com`
  - `RESEND_FROM_HOLA` = `hola@tushorarios.com`
  - `RESEND_FROM_NOTIF` = `notificaciones@tushorarios.com`

- [ ] **Step 4 — Verificación:** Refresh de la página → deben aparecer las 4 variables listadas con los 3 environments cada una.

**Output esperado:** 4 env vars publicadas en los 3 environments de Vercel.

---

## Task 7: Instalar SDK Resend + crear singleton + actualizar .env.example

**Code changes. Local development.** Esta es la única tarea con commit.

**Files:**
- Create: `src/lib/resend.ts`
- Create: `src/emails/.gitkeep`
- Modify: `package.json`
- Modify: `.env.example`
- Create: `.env.local` (no commit)

- [ ] **Step 1:** Instalar dependencies:
  ```bash
  npm install resend @react-email/components
  ```
  Expected: `npm install` exitoso, sin warnings. Verifica `package.json`:
  ```bash
  grep -E "resend|@react-email" package.json
  ```
  Expected: ambas líneas presentes en `dependencies`.

- [ ] **Step 2:** Crear `src/lib/resend.ts`:
  ```typescript
  import { Resend } from 'resend';

  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not set');
  }

  export const resend = new Resend(process.env.RESEND_API_KEY);

  export const FROM_NOREPLY = process.env.RESEND_FROM_NOREPLY ?? 'noreply@tushorarios.com';
  export const FROM_HOLA = process.env.RESEND_FROM_HOLA ?? 'hola@tushorarios.com';
  export const FROM_NOTIF = process.env.RESEND_FROM_NOTIF ?? 'notificaciones@tushorarios.com';
  ```

- [ ] **Step 3:** Crear placeholder de carpeta de templates:
  ```bash
  mkdir -p src/emails && touch src/emails/.gitkeep
  ```

- [ ] **Step 4:** Crear `.env.local` (no commiteado) con los 4 valores reales para desarrollo local:
  ```bash
  RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
  RESEND_FROM_NOREPLY=noreply@tushorarios.com
  RESEND_FROM_HOLA=hola@tushorarios.com
  RESEND_FROM_NOTIF=notificaciones@tushorarios.com
  ```

- [ ] **Step 5:** Modificar `.env.example` para agregar los nombres (sin valores reales). Leer primero el archivo y agregar al final:
  ```bash
  # Resend (transactional email — see docs/superpowers/specs/2026-05-19-...)
  RESEND_API_KEY=
  RESEND_FROM_NOREPLY=
  RESEND_FROM_HOLA=
  RESEND_FROM_NOTIF=
  ```

- [ ] **Step 6 — Verificación:** Build local debe pasar sin errores de types:
  ```bash
  npm run build
  ```
  Expected: build completa sin errores. (Nota: durante el build, `process.env.RESEND_API_KEY` está disponible desde `.env.local` — no hay error porque está definido.)

- [ ] **Step 7 — Commit:**
  ```bash
  git add src/lib/resend.ts src/emails/.gitkeep package.json package-lock.json .env.example
  git commit -m "$(cat <<'EOF'
  feat(email): scaffold Resend client para transactional emails

  - src/lib/resend.ts: singleton del SDK con FROM_* constants
  - src/emails/: carpeta lista para templates JSX con react-email
  - .env.example: documenta las 4 variables RESEND_*

  Parte del sub-proyecto 1 (Email Infrastructure) de la transformación
  a SaaS multi-tenant. Spec: docs/superpowers/specs/2026-05-19-dns-email-infrastructure-design.md

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

**Output esperado:** un commit nuevo en main con los 5 archivos (resend.ts, .gitkeep, package.json, package-lock.json, .env.example).

---

## Task 8: Crear API route temporal `/api/test-email` para smoke test

**Code changes. Temporal — se borra en Task 11.**

**Files:**
- Create: `src/app/api/test-email/route.ts` (temporal)

- [ ] **Step 1:** Crear `src/app/api/test-email/route.ts`:
  ```typescript
  import { NextResponse } from 'next/server';
  import { resend, FROM_NOREPLY } from '@/lib/resend';

  export async function GET() {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'disabled in production' }, { status: 403 });
    }

    const { data, error } = await resend.emails.send({
      from: `Tus Horarios <${FROM_NOREPLY}>`,
      to: 'suv411@hotmail.com',
      subject: 'Smoke test — Resend client funciona',
      text: 'Si recibes este email, el cliente Resend está bien configurado en src/lib/resend.ts y el dominio tushorarios.com está verificado en Resend.',
    });

    if (error) {
      console.error('Resend error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: data?.id, ok: true });
  }
  ```

- [ ] **Step 2:** Arrancar el dev server local:
  ```bash
  npm run dev
  ```
  Esperar a que diga "Ready in Xs". Si no compila, debug.

- [ ] **Step 3 — Verificación:** En otra terminal:
  ```bash
  curl http://localhost:3000/api/test-email
  ```
  Expected response (JSON):
  ```json
  {"id": "<uuid de resend>", "ok": true}
  ```

- [ ] **Step 4:** Abrir Hotmail → confirmar email recibido con remitente `Tus Horarios <noreply@tushorarios.com>` y subject "Smoke test — Resend client funciona".

- [ ] **Step 5:** Verificar en Resend dashboard → tab "Emails" → debe aparecer este envío con status "Delivered".

- [ ] **Step 6:** Detener el dev server (Ctrl+C en la terminal del Step 2).

**Output esperado:** email recibido en Hotmail vía la API route, confirmando que el cliente Resend funciona end-to-end desde código del app.

**NO HACER COMMIT** de este archivo todavía — se borra en Task 11.

---

## Task 9: Verificar Hostinger Email (recepción + envío)

**No code changes. Webmail testing only.**

- [ ] **Step 1:** Desde tu Hotmail personal o Gmail, enviar un email a `hola@tushorarios.com`. Subject sugerido: "Test inbox Hostinger". Body: cualquier texto.

- [ ] **Step 2:** Login al webmail de Hostinger con `hola@tushorarios.com` (URL típicamente `https://webmail.hostinger.com` o similar — Hostinger lo muestra en el panel del Task 1).

- [ ] **Step 3 — Verificación recepción:** El email debe aparecer en la bandeja en <30 segundos. Si no llega después de 2 minutos: revisar carpeta spam del webmail. Si tampoco está ahí: verificar MX records con `dig MX tushorarios.com` (deben apuntar a Hostinger).

- [ ] **Step 4:** Desde el webmail Hostinger, click "Reply" → escribir respuesta corta → enviar.

- [ ] **Step 5 — Verificación envío:** El email debe llegar a tu Hotmail/Gmail original. **Verificar que no esté en spam** y que el remitente sea `hola@tushorarios.com`.

- [ ] **Step 6:** Repetir Steps 1-5 con `soporte@tushorarios.com` para confirmar que ese buzón también funciona.

**Output esperado:** los dos buzones funcionan en ambas direcciones (recibir y enviar) sin caer en spam.

---

## Task 10: Verificar flujo de invite real de Supabase Auth

**No code changes. End-to-end test through the actual app.**

- [ ] **Step 1:** Login a la app en `app-horarios-mauve.vercel.app` con tu cuenta admin.

- [ ] **Step 2:** Ir a `/employees` → click botón **"Invitar"** o equivalente.

- [ ] **Step 3:** Crear un empleado de prueba con tu email personal (usar un email que NO esté ya registrado en el app — ej. una variante con `+test1` como `suv411+test1@hotmail.com`):
  - Email: `suv411+test1@hotmail.com`
  - Nombre: "Test Auth Email"
  - Rol: employee
  - Sede / Posición: cualquier valor válido
  - Submit.

- [ ] **Step 4 — Verificación inbox:** Esperar el email de invitación en tu Hotmail (~30 segundos). Verificar:
  - **From:** `Tus Horarios <noreply@tushorarios.com>` _(NOT `noreply@mail.app.supabase.io` — eso significaría que el SMTP custom no está activo)_
  - **Subject:** algo tipo "You have been invited" o el branding que tengas en los Email Templates de Supabase.
  - **Link** dentro del email apunta a la URL de la app y al hacer click permite establecer password.

- [ ] **Step 5 — Verificación Resend dashboard:** Resend dashboard → tab "Emails" → confirmar que ESTE email aparece como "Delivered" (es el segundo email que vas a ver — el primero fue el smoke test del Task 8).

- [ ] **Step 6:** Borrar el empleado de prueba: `/employees` → encontrar "Test Auth Email" → eliminar (o usar el flujo de delete demo si está disponible).

**Output esperado:** invitación real funciona vía Resend con el remitente correcto, sin haber tocado código del `/api/employees/invite` route — solo cambió el SMTP underlying.

**Si falla esto:** los emails de Supabase Auth no están saliendo por Resend. Volver a Task 5 y verificar credenciales SMTP. Mientras se debugea, el flujo de invite sigue funcionando con el provider default de Supabase, pero limitado a 4 emails/hora.

---

## Task 11: Cleanup + commit final

**Code changes. Borrar el API route temporal.**

**Files:**
- Delete: `src/app/api/test-email/route.ts`

- [ ] **Step 1:** Borrar el archivo temporal:
  ```bash
  rm src/app/api/test-email/route.ts
  ```

- [ ] **Step 2:** Verificar que la carpeta `src/app/api/test-email/` queda vacía y removerla si Next.js lo permite:
  ```bash
  rmdir src/app/api/test-email 2>/dev/null || true
  ```

- [ ] **Step 3:** Run build local para confirmar que nada se rompió:
  ```bash
  npm run build
  ```
  Expected: build limpio sin errores ni warnings nuevos.

- [ ] **Step 4 — Commit:**
  ```bash
  git add -A src/app/api/test-email
  git commit -m "$(cat <<'EOF'
  chore(email): remover API route temporal de smoke test

  /api/test-email se usó solo para verificar el cliente Resend
  durante el setup del sub-proyecto 1. Ya no es necesario.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

- [ ] **Step 5 — Push final:**
  ```bash
  git push origin main
  ```

- [ ] **Step 6 — Verificación end-to-end del sub-proyecto:** Recorrer el "Plan de verificación" del spec (11 items) y marcar mentalmente que todos pasan:
  1. SPF resuelve con dig
  2. DKIM válido en mxtoolbox
  3. DMARC válido y monitor mode
  4. MX apunta a Hostinger
  5. Resend marca dominio como Verified
  6. Supabase SMTP test email llega
  7. Hostinger inbox recibe
  8. Hostinger inbox envía
  9. API route transaccional funcionó (ya borrada, pero verificamos)
  10. Supabase Auth invite real funciona vía Resend
  11. Vercel tiene las 4 env vars en 3 environments

**Output esperado:** repo en estado limpio (sin archivos temporales), todos los criterios del spec verificados, push a main exitoso.

---

## Sub-proyecto completado cuando:

- ✅ Los 11 items del plan de verificación del spec pasan
- ✅ `src/lib/resend.ts` y `src/emails/.gitkeep` están en main
- ✅ `.env.example` documenta las 4 variables
- ✅ Vercel tiene las 4 variables configuradas en los 3 environments
- ✅ Supabase Auth SMTP está usando Resend (verificable enviando un invite real)
- ✅ Hostinger Email funciona para hola@ y soporte@
- ✅ DMARC en modo monitor (`p=none`) recogiendo reports en `dmarc@tushorarios.com`

**Siguiente sub-proyecto:** Landing page (sub-proyecto 2). Requiere:
- Resend funcional (este sub-proyecto) ✓
- Decidir si la landing es proyecto Vercel separado o ruta dentro del actual
- Publicar A/CNAME para apex + www apuntando a Vercel
- Diseñar copy en español Colombia con CTA "Solicitar demo"
- Implementar el form que dispara email vía Resend a `suv411@hotmail.com` + crea registro en tabla `demo_requests` (nueva, en migración separada)
