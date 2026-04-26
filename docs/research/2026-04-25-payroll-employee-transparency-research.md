# Vista del Empleado y Transparencia Salarial — Colombia 2026

**Fecha de elaboración:** 25 de abril de 2026  
**Complementa:** `2026-04-25-colombia-payroll-research.md` (vista del empleador)  
**Alcance:** Responde la pregunta del empleado: "Me pagaron $2.8 M este mes, ¿a dónde se fue cada peso?" Incluye marco legal del desprendible, anatomía de deducciones, UX de transparencia, cálculo de retención y ejemplo trabajado.

---

## 1. RESUMEN EJECUTIVO

Los 10 puntos críticos para el diseño de UX del empleado:

1. **El empleado colombiano promedio no entiende su colilla.** El Ministerio del Trabajo registra que el no pago de salario y prestaciones es la queja laboral más frecuente. La opacidad del desprendible alimenta sospechas de sub-liquidación incluso cuando el cálculo es correcto. La app debe convertirse en traductora, no solo en calculadora.

2. **El desprendible legal NO es obligatorio entregar, pero sí informar sobre aportes a seguridad social.** Ley 1393/2010, art. 32, exige informar al empleado sobre aportes pagados. La omisión puede generar hasta 5 SMMLV de multa. Entregar una colilla digital clara elimina ese riesgo y construye confianza.

3. **El empleado confunde "bruto" con "lo que gana".** El devengado total (salario + auxilio + recargos) no llega íntegro al banco. Se le descuentan salud 4 % + pensión 4 % + eventualmente retención en la fuente y solidaridad pensional. El empleado percibe que "le roban" cuando en realidad son deducciones legales que le benefician (salud, pensión).

4. **Las provisiones (cesantías, prima, vacaciones) son ingresos reales que no aparecen en el pago mensual.** El empleado con salario de $2.8 M gana mensualmente ~$466 K adicionales que el empleador separa para pagarle en junio, diciembre y en el fondo de cesantías. Visualizar esto en la app cambia la percepción de "me pagan poco" por "me pagan distribuido".

5. **La retención en la fuente aparece y desaparece.** Un empleado con $2.8 M NO paga retención (su base depurada está por debajo de 95 UVT ≈ $4.976 M). Si recibe horas extras o bonificaciones, puede cruzar ese umbral en un mes. Sin explicación, parece arbitrario.

6. **El auxilio de transporte tiene reglas asimétricas que desconciertan.** Entra en prima y cesantías, pero NO en seguridad social ni vacaciones. La app debe mostrar en qué base está incluido en cada cálculo con un ícono o tooltip.

7. **El IBC no es igual al salario, y eso importa.** El auxilio de transporte ($249.095) está excluido de la base de cotización. Para un empleado con $2.8 M, el IBC es exactamente $2.8 M; para uno que gana mínimo, el IBC es $1.750.905 (sin el transporte). Esta diferencia impacta el monto de la pensión futura.

8. **La nómina electrónica DIAN (Resolución 000227/2025) obliga a reportar devengados y deducciones por separado.** La estructura técnica del XML es compatible con el detalle que queremos mostrarle al empleado. La app puede usar los mismos conceptos DIAN como etiquetas en la colilla digital.

9. **Quincena vs. mensual afecta la claridad.** En pago quincenal, los recargos y horas extras se pagan en la quincena en que ocurrieron (no se acumulan). El primer pago quincenal de un empleado que ingresó el día 10 puede ser muy pequeño; sin contexto parece un error.

10. **Los líderes globales (Gusto, Rippling, Deel) y colombianos (Buk, Siigo) convergen en el mismo patrón UX:** lista de devengados con subtotal, lista de deducciones con subtotal, neto final resaltado. Lo diferenciador de App Horarios puede ser la sección "Lo que no ves en tu cuenta" que muestra las provisiones mensuales acumuladas.

---

## 2. ANATOMÍA DE UN PAGO QUINCENAL / MENSUAL AL EMPLEADO

### 2.1 Quincenas vs. pago mensual

La legislación colombiana (CST, art. 134) [^1] permite que los sueldos se paguen por períodos iguales y vencidos, con un máximo de un mes. Muchas empresas de servicios y comercio pagan quincenalmente; las del sector manufacturero o de retail pueden pagar mensual.

**Distribución en pago quincenal:**

| Quincena | Qué incluye |
|----------|------------|
| Primera (día 15) | Salario base días 1–15 + auxilio de transporte proporcional + recargos y horas extras ocurridos en esos días |
| Segunda (día 30/31) | Salario base días 16–30/31 + auxilio de transporte proporcional + recargos y horas extras del período |

**Regla clave:** Los recargos nocturnos, dominicales y horas extras se pagan en la quincena en que ocurrieron. El CST art. 134 admite que el pago sea "a más tardar en el período siguiente", pero la práctica sana es pagar en el mismo período. [^2]

**Ejemplo:** Un empleado con salario $2.800.000 que trabajó 3 domingos en la primera quincena y 2 en la segunda verá los recargos dominicales distribuidos en cada colilla.

### 2.2 Conceptos que forman el devengado

| Concepto | ¿Constituye salario? | ¿Entra en SS? | ¿Entra en prima/cesantías? |
|----------|---------------------|---------------|---------------------------|
| Salario base | Sí | Sí | Sí |
| Auxilio de transporte | No (es beneficio) | No | Sí (art. 7 Ley 1 de 1963) |
| Recargos nocturnos | Sí | Sí | Sí |
| Horas extras | Sí | Sí | Sí |
| Recargo dominical/festivo | Sí | Sí | Sí |
| Bonificación habitual | Sí | Sí | Sí |
| Bonificación ocasional (p. ej., navidad única) | No (pacto expreso) | No | No |
| Alimentación en especie (beneficio acordado) | No (CST art. 128) | No | No |
| Comisiones por ventas | Sí | Sí | Sí |

Fuente: CST arts. 127-129 [^1], Ley 50/1990 art. 15 [^3].

### 2.3 Conceptos NO salariales y cómo aparecen en la colilla

Los pagos "no constitutivos de salario" (art. 128 CST) son beneficios que el empleador otorga sin que formen base para liquidar prestaciones ni aportes. Deben estar expresamente pactados en el contrato o acuerdo laboral. [^4]

Ejemplos comunes en Colombia:
- Auxilio de alimentación (tarjetas Pluxee, Sodexo): excluido del IBC y no sujeto a retención en la fuente.
- Gastos de representación (para cargos específicos).
- Prima extralegal no habitual.
- Dotación (ropa de trabajo, calzado): en especie, no en dinero.

**Impacto en la colilla:** Estos conceptos aparecen en la sección "Devengados" pero etiquetados como "No constitutivo de salario" o simplemente como beneficio adicional. No afectan la base de la seguridad social, ni prima, ni cesantías. Un tooltip explicativo es esencial para que el empleado entienda por qué ese valor "extra" no aumenta su liquidación anual.

---

## 3. ANATOMÍA DE LAS DEDUCCIONES DEL EMPLEADO

### 3.1 Mapa completo de deducciones

