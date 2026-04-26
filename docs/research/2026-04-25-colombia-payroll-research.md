# Investigación: Liquidación Mensual de Nómina en Colombia — 2026

**Fecha de elaboración:** 25 de abril de 2026  
**Alcance:** Marco legal vigente 2026, conceptos de liquidación mensual, recargos, prestaciones, casos especiales y casos prácticos. Diseñado para servir de base al motor de cálculo de nómina de App Horarios.

---

## 1. RESUMEN EJECUTIVO

Los 10 puntos críticos para el diseño del motor:

1. **Dos "mitades" de año con divisores distintos.** Desde el 15 de julio de 2026 la jornada máxima baja de 44 a 42 horas semanales (Ley 2101/2021, última reducción). El divisor salarial cambia de **220 h/mes a 210 h/mes**, por lo que el valor de la hora ordinaria sube de $7.959 a $8.338 (salario mínimo). El sistema debe saber en qué "semestre de jornada" cae cada entrada.

2. **El recargo nocturno parte desde las 7:00 p.m., no desde las 9:00 p.m.** La Ley 2466 de 2025 (vigente desde el 25 de diciembre de 2025) amplió la franja nocturna a 19:00–06:00. El porcentaje (35 %) no cambió, pero impacta a todos los turnos de tarde.

3. **El recargo dominical/festivo sube en julio 2026.** Progresión: 80 % hasta el 30 de junio de 2026 → **90 % desde el 1 de julio de 2026** → 100 % desde el 1 de julio de 2027 (Ley 2466/2025). Combinado con el cambio de jornada, julio 2026 tiene doble impacto en el costo.

4. **Los recargos se suman sobre la hora ordinaria** (no se multiplican entre sí). Nocturno dominical ordinario = 35 % + 90 % = 125 % de recargo, valor total = hora × 2,25.

5. **El auxilio de transporte se incluye en la base de prima y cesantías, pero NO en seguridad social ni parafiscales.** $249.095 para 2026; solo para empleados con salario ≤ 2 SMMLV ($3.501.810).

6. **Exoneración de SENA (2 %) e ICBF (3 %) para trabajadores con salario < 10 SMMLV** (Ley 1607/2012, art. 114-1 ET). Las Cajas de Compensación (4 %) siempre se pagan. Afecta a la mayoría de los 50–200 empleados del cliente tipo.

7. **Salario integral mínimo: $22.761.765 (= 13 SMMLV).** Base de cotización = 70 % del integral. Incluye prestaciones, pero excluye vacaciones. Recargos sí aplican sobre el factor salarial.

8. **La incapacidad por enfermedad general no suspende el contrato.** El empleador paga los 2 primeros días al 66,67 %; la EPS paga desde el día 3 (66,67 % días 3–90; 50 % días 91–180). La ARL paga incapacidad laboral al 100 % desde el día 1.

9. **Nómina electrónica es obligatoria (DIAN).** Resolución Unificada 000227 de 2025. Los conceptos del documento XML deben coincidir con los conceptos del motor de cálculo (devengados, deducciones, totales).

10. **Dos puntos de corte anuales para prestaciones.** Prima: 30 de junio y 20 de diciembre. Cesantías: depositar antes del 14 de febrero del año siguiente. El sistema debe provisionar mensualmente y liquidar en las fechas de corte.

---

## 2. MARCO LEGAL VIGENTE 2026

### 2.1 Código Sustantivo del Trabajo (CST)

El Código Sustantivo del Trabajo, adoptado por el Decreto Ley 2663 de 1950, es la norma base de las relaciones laborales colombianas. Los artículos más relevantes para el motor de nómina son: [^1]

| Artículos | Tema |
|-----------|------|
| 127–129 | Definición de salario y elementos no salariales |
| 132 | Salario integral |
| 158–164 | Jornada ordinaria, máxima y distribución |
| 167A | Tope de horas extras (2 h/día, 12 h/semana) |
| 168 | Trabajo nocturno y recargo 35 % |
| 171–174 | Descanso dominical y festivo obligatorio |
| 179–181 | Recargo dominical/festivo, habitual vs. ocasional, descanso compensatorio |
| 186–192 | Vacaciones — 15 días hábiles por año de servicios |
| 249–253 | Auxilio de cesantías — depósito anual fondo |
| 306–307 | Prima de servicios — 30 días/año en dos pagos |

### 2.2 Ley 2101 de 2021 — Reducción gradual de jornada [^2]

**Objeto:** reducir la jornada máxima de 48 h semanales a 42 h, de forma gradual, sin reducir salario ni prestaciones.

| Fecha de vigencia | Jornada máxima semanal |
|-------------------|------------------------|
| Hasta 15 jul 2023 | 48 h |
| 16 jul 2023 | 47 h |
| 16 jul 2024 | 46 h |
| 15 jul 2025 | 44 h |
| **15 jul 2026** | **42 h** (definitiva) |

**Implicación para 2026:** el año tiene dos mitades con jornadas distintas:
- 1 enero – 14 julio 2026: máximo 44 h/semana → divisor de **220 h/mes**
- 15 julio – 31 diciembre 2026: máximo 42 h/semana → divisor de **210 h/mes**

El Ministerio del Trabajo confirmó que la reducción no afecta el salario ni el valor de la hora ordinaria a la baja —de hecho, el valor de la hora sube al bajar el divisor. [^3]

### 2.3 Ley 2466 de 2025 — Reforma laboral [^4]

Sancionada el 25 de junio de 2025 (Diario Oficial 53.160). Sus disposiciones más relevantes para nómina:

**a) Nuevo horario nocturno (Art. 10, vigente desde 25 dic 2025):**  
La jornada diurna es 6:00 a.m.–7:00 p.m. El trabajo nocturno se define entre las **7:00 p.m. y las 6:00 a.m.** (antes era desde las 9:00 p.m.). El recargo del 35 % sobre la hora ordinaria se mantiene pero ahora aplica a dos horas adicionales por jornada.

**b) Recargo dominical/festivo escalonado (vigente progresivamente):**

| Período | % de recargo sobre hora ordinaria |
|---------|----------------------------------|
| 1 jul 2025 – 30 jun 2026 | 80 % |
| 1 jul 2026 – 30 jun 2027 | **90 %** |
| desde 1 jul 2027 | 100 % |

