# Payroll — Sub-spec 4: Liquidación final por terminación

**Status:** Spec (aprobada en brainstorming)
**Date:** 2026-05-25
**Owner:** Simon Urrego (con Claude Opus 4.7)
**Depends on:**
- Sub-spec 2 (`docs/superpowers/specs/2026-04-26-payroll-engine-design.md`) — motor de nómina mensual, ya en producción.
- Research (`docs/research/2026-04-25-colombia-payroll-research.md`) + verificación legal 2026 (ver §3).

Calcula la liquidación definitiva de prestaciones e indemnización cuando un empleado termina su contrato. Es un evento único por empleado (no un período mensual de todos), con su propio cálculo legal, persistencia y documento PDF.

---

## 1. Objetivo

El admin puede:
- Crear una liquidación para un empleado terminado, ingresando los datos que el sistema no tiene (motivo, tipo de contrato, fechas de corte, días de vacaciones pendientes).
- Ver el cálculo legal: cesantías, intereses sobre cesantías, prima proporcional, vacaciones pendientes e indemnización por despido sin justa causa (cuando aplica).
- Aplicar ajustes manuales sin perderlos al recalcular.
- Aprobar (snapshot inmutable) → marcar como pagada. Reabrir antes de pagar.
- Descargar un documento PDF de liquidación.

**Out of scope:** DIAN nómina electrónica de la liquidación; cálculo automático de indemnización moratoria (Art. 65) y sanción por cesantías no consignadas (solo se alertan); salario variable con promedio automático (se usa último salario + override manual).

---

## 2. Decisiones de diseño (con razones)

| # | Decisión | Razón |
|---|----------|-------|
| D1 | **Cubre todos los motivos** de terminación (renuncia, mutuo acuerdo, justa causa, sin justa causa, fin de contrato) | El admin elige; la indemnización se calcula solo en `sin_justa_causa`, 0 en los demás (con warning). |
| D2 | **Cálculo legal por períodos con fechas de corte** (no provisiones acumuladas) | Legalmente exacto. El admin ingresa `cesantias_cutoff` y `vacations_cutoff` (último disfrute) que el sistema no tiene. |
| D3 | **Tipo de contrato + fecha fin en el formulario** (no en `profiles`) | Cero cambios al schema de empleados; consistente con las fechas de corte. |
| D4 | **Base = último salario** de `salary_history` + override manual para variables | Correcto para salario fijo (mayoría); evita la complejidad de promediar variables. |
| D8 | **El motor propone los días proporcionales de vacaciones** (desde `vacations_cutoff`), editable | Punto de partida útil para el admin: 15 días hábiles/año proporcional al tiempo desde el último disfrute. El admin ajusta si tomó días sueltos. |
| D5 | **Tabla dedicada `liquidations`** + PDF | Una liquidación es un evento único por empleado, no encaja en `payroll_periods` (período-mensual-de-todos). |
| D6 | **Cifras leídas de `payroll_settings`** vigente a `termination_date` | SMMLV/auxilio/UVT nunca hardcoded; el motor mensual ya tiene la tabla 2026 con la reforma. |
| D7 | **Errors/warnings persistidos desde el inicio** (columnas jsonb) | Lección aprendida del motor mensual: no mostrar errores es un bug. |

---

## 3. Validación legal 2026 (verificada contra fuentes oficiales)

Verificado mayo 2026 contra el texto de la **Ley 2466 de 2025** (Función Pública), Art. 64 y 192 CST (leyes.co), Decretos 1469/1470 de 2025, y fuentes especializadas (Gerencie, Actualícese, Buk).

**Cifras 2026** (en `payroll_settings`, NO hardcodear): SMMLV $1.750.905 · Auxilio transporte $249.095 (aplica hasta 2 SMMLV) · UVT $52.374 · Umbral indemnización 10 SMMLV = $17.509.050 · Salario integral ≥13 SMMLV = $22.761.765.

**La reforma Ley 2466/2025 NO modificó** cesantías, intereses, prima, vacaciones ni la indemnización del Art. 64. Cambió recargos/jornada (insumos de la nómina mensual, ya parametrizados en `payroll_settings` por fecha). Por tanto las fórmulas de liquidación de §5 son estables.

---

## 4. Schema (migración 052)