| Deducción | Base | % Empleado | Notas |
|-----------|------|-----------|-------|
| Salud | IBC | 4 % | El empleador paga el 8.5 % adicional |
| Pensión | IBC | 4 % | El empleador paga el 12 % adicional |
| Solidaridad pensional | IBC | 1 %–2 % | Solo si IBC ≥ 4 SMMLV ($7.003.620) |
| Retención en la fuente | Base depurada | 0 %–39 % | Solo si base depurada > 95 UVT ($4.976 K) |
| Embargo judicial (alimentos) | Salario libre | Hasta 50 % | Por orden judicial |
| Embargo civil | Salario > SMMLV | 1/5 del excedente | No puede afectar el SMMLV |
| Libranza / préstamo | Neto | Variable | El empleado debe conservar ≥ 50 % del neto |
| Aportes voluntarios pensión / AFC | Bruto | Hasta 30 % | Reducen base de retención |
| Cuota sindical | Salario | Según estatuto sindical | Solo si está afiliado; el monto lo fija la asamblea (CST art. 400) [^5] |

### 3.2 Salud y pensión — la confusión del 4 % + 4 %

El empleado ve que le descuentan $224.000 si su salario es $2.8 M ($112.000 salud + $112.000 pensión = 8 % del IBC). Pero el costo total del sistema es:
- Salud: 12.5 % total → empleado paga 4 %, empleador paga 8.5 %.
- Pensión: 16 % total → empleado paga 4 %, empleador paga 12 %.

El empleador pone $588.000 adicionales al mes en esos dos ítems sin que el empleado lo vea en su colilla. [^6]

### 3.3 Fondo de Solidaridad Pensional

Solo aplica si el IBC es ≥ 4 SMMLV ($7.003.620 en 2026). Con un salario de $2.8 M, este empleado NO paga solidaridad pensional. [^7]

**Tabla vigente 2026** (Ley 100/1993, reforma pensional Ley 2381/2024 suspendida por Auto 841 Corte Constitucional 2025): [^8]

| IBC en SMMLV | % solidaridad | % subsistencia | Total FSP |
|---|---|---|---|
| < 4 | 0 % | 0 % | 0 % |
| ≥ 4 y < 16 | 0.5 % | 0.5 % | 1.0 % |
| ≥ 16 y ≤ 17 | 0.5 % | 0.7 % | 1.2 % |
| > 17 y ≤ 18 | 0.5 % | 0.9 % | 1.4 % |
| > 18 y ≤ 19 | 0.5 % | 1.1 % | 1.6 % |
| > 19 y ≤ 20 | 0.5 % | 1.3 % | 1.8 % |
| > 20 | 0.5 % | 1.5 % | 2.0 % |

**Nota de contradicción:** La Ley 2381 de 2024 propuso rangos diferentes pero permanece suspendida. Se aplican los porcentajes históricos de Ley 100/1993. Preferir siempre la tabla Corte Constitucional/Colpensiones. [^9]

### 3.4 Retención en la fuente (ver sección 8 para el detalle completo)

Solo aplica si la base mensual depurada supera 95 UVT ($4.976.000). El empleado tipo del cliente (salarios 1.5–3 SMMLV) raramente paga retención, salvo cuando recibe bonificaciones o horas extras que elevan su devengado mensual.

### 3.5 Embargos judiciales

**Embargo de alimentos (CST art. 154):** Hasta el 50 % del salario, incluso sobre el salario mínimo. Solo por orden judicial. [^10]

**Embargo civil (CST art. 155):** Solo es embargable la quinta parte (20 %) del salario que exceda el SMMLV. Ejemplo: salario $2.8 M → embargable = ($2.8 M − $1.75 M) × 20 % = $210.000.

### 3.6 Libranzas y préstamos

Ley 1527 de 2012 regula los descuentos directos de nómina para créditos con bancos, cooperativas o fondos de empleados. Límite: el empleado debe conservar al menos el 50 % de su salario neto (después de aportes de ley) para uso personal. [^11]

Ejemplo: empleado con neto de $2.464.000 puede tener libranzas hasta $1.232.000/mes.

### 3.7 Aportes voluntarios a pensión y AFC

El empleado puede autorizar descuentos adicionales en nómina hacia:
- Fondo de pensiones voluntarias.
- Cuenta AFC (Ahorro para Fomento de la Construcción).

Beneficio: estos aportes son renta exenta hasta el 30 % del ingreso laboral o 3.800 UVT anuales ($199 M), lo que sea menor (ET art. 126-1). [^12] Reducen la base de retención en la fuente. Si la app permite configurarlos, debe mostrar la reducción de retención generada.

### 3.8 Diferencia empleado vs. empleador — lo que el bolsillo de cada uno paga

| Concepto | % Empleado | % Empleador | ¿Quién lo siente? |
|---|---|---|---|
| Salud 4 % | Sí (en colilla) | No | Empleado |
| Salud 8.5 % | No | Sí (costo) | Empleador |
| Pensión 4 % | Sí (en colilla) | No | Empleado |
| Pensión 12 % | No | Sí (costo) | Empleador |
| ARL (mín. 0.522 %) | No | Sí (costo) | Empleador |
| SENA 2 % / ICBF 3 % | No (salarios < 10 SMMLV exonerados) | Aplica solo ≥ 10 SMMLV | Empleador |
| Caja de Compensación 4 % | No | Sí (costo) | Empleador |
| Prima 8.33 % | No | Sí (provisión) | Empleador (paga al empleado en junio/dic) |
| Cesantías 8.33 % | No | Sí (provisión) | Empleador (deposita en fondo en febrero) |
| Intereses cesantías 1 % | No | Sí (provisión) | Empleador (paga en enero) |
| Vacaciones 4.17 % | No | Sí (provisión) | Empleador (paga al tomarse) |

---

## 4. LO QUE NO ES "DEDUCCIÓN" PERO IMPACTA LO QUE LLEGA AL BANCO

### 4.1 Provisiones: el dinero que ganas pero no ves en enero

Cada mes el empleado "gana" en valor real mucho más de lo que llega al banco, porque el empleador separa dinero en:

| Provisión | % de la base | Para salario $2.8 M | Cuándo lo recibe |
|---|---|---|---|
| Cesantías | 8.33 % | $233.240 | En el fondo (retira para vivienda/educación o al terminar el contrato) |
| Intereses de cesantías | 1 % | $27.990 | Directamente al empleado en los primeros 15 días de enero |
| Prima de servicios | 8.33 % | $233.240 | Mitad en 30 junio, mitad en 20 dic |
| Vacaciones | 4.17 % | $116.760 | Al tomarse las vacaciones (15 días hábiles/año) |
| **Total mensual oculto** | **~21.83 %** | **~$611.230** | En distintos momentos del año |

Base de cálculo: salario + auxilio de transporte (para cesantías e intereses, y prima). Para vacaciones, solo el salario base. [^13][^14]

### 4.2 Cómo explicarle al empleado el "salario total"

Mensaje clave para el tooltip o sección de la app:

> "Este mes te pagamos $2.551.240 en tu cuenta. Pero adicionalmente reservamos $611.230 en tus cesantías, tu prima futura y tus vacaciones. Tu compensación total mensual es $3.162.470."

Esta visualización convierte la app en aliada del empleado, reduce la sensación de sub-pago y es diferenciadora frente a las colillas tradicionales en Colombia.

### 4.3 Las vacaciones no son "prestación" sino descanso remunerado

Las vacaciones (CST art. 186-192) corresponden a 15 días hábiles por año trabajado. No se acumulan en un fondo externo: el empleador las paga cuando el empleado las toma. Si no las toma, se acumulan como pasivo contable. [^15]

La app puede mostrar: "Días de vacaciones acumulados a hoy: X días. Equivalente en pesos: $YYY.YYY."