**c) Eliminación de autorización ministerial para horas extras:**  
La Ley 2466/2025 suprimió la obligación de solicitar permiso al Ministerio del Trabajo para acordar horas extra. Solo persiste el límite legal de 2 h/día y 12 h/semana.

**d) Horas extras en domingos/festivos:** los recargos se suman aritméticamente (ver sección 3.3).

### 2.4 Decreto 1072 de 2015 (DUR Trabajo) [^5]

Decreto Único Reglamentario del sector Trabajo. Compila todas las normas reglamentarias laborales. Art. 2.2.4.3.5 establece la tabla de cotización ARL por clases de riesgo.

### 2.5 Ley 50 de 1990 [^6]

Reforma el CST. Principales aportes para nómina: artículo 132 (salario integral, factor prestacional mínimo 30 %); depósito de cesantías en fondos (antes las retenía el empleador); prima de servicios semestral.

### 2.6 Decreto 0159 de 2026 — Fijación transitoria del SMMLV [^7]

Ante litigio en el Consejo de Estado, el Gobierno expidió el 19 de febrero de 2026 este decreto transitorio, que confirma el SMMLV en **$1.750.905** (Decretos 1469 y 1470 del 29 de diciembre de 2025). El aumento es del ~23 % respecto a 2025.

### 2.7 Decretos 1469 y 1470 de 2025 — SMMLV y Auxilio de Transporte [^8]

- **SMMLV 2026:** $1.750.905  
- **Auxilio de Transporte 2026:** $249.095  
- Vigencia desde el 1 de enero de 2026.

---

## 3. DEFINICIÓN Y CÁLCULO DEL VALOR DE LA HORA ORDINARIA

### 3.1 Fórmula general

```
Valor hora ordinaria = Salario mensual ÷ Horas mensuales ordinarias
```

**¿Qué se entiende por "horas mensuales ordinarias"?**  
El Ministerio del Trabajo aplica la fórmula: [^9]

```
Horas/mes = (Jornada semanal máxima ÷ 6 días laborables) × 30 días
```

| Período | Jornada semanal | Horas/mes | Valor hora (SMMLV $1.750.905) |
|---------|----------------|-----------|-------------------------------|
| 1 ene – 14 jul 2026 | 44 h | **220 h** | **$7.959** |
| 15 jul – 31 dic 2026 | 42 h | **210 h** | **$8.338** |

> **Nota de diseño:** el divisor 220 (o 210) es una convención para salarios mensuales. No varía por mes según días hábiles reales del mes calendario. El divisor es fijo por semestre de jornada.

Convenciones históricas que siguen usando algunos empleadores:
- 240 h/mes: proveniente de las antiguas 48 h/semana × 5 semanas (hoy obsoleto para nuevos contratos)
- 230 h/mes: uso informal, no tiene base reglamentaria vigente
- **220 h/mes** (ene–jul 2026) y **210 h/mes** (jul–dic 2026): convención correcta según Ley 2101/2021

### 3.2 Casos especiales del divisor

**Salario integral:** la hora ordinaria se calcula sobre el factor salarial (70 % del integral), pero los recargos se calculan igualmente sobre el valor de la hora ordinaria que resulte.

**Trabajador a tiempo parcial:** el salario es proporcional a las horas pactadas y el divisor se ajusta a esas horas. La UGPP publicó en 2026 el ABC de trabajadores a tiempo parcial con pautas específicas. [^10]

**Aprendiz SENA:** no es contrato de trabajo sino contrato de aprendizaje. No aplica el divisor de horas para recargos ordinarios.

---

## 4. RECARGOS Y MULTIPLICADORES

### 4.1 Tabla maestra de recargos 2026

> **Base:** la hora ordinaria del trabajador = HO = Salario mensual ÷ horas/mes  
> **Método de cálculo:** los porcentajes de recargo se suman al 100 % base, luego se multiplica por HO.  
> Ejemplo: trabajo extra nocturno = HO × (1 + 0,75) = HO × 1,75

#### Período 1 enero – 30 junio 2026 (jornada 44 h; nocturno desde 7 pm; dominical 80 %)

| Concepto | Recargo | Factor | Base legal |
|----------|---------|--------|------------|
| Hora ordinaria diurna | — | × 1,00 | Art. 158 CST |
| **Recargo nocturno** (7 pm–6 am) | +35 % | × 1,35 | Art. 168 CST + Ley 2466/2025 art. 10 |
| **Recargo dominical/festivo** | +80 % | × 1,80 | Ley 2466/2025 (progresivo) |
| Recargo dominical/festivo nocturno | +35 % + 80 % | × 2,15 | Suma aritmética |
| **Hora extra diurna** | +25 % | × 1,25 | Art. 168 CST |
| **Hora extra nocturna** | +75 % | × 1,75 | Art. 168 CST |
| Hora extra diurna dominical/festiva | +25 % + 80 % | × 2,05 | Suma aritmética |
| Hora extra nocturna dominical/festiva | +75 % + 80 % + 35 % | × 2,90 | Suma aritmética |

#### Período 1 julio – 14 julio 2026 (jornada 44 h; nocturno desde 7 pm; dominical 90 %)

| Concepto | Factor |
|----------|--------|
| Recargo dominical/festivo | × 1,90 |
| Recargo dominical/festivo nocturno | × 2,25 |
| Hora extra diurna dominical/festiva | × 2,15 |
| Hora extra nocturna dominical/festiva | × 3,00 |
| (demás igual al semestre anterior) | |

#### Período 15 julio – 31 diciembre 2026 (jornada 42 h; nocturno desde 7 pm; dominical 90 %)

> Los factores son iguales a los del período anterior, pero HO sube a $8.338 (SMMLV), lo que eleva todos los valores absolutos ~4,8 %.

### 4.2 Valores en pesos — Salario mínimo 2026

#### Primer semestre (HO = $7.959)

| Concepto | Valor por hora |
|----------|---------------|
| Hora ordinaria | $7.959 |
| Recargo nocturno | $2.786 adicional → total $10.745 |
| Recargo dominical/festivo | $6.367 adicional → total $14.326 |
| Hora extra diurna | $9.948 |
| Hora extra nocturna | $13.928 |
| Hora extra diurna dominical | $16.315 |
| Hora extra nocturna dominical | $23.084 |