### `liquidations`
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid NOT NULL FK organizations | multi-tenant (incluir SIEMPRE en inserts) |
| `employee_id` | uuid NOT NULL FK profiles | |
| `termination_date` | date NOT NULL | |
| `reason` | text NOT NULL CHECK IN ('renuncia','mutuo_acuerdo','justa_causa','sin_justa_causa','fin_contrato') | |
| `contract_kind` | text NOT NULL CHECK IN ('indefinido','fijo','obra_labor') | |
| `contract_end_date` | date NULL | requerido si `fijo`/`obra_labor` (validado en motor) |
| `hire_date` | date NOT NULL | default `profiles.hire_date`, editable |
| `cesantias_cutoff` | date NOT NULL | desde cuándo se deben cesantías |
| `vacations_cutoff` | date NOT NULL | último disfrute de vacaciones (o `hire_date` si nunca tomó) |
| `vacation_days_pending` | numeric(6,2) NOT NULL DEFAULT 0 | días finales usados; prefill = proporcional desde `vacations_cutoff`, editable |
| `base_salary` | numeric(12,2) NOT NULL | último salario; editable |
| `status` | text NOT NULL CHECK IN ('draft','approved','paid') DEFAULT 'draft' | |
| `compute_errors` | jsonb NOT NULL DEFAULT '[]' | |
| `compute_warnings` | jsonb NOT NULL DEFAULT '[]' | |
| `approved_at/by`, `paid_at/by` | timestamptz/uuid NULL | auditoría |
| `created_at` | timestamptz DEFAULT now() | |

### `liquidation_items` (conceptos calculados, patrón `payroll_entries`)
`id` · `liquidation_id` uuid FK ON DELETE CASCADE · `organization_id` uuid NOT NULL · `concept` text CHECK IN ('cesantias','cesantias_interest','prima','vacaciones','indemnizacion','otro') · `base` numeric · `days` int · `amount` numeric NOT NULL · `description` text · `is_manual_override` boolean DEFAULT false · `created_at`.

### RLS (admin-scoped, mismo patrón payroll)
Ambas tablas: `is_super_admin() OR (organization_id = get_user_org_id() AND get_user_role() IN ('admin','manager'))` para ALL; SELECT incluye empleado viendo lo propio si se requiere (V1: solo admin/manager). Trigger: `status='paid'` no vuelve a `draft`.

---

## 5. Motor de cálculo — `src/lib/liquidacion-engine.ts`

Función pura `computeLiquidacion(input): LiquidacionOutput`. Lee SMMLV/auxilio del `payroll_settings` vigente a `termination_date`. Convención **360 días** (año comercial, mes 30 días).

```ts
interface LiquidacionInput {
  termination_date: string; hire_date: string;
  reason: 'renuncia'|'mutuo_acuerdo'|'justa_causa'|'sin_justa_causa'|'fin_contrato';
  contract_kind: 'indefinido'|'fijo'|'obra_labor';
  contract_end_date: string | null;
  cesantias_cutoff: string; vacations_cutoff: string;
  vacation_days_pending: number; // valor final (admin); el form lo prefill con suggestVacationDays()
  base_salary: number; is_integral_salary: boolean;
  settings: PayrollSettings; // vigente a termination_date (smmlv, aux_transport)
}
interface LiquidacionOutput { items: ComputedItem[]; total: number; errors: string[]; warnings: string[]; }

// Helper puro reutilizado por el form para prefill (editable):
// suggestVacationDays(vacations_cutoff, termination_date) = díasEntre(cutoff, term) × 15 / 360
export function suggestVacationDays(cutoff: string, termination: string): number;
```

### Bases salariales (DIFERENCIADAS — error legal si se unifican)
- **Base CON auxilio** (cesantías, prima): `base_salary + (base_salary ≤ 2×SMMLV ? aux_transport : 0)`.
- **Base SIN auxilio** (vacaciones, indemnización): `base_salary`.
- **Salario integral** (`is_integral_salary`): no genera cesantías/prima (van incluidas); vacaciones sí; base indemnización = 100% del integral.

### Fórmulas
1. **Cesantías** = `baseConAux × díasEntre(cesantias_cutoff, termination_date) / 360`
2. **Intereses cesantías** = `cesantías × díasCesantías × 0.12 / 360`
3. **Prima** = `baseConAux × díasDelSemestreActual / 360` (semestre: ene–jun o jul–dic que contiene `termination_date`, desde el inicio del semestre o `hire_date` si entró después)
4. **Vacaciones** = `(baseSinAux / 30) × vacation_days_pending`. El form prefill `vacation_days_pending` con `suggestVacationDays(vacations_cutoff, termination_date)` = `díasEntre × 15 / 360` (15 días hábiles/año proporcional), editable por el admin.
5. **Indemnización** (solo `sin_justa_causa`; demás motivos → 0 + warning):
   - **Indefinido, base < 10×SMMLV:** 30 días por el 1er año + 20 días por año adicional, **proporcional por fracción** en la parte adicional.
   - **Indefinido, base ≥ 10×SMMLV:** 20 días + 15 por año adicional (proporcional).
   - **Fijo:** salarios del tiempo que falta hasta `contract_end_date` (`díasRestantes/30 × baseSinAux`).
   - **Obra/labor:** tiempo restante estimado, **mínimo 15 días**.
   - Valor del día indemnización = `baseSinAux / 30`.