---

## 5. COMPROBANTE DE PAGO / COLILLA / DESPRENDIBLE

### 5.1 Marco legal

**CST art. 134:** El salario se paga por períodos iguales y vencidos. No menciona explícitamente la colilla, pero obliga a informar. [^1]

**Ley 1393 de 2010, art. 32:** Los empleadores deben informar a los empleados sobre los aportes pagados a la protección social o garantizarles acceso para verificarlos. Sanción: hasta 5 SMMLV ($8.754.525 en 2026) por incumplimiento. [^16]

**CST art. 65 (párrafo 1):** Al terminar el contrato, el empleador debe informar por escrito el estado de aportes de seguridad social de los últimos 3 meses. Incumplimiento genera indemnización moratoria (Corte Suprema de Justicia, SL3770-2020; SL3392-2019). [^17]

**Conclusión legal:** Entregar la colilla digital no es obligatorio pero es la forma más práctica de cumplir la obligación de informar del art. 32. La app crea el "comprobante" que protege al empleador y empodera al empleado.

### 5.2 Información mínima que debe contener

Según práctica uniforme de los operadores de nómina electrónica (Buk, Siigo, Alegra, DIAN) y la jurisprudencia citada: [^18][^19]

**Encabezado:**
- Razón social y NIT del empleador
- Nombre completo, documento de identidad, cargo, centro de costo del empleado
- Período de pago (del DD/MM/YYYY al DD/MM/YYYY)
- Fecha de emisión

**Devengados (ingresos):**
- Salario básico (días trabajados × valor diario)
- Auxilio de transporte (si aplica, salario ≤ 2 SMMLV)
- Detalle de cada recargo y hora extra (tipo, horas, valor unitario, total)
- Bonificaciones, comisiones
- Conceptos no salariales etiquetados como tales
- **Subtotal devengado**

**Deducciones:**
- Salud empleado (4 % IBC)
- Pensión empleado (4 % IBC)
- Solidaridad pensional (si aplica)
- Retención en la fuente (si aplica)
- Libranzas / préstamos (desglosados por acreedor)
- Aportes voluntarios
- Cuota sindical (si aplica)
- Otras deducciones autorizadas
- **Subtotal deducciones**

**Neto a pagar:**
- Devengado − Deducciones = **NETO A PAGAR** (valor que llega al banco)

**Sección informativa (no deducción):**
- Aportes del empleador a salud, pensión, ARL (informativos)
- Provisiones del mes (cesantías, prima, vacaciones): "Lo que ganas pero recibirás después"

### 5.3 Nómina electrónica DIAN — Documento Soporte de Pago

La Resolución Unificada 000227 de 2025 (título V, cap. III) compiló la Resolución 000013 de 2021. Toda empresa con trabajadores dependientes está obligada a emitir el Documento Soporte de Pago de Nómina Electrónica (DSPNE). [^20][^21]

**Conceptos obligatorios en el XML:**
- Identificación del empleador (NIT, razón social, dirección, correo)
- Identificación del trabajador (cédula, nombre, cargo)
- CUNE (código único de documento)
- Valores devengados de nómina (detallados por tipo)
- Deducciones de nómina (detalladas por tipo)
- Total neto pagado
- Método de pago (transferencia, efectivo, etc.)
- Fecha y hora de generación
- Firma digital del emisor (certificado digital)
- Identificación del software proveedor tecnológico

**Implicación para App Horarios:** Los conceptos del XML DIAN son exactamente los mismos que debe mostrar la colilla digital al empleado. La app puede usar las etiquetas DIAN como vocabulario estándar (ej. "HorasExtrasOrdinariasDiurnas", "AuxilioTransporte", "Salud4x1000").

---

## 6. UX DE TRANSPARENCIA SALARIAL

### 6.1 El patrón universal de la colilla digital

Los líderes globales y colombianos convergen en la misma estructura de tres bloques: [^22][^23][^24]

```
+-----------------------------+
|  GANAS (Devengados)         |
|  Salario base      2.800.000|
|  Auxilio transporte  249.095|
|  H. extra nocturna   44.544 |
|  Recargo dominical  150.060 |
|  ─────────────────────────  |
|  TOTAL DEVENGADO   3.243.699|
+-----------------------------+
|  TE DESCUENTAN (Deducciones)|
|  Salud 4%           112.000 |
|  Pensión 4%         112.000 |
|  ─────────────────────────  |
|  TOTAL DEDUCCIONES  224.000 |
+-----------------------------+
|  TE LLEGA AL BANCO          |
|  NETO               3.019.699|
+-----------------------------+
|  GANAS PERO RECIBIRÁS DESPUÉS|
|  Cesantías mes       270.000 |
|  Prima mes           270.000 |
|  Vacaciones mes      116.760 |
|  TOTAL PROVISIONES   656.760 |
+-----------------------------+
```

### 6.2 El diagrama Sankey aplicado a nómina

Un Sankey textual convierte el "flujo de pesos" en algo visual. Para el caso $2.8 M (ver sección 9), el flujo es:

```
Devengado Bruto ($3.243.699)
    ├─► Neto al banco ($3.019.699) → Bolsillo empleado
    └─► Deducciones SS ($224.000)
            ├─► EPS ($112.000) → Sistema de salud (empleado)
            └─► AFP ($112.000) → Fondo pensión (empleado)

Provisiones empleador ($3.243.699 base)
    ├─► Cesantías (~$270.000) → Fondo de cesantías (empleado, febrero)
    ├─► Intereses cesantías (~$32.400) → Empleado (enero)
    ├─► Prima (~$270.000) → Empleado (junio/diciembre)
    └─► Vacaciones (~$116.760) → Empleado (al tomarlas)
```

Los productos que mejor implementan esto en Colombia (Buk, Siigo) muestran una tabla de devengados + deducciones con subtotales. La diferenciación de App Horarios puede ser el bloque de "provisiones del mes" que actualmente ningún desprendible estándar muestra al empleado. [^25][^26]

### 6.3 Otros patrones de visualización efectivos

| Patrón | Descripción | Cuándo usarlo |
|--------|-------------|---------------|
| Tabla desglosada (lista) | Concepto / Valor / IBC base | Colilla estándar, siempre |
| Waterfall chart | Parte del bruto y muestra barras + y − | Para explicar retención en la fuente |
| Donut chart | % que va a cada destino | Vista anual "¿adónde fue mi plata este año?" |
| Barra apilada comparativa | Mes actual vs. promedio últimos 3 meses | Para mostrar por qué cambió la retención |
| Progress bar | Cesantías acumuladas en el año | Motivador: "acumulaste X de X" |

**Wagestream (ahora Stream)** muestra en tiempo real cuánto ha ganado el empleado en el período actual, permitiéndole retirar earned wages anticipadamente. El principio es el mismo: el empleado siente que la información es suya y actualizada. [^27]

**Gusto (EE.UU.)** tiene un portal del empleado donde cada concepto del paystub tiene un enlace "¿Qué es esto?" con una descripción en lenguaje simple. Este patrón es el que más reduce tickets de soporte. [^22]

**Rippling** integra el paystub con el historial de beneficios, mostrando el "employer cost" junto al net pay, lo que genera la conversación de "tu empresa pone X por ti cada mes". [^23]

### 6.4 Productos colombianos — estado del arte