#### Segundo semestre desde jul 15 (HO = $8.338)

| Concepto | Valor por hora |
|----------|---------------|
| Hora ordinaria | $8.338 |
| Recargo nocturno | $2.918 adicional → total $11.256 |
| Recargo dominical/festivo (90 %) | $7.504 adicional → total $15.842 |
| Hora extra diurna | $10.423 |
| Hora extra nocturna | $14.592 |
| Hora extra diurna dominical | $17.510 |
| Hora extra nocturna dominical | $24.180 |

### 4.3 Reglas y límites

- **Tope semanal de horas extra:** 2 h/día y máximo **12 h/semana** (art. 167A CST; ratificado por Ley 2466/2025). [^11]
- **Registro obligatorio:** el empleador debe llevar registro detallado de cada hora extra indicando si es diurna o nocturna (Ley 2466/2025).
- **Domingo habitual vs. ocasional:** si el trabajador labora 3 o más domingos al mes (habitual), tiene derecho al recargo + descanso compensatorio remunerado (art. 181 CST). Si labora 1–2 domingos (ocasional), elige entre compensatorio monetario o descanso (art. 180 CST). [^12]

---

## 5. DÍAS HÁBILES Y FESTIVOS DEL MES

### 5.1 Festivos nacionales 2026

Colombia tiene **18 días festivos** en 2026 bajo la Ley 51 de 1983 (Ley Emiliani). Once caen en lunes. Lista completa: [^13]

| N.° | Fecha | Festivo |
|----|-------|---------|
| 1 | 1 ene | Año Nuevo |
| 2 | 12 ene | Día de los Reyes Magos (lun) |
| 3 | 23 mar | Día de San José (lun) |
| 4 | 2 abr | Jueves Santo |
| 5 | 3 abr | Viernes Santo |
| 6 | 1 may | Día del Trabajo |
| 7 | 18 may | Ascensión del Señor (lun) |
| 8 | 8 jun | Corpus Christi (lun) |
| 9 | 15 jun | Sagrado Corazón de Jesús (lun) |
| 10 | 20 jul | Independencia |
| 11 | 7 ago | Batalla de Boyacá |
| 12 | 17 ago | Asunción de la Virgen (lun) |
| 13 | 12 oct | Día de la Diversidad Étnica (lun) |
| 14 | 2 nov | Todos los Santos (lun) |
| 15 | 16 nov | Independencia de Cartagena (lun) |
| 16 | 8 dic | Inmaculada Concepción |
| 17 | 25 dic | Navidad |
| 18 | (falta uno — ver nota) | |

> **Nota:** distintas fuentes listan 17 o 18 festivos para 2026; la diferencia suele ser el festivo de Jueves/Viernes Santos versus el conteo de algunos festivos religiosos trasladados. La app debe usar el calendario oficial precargado (ya implementado en la tabla `holidays`).

### 5.2 Sábado como día hábil

En Colombia el sábado es día hábil en la semana ordinaria de trabajo si la jornada se distribuye en 6 días (lun–sáb). En ese caso, el sábado no genera recargo dominical pero sí puede generar recargo nocturno después de las 7 p.m.

### 5.3 Festivos de sede (por empresa)

El empleador puede establecer festivos adicionales por convenio colectivo o pacto laboral, que se sumarían al calendario nacional. La app ya tiene la tabla `holidays` con soporte de `location_id` para festivos por sede. [^14]

### 5.4 ¿Cambia el divisor salarial por días hábiles del mes?

**No.** El divisor (220 h o 210 h) es fijo para todos los meses del semestre de jornada correspondiente, independientemente de cuántos días hábiles o festivos tenga ese mes específico. Lo que varía es el número de horas efectivamente trabajadas (y remuneradas) según las entradas del horario.

---

## 6. AUSENCIAS QUE AFECTAN LA LIQUIDACIÓN

### 6.1 Incapacidad por enfermedad general (EPS)

| Período | Quién paga | % del IBC |
|---------|-----------|-----------|
| Días 1–2 | **Empleador** | 66,67 % |
| Días 3–90 | EPS | 66,67 % |
| Días 91–180 | EPS | 50 % |
| >180 días | Fondo de Pensiones o EPS (prorroga) | — |

El empleador puede adelantar el pago y luego recobrar a la EPS. [^15] El salario mínimo fija el piso: ninguna incapacidad puede ser inferior a un SMMLV proporcional. Durante la incapacidad se siguen causando aportes a salud, pensión y ARL (base = valor de la incapacidad reconocida).

> **Laguna identificada:** si el empleador no adelanta (práctica en algunas empresas pequeñas), la app necesita marcar si ese período se excluye del devengado para efectos de parafiscales.

### 6.2 Incapacidad por accidente de trabajo (ARL)

- La ARL paga desde el **primer día** al **100 % del IBC**. [^16]
- El empleador paga el día del accidente.
- El contrato no se suspende; continúan los aportes a seguridad social.

### 6.3 Licencia de maternidad

- **Duración:** 18 semanas (126 días calendario) — Ley 2114 de 2021. [^17]
- **Remuneración:** 100 % del salario, pagada inicialmente por el empleador, reembolsada por la EPS.
- **Requisito EPS:** haber cotizado las semanas mínimas exigidas.
- La madre puede ceder hasta 6 semanas al padre (siempre que tome mínimo 12 semanas).

### 6.4 Licencia de paternidad

- **Duración:** 2 semanas (14 días calendario). [^18]
- **Remuneración:** 100 % del salario, pagado por la EPS.
- El padre debe haber cotizado el mínimo de semanas.

### 6.5 Vacaciones

- **Derecho:** 15 días **hábiles** por cada año completo de servicios (art. 186 CST).
- **Base de liquidación:** salario ordinario vigente al inicio del disfrute, sin auxilio de transporte, sin horas extras ni dominicales/festivos (art. 192 CST).
- **Fórmula de provisión mensual:**  
  `Valor vacaciones = Salario base × (15 días hábiles / (días hábiles del año)) × (días trabajados en el mes / días hábiles del mes)`  
  En la práctica se aproxima al 4,17 % del salario mensual para cómputos de costo.
