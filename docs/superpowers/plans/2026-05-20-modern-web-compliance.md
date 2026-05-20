# Plan — Modern Web Guidance Compliance Polish

**Estado:** ✅ COMPLETADO 2026-05-20
**Fecha:** 2026-05-20
**Branch base:** `main` (HEAD `83d28fe`)
**Branch trabajo:** `polish/modern-web-compliance`
**Estimación inicial:** ~95 min · 5–7 commits · 1 PR
**Resultado:** 4 commits + 1 final = 5 commits, build limpio, 293 tests verdes
**Objetivo:** cerrar 12 hallazgos del audit `modern-web-guidance` antes de arrancar sub-proyecto 3 (multi-tenant), dejando la app en ~95% compliance con las guías de Google.

## Commits resultantes

- `e75a933` feat(a11y): landmarks + skip-link + aria-label en navs (Fase 2)
- `2ca800b` chore(a11y): focus-visible + prefers-reduced-motion + smooth-scroll + favicon compression (Fase 1)
- `5a50879` feat(a11y): DemoForm labels htmlFor + aria-invalid + aria-describedby + role=alert (Fase 3)
- `10a9aab` feat(a11y/perf): :user-invalid CSS + content-visibility en secciones below-fold (Fase 4)
- `<TBD>` docs: CLAUDE.md modern-web-compliance + plan completo (Fase 5)

## Contexto

Audit hecho el 2026-05-20 usando el plugin `modern-web-guidance` (Google Chrome) contra los 5 master guides (`accessibility`, `performance`, `html`, `forms`, `css`). 12 hallazgos categorizados en 3 prioridades. Esta sesión cierra todos antes de comenzar el big refactor multi-tenant.

**Guías relevantes consultadas:**
- `accessibility` (landmarks, forms, focus, live regions, contrast, motion, dialogs)
- `performance` (LCP, CWV, image priority, content-visibility)
- `html` (semantic HTML, native overlays, focus boundaries)
- `forms` (validation timing, labels, autocomplete)
- `css` (modern CSS architecture)

## Reglas para subagentes (briefing obligatorio)

Cualquier subagente despachado para una fase debe:
1. **Invocar `modern-web-guidance:modern-web-guidance` skill** antes de codear, con la query específica de su fase.
2. Consultar `vercel:react-best-practices` si toca TSX.
3. Pinear modelo a `sonnet` o `opus` (nunca `haiku`).
4. Reportar al final qué guides aplicó y qué decisiones tomó.

## Fases

### Fase 1 — Quick wins globales (CSS + assets) · ~20 min

Sin tocar lógica. Solo estilos globales y assets que afectan toda la app.

- [x] **1.1** Comprimir `src/app/icon.png` de 230 KB a <15 KB (pngquant o regenerar). Verificar que `apple-icon.png` (29 KB) sigue OK.
- [x] **1.2** Agregar utility global `:focus-visible` en `src/app/globals.css` para `<a>` y `<button>` con outline contrastante (3:1 mínimo, color `hsl(var(--ring))`).
- [x] **1.3** Agregar `@media (prefers-reduced-motion: reduce)` en `globals.css` que neutralice animation/transition durations a 0.01ms.
- [x] **1.4** Smooth scroll global: `html { scroll-behavior: smooth }` con override dentro del bloque de reduced-motion.

**Guides:** `accessibility` §5 (focus management), §10 (motions), `performance` (asset weight), `css`.
**Verificación:** Lighthouse a11y ≥95 en `https://www.tushorarios.com` preview, tab por nav con focus visible.

---

### Fase 2 — Landmarks & navegación · ~15 min

- [x] **2.1** `<nav aria-label="Principal">` en `src/components/landing/NavBar.tsx`.
- [x] **2.2** Envolver bloque de links legales del Footer en `<nav aria-label="Pie de página">`.
- [x] **2.3** Skip-to-content link en `src/app/(marketing)/layout.tsx`: `<a href="#contenido">` visualmente oculto pero `focus-visible`.
- [x] **2.4** Skip-to-content link en `src/app/(authenticated)/layout.tsx` apuntando al `<main>` del layout autenticado.
- [x] **2.5** Setear `tabIndex={-1}` + `id` en secciones target de anchors del landing (`#sectores`, `#funciones`, `#como-funciona`, `#faq`, `#solicitar-demo`) para que el foco salte correctamente al hacer scroll-to-anchor.
- [x] **2.6** Audit del sidebar autenticado (`src/components/layout/sidebar.tsx`): asegurar `<nav aria-label="Navegación principal">`.