| Producto | Portal empleado | Visualización | Notas |
|----------|----------------|---------------|-------|
| Buk | Sí (web + app) | Tabla devengados/deducciones + neto | Envío por email o acceso directo en portal |
| Siigo | Sí (portal nube) | Descarga PDF de desprendible, tabla estándar | Generación automática con nómina electrónica |
| Alegra | Sí | Desprendible descargable en PDF | Formato compatible DIAN |
| Factúra.co | Parcial | Principalmente para el empleador | Menos orientado al empleado |
| App Horarios | **Propuesta** | Desprendible digital + bloque de provisiones + tooltips | Diferenciador: contexto en tiempo de horarios |

---

## 7. CASOS DE TENSIÓN Y ERRORES COMUNES QUE GENERAN DESCONFIANZA

### 7.1 "¿Por qué me descontaron retención este mes y no el anterior?"

**Causa real:** En Procedimiento 1 (mes a mes), la retención depende de la base depurada mensual. Si el empleado recibió bonificación, horas extras o compensación especial, su devengado superó el umbral de 95 UVT ese mes.

**Respuesta UX recomendada:** Mostrar junto a la línea "Retención en la fuente: $X" un tooltip que diga: "Este mes tu ingreso supera $4.976.000 depurado, por eso aplica retención. Los meses en que no supere ese umbral no habrá descuento."

### 7.2 "¿Qué es el IBC y por qué no es exactamente mi salario?"

**Causa real:** El IBC excluye el auxilio de transporte ($249.095) y cualquier pago no constitutivo de salario. Para la mayoría de empleados el IBC sí es igual al salario base.

**Respuesta UX:** Mostrar "Base de cotización (IBC): $X" debajo del salario en la sección de seguridad social, con nota: "El auxilio de transporte no entra en esta base."

### 7.3 "¿Por qué el auxilio de transporte aparece en mi prima pero no en mis aportes de salud?"

**Causa real:** Ley 1 de 1963, art. 7, incluyó el auxilio de transporte en la base de prestaciones sociales (prima y cesantías). La ley de seguridad social (Ley 100/1993) lo excluyó del IBC. Son dos normas distintas con objetivos distintos. [^28]

**Respuesta UX:** En el tooltip del auxilio de transporte: "Sí entra en: cesantías, prima de servicios. NO entra en: salud, pensión, ARL, parafiscales."

### 7.4 "¿Por qué el primer mes me pagaron menos?"

**Causa real:** Ingreso a mitad de período. El pago se calcula por días: (salario / 30) × días trabajados. Si entró el día 10, solo recibe 20/30 del salario base.

**Respuesta UX:** Mostrar "Días trabajados en período: 20 de 30" al inicio de la colilla. La proporcionalidad queda obvia.

### 7.5 "¿Por qué cobré más este mes?" (Vacaciones liquidadas, prima)

**Causa real:** En junio y diciembre llegan la prima de servicios y eventualmente vacaciones tomadas. El empleado puede sorprenderse positivamente pero sin contexto puede generar dudas ("¿esto es correcto?").

**Respuesta UX:** Colilla con sección "Conceptos especiales este período" que explica la prima o las vacaciones liquidadas con el cálculo detallado.

### 7.6 "¿Por qué me cobran solidaridad pensional?"

**Causa real:** El empleado ganó ≥ 4 SMMLV ($7.003.620) este mes, quizá por bonificación excepcional.

**Respuesta UX:** "Solidaridad pensional: $70.036 — Este mes tu salario superó 4 salarios mínimos. Esta contribución va al fondo que subsidia pensiones de personas de bajos ingresos. Es un aporte solidario, no un impuesto personal."

### 7.7 Estadísticas de confianza y desconfianza — contexto cualitativo

El Ministerio del Trabajo reportó en septiembre 2023 que **el no pago de salario y prestaciones es la primera causa de quejas laborales** en Colombia, seguido del incumplimiento de normas de seguridad. [^29] No existe encuesta pública de ACRIP o DANE específica sobre comprensión de colillas a la fecha de este research, pero los artículos de Buk, Siigo y Pluxee citan consistentemente que "la transparencia en la colilla reduce conflictos laborales y fortalece la confianza", lo que sugiere que la necesidad es reconocida por la industria. [^18][^25]

**Implicación de diseño:** La app debe incluir:
1. Tooltips en cada concepto con definición y base legal.
2. Explicación de por qué cambió cada deducción respecto al mes anterior.
3. Enlace a una guía de "preguntas frecuentes sobre tu pago".

---

## 8. CÁLCULO DE RETENCIÓN EN LA FUENTE PASO A PASO (2026)

### 8.1 UVT 2026

**$52.374** (Resolución DIAN 000238 del 15 de diciembre de 2025). [^30]

### 8.2 Tabla de retención por salarios (Art. 383 ET)

| Rango en UVT | Equivalente en pesos (aprox.) | Fórmula de cálculo | Tarifa marginal |
|---|---|---|---|
| 0 – 95 | $0 – $4.975.530 | $0 | 0 % |
| >95 – 150 | $4.975.531 – $7.856.100 | (Base−95) × 19 % | 19 % |
| >150 – 360 | $7.856.101 – $18.854.640 | (Base−150) × 28 % + 10 UVT | 28 % |
| >360 – 640 | $18.854.641 – $33.519.360 | (Base−360) × 33 % + 69 UVT | 33 % |
| >640 – 945 | $33.519.361 – $49.493.430 | (Base−640) × 35 % + 162 UVT | 35 % |
| >945 – 2.300 | $49.493.431 – $120.460.200 | (Base−945) × 37 % + 268 UVT | 37 % |
| >2.300 | >$120.460.200 | (Base−2.300) × 39 % + 770 UVT | 39 % |

Los valores en pesos son referencia; el cálculo se hace siempre en UVT. [^31]

### 8.3 Depuración mensual (Art. 388 ET) — Paso a paso

```
PASO 1: Ingresos brutos del mes
  = Salario base + auxilio transporte + horas extras + recargos + bonificaciones

PASO 2: Restar ingresos no gravados
  − Aportes obligatorios a pensión del empleado (4 % IBC)
  − Aportes obligatorios a salud del empleado (4 % IBC)
  − Aportes voluntarios a fondos de pensión / AFC (hasta 30 % del ingreso)
  = Subtotal A

PASO 3: Restar deducciones permitidas
  − Intereses sobre crédito hipotecario de vivienda (máx. 100 UVT/mes = $5.237.400)
  − Medicina prepagada o póliza de salud (máx. 16 UVT/mes = $837.984)
  − Dependientes económicos (10 % del ingreso, máx. 32 UVT/mes = $1.675.968)
  = Subtotal B

PASO 4: Restar rentas exentas laborales
  − 25 % del subtotal B (renta exenta laboral, ET art. 206 num. 10)
  TOPE: 790 UVT anuales = $3.447.468 / mes (= $790×$52.374/12)
  = BASE GRAVABLE DEPURADA

PASO 5: Validar límite global (40 %)
  La suma de deducciones + exenciones no puede exceder el 40 % de (ingresos brutos − aportes SS)
  con un tope absoluto de 1.340 UVT anuales ($70.181.160)

PASO 6: Convertir a UVT
  Base UVT = Base Gravable ÷ $52.374

PASO 7: Aplicar tabla Art. 383
  Si Base UVT ≤ 95: Retención = $0
  Si Base UVT > 95: Aplicar fórmula del tramo correspondiente

PASO 8: Multiplicar por UVT 2026
  Retención mensual = UVT resultantes × $52.374
```