### Errors (bloquean aprobar) vs Warnings
**Errors:** sin `salary_history`/`base_salary`; `contract_kind` fijo/obra o `reason=fin_contrato` sin `contract_end_date`; `termination_date < hire_date`; `cesantias_cutoff > termination_date`; `vacations_cutoff > termination_date`; `vacation_days_pending < 0`.
**Warnings:** indemnización 0 por motivo ≠ sin_justa_causa; recordatorio de revisar indemnización moratoria (Art. 65) si el pago se demora; recordatorio de cesantías consignadas a fondo (descontar si ya se consignaron).

### Persistencia (builder `assembleLiquidacion`)
Async: lee settings vigente, llama `computeLiquidacion`, inserta `liquidation_items` (con `organization_id`), actualiza `liquidations.compute_errors/warnings`. Captura errores de insert → `errors[]` (lección del motor mensual). Recalcular preserva items con `is_manual_override=true`.

---

## 6. UI

- **`/nomina/liquidaciones`** (admin): lista (empleado, fecha terminación, motivo badge, total, estado) + filtros (año, estado) + "Nueva liquidación".
- **Modal "Nueva liquidación"**: select empleado → prellena `hire_date` + `base_salary` (editables) → motivo, `contract_kind` (+ `contract_end_date` condicional), `cesantias_cutoff`, `vacations_cutoff` → al ingresar `vacations_cutoff` el form prefill `vacation_days_pending` con `suggestVacationDays(...)` (editable) → "Calcular preview" → crea `draft` + redirige.
- **`/nomina/liquidaciones/[id]`**: desglose por concepto (base/días/monto), total, panel errores/warnings (patrón período), tab ajustes manuales, botones por estado (`draft`: recalcular/aprobar [bloqueado con errores]; `approved`: reabrir/marcar pagado; `paid`: solo lectura), "Descargar PDF".
- **PDF** (`jspdf`/`jspdf-autotable`): membrete org, datos empleado, período laborado, tabla de conceptos, total, espacio de firma.
- **Sidebar**: item "Liquidaciones" bajo grupo Nómina (admin/super_admin).

---

## 7. Edge cases

| Caso | Manejo |
|---|---|
| Empleado sin salario vigente | Error; aprobar bloqueado |
| Fijo/obra/fin_contrato sin `contract_end_date` | Error |
| `termination_date < hire_date` o `cesantias_cutoff > termination_date` | Error |
| Salario integral | Rama: sin cesantías/prima; vacaciones sí; indemnización base 100% |
| Liquidación que cruza cambio de settings (jul-2026) | Usa settings vigente a `termination_date` (fecha puntual, sin multi-period split) |
| Motivo ≠ sin_justa_causa | Indemnización 0 + warning |
| Reapertura con overrides | `is_manual_override=true` preservado en recalc |
| Cesantías ya consignadas a fondo | Warning (admin descuenta con override; V1 no lo automatiza) |

---

## 8. Testing

**Vitest** (`src/lib/liquidacion-engine.test.ts`) con vectores del research:
- Indemnización: indefinido <10 SMMLV (30+20 proporcional), indefinido ≥10 SMMLV (20+15), fijo (tiempo restante), obra (mínimo 15 días), renuncia (0).
- Cesantías/intereses/prima/vacaciones proporcionales con base correcta (con/sin auxilio).
- `suggestVacationDays`: 1 año completo → 15 días; medio año → 7.5; cutoff = termination → 0.
- Salario integral (sin cesantías/prima).
- Errors: sin salario, fechas inválidas, contract_end_date faltante.

**SQL tests** (`supabase/tests/payroll/`): RLS admin-scoped (org A no ve liquidaciones de org B); `liquidation_paid_terminal` (paid→draft bloqueado).

---

## 9. Resumen de deliverables

**Migración (1):** `052_liquidations.sql` — 2 tablas + RLS + trigger terminal + índices.
**Archivos nuevos (~9):** `liquidacion-engine.ts` + test, `liquidacion-builder.ts`, `liquidacion-pdf.ts`, `liquidation-form.tsx`, `liquidation-detail.tsx` (+ items/overrides), `/nomina/liquidaciones/page.tsx`, `/nomina/liquidaciones/[id]/page.tsx`.
**Modificar (~3):** `types.ts` (Liquidation, LiquidationItem, LiquidacionInput/Output), `sidebar.tsx` (item), `database.types.ts` (regen).
**SQL tests (2).**

---

**Spec FIN — verificada contra regulación colombiana 2026.**
