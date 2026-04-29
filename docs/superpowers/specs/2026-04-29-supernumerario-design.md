# Supernumerario (empleado floater) — diseño

**Fecha:** 2026-04-29
**Scope:** Concepto de empleado que cubre múltiples posiciones para reducir extras forzados. Usado por el algoritmo solo cuando los primarios no alcanzan. Fase A: turno completo. Fase B (futura): cobertura parcial 2-4h.

## 1. Motivación

Caso real verificado: Recepción tiene 2 empleados (Katherine y Beatriz) que cubren 4+4 domingos cada una en abril 2026. Saturación clara. Un supernumerario que pueda cubrir Recepción algunos domingos los descarga.

## 2. Modelo

**Atributo del empleado** (no posición ni contract type):
- `profiles.is_floater BOOLEAN DEFAULT false` (mig 035).
- Posiciones que puede cubrir: tabla existente `employee_secondary_positions` (ya vincula employee → position[]).

Ejemplo: Juan = floater, primary_position = `Aux. Farmacia`, secondary = `[Aux. Recepción, Coordinador Compras]`. El motor lo ve como elegible para los 3 conjuntos de slots.

## 3. Prioridad en el motor

Modificar `generateSchedule` (`src/lib/schedule-generator.ts`) para tener **3 pases** (en vez de 2):

```
Para cada slot:
  Pase 1: candidatos primarios (employee.position_id == slot.positionId, NO floaters)
    → respetan caps y inviolables.

  Pase 1.5 (NUEVO): floaters elegibles (is_floater=true Y la posición está en sus secondaries)
    → respetan caps y inviolables.

  Pase 2 (extras): todos los candidatos (primarios + floaters), permitiendo overrides de caps blandos.
```

Razón: floaters son "amortiguadores" — solo entran cuando los primarios saturan. Si Pase 1 cubre el slot con un primario, el floater queda libre para otro día. Esto maximiza la cobertura sin recurrir a extras.

**Equidad floater**: el scoring trata al floater como un primario más en su Pase. Las penalizaciones por rolling rollups balancean entre múltiples floaters si los hay.

## 4. UI

**Form `/employees`** (modificar `src/components/employees/employee-form.tsx` o equivalente):

```
... (campos actuales: nombre, apellido, email, posición primaria, etc.)

☑ Supernumerario (cubre múltiples posiciones)
   Solo se asigna cuando los empleados primarios no alcanzan.

   [si ON, mostrar:]
   Posiciones que puede cubrir:
   ┌─ Departamento Farmacia ─────────┐
   │ ☐ Aux. Administrativo (Farmacia) │
   └──────────────────────────────────┘
   ┌─ Departamento Recepción ────────┐
   │ ☑ Aux. Administrativo (Recepción)│
   └──────────────────────────────────┘
   ┌─ Departamento Compras ──────────┐
   │ ☑ Coordinador de Compras         │
   └──────────────────────────────────┘
```

NOTA: la posición primaria no se incluye en el multi-select (es la default). Solo las "extras" que cubre.

**Tabla `/employees`**: agregar badge "Supernumerario" (azul) en la fila de cada floater, al lado del nombre.

## 5. Migración 035

```sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_floater BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.is_floater IS
  'Empleado supernumerario: el motor lo usa solo cuando los empleados primarios saturan. Sus secondary_positions definen qué cubre.';
```

`employee_secondary_positions` ya existe — sin cambios.

## 6. Tipo TS

```ts
export interface Profile {
  // ... campos existentes
  is_floater: boolean;
}
```

## 7. Tests

`schedule-generator.test.ts` — 2 tests nuevos:

1. **Floater no se usa si hay primario disponible**: 1 slot Aux. Farmacia, 2 empleados — uno primario (Aux. Farmacia) y uno floater con secondary Farmacia. Verificar que se elige el primario.
2. **Floater se usa cuando primario falla por cap**: 1 slot, primario tiene 6 días consecutivos (cap inviolable), floater elegible → floater asignado.

## 8. Entregables

1. Migración 035 + tipo TS.
2. Motor con Pase 1.5.
3. Form `/employees` con switch + multi-pick de secundarias agrupadas por departamento.
4. Persistencia: insert/delete en `employee_secondary_positions` desde el form.
5. Badge en la tabla de empleados.
6. CLAUDE.md.

## 9. No incluido (Fase B)

- Cobertura parcial 2-4h: requiere plantillas de duración variable. Diferido hasta que confirmemos demanda.
- Floater multi-sede (cubre varias sedes): hoy `profiles.location_id` es único. Si más adelante se necesita, otro spec.
- Reportes de utilización del floater (% de turnos que cubrió, ahorros estimados en extras): nice-to-have.