### 8.4 Procedimiento 1 vs. Procedimiento 2

| Característica | Procedimiento 1 (Art. 385 ET) | Procedimiento 2 (Art. 386 ET) |
|---|---|---|
| Frecuencia de cálculo | Cada mes | Semestral (junio y diciembre) |
| Variable calculada | Retención del mes | Porcentaje fijo a aplicar |
| Aplica a | Rentas laborales y no laborales | Solo rentas de trabajo dependiente |
| Mejor para | Salarios estables | Salarios con pagos irregulares |
| Criterio de elección | El que genere menor retención para el empleado | Idem |

**Nota:** El empleador elige el procedimiento; suele informarlo en el formulario de ingreso. En la práctica, la mayoría de PyMEs usa Procedimiento 1. [^32]

### 8.5 Ejemplos para tres niveles salariales — 2026

#### Ejemplo 1: Salario $2.000.000 (≈ 1.14 SMMLV, recibe auxilio de transporte)

```
Devengado bruto:         $2.249.095 (salario + aux. transporte)
IBC para SS:             $2.000.000 (sin aux. transporte)
− Pensión 4 %:           −$80.000
− Salud 4 %:             −$80.000
Subtotal A:              $2.089.095

Renta exenta 25 %:       $522.274 (= $2.089.095 × 25 %)
                         Tope mensual: $3.447.468 → OK, no supera
Base gravable:           $2.089.095 − $522.274 = $1.566.821
En UVT:                  $1.566.821 ÷ $52.374 = 29.92 UVT

29.92 UVT < 95 UVT → RETENCIÓN = $0
```

#### Ejemplo 2: Salario $5.000.000 (≈ 2.86 SMMLV, sin auxilio de transporte)

```
Devengado bruto:         $5.000.000
IBC:                     $5.000.000
− Pensión 4 %:           −$200.000
− Salud 4 %:             −$200.000
Subtotal A:              $4.600.000

Renta exenta 25 %:       $1.150.000
Base gravable:           $4.600.000 − $1.150.000 = $3.450.000
En UVT:                  $3.450.000 ÷ $52.374 = 65.87 UVT

65.87 UVT < 95 UVT → RETENCIÓN = $0
```

**Punto de corte:** Para pagar retención sin otras deducciones, el salario base debería ser ≈ $6.5 M–$7 M antes de deducir el 8 %. Las horas extras y bonificaciones pueden llevar un salario de $5 M a terreno de retención en meses puntuales.

#### Ejemplo 3: Salario $12.000.000 (≈ 6.85 SMMLV, sin auxilio de transporte)

```
Devengado bruto:         $12.000.000
IBC:                     $12.000.000
− Pensión 4 %:           −$480.000
− Salud 4 %:             −$480.000
Subtotal A:              $11.040.000

Renta exenta 25 %:       $2.760.000
Base gravable:           $11.040.000 − $2.760.000 = $8.280.000
En UVT:                  $8.280.000 ÷ $52.374 = 158.08 UVT

Tramo >150–360 → (158.08 − 150) × 28 % + 10 UVT
= 8.08 × 28 % + 10 = 2.262 + 10 = 12.262 UVT
Retención = 12.262 × $52.374 = $642.404/mes
```

### 8.6 Si la app solo muestra, no calcula: ¿qué necesita guardar?

Si App Horarios delega el cálculo al contador externo y solo muestra el resultado en la colilla, la base de datos debe guardar:
- `payroll_entries.retencion_fuente NUMERIC` (valor calculado por el contador)
- `payroll_entries.base_gravable NUMERIC` (para que el empleado pueda verificar)
- `payroll_entries.procedimiento_retencion ENUM('1','2')` (para explicar variaciones)
- `payroll_entries.uvt_base NUMERIC` (los UVT del período para explicar el cálculo)

---

## 9. EJEMPLO CONCRETO TRABAJADO — EMPLEADO $2.800.000

### 9.1 Parámetros del caso

- Salario mensual: **$2.800.000**
- SMMLV 2026: $1.750.905 → ratio: 1.60 SMMLV → **tiene derecho a auxilio de transporte** (≤ 2 SMMLV)
- Período: **enero 2026** (divisor 220 horas, jornada 44 h/sem)
- Horas extra nocturnas en el mes: **8** (entre 21:00 y 06:00, recargo 75 % sobre ordinaria)
- Turnos dominicales ordinarios: **2** domingos completos de 8 horas (recargo 80 %, período enero–junio 2026)

### 9.2 Cálculo del devengado

**Hora ordinaria = $2.800.000 ÷ 220 = $12.727,27**

| Concepto | Cantidad | Valor unitario | Total |
|---|---|---|---|
| Salario base (mes completo) | 1 | $2.800.000 | $2.800.000 |
| Auxilio de transporte | 1 | $249.095 | $249.095 |
| Horas extra nocturnas (×1.75) | 8 h | $22.272 | $178.176 |
| Recargo dominical ordinario (×0.80) | 16 h | $10.182 | $162.912 |
| **TOTAL DEVENGADO** | | | **$3.390.183** |

*Nota: Las 16 horas dominicales son horas ordinarias trabajadas en domingo, no horas extras. El recargo dominical del 80 % es adicional a la hora ordinaria (valor total = $12.727 × 1.80 = $22.909 por hora; aquí se muestra el recargo separado como $10.182 × 16 = $162.912).*

### 9.3 IBC para aportes a seguridad social

El IBC excluye el auxilio de transporte:
**IBC = $2.800.000 + $178.176 + $162.912 = $3.141.088**

*(Horas extras y recargos sí constituyen salario y entran al IBC.)*

### 9.4 Deducciones del empleado

| Concepto | Base | % | Valor |
|---|---|---|---|
| Salud empleado | $3.141.088 | 4 % | $125.644 |
| Pensión empleado | $3.141.088 | 4 % | $125.644 |
| Solidaridad pensional | N/A | 0 % | $0 (IBC < 4 SMMLV) |
| Retención en la fuente | Depurada | 0 % | $0 (ver abajo) |
| **TOTAL DEDUCCIONES** | | | **$251.288** |

**Verificación retención:**
- Ingresos brutos: $3.390.183
- − Pensión 4 %: $125.644
- − Salud 4 %: $125.644
- Subtotal A: $3.138.895
- − Renta exenta 25 %: $784.724
- Base gravable: $2.354.171
- En UVT: $2.354.171 ÷ $52.374 = **44.95 UVT**
- 44.95 UVT < 95 UVT → **Retención = $0**

### 9.5 Neto a pagar

| | Valor |
|---|---|
| Total devengado | $3.390.183 |
| − Total deducciones | $251.288 |
| **NETO AL BANCO** | **$3.138.895** |

### 9.6 Provisiones del empleador (lo que el empleado gana pero recibe después)

Base para cesantías e intereses: Salario + auxilio = $2.800.000 + $249.095 + $178.176 + $162.912 = $3.390.183  
Base para vacaciones: Solo salario base = $2.800.000  
*(Nota: El auxilio de transporte entra en la base de prima y cesantías per Ley 1 de 1963 y Ley 50/1990 art. 7)*

| Provisión | Base | % | Provisión mensual |
|---|---|---|---|
| Cesantías | $3.390.183 | 8.33 % | $282.402 |
| Intereses cesantías | $282.402 (cesantías acumuladas) | 1.0 % | $28.240 |
| Prima de servicios | $3.390.183 | 8.33 % | $282.402 |
| Vacaciones | $2.800.000 | 4.17 % | $116.760 |
| **TOTAL PROVISIONES** | | | **$709.804** |