**Guides:** `accessibility` §1 (landmarks, skip links), §3 (accessible names), `html` §1 (landmarks).
**Verificación:** screen-reader rotor muestra landmarks nombrados; tab a skip link aparece visible y funciona.

---

### Fase 3 — DemoForm a11y rebuild · ~30 min

Refactor focalizado en `src/components/landing/DemoForm.tsx`.

- [x] **3.1** Refactor componente `<Field>`: usar `useId()` para generar `id` único; `<label htmlFor={id}>` explícito; pasar `id` al input vía render-prop o cloneElement.
- [x] **3.2** Cada `<input>`/`<select>`/`<textarea>` recibe `aria-invalid={!!error}` + `aria-describedby={errorId}`.
- [x] **3.3** Error message recibe `id={errorId}` para que `aria-describedby` lo apunte.
- [x] **3.4** Form-level error block (línea ~130): agregar `role="alert"` + `aria-live="polite"`.
- [x] **3.5** Validar que honeypot `<input>` con `aria-hidden` no rompa RHF ni accessibility tree.
- [x] **3.6** Reemplazar `↓` literal del CTA secundario del Hero por `<ArrowDown aria-hidden="true" />` de lucide.

**Guides:** `accessibility` §7 (forms), §8 (live regions), `forms` (all).
**Verificación:** NVDA o VoiceOver anuncia errores al submit; tab por form sin estados confusos; campo inválido se anuncia como "Email, inválido, debe ser un correo válido".

---

### Fase 4 — Nice-to-have polish · ~20 min

- [x] **4.1** Agregar regla CSS `input:user-invalid` + `select:user-invalid` + `textarea:user-invalid` con border rojo en `globals.css` o módulo del form. (Errores aparecen post-blur, no en render inicial.)
- [x] **4.2** Agregar `content-visibility: auto` + `contain-intrinsic-size` apropiado en secciones below-fold del landing: `Faq`, `DemoForm`, `Footer` (las primeras 3 — Hero, Pain, Solution — se quedan sin containment).
- [x] **4.3** (Opcional) Convertir `icon.png` → WebP si reduce >50% vs PNG optimizado de Fase 1.1.

**Guides:** `css` (content-visibility), `forms` (:user-valid/:user-invalid), `performance` (containment).
**Verificación:** form vacío al cargar no muestra errores rojos; al blur de un campo inválido sí los muestra; Lighthouse perf ≥90.

---

### Fase 5 — Refresh proceso & docs · ~10 min

- [x] **5.1** Update `CLAUDE.md` agregando sección "Modern Web Compliance" con regla: "Antes de nuevo UI/CSS/JS cliente → invocar skill `modern-web-guidance:modern-web-guidance`".
- [x] **5.2** Listar en `CLAUDE.md` (sección Agent Skills) los plugins relevantes: modern-web-guidance, vercel:* skills, chrome-devtools-mcp, supabase MCP, github MCP.
- [x] **5.3** Marcar este plan como completado en `docs/superpowers/plans/2026-05-20-modern-web-compliance.md` (checkbox al inicio).
- [x] **5.4** Crear commit final + push + PR a `main` con descripción referenciando este plan.

**Verificación:** `npm run build` pasa, `npm run lint` pasa, `npm run test` pasa, working tree limpio.

---

## Verificación final end-to-end

1. **Build local:** `npm run build` sin errores.
2. **Type check:** se valida en build.
3. **Tests:** `npm run test` — 38 tests verdes.
4. **Lighthouse en preview Vercel:**
   - Accessibility ≥95
   - Performance ≥90
   - SEO ≥95 (sin regresión vs hoy)
5. **Manual landing:**
   - Tab desde top: skip link visible → nav → CTAs → form fields → footer. Focus visible en cada paso.
   - Submit form vacío: errores anunciados por screen reader.
   - Submit form válido pero rate-limited: error global anunciado.
6. **Manual login + forgot:**
   - Tab por login sin focus invisible.
   - `/forgot-password` → email → "Revisa tu correo" anunciado (ya tiene role).
7. **Manual app autenticado (smoke):**
   - Tab por sidebar con focus visible.
   - Abrir un dialog (asignación de turno) → tab atrapado dentro (Radix lo maneja).

## Rollback

Cada fase = 1 commit atómico. Si algo regresa funcionalidad existente, `git revert` del commit puntual sin afectar las otras fases.

## Próximo paso después de mergear

Arrancar sub-proyecto 3 (multi-tenant data model) en sesión separada con brainstorming.