- **Acumulación:** máximo 2 períodos; el trabajador debe disfrutar al menos 6 días hábiles continuos anualmente (art. 190 CST).

### 6.6 Permisos remunerados y no remunerados

No existe una ley que regule permisos remunerados con alcance general (más allá de licencias de luto, calamidad doméstica en algunos convenios y el permiso sindical). Cada empresa los regula en su reglamento interno o contrato. Los días no remunerados se descuentan del salario proporcional y reducen la base de cotización IBC.

### 6.7 Suspensión disciplinaria

Durante la suspensión no se causan salario ni prestaciones; sí continúa el contrato. El empleador puede descontar los días suspendidos proporcionalmente. Las cesantías y prima no se causan por los días de suspensión.

---

## 7. CONCEPTOS DE LA LIQUIDACIÓN MENSUAL

### 7.1 Devengados

| Concepto | Base de cálculo | Incluye auxilio transporte |
|----------|----------------|--------------------------|
| Salario básico | Según contrato | No |
| Auxilio de transporte | $249.095/mes (salario ≤ 2 SMMLV) | — |
| Horas extras | HO × factor × n.° horas | No |
| Recargos nocturnos | HO × 0,35 × horas nocturnas | No |
| Recargo dominical/festivo | HO × 0,80 (o 0,90) × horas dom./fest. | No |
| Comisiones y bonificaciones habituales | Pacto laboral | No |

### 7.2 Deducciones del trabajador

| Concepto | % | Base |
|----------|---|------|
| Salud (empleado) | 4 % | IBC (salario sin aux. transporte) |
| Pensión (empleado) | 4 % | IBC |
| Fondo solidaridad pensional | 1 % (salario >4 SMMLV); adicional >16 SMMLV | IBC |
| Retención en la fuente | Tabla art. 383 ET (ver sección 7.4) | Base gravable depurada |
| Libranzas / embargos | Según orden judicial o autorización | — |

### 7.3 Aportes patronales (costo del empleador)

| Concepto | % | Base |
|----------|---|------|
| Salud (empleador) | 8,5 % | IBC |
| Pensión (empleador) | 12 % | IBC |
| ARL | 0,522 %–6,960 % (según riesgo) | IBC |
| Caja de Compensación Familiar | 4 % | IBC |
| SENA | 2 % (exonerado si salario <10 SMMLV y persona jurídica) | IBC |
| ICBF | 3 % (exonerado si salario <10 SMMLV y persona jurídica) | IBC |
| Prima de servicios (provisión) | 8,33 % | Salario + auxilio transporte |
| Cesantías (provisión) | 8,33 % | Salario + auxilio transporte |
| Intereses sobre cesantías | 12 % anual / 1 % mensual | Sobre saldo cesantías |
| Vacaciones (provisión) | 4,17 % | Solo salario ordinario |

> **Exoneración parafiscales (Ley 1607/2012, art. 114-1 ET):** las personas jurídicas contribuyentes del impuesto de renta que tengan trabajadores con salario inferior a 10 SMMLV ($17.509.050 en 2026) están exoneradas de SENA e ICBF para esos empleados. [^19] Las personas naturales empleadoras solo quedan exoneradas si tienen 2 o más trabajadores. Las Cajas de Compensación (4 %) **nunca** tienen exoneración general.

### 7.4 Tabla de retención en la fuente por salarios 2026

UVT 2026 = $52.374 (Resolución DIAN 000238, 15 dic 2025). [^20]  
Umbral mínimo de retención: 95 UVT = $4.975.530 mensuales.

| Rango en UVT | Rango en COP | Tarifa marginal | Fórmula (resultado en UVT) |
|---|---|---|---|
| 0–95 | $0–$4.975.530 | 0 % | — |
| >95–150 | >$4.975.530–$7.856.100 | 19 % | (Base–95) × 19 % |
| >150–360 | >$7.856.100–$18.854.640 | 28 % | (Base–150) × 28 % + 10 UVT |
| >360–640 | >$18.854.640–$33.519.360 | 33 % | (Base–360) × 33 % + 69 UVT |
| >640–945 | >$33.519.360–$49.493.430 | 35 % | (Base–640) × 35 % + 162 UVT |
| >945–2.300 | >$49.493.430–$120.460.200 | 37 % | (Base–945) × 37 % + 268 UVT |
| >2.300 | >$120.460.200 | 39 % | (Base–2.300) × 39 % + 770 UVT |

**Cálculo de la base gravable:**
1. Salario bruto (incl. comisiones habituales).
2. Restar aportes obligatorios: salud 4 % + pensión 4 % + solidaridad si aplica.
3. Restar rentas exentas: 25 % del ingreso neto laboral (tope 240 UVT/mes).
4. Restar deducciones permitidas (intereses hipotecarios, salud prepagada, dependientes).
5. Aplicar límite: exenciones + deducciones ≤ 40 % del ingreso neto y ≤ 1.340 UVT anuales.
6. Convertir base a UVT y aplicar tabla.

---

## 8. CASOS ESPECIALES

### 8.1 Trabajador a tiempo parcial

El salario es proporcional a las horas pactadas respecto a la jornada máxima legal. Los aportes a seguridad social se liquidan con base en el IBC real, con un piso de un SMMLV proporcional a las horas pactadas. La UGPP publicó en febrero 2026 el ABC de tiempo parcial. [^10]

### 8.2 Salario integral

- Mínimo legal: **$22.761.765** (= 10 SMMLV + 30 % factor prestacional = 13 SMMLV).
- **Incluye:** todos los factores salariales + factor prestacional (prima, cesantías, intereses cesantías, recargos, horas extras...). [^21]
- **Excluye:** vacaciones (se pagan aparte).
- **Base de cotización:** 70 % del valor del salario integral (para salud, pensión, ARL y parafiscales).
- **Retención en la fuente:** sobre el 100 %.
- **Recargos y horas extras:** el factor prestacional del 30 % se entiende que los cubre; sin embargo, la jurisprudencia reconoce que si el trabajador labora horas extras adicionales más allá de lo que el integral compensa, puede reclamarlas. Se recomienda pactar expresamente en contrato.

### 8.3 Contrato a término fijo vs. indefinido