### 9.7 Costo total del empleador

| Concepto | Valor mensual |
|---|---|
| Salario + auxilio + recargos (devengado) | $3.390.183 |
| Salud empleador (8.5 % IBC) | $266.993 |
| Pensión empleador (12 % IBC) | $376.931 |
| ARL riesgo I (0.522 % IBC) | $16.396 |
| Caja de Compensación (4 % IBC) | $125.644 |
| Provisión cesantías | $282.402 |
| Provisión intereses cesantías | $28.240 |
| Provisión prima | $282.402 |
| Provisión vacaciones | $116.760 |
| **COSTO TOTAL EMPLEADOR** | **$4.885.951** |

*(SENA e ICBF: exonerados porque IBC < 10 SMMLV, Ley 1607/2012 art. 114-1 ET)*

### 9.8 Mapa Sankey textual — ¿A dónde va cada peso?

```
ORIGEN: Devengado Bruto del empleado = $3.390.183
─────────────────────────────────────────────────────────────────────

$3.390.183
│
├─► BOLSILLO DEL EMPLEADO: $3.138.895 (92.6 %)
│       El valor que llega a la cuenta bancaria del empleado
│
└─► DEDUCCIONES SS DEL EMPLEADO: $251.288 (7.4 %)
        ├─► Sistema de salud (EPS): $125.644
        │       → Para financiar su propia atención médica
        └─► Fondo de pensiones (AFP/Colpensiones): $125.644
                → Se acumula para su pensión de vejez


ADICIONALMENTE — Lo que el empleador separa cada mes para el empleado:

$709.804 en PROVISIONES
│
├─► Fondo de Cesantías ($282.402)
│       → Se deposita en febrero del año siguiente
│       → El empleado puede retirarlas para vivienda/educación
│
├─► Intereses de cesantías ($28.240)
│       → Pago directo al empleado en enero del año siguiente
│
├─► Prima de servicios ($282.402)
│       → $141.201 se paga el 30 de junio
│       → $141.201 se paga el 20 de diciembre
│
└─► Vacaciones ($116.760)
        → Se paga cuando el empleado tome sus 15 días hábiles
        → Es un derecho acumulado, no un gasto diferido


COSTO DEL EMPLEADOR PAGADO AL ESTADO / SISTEMA (no va al empleado):

$785.964 mensuales
│
├─► EPS (salud empleador 8.5 %): $266.993
├─► AFP (pensión empleador 12 %): $376.931
├─► ARL (accidentes laborales 0.522 %): $16.396
└─► CCFF (Caja Compensación 4 %): $125.644


RESUMEN DE DISTRIBUCIÓN DE CADA $1.000 QUE CUESTA EL EMPLEADOR:

  Empleado (al banco hoy):         $642  ← Lo que el empleado ve
  Empleado (después: prima/ces.):  $145  ← Lo que ganó pero recibirá después
  Sistema SS (por el empleado):     $51  ← Aporta el empleado (SS)
  Sistema SS (costo empleador):    $161  ← Solo costo empleador
  ─────────────────────────────────────
  Total por cada $1.000:         $1.000 (valor neto: $999 por redondeo)
```

---

## 10. RECOMENDACIONES ESPECÍFICAS PARA APP HORARIOS

### 10.1 Modelo de datos adicional requerido

Respecto al research 1 (que cubre estructura de `schedule_entries`, `contract_types`, `shift_templates`), las pantallas de colilla digital requieren una nueva tabla de liquidación:

**Tabla `payroll_periods`:**
```
id                  UUID PK
employee_id         UUID FK profiles
period_start        DATE
period_end          DATE
payment_date        DATE
payment_type        ENUM('quincenal_1','quincenal_2','mensual')
status              ENUM('draft','approved','paid')
created_at          TIMESTAMPTZ
```

**Tabla `payroll_entries`:**
```
id                      UUID PK
payroll_period_id        UUID FK
concept_type             ENUM('salary','transport','overtime_day','overtime_night',
                              'surcharge_night','surcharge_sunday','surcharge_holiday',
                              'bonus_salary','bonus_non_salary','vacation_pay',
                              'prima','cesantias_interest','health_employee',
                              'pension_employee','solidarity_pension',
                              'income_tax','embargo','libranza','voluntary_pension',
                              'afc','union_fee','other_deduction')
is_income               BOOLEAN  (true = devengado, false = deducción)
is_salary_component     BOOLEAN  (constituye salario)
ibc_includes            BOOLEAN  (entra en base de cotización SS)
prestaciones_includes   BOOLEAN  (entra en base de prima/cesantías)
description             TEXT
quantity                NUMERIC  (horas, días, etc.)
unit_value              NUMERIC
total_value             NUMERIC
created_at              TIMESTAMPTZ
```

**Tabla `payroll_provisions`:**
```
id                    UUID PK
payroll_period_id     UUID FK
concept               ENUM('cesantias','cesantias_interest','prima','vacaciones')
base_amount           NUMERIC
rate                  NUMERIC  (8.33, 1.0, 8.33, 4.17)
provision_amount      NUMERIC
accumulated_ytd       NUMERIC  (acumulado año)
created_at            TIMESTAMPTZ
```

**Tabla `payroll_employer_cost`:**
```
id                    UUID PK
payroll_period_id     UUID FK
health_employer       NUMERIC
pension_employer      NUMERIC
arl_employer          NUMERIC
ccff_employer         NUMERIC
total_employer_cost   NUMERIC
created_at            TIMESTAMPTZ
```

### 10.2 Pantallas críticas para el empleado

**Pantalla 1: Mi Pago (resumen)**
- Período y fecha de pago.
- Card principal: "Te depositamos $X.XXX.XXX" (neto) en tipografía grande.
- Desglose colapsable: devengados / deducciones / provisiones.
- Botón: "Descargar colilla PDF".
- Badge: "Nómina electrónica enviada a DIAN" con fecha.

**Pantalla 2: Detalle del pago**
- Lista de devengados con etiqueta, cantidad, valor unitario, total.
- Lista de deducciones con etiqueta, base, porcentaje, total.
- Totales con formato visual prominente.
- Cada línea con ícono de información (i) que abre un bottom sheet / tooltip.

**Pantalla 3: Lo que también ganás este mes**
- Sección "Provisiones del mes" con tabla:
  - Cesantías del mes: $X
  - Prima del mes: $X
  - Vacaciones del mes: $X
  - Intereses cesantías: $X
- Acumulado YTD de cada provisión.
- Mensaje: "Este dinero está reservado para vos. Lo recibirás en [fecha]."

**Pantalla 4: Mi historial de pagos**
- Lista de períodos pagados.
- Gráfico de barras: devengado mensual últimos 6 meses.
- Filtro por año.

**Pantalla 5: Preguntas frecuentes sobre mi pago**
- Sección de ayuda contextual para las 6 preguntas más frecuentes (sección 7 de este documento).
- Con ejemplos calculados sobre el propio salario del empleado.

### 10.3 Tooltips y textos de ayuda recomendados

