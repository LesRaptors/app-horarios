# Employee-level Rest Rules — Spec

## Problema

Las reglas de descanso (`weekend_rotation`, `work_cycle`, etc.) viven en `contract_rest_rules`, asociadas al `contract_type`. Cuando varios empleados comparten el mismo contract_type (ej. todos "Full-time"), reciben la misma regla y descansan en sincro. Esto rompe la rotación operativa: si Valentina y Sara son ambas Full-time con regla "findes alternados", o ambas descansan o ambas trabajan según el offset compartido del contract.

Operación real necesita: **rotación entre individuos** del mismo contract — Valentina descansa findes pares, Sara descansa findes impares, supernumerario cubre lo que toque.

## Solución

Permitir reglas de descanso a nivel **empleado**, además de contract_type. Tabla nueva `employee_rest_rules` paralela a `contract_rest_rules`.

**Semántica de override:** si el empleado tiene 1+ reglas individuales, esas se usan **en lugar de** las del contract_type (no se suman). Si el empleado no tiene reglas, fallback al contract_type.

**Razón:** predecible — un humano editando reglas en `/employees` espera que lo que ve allí sea lo que aplica, sin tener que revisar también el contract.

## Cambios

1. **Schema:** tabla `employee_rest_rules` con misma forma que `contract_rest_rules` pero con `employee_id` (FK profiles ON DELETE CASCADE) en vez de `contract_type_id`.
2. **Tipos:** nuevo `EmployeeRestRule` paralelo a `RestRule`.
3. **Motor (`schedule-generator.ts`):** consultar primero `restRulesByEmployee[employeeId]`; si vacío, fallback a `restRulesByContract[contract_type_id]`.
4. **Health (`schedule-health.ts`):** mismo fallback al detectar restDays.
5. **UI:** componente `<EmployeeRestRulesEditor>` que reusa `<RestRuleCards>` con shape adaptado; integrado en form de edit/invite empleado.
6. **CRUD:** delete-all + insert-new al guardar (mismo patrón que `employee_secondary_positions`).

## No-objetivos

- No aplicamos reglas globales (location/sede). Solo empleado u organización-vía-contract.
- No agregamos UI para "merge" de reglas (override es suficiente).
- No deprecamos `contract_rest_rules` — sigue funcionando como default.

## Caso de prueba operativo

- Valentina Celis: `weekend_rotation` cada 2 semanas, offset=0, sat+sun.
- Sara Isabel: `weekend_rotation` cada 2 semanas, offset=1, sat+sun.
- Resultado esperado: nunca descansan el mismo finde, supernumerario cubre el slot de la que descansa.