| Aspecto | Término fijo (≤3 años) | Término indefinido |
|---------|----------------------|-------------------|
| Notificación de no renovación | Con 30 días de antelación | No aplica |
| Prestaciones proporcionales al tiempo | Sí, al vencimiento | Sí, anualmente |
| Indemnización por despido sin justa causa | Salarios del período restante del contrato | 30 días si ≤1 año; 20 días adicionales por c/año >1 año |
| Prima y cesantías | Iguales, proporcionales | Iguales, proporcionales |

### 8.4 Aprendices SENA [^22]

El contrato de aprendizaje no es un contrato de trabajo (art. 30 Ley 789/2002). Los valores de apoyo de sostenimiento 2026:

| Etapa | Apoyo mensual |
|-------|--------------|
| Lectiva (teórica) | 75 % SMMLV = **$1.313.179** |
| Productiva (práctica) | 100 % SMMLV = **$1.750.905** |

No se pagan prestaciones sociales. El empleador aporta a salud y ARL. Con la Ley 2466/2025 se les reconocen cesantías y prima en la etapa productiva (cambio reciente — verificar reglamentación pendiente).

### 8.5 Servicios temporales (empresas de servicios temporales — EST)

El trabajador en misión tiene todos los derechos laborales iguales a los trabajadores directos de la empresa usuaria, incluyendo mismas condiciones de salario y prestaciones (art. 74–76 Ley 50/1990). La EST actúa como empleador para efectos de nómina.

---

## 9. EJEMPLOS NUMÉRICOS TRABAJADOS

### Ejemplo 1 — Trabajador mensual simple (sin recargos)

**Datos:**
- Cargo: auxiliar de servicios
- Salario: $1.750.905 (mínimo)
- Período: agosto 2026 (jornada 42 h/semana, HO = $8.338)
- Días trabajados: 30 (mes completo)
- Riesgo ARL: Clase I (0,522 %)
- Empresa: persona jurídica (exonerada SENA/ICBF para este empleado)

#### Devengado

| Concepto | Valor |
|----------|-------|
| Salario base | $1.750.905 |
| Auxilio de transporte | $249.095 |
| **Total devengado** | **$2.000.000** |

#### Deducciones empleado

| Concepto | Base | % | Valor |
|----------|------|---|-------|
| Salud | $1.750.905 | 4 % | $70.036 |
| Pensión | $1.750.905 | 4 % | $70.036 |
| **Total deducciones** | | | **$140.072** |

#### Neto a pagar al trabajador

$2.000.000 − $140.072 = **$1.859.928**

#### Costo total del empleador

| Concepto | Base | % | Valor |
|----------|------|---|-------|
| Salud (empleador) | $1.750.905 | 8,5 % | $148.827 |
| Pensión (empleador) | $1.750.905 | 12 % | $210.109 |
| ARL (clase I) | $1.750.905 | 0,522 % | $9.140 |
| Caja Compensación | $1.750.905 | 4 % | $70.036 |
| SENA | — | exonerado | $0 |
| ICBF | — | exonerado | $0 |
| Prima (provisión) | $2.000.000 | 8,33 % | $166.600 |
| Cesantías (provisión) | $2.000.000 | 8,33 % | $166.600 |
| Int. cesantías (provisión) | $1.750.905×8,33 % | 1 %/mes | $1.459 |
| Vacaciones (provisión) | $1.750.905 | 4,17 % | $73.013 |
| **Total aportes + prestaciones** | | | **$845.784** |

**Costo total del empleador** = $2.000.000 (salario+transporte pagados al empleado) + $845.784 (aportes) = **$2.845.784 / mes**

---

### Ejemplo 2 — Trabajador con recargos nocturnos y dominicales

**Datos:**
- Cargo: vigilante nocturno
- Salario base: $2.200.000/mes
- Período: octubre 2026 (segunda mitad del año, jornada 42 h/semana)
- HO = $2.200.000 ÷ 210 = **$10.476**
- Jornada habitual: lunes a sábado, 8 pm–4 am (8 h nocturnas)
- Trabajó 4 domingos en el mes (habitual → derecho a recargo + descanso compensatorio)
- Total horas en el mes: 22 turnos × 8 h = 176 h ordinarias nocturnas

Recargos:
- 176 h nocturnas (lun–sáb): recargo nocturno 35 %
- 4 domingos × 8 h = 32 h nocturnas dominicales: recargo nocturno 35 % + dominical 90 % = 125 %
- No hay horas extras (jornada de 42 h semanal, 8 h/turno no supera el límite)

#### Cálculo de recargos

| Concepto | Horas | Factor | Valor por hora | Total |
|----------|-------|--------|----------------|-------|
| Horas nocturnas (L–S) | 176 | × 1,35 | $10.476 × 1,35 = $14.143 | $2.489.168 |
| Horas nocturnas dominicales | 32 | × 2,25 | $10.476 × 2,25 = $23.571 | $754.272 |
| **Subtotal recargos** | | | | **$3.243.440** |

> Pero el salario base ya paga las horas ordinarias. El recargo es el **adicional** sobre lo ordinario, no el total:

Salario base $2.200.000 / 210 h × 208 h efectivas = $2.178.667 (horas ordinarias base)  
Recargo noche L–S = $10.476 × 0,35 × 176 h = $645.490  
Recargo noche dominical = $10.476 × (0,35 + 0,90) × 32 h = $418.624  

Total devengado = $2.200.000 (salario mes completo) + $645.490 + $418.624 = **$3.264.114**

**Nota:** como es trabajador dominical habitual (4 domingos), además de los recargos le corresponde 1 día compensatorio por cada domingo laborado = 4 días hábiles compensatorios en el mes siguiente (o pago monetario equivalente).

#### Deducciones empleado

| Concepto | Base (IBC) | % | Valor |
|----------|-----------|---|-------|
| Salud | $2.200.000 | 4 % | $88.000 |
| Pensión | $2.200.000 | 4 % | $88.000 |
| **Total deducciones** | | | **$176.000** |

**Neto a pagar:** $3.264.114 − $176.000 = **$3.088.114**

---

### Ejemplo 3 — Trabajador con incapacidad parcial del mes

