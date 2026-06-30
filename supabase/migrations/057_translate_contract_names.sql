-- Migration 057: Traducir nombres de tipos de contrato al español
--
-- ¿Qué hace?
--   - Renombra los tipos de contrato sembrados en inglés (migración 014).
--   - No toca 'Fin de semana' ni 'Sin definir' (ya en español; 'Sin definir'
--     se compara por nombre en la UI y debe permanecer estable).
--
-- ¿Por qué?
--   La app es para mercado latinoamericano; no debe mostrar inglés.

BEGIN;

UPDATE contract_types SET name = 'Tiempo completo'            WHERE name = 'Full-time';
UPDATE contract_types SET name = 'Medio tiempo'               WHERE name = 'Part-time';
UPDATE contract_types SET name = 'Asistencial tiempo completo' WHERE name = 'Asistencial Full-time';

COMMIT;