| Concepto | Tooltip recomendado |
|---|---|
| Auxilio de transporte | "Solo aplica si ganás hasta 2 salarios mínimos. No entra en tu base de salud y pensión, pero sí en tu prima y cesantías." |
| Salud 4 % | "Tu aporte al sistema de salud. Tu empresa pone 8.5 % adicional. Con esto financiás tu atención médica y la de tu familia en la EPS." |
| Pensión 4 % | "Tu ahorro para pensión. Tu empresa pone 12 % adicional. Total: 16 % va a tu fondo de pensiones cada mes." |
| Solidaridad pensional | "Aplica solo si tu salario supera 4 salarios mínimos ($7.003.620). Es un aporte solidario para financiar pensiones de personas con bajos ingresos." |
| Retención en la fuente | "Anticipo del impuesto de renta. Si tu ingreso depurado supera $4.976.000/mes, la empresa lo retiene para el Estado. Si declarás renta, podés recuperarlo o descontarlo." |
| Cesantías | "Un mes de salario por año de trabajo. Tu empresa lo deposita en tu fondo de cesantías antes del 14 de febrero. Podés usarlo para vivienda, educación o recibirlo al terminar el contrato." |
| Prima de servicios | "Un salario extra que te pagan dos veces al año: la mitad en junio y la otra mitad en diciembre." |
| Vacaciones | "15 días hábiles de descanso pagado por año. Se acumulan mes a mes. Cuándo las tomés, te pagamos los días acumulados." |
| IBC | "Ingreso Base de Cotización: es la base sobre la que se calculan tus aportes a salud y pensión. Equivale a tu salario (sin incluir el auxilio de transporte)." |

### 10.4 Disclaimers legales obligatorios

Si la app solo despliega información sin certificarla como nómina oficial (no emite CUNE/nómina electrónica directamente), debe mostrar:

```
Aviso legal: Este comprobante es informativo y fue generado a partir de los datos 
ingresados por el empleador. El documento oficial de pago de nómina es el Documento 
Soporte de Pago de Nómina Electrónica emitido ante la DIAN. En caso de discrepancia, 
prevalece el documento DIAN. Para consultar tu nómina electrónica oficial, 
contactá a tu empleador o accedé al portal DIAN.
```

Si la app emite el CUNE y firma digitalmente (integración con software DIAN), puede omitir ese aviso y decir:

```
Nómina electrónica registrada ante la DIAN. CUNE: [código]. Fecha: [fecha].
```

### 10.5 Flujo de emisión recomendado para el empleador

1. El admin aprueba el borrador de nómina (basado en `schedule_entries` del período).
2. Sistema calcula automáticamente: devengados (de horarios + horas extras aprobadas), deducciones (fórmulas legales), provisiones (fórmulas).
3. Admin revisa y ajusta si es necesario.
4. Admin aprueba → sistema genera colilla digital en portal del empleado + email.
5. (Opcional v2) Sistema envía DSPNE a DIAN vía proveedor tecnológico autorizado.
6. Empleado accede al portal, ve su pago con todos los tooltips.

---

## 11. LAGUNAS Y PREGUNTAS ABIERTAS PARA EL CLIENTE

1. **¿El cliente quiere que App Horarios calcule la nómina o solo la visualice?** Si solo visualiza, el modelo de datos debe aceptar la importación del cálculo del contador. Si calcula, debe certificarse como proveedor tecnológico DIAN para nómina electrónica (proceso costoso).

2. **¿Cuál es el porcentaje de empleados con retención en la fuente en el cliente tipo?** Dado que el cliente tiene empleados de 50–200 personas en servicios/retail, es probable que < 5 % tenga retención. La sección de retención puede ser simplificada en v1.

3. **¿Cómo integrar las horas extras aprobadas en `schedule_entries` (overtime_status='approved') con el cálculo de nómina?** La app ya tiene el módulo de aprobación de horas extras; el enlace con `payroll_entries` es el paso siguiente.

4. **¿El cliente paga quincenal o mensual?** La arquitectura de `payroll_periods` debe soportar ambas, pero la UX varía.

5. **¿El cliente tiene empleados con retención en la fuente (Procedimiento 1 o 2)?** El contador externo ¿provee el dato o la app debe calcularlo?

6. **Reforma pensional (Ley 2381/2024):** Pendiente de fallo de la Corte Constitucional. Si se aprueba, los empleados con salario ≤ 2.3 SMMLV cotizarán obligatoriamente a Colpensiones. Impacto: posible cambio en la tabla de solidaridad pensional. La app debe permitir actualizar estas tasas fácilmente (datos de configuración, no código).

7. **Ley 2466/2025 — Recargo nocturno desde las 19:00:** La app ya soporta `is_night` en `shift_templates`. ¿Se ha actualizado la sugerencia automática de `is_night` para detectar turnos que empiezan a las 19:00? (El research 1 cita el umbral de 21:00 en algunos lugares; debe corregirse a 19:00 según Ley 2466, vigente desde 25 dic 2025).

8. **Visualización de provisiones acumuladas YTD:** ¿El cliente quiere mostrarle al empleado "has acumulado $X.XXX en cesantías en lo que va del año"? Requiere persistir `accumulated_ytd` o calcularlo en tiempo real.

9. **¿Los empleados demo necesitan colilla de pago?** Dado que son placeholders sin auth.users, la respuesta es no; pero si un demo se convierte en real a mitad de mes, ¿cómo se trata el período parcial?

10. **Idioma del desprendible:** Toda la UI es en español (CLAUDE.md). ¿El cliente tiene empleados bilingües (zonas fronterizas, turismo)? Si no, esto no es prioridad.

---

## BIBLIOGRAFÍA (≥ 25 fuentes nuevas)

[^1]: Decreto Ley 2663 de 1950 — Código Sustantivo del Trabajo (CST). Arts. 127-129, 134, 154, 155, 186-192, 249-253, 306-307, 400. Secretaría del Senado. https://www.suin-juriscol.gov.co/viewdocument.asp?ruta=codigo/30019323

[^2]: Infobae Colombia (2026-01-12). "Salario mínimo de 2026: esto es lo que deben pagar las empresas a los trabajadores colombianos en la primera quincena del año." https://www.infobae.com/colombia/2026/01/12/salario-minimo-de-2026-esto-es-lo-que-deben-pagar-las-empresas-a-los-trabajadores-colombianos-en-la-primera-quincena-del-ano/

[^3]: Ley 50 de 1990. Arts. 7, 15 (cesantías en fondos, conceptos salariales). Función Pública — Gestor Normativo. https://www.funcionpublica.gov.co/

[^4]: Pluxee Colombia. "Pagos que no constituyen salario en Colombia." https://www.pluxee.co/blog/estos-son-los-pagos-que-no-constituyen-salario-en-colombia/

[^5]: Ministerio del Trabajo (2019). Concepto 08SE2019120300000020392 — Cuota sindical. https://www.mintrabajo.gov.co/documents/20147/60092336/

[^6]: Buk Colombia. "Seguridad social y pensiones en Colombia 2026: aportes, cálculos y cambios clave." https://www.buk.co/blog/seguridad-social-y-pensiones-en-2025

[^7]: Colpensiones. "Fondo de Solidaridad Pensional — Preguntas frecuentes." https://www.colpensiones.gov.co/preguntas-frecuentes/278/fondo-de-solidaridad-pensional/

[^8]: Bitakora. "Fondo de solidaridad pensional: Tabla porcentajes 2026." https://recursos.bitakora.co/blog/fondo-de-solidaridad-pensional/