**Datos:**
- Cargo: operario de planta
- Salario: $2.500.000/mes
- Período: mayo 2026 (jornada 44 h/semana, HO = $2.500.000 ÷ 220 = $11.364)
- Incapacidad por enfermedad general: del 8 al 22 de mayo = **15 días de incapacidad**
- Días de trabajo efectivo: 15 días (1–7 may + 23–30 may)
- Días del mes: 31

#### Días y responsabilidades

| Días incapacidad | Quién paga | % IBC | Valor diario (IBC $2.500.000/30) | Total |
|-----------------|-----------|-------|--------------------------------|-------|
| Días 1–2 (8–9 may) | Empleador | 66,67 % | $55.558 | $111.116 |
| Días 3–15 (10–22 may) | EPS | 66,67 % | $55.558 | $722.254 |

#### Devengado del mes

| Concepto | Cálculo | Valor |
|----------|---------|-------|
| Salario por 15 días trabajados | $2.500.000 × 15 / 30 | $1.250.000 |
| Incapacidad empleador (días 1–2) | $111.116 | $111.116 |
| Incapacidad EPS (días 3–15, adelantada por empleador para recobro) | $722.254 | $722.254 |
| Auxilio de transporte | Solo por días laborados: $249.095 × 15 / 30 | $124.548 |
| **Total devengado bruto** | | **$2.207.918** |

> El empleador luego recobra a la EPS $722.254.

#### IBC para aportes de seguridad social de mayo

La base de cotización durante incapacidad incluye el valor de la incapacidad reconocida: IBC = Salario 15 días + Incapacidades = $1.250.000 + $833.370 = $2.083.370 (proporcional).

#### Deducciones empleado

| Concepto | Base (IBC aprox.) | % | Valor |
|----------|------------------|---|-------|
| Salud | $2.083.370 | 4 % | $83.335 |
| Pensión | $2.083.370 | 4 % | $83.335 |
| **Total deducciones** | | | **$166.670** |

**Neto al empleado:** $2.207.918 − $166.670 = **$2.041.248**

---

## 10. SOFTWARE DE NÓMINA LÍDER EN COLOMBIA

Los principales sistemas utilizados por empresas de 50–200 empleados en Colombia son: [^23]

### 10.1 Panorama de mercado

| Software | Modelo | Nómina electrónica DIAN | Módulo turnos |
|----------|--------|------------------------|---------------|
| **Siigo Nube** | SaaS | Sí, autorizado | Básico |
| **Alegra** | SaaS | Sí, autorizado | No nativo |
| **Helisa** | On-premise / SaaS | Sí | Sí (>200 funciones RRHH) |
| **World Office** | On-premise | Sí | Limitado |
| **Buk** | SaaS (Chile/Colombia) | Sí | Sí (planificación turnos) |
| **Aleg (Aspel-NOI)** | On-premise | Sí | No |

### 10.2 Estructura de datos típica en software de nómina

Los sistemas de nómina colombianos modelan los conceptos en dos capas:

**Capa 1 — Conceptos de nómina:** cada tipo de ingreso o deducción es un "concepto" con:
- Código (ej. `001` = sueldo básico, `035` = hora extra diurna, `100` = salud empleado)
- Nombre y tipo (devengado / deducción / aporte patronal)
- Fórmula de cálculo (porcentaje, valor fijo, fórmula condicional)
- Indicador de si es factor para prestaciones, seguridad social, auxilio transporte
- Vigencia (fecha desde / hasta, para manejar los cambios graduales)

**Capa 2 — Liquidación:** cada período de nómina genera un documento con:
- Encabezado: empleado, período, estado
- Líneas de concepto: código, base, %, valor
- Totales: devengado, deducciones, neto
- Aportes: salud, pensión, ARL, parafiscales (para PILA)
- Provisiones: prima, cesantías, vacaciones

### 10.3 Nómina electrónica DIAN (Documento Soporte de Nómina)

Obligatoria para todos los empleadores que sean sujetos del impuesto de renta. [^24] Resolución Unificada DIAN 000227 de 2025.  
Estructura XML: devengados + deducciones + totales. El plazo es los primeros 10 días del mes siguiente al pago.  
Conceptos en el XML que deben corresponder exactamente con los del motor de nómina:
- `Sueldo`, `HorasExtras`, `Vacaciones`, `PrimaServicios`, `Cesantias`, `IncapacidadesGenerales`, `AuxilioTransporte`
- Deducciones: `Salud`, `FondoPension`, `FondoSolidaridad`, `RetencionFuente`

---

## 11. IMPLICACIONES DE DISEÑO PARA EL MOTOR DE NÓMINA

### 11.1 Modelo de datos mínimo

| Tabla / Entidad | Campos clave |
|-----------------|-------------|
| `employees` | `salary`, `contract_type`, `hire_date`, `risk_class_arl`, `is_integral_salary` |
| `pay_periods` | `year`, `month`, `start_date`, `end_date`, `status` |
| `schedule_entries` | `start_time`, `end_time`, `employee_id`, `date` (ya existe en la app) |
| `absence_records` | `employee_id`, `start_date`, `end_date`, `type` (`sick`, `accident`, `maternity`, `paternity`, `vacation`, `unpaid`), `percentage_paid`, `payer` |
| `payroll_concepts` | `code`, `name`, `type`, `formula`, `valid_from`, `valid_to` |
| `payroll_lines` | `pay_period_id`, `employee_id`, `concept_id`, `base`, `rate`, `value` |
| `payroll_settings` | `period`, `smmlv`, `aux_transport`, `overtime_limit_weekly`, `night_start_hour`, `sunday_surcharge_pct`, `hourly_divisor` |

### 11.2 Configuración por período (semestre de jornada)

El motor necesita una tabla de parámetros indexada por rango de fechas:

| Parámetro | Ene–14 jul 2026 | 15 jul–31 dic 2026 |
|-----------|----------------|-------------------|
| `hourly_divisor` | 220 | 210 |
| `hourly_rate_smmlv` | $7.959 | $8.338 |
| `night_start` | 19:00 | 19:00 |
| `sunday_surcharge_pct` | 80 % | 90 % |
| `holiday_surcharge_pct` | 80 % | 90 % |

### 11.3 Casos edge a tener en cuenta

1. **Turno que cruza la medianoche:** la clasificación nocturna/diurna debe hacerse por cada hora individual del turno, no por la hora de inicio del turno.
2. **Turno que cae exactamente el 14–15 de julio:** si un turno cruza la medianoche del 14 al 15, las horas de cada día se calculan con el divisor del día correspondiente.
3. **Domingo/festivo que cae en turno nocturno:** aplican dos recargos sumados. La hora de referencia para "si es festivo" es la hora local del trabajador en su sede (relevante si en el futuro hay sedes en zonas horarias distintas).
4. **Incapacidad parcial de mes:** el IBC para seguridad social del mes se recalcula proporcionalmente.
5. **Empleado que cruza el umbral de 2 SMMLV por recargos:** pierde auxilio de transporte si el total devengado supera $3.501.810; la app debe evaluar esto antes de incluir el auxilio.
6. **Salario integral con horas extras pactadas por encima del integral:** requiere cálculo separado del excedente.
7. **Múltiples contratos simultáneos:** un empleado puede tener dos contratos de trabajo parciales con el mismo empleador. Cada uno se liquida por separado para IBC.
8. **Cambio de salario a mitad de mes:** la base de vacaciones usa el salario vigente al inicio del disfrute; la base de prima y cesantías se calcula sobre el promedio del semestre.

### 11.4 Qué NO debe calcular la app (al menos en v1)

- Retención en la fuente (requiere datos de deducciones personales — hipoteca, dependientes — que la app no gestiona).
- Liquidación final de contrato (cesantías definitivas, indemnizaciones).
- Aportes PILA (Planilla Integrada de Liquidación de Aportes) — generación del archivo para el operador.

Estos cálculos pueden delegarse al software de nómina; la app exporta las horas y conceptos para que el contador los importe.

---

## 12. BIBLIOGRAFÍA

[^1]: Código Sustantivo del Trabajo — Cancillería de Colombia. https://www.cancilleria.gov.co/sites/default/files/Normograma/docs/pdf/codigo_sustantivo_trabajo_pr006.pdf

[^2]: Ley 2101 de 2021 — Gestor Normativo Función Pública. https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=166506 (consultado 2026-04-25)

[^3]: Ministerio del Trabajo — "Los salarios de los trabajadores se deberán mantener con la reducción de la jornada laboral". https://www.mintrabajo.gov.co/comunicados/2023/julio/los-salarios-de-las-y-los-trabajadores-se-deberan-mantener-con-la-reduccion-de-la-jornada-laboral-en-colombia (jul 2023)

[^4]: Ley 2466 de 2025 — Alcaldía de Bogotá / Gestor Normativo. https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=181933 (sancionada 25 jun 2025)

[^5]: Decreto 1072 de 2015 — DUR Trabajo. https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=76271

[^6]: Ley 50 de 1990 — Secretaría del Senado. http://www.secretariasenado.gov.co/senado/basedoc/ley_0050_1990.html

[^7]: Decreto 0159 de 2026 — Presidencia de la República. https://dapre.presidencia.gov.co/normativa/normativa/DECRETO%20No.%200159%20DEL%2019%20DE%20FEBRERO%20DE%202026.pdf (19 feb 2026)

[^8]: Decretos 1469 y 1470 del 29 de diciembre de 2025 — SMMLV y Auxilio de Transporte. Holland & Knight resumen: https://www.hklaw.com/en/insights/publications/2025/12/colombia-decreta-aumento-del-salario-minimo-y-auxilio-de-transporte (dic 2025)

[^9]: Infobae Colombia — "Este 2026 entrará en vigencia la jornada laboral de 42 horas y así quedará el pago por hora". https://www.infobae.com/colombia/2026/01/01/este-2026-entrara-en-vigencia-la-jornada-laboral-de-42-horas-en-colombia-asi-quedara-el-pago-por-hora-de-trabajo/ (1 ene 2026)

[^10]: UGPP — ABC Trabajadores a Tiempo Parcial 2026. https://www.ugpp.gov.co/wp-content/uploads/2026/02/ABC-Trabajadores-a-Tiempo-Parcial.pdf (feb 2026)

[^11]: Buk Colombia — "Regulaciones de horas extras y recargos en Colombia". https://www.buk.co/blog/regulaciones-de-recargos-y-horas-extras-en-colombia

[^12]: Gerencie.com — "Descanso compensatorio remunerado por trabajo dominical". https://www.gerencie.com/descanso-compensatorio-remunerado-por-trabajo-dominical.html

[^13]: Buk Colombia — "Calendario 2026 Colombia con festivos y recargos laborales". https://www.buk.co/blog/calendario-2026-colombia-con-festivos

[^14]: Ley 51 de 1983 (Ley Emiliani) — festivos en Colombia. Referencia: Señal Colombia. https://www.senalcolombia.tv/general/festivos-en-colombia-2026

[^15]: Gerencie.com — "¿Cómo se pagan las incapacidades laborales en Colombia?". https://www.gerencie.com/como-se-liquidan-los-dias-de-incapacidad-por-enfermedad-general.html

[^16]: Asuntos Legales — "Incapacidades de accidentes y enfermedades laborales". https://www.asuntoslegales.com.co/consumidor/asi-funcionan-los-pagos-de-las-incapacidades-de-accidentes-y-enfermedades-laborales-3591238

[^17]: Ley 2114 de 2021 — Licencia de maternidad 18 semanas. Actualícese. https://actualicese.com/licencias-de-maternidad-y-paternidad-en-2026/

[^18]: Buk Colombia — "Licencia de paternidad en Colombia". https://www.buk.co/blog/licencia-de-paternidad-en-colombia

[^19]: Alegra Blog — "Aportes parafiscales en Colombia". https://blog.alegra.com/colombia/aportes-parafiscales/

[^20]: DIAN — Resolución 000238 del 15 de diciembre de 2025 (UVT 2026 = $52.374). Referencia: Buk. https://www.buk.co/blog/uvt-2026-colombia-valor-oficial

[^21]: Siigo — "Salario Integral en Colombia 2026". https://www.siigo.com/blog/salario-integral-en-colombia/

[^22]: Infobae Colombia — "Esto es lo que ganará un aprendiz del SENA en 2026". https://www.infobae.com/colombia/2026/01/07/esto-es-lo-que-ganara-un-aprendiz-del-sena-en-2026-segun-la-reforma-laboral-y-el-ajuste-de-salario-minimo/ (7 ene 2026)