[^9]: Corte Constitucional de Colombia. Auto 841 de 2025 — Suspensión temporal Ley 2381/2024 (Reforma pensional). https://www.corteconstitucional.gov.co/relatoria/autos/2025/a841-25.htm

[^10]: Ministerio de Justicia — LegalApp. "Embargos y descuentos de nómina." https://www.minjusticia.gov.co/programas-co/LegalApp/Paginas/

[^11]: Ley 1527 de 2012. Libranzas y descuentos directos de nómina. Congreso de Colombia.

[^12]: Estatuto Tributario, art. 126-1. "Deducción de contribuciones a fondos de pensiones de jubilación e invalidez y fondos de cesantías." https://estatuto.co/126-1

[^13]: Alegra Colombia. "Cómo calcular las prestaciones sociales: prima, cesantías." https://blog.alegra.com/colombia/como-calcular-las-prestaciones-sociales/

[^14]: Nilo.app. "Cómo liquidar cesantías, primas y vacaciones en Colombia 2025: fórmulas y ejemplos." https://nilo.app/blog/como-liquidar-cesantias-primas-y-vacaciones-en-colombia-2025-formulas-y-ejemplos/

[^15]: Pluxee Colombia. "Prestaciones sociales en Colombia: guía práctica 2026." https://www.pluxee.co/blog/prestaciones-sociales-en-colombia/

[^16]: Ley 1393 de 2010, art. 32. Obligación de informar aportes a protección social. Congreso de Colombia.

[^17]: Corte Suprema de Justicia — Sala Laboral. Sentencias SL3770-2020 y SL3392-2019 (indemnización moratoria). Citadas en Gerencie.com: https://www.gerencie.com/desprendibles-o-recibos-de-pago-de-nomina-son-obligatorios.html

[^18]: Buk Colombia. "Estructura y elementos clave en un desprendible de pago." https://www.buk.co/blog/estructura-y-elementos-clave-en-un-desprendible-de-pago

[^19]: Siigo. "Desprendible de nómina: beneficios y digitalización." https://www.siigo.com/blog/desprendible-de-nomina/

[^20]: DIAN. "Páginas — Documento Soporte de Pago de Nómina Electrónica." https://www.dian.gov.co/impuestos/Paginas/Sistema-de-Factura-Electronica/Documento-Soporte-de-Pago-de-Nomina-Electronica.aspx

[^21]: AFS Consulting. "¿Qué es la Resolución 000227 de 2025 de la DIAN?" https://afsconsulting.co/que-es-la-resolucion-000227-de-2025-de-la-dian/

[^22]: Gusto Help Center. "View and understand your paystub and track your pay." https://support.gusto.com/article/100010018100000/

[^23]: Rippling. "Rippling vs. Gusto: The 2025 Definitive Comparison for HR and Payroll." https://www.rippling.com/blog/rippling-vs-gusto-hr-payroll-comparison

[^24]: Actualícese. "Nómina electrónica en 2026: cambios normativos y puntos clave que debes revisar." https://actualicese.com/nomina-electronica-en-2026-cambios-normativos-y-puntos-clave-que-debes-revisar/

[^25]: Siigo Portal de Clientes. "Generar desprendibles de nómina electrónica Pro/Plus." https://siigonube.portaldeclientes.siigo.com/generar-desprendibles-de-nomina-electronica-pro-plus/

[^26]: Alegra Colombia. "Desprendibles de pago de nómina: guía completa para empresas." https://blog.alegra.com/colombia/desprendibles-de-pago-de-nomina/

[^27]: Wagestream (Stream). "The Employee App That Boosts Financial Wellbeing." https://wagestream.com/en-us/solutions

[^28]: Ley 1 de 1963, art. 7 / Ley 50 de 1990, art. 7. Inclusión auxilio de transporte en prestaciones sociales. Citado en: Porvenir. "¿Las cesantías se liquidan con el auxilio de transporte?" https://www.porvenir.com.co/cesantias/liquidacion-cesantias-auxilio-transporte

[^29]: Ministerio del Trabajo. "El no pago de salario, prestaciones e incumplimiento de normas de seguridad, son las mayores quejas de trabajadores." (Comunicado, septiembre 2023). https://www.mintrabajo.gov.co/comunicados/2023/septiembre/

[^30]: DIAN. Resolución 000238 del 15 de diciembre de 2025 — Fijación UVT 2026: $52.374. Citado en: Siempre al Día. "Tabla de retención en la fuente 2026." https://siemprealdia.co/colombia/impuestos/tabla-de-retencion-en-la-fuente-2026/

[^31]: Alegra Colombia. "Tabla de retención en la Fuente 2026: Bases y Tarifas." https://blog.alegra.com/colombia/tabla-de-retencion-en-la-fuente-2026/

[^32]: Siempre al Día. "Retención en la fuente por salarios 2026." https://siemprealdia.co/colombia/impuestos/retencion-en-la-fuente-por-salarios/

[^33]: Gerencie.com. "Horas extras y recargos nocturnos, dominicales y festivos." https://www.gerencie.com/horas-extras-y-recargos-nocturnos-dominicales-y-festivos.html

[^34]: Siempre al Día. "Horas extra y recargos nocturnos 2026." https://siemprealdia.co/colombia/derecho-laboral/horas-extra-y-recargos-nocturnos/

[^35]: Vinnuretti Legal. "Costo del Salario Mínimo para el Empleador en el año 2026." https://legal.vinnuretti.com/Aht_1_012026.aspx

[^36]: Actualícese. "Auxilio de transporte y prima de servicios: cómo afecta al cálculo." https://actualicese.com/auxilio-de-transporte-y-prima-de-servicios-como-afecta-al-calculo/

[^37]: Siempre al Día. "Auxilio de transporte 2026." https://siemprealdia.co/colombia/derecho-laboral/auxilio-de-transporte/

[^38]: Presidencia de la República. "Salario vital: $2.000.000 a partir de enero de 2026." (Decretos 1469 y 1470 del 29 de diciembre de 2025). https://www.presidencia.gov.co/prensa/Paginas/Salario-vital-2-000-000-a-partir-de-enero-de-2026-251230.aspx

[^39]: Buk Colombia. "Retención en la fuente 2026 Colombia: tabla, tarifas y cómo calcularla." https://www.buk.co/blog/retencion-en-la-fuente-2026

[^40]: Libre Gestión. "Retención en la fuente por salarios 2026 en Colombia: Guía completa." https://web.libregestion.com/retencion-fuente-salarios-2026-colombia/

[^41]: Ministerio del Trabajo. Decreto 0159 de 2026 — Fijación transitoria del SMMLV. https://dapre.presidencia.gov.co/normativa/normativa/DECRETO%20No.%200159%20DEL%2019%20DE%20FEBRERO%20DE%202026.pdf

[^42]: UGPP. "Calculadora para Ingreso Base de Cotización (IBC)." https://www.ugpp.gov.co/calculadora-ibc

[^43]: Minjusticia — LegalApp. "¿Cómo y quién paga el salario durante una incapacidad laboral?" https://www.minjusticia.gov.co/programas-co/LegalApp/Paginas/Como-y-quien-paga-el-salario-durante-una-incapacidad-laboral.aspx

---

*Documento generado el 25 de abril de 2026. Fuentes verificadas a esa fecha. Los valores de SMMLV, UVT y porcentajes de recargos dominicales están sujetos a actualización en julio 2026 (cambio de jornada y recargo dominical). Revisar en esa fecha.*