[^23]: Programas Contabilidad — "Software de nómina más utilizados en Colombia 2024–2026". https://programascontabilidad.com/comparativas-de-software/nomina-electronica/software-de-nomina-colombia/

[^24]: DIAN — "Abecé Documento Soporte de Nómina Electrónica". https://www.dian.gov.co/Prensa/Aprendelo-en-un-DIAN-X3/Paginas/Abece-Documento-Soporte-de-Nomina-Electronica.aspx

[^25]: Actualícese — "Jornada laboral semanal 2026 en Colombia". https://actualicese.com/jornada-laboral-semanal-2026-en-colombia/

[^26]: PwC Colombia — "Reducción de jornada ordinaria laboral". https://www.pwc.com/co/es/pwc-insights/reduccion-jornada-laboral.html

[^27]: Actualícese — "Horas extra y recargos 2026 en Colombia". https://actualicese.com/horas-extra-y-recargos-2026-en-colombia/

[^28]: Nexia Montes & Asociados — "Recargo nocturno desde las 7:00 p.m.". https://nexiamya.com.co/recargo-nocturno-desde-las-700-p-m-esto-cambia-con-la-ley-2466-de-2025-y-asi-se-calcula-el-pago-por-hora/

[^29]: Buk Colombia — "Recargo dominical y festivo reforma laboral". https://www.buk.co/blog/recargo-dominical-y-festivo-reforma-laboral

[^30]: Buk Colombia — "Aportes parafiscales con salario mínimo 2026". https://www.buk.co/blog/aportes-parafiscales-con-salario-minimo-2026-en-colombia

[^31]: Vinnuretti Legal — "Costo del Salario Mínimo para el Empleador en 2026". https://legal.vinnuretti.com/Aht_1_012026.aspx

[^32]: Actualícese — "Prima de servicios". https://actualicese.com/prima-de-servicios/

[^33]: Gerencie.com — "Porcentajes ARL según nivel de riesgo". https://www.gerencie.com/cotizacion-a-riesgos-laborales-segun-nivel-de-riesgo.html

[^34]: Alegra Blog — "Retención en la fuente por salarios — tabla 2026". https://blog.alegra.com/colombia/retencion-en-la-fuente-por-salarios-tabla/

[^35]: Siempre al Día — "Horas extra y recargos nocturnos 2026". https://siemprealdia.co/colombia/derecho-laboral/horas-extra-y-recargos-nocturnos/

[^36]: Mintrabajo — "Jornada nocturna desde las 7:00 p.m. y pago del 100 % de dominicales y festivos". https://www.mintrabajo.gov.co/comunicados/2023/diciembre/jornada-nocturna-desde-las-7-00-p.m.-y-pago-del-100-de-dominicales-y-festivos-hacen-parte-de-los-16-articulos-aprobados-de-la-reforma-laboral (dic 2023)

[^37]: El Colombiano — "ABC reforma laboral: así cambiarán la jornada laboral, las horas extra y el recargo dominical". https://www.elcolombiano.com/negocios/reforma-laboral-cambios-jornada-laboral-horas-extra-recargo-dominical-JE27769918

[^38]: Actualícese — "Recargo nocturno en Colombia: conoce el horario aplicable a partir del 25 de diciembre de 2025". https://actualicese.com/recargo-nocturno-en-colombia-conoce-el-horario-aplicable-a-partir-del-25-de-diciembre-de-2025/

---

## 13. LAGUNAS Y PREGUNTAS ABIERTAS PARA DISCUTIR CON EL CLIENTE

1. **¿El cliente liquida nómina directamente o usa software externo?** Si usa Siigo/Alegra/Helisa, la app podría exportar un CSV/Excel con las horas y conceptos para importar al software de nómina en lugar de calcular la liquidación completa.

2. **¿Qué clases de riesgo ARL tienen las sedes del cliente?** El costo del empleador varía significativamente entre riesgo I (0,522 %) y riesgo V (6,96 %). Una app de horarios no puede calcular el costo real sin este dato por sede.

3. **¿Hay empleados con salario integral?** El cálculo del valor hora integral y la base de cotización al 70 % requieren una rama de lógica diferenciada.

4. **¿Cómo maneja el cliente el descanso compensatorio dominical?** ¿Lo paga en dinero o lo concede como día libre? Esto afecta si se necesita un registro de días compensatorios pendientes.

5. **Reglamentación pendiente de la Ley 2466 sobre aprendices:** la ley reconoce cesantías y prima en etapa productiva, pero la reglamentación específica puede no estar completa. Si el cliente tiene aprendices, necesita confirmación de su ARL y asesor de nómina.

6. **Incapacidades de más de 180 días:** la app asume que la gestión de incapacidades de larga duración (rehabilitación, pensión de invalidez) queda fuera de alcance. Confirmar con el cliente.

7. **Festivos de sede adicionales:** ¿el cliente tiene convenios colectivos que agreguen festivos propios? La tabla `holidays` de la app ya los soporta, pero hay que cargarlos manualmente.

8. **Contradicción detectada en fuente secundaria (Buk, una entrada):** una fuente indicaba que el recargo dominical subiría al 100 % en julio 2026. Todas las demás fuentes coinciden en 90 % julio 2026 y 100 % julio 2027. **Se recomienda verificar con Mintrabajo o el texto oficial de la Ley 2466 antes de codificar el valor.**

9. **¿La empresa tiene trabajadores en zonas rurales o áreas especiales?** Existen regímenes especiales de jornada (art. 164 CST, trabajos discontinuos o intermitentes) que no aplican los mismos topes.

10. **Retención en la fuente:** su cálculo requiere datos del empleado (créditos hipotecarios, dependientes) que están fuera del alcance de una app de horarios. Se recomienda limitarse a exportar el devengado bruto y las deducciones de seguridad social; el cálculo de retención queda a cargo del contador.

---

*Documento elaborado el 25 de abril de 2026. Las fuentes de datos oficiales (Mintrabajo, DIAN, Función Pública) deben verificarse ante cada cambio normativo. El motor de nómina debe permitir actualizar parámetros sin modificar código (tabla `payroll_settings` por período).*
