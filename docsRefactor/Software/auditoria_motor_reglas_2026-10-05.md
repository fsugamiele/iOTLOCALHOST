# Auditoría profunda del motor de reglas + plan de mejora

**Fecha:** 2026-10-05 · **Alcance:** edge-engine completo, cadena editor→backend→motor, verdad de datos (Mongo `iotix`, 7 días de telemetría y notificaciones) · **Método:** solo lectura (código, logs, Mongo); cero modificaciones al sistema.

> Motivación (Franco): el motor de reglas es la columna vertebral del producto. Si las alarmas fallan, son inconsistentes o se generan falsas alarmas por configuración o cálculos erróneos, se pierde credibilidad y el producto termina sin aceptación.

---

## Parte 1 — Hallazgos consolidados

Convención de severidad: **P0** = genera falsas alarmas o alarmas mudas hoy · **P1** = degrada confianza/predictibilidad · **P2** = deuda técnica/higiene.

### A. Motor de reglas (edge-engine)

| # | Sev | Hallazgo | Evidencia |
|---|---|---|---|
| A1 | **P0** | **Estado compartido entre equipos**: `cooldownState`, `activeState` y el `windowState` de tipo S se clavean por `ruleId` SIN `dId`. Con 2+ equipos del mismo deviceType se mezclan: el cooldown de uno silencia al otro, el resolve de uno cierra la alarma del otro. Medido: 91–96% de los resolves de las reglas ELTEK llevan el dId del equipo equivocado. | `ruleEngine.js:288-297, 331-333`, `typeS.js:19`; análisis de `notifications` 48h |
| A2 | **P0** | **Resolve prematuro en tipo S**: cualquier mensaje no-matching (aunque la ventana siga cumpliendo `countThreshold`) emite resolve. Combinado con A1 produce el ciclo fire→resolve→fire cada ~30 s observado en producción. | `ruleEngine.js:166-175` (rama `else if (activeState.has)` sin consultar `count`) |
| A3 | **P0** | **Re-fire mientras la condición sigue activa**: D/S/M re-notifican cada `cooldownSec` sin supresión de "ya está activa". Medido: cat-eltek-A2 refirea con mediana 317 s ≈ su cooldown de 300 s; 1650 fires/7d. Cross sí suprime (via `firedKey`) → inconsistencia semántica entre tipos. | `ruleEngine.js:fireAlarm` (sin check de `activeState` pre-existente) vs `typeCross.js:218,227` |
| A4 | **P0** | **Tipo C no marca `activeState` al disparar**: sus alarmas nunca resuelven por condición ni reciben resolve-by-edit; quedan "abiertas" para siempre. Es el único tipo que omite el parámetro. | `ruleEngine.js:61-66` (falta `activeState` en la llamada) |
| A5 | **P0** | **Regla M activa nunca resuelve si la métrica pasa a `insufficient`** (buffer bajo minSamples, miembros de spread < 2, input desaparecido): `if (res.detail) continue` salta también el resolve → alarmas M zombie en `activeState`. Contradice spec_motor_m §5. | `ruleEngine.js:183` |
| A6 | **P0** | **M2 instantáneas (ratio/divergence/spread) leen siteState sin control de frescura**: `consumption_tank` queda congelado cuando el grupo se apaga → la alarma de sifoneo **persiste y re-dispara con el grupo apagado**, exactamente el caso que la spec de sifoneo §6#1 prohíbe. El patrón de frescura existe (`_lastUpdate` + `SUM_STALENESS_MS` en typeCross) pero M2 no lo usa. | `typeM.js:122-131`; spec_deteccion_sifoneo_eficiencia §6 |
| A7 | **P1** | **Staleness es por-variable, no por-equipo**: si el equipo publica 10 variables y la regla mira una que deja de llegar, dispara aunque el equipo esté vivo (y viceversa: no refresca con otras variables). La spec §14 dice "si un **equipo** deja de reportar". | `ruleEngine.js:48` (dispatch por variable) + `typeM.js:106` |
| A8 | **P1** | **dutyCycle y flatline de ventana larga no persisten**: la ventana de 8 días de cat-AR-08/cat-CB-06 vive solo en memoria; un reinicio del edge la pierde y la regla queda `insufficient` hasta re-armar. Contradice spec §11-D2 ("los acumuladores de M3 persisten en Mongo… un reinicio NO pierde el acumulado"). | `typeM.js:187`, `msoftstate.js` (solo `_persist`) |
| A9 | **P1** | **Editar una regla acumuladora borra lo acumulado**: el cleanup de reload borra las claves `ruleId:dId` de `mState`; al próximo mensaje el acumulador renace en 0 y el flush lo sobrescribe en Mongo. Editar el umbral de `cummins-pcc-oil-life` borra las 96 h de vida de aceite acumuladas. Además el cleanup no borra los docs de la colección `msoftstate` → una regla recreada con el mismo ruleId rehidrata un `acc` obsoleto. | `reloadState.js:100-107`, `msoftstate.js:28-34` |
| A10 | **P1** | **Keys zombie de resolve en reload**: `cleanupStateForRules` no borra `${ruleId}:resolveStart` (D) ni `${siteCode}:${ruleId}:resolveStart` (cross). Una regla editada durante su ventana de resolve puede cerrar la alarma nueva antes de tiempo. El propio comentario del módulo advierte que las keys nuevas deben registrarse ahí. | `reloadState.js:91-119` vs `ruleEngine.js:230`, `typeCross.js:171` |
| A11 | **P2** | **`thresholdUsed`/`value` invertidos en M respecto de la spec** (§8/§9 piden `thresholdUsed=metricValue`): el motor manda la métrica en `value` y el umbral en `thresholdUsed`. No afecta el disparo; rompe trazabilidad y el criterio de verificación de la spec. | `ruleEngine.js:186-191, 268-273` |
| A12 | **P1** | **`eq`/`neq` estrictos + bool**: `evaluateD` usa `===`. La cadena editor coacciona bool a `1/0` (`coerceValue`), pero si la telemetría publica JSON `true`, `true === 1` es false → la regla eq sobre bool nunca dispara. `condition.value` es `Mixed` en el schema: nada garantiza tipos compatibles. | `typeD.js:6`, `ruleSentence.js:246`, `rule_definition.js:24` |
| A13 | **P1** | **`rule.cooldownMinutes` fantasma**: el INFO "setpoint no disponible" lee `(rule.cooldownMinutes || 60)` — campo que no existe en el schema ni lo escribe nadie. La cadencia del INFO queda fija en 60 min, desacoplada del `cooldownSec` real. | `ruleEngine.js:81` |
| A14 | **P2** | **Config muerta de punta a punta**: `source_filter` (schema + seeds, nadie lo lee), `reset_behavior` ('manual' declarado TODO en typeS), `setpointSource.register/scale` (el motor nunca los aplica), `graceSec` en reglas D/S/M (solo cross lo consume). El usuario los configura y no hacen nada. | grep sobre edge-engine; `rule_definition.js:82-84` |
| A15 | **P1** | **Hoja cross con device ausente devuelve `false`, no `null`**: en una rama AND, un equipo ausente/apagado **mata el fuego** en vez de neutralizarlo (semántica tri-state solo existe para hojas suma). Una regla "falla de red Y grupo no arranca" se desactiva silenciosamente si el ATS deja de reportar. | `typeCross.js:151-152` |
| A16 | **P2** | **SIGTERM sin flush final** de acumuladores: se pierden hasta 30 s de acumulado por reinicio. | `index.js:274-279` |
| A17 | **P2** | **`SUM_STALENESS_MS` = 90 s hardcoded** vs cadencia real del GEN ~64 s: margen de 1.4×; un solo mensaje perdido deja la hoja suma sin evaluar (retorno neutro). | `typeCross.js:25` |
| A18 | **P2** | **`spread` culpa a un equipo incluso con 2 miembros** (empate respecto a la mediana → outlier arbitrario por orden del Map). Spec §6-C: con 2 devices avisar sin culpar. | `typeM.js:153-157` |
| A19 | **P2** | **`cumulativeSince` reset de recarga hardcodeado a +1** unidad cruda: recargas fraccionadas lentas (< 1 punto por muestra) nunca resetean el acumulado → falso positivo de sifoneo. Mismo `> 1` arbitrario en detección de repostaje de autonomía. | `typeM.js:256`, `autonomy.js:177,278` |
| A20 | **P2** | Menores: credenciales de Mongo en texto plano en `logs/edge-*.log` (línea "Mongo conectado"); `hydrateSiteState` usa `Object.keys(records).length` sobre un array; `buildSnapshot` asume ruleId único global sin validar. | `index.js:80`, `siteState.js:100`, `reloadState.js:27` |

### B. Cadena de configuración (editor web → backend → motor)

El "modo experto" del editor **está muerto** (el template ya no tiene el modal ni el wizard; `RuleCard` solo emite edit/delete y todo abre el SentenceEditor). Consecuencia estructural: **ningún campo fuera de la "frase" es editable por UI** (cooldownSec, graceSec, resolveGraceSec, escalateAfterMinutes, correlationParent, fallbackToD, on_missing_ref), y lo que `sentenceToRule` no preserva se destruye al guardar.

| # | Sev | Hallazgo | Evidencia |
|---|---|---|---|
| B1 | **P0** | **Round-trip no idempotente — guardar sin tocar nada muta la regla**: se pierden `fallbackToD` (C vuelve siempre a `true`), `on_missing_ref`, `source_filter`, `reset_behavior`, `correlationParent` (cross), `resolveGraceSec` (borrado en C/S/M por `_packId.vue:700`), `graceSec` (borrado en D), `escalateAfterMinutes` (no se preserva — una regla C con escalada la pierde en silencio). | `ruleSentence.js:287-395`, `_packId.vue:684-701` |
| B2 | **P0** | **Redondeo a minutos**: `durationSec` de ventanas S y **todas las M con ventana** se convierte `round(sec/60)*60` en cada edición (50 s → 60 s; 90 s → 120 s). cat-eltek-A1 ya sufrió 50→60. | `ruleSentence.js:322, 428` |
| B3 | **P1** | **`cooldownSec: 0` se reescribe a 300** (falsy), y el cooldown no es editable en ninguna UI: todo lo nuevo nace con 300 s. | `ruleSentence.js:301`, `SentenceEditor.vue:418` |
| B4 | **P1** | **`mWindow.minSamples` de los seeds pisado** por hardcodeos del editor (slope/projection→3, dutyCycle/stepJump→2, flatline/variance→3): una regla sembrada con minSamples 6/10 dispara con menos evidencia tras cualquier edición. | `ruleSentence.js:331-370` vs seeds |
| B5 | **P1** | **Unidad de slope se compone en cada guardado**: `°C/min` → `°C/min/min` → `°C/min/min/min`… se propaga a notificaciones. | `ruleSentence.js:332` + `:408` |
| B6 | **P1** | **El editor muestra controles que el guardado ignora**: el `op` de staleness/flatline se fuerza a `gte`/`lte` aunque el usuario elija otro; `condition.value` de C es inerte cuando hay setpoint (y si queda vacío se coacciona `''→0`, un umbral de fallback que nadie tipeó); la fila de variable sigue editable en presets M aunque la UI promete "solo umbral editable" (desincroniza `mParams.weightVariable`). | `ruleSentence.js:359,364`, `SentenceEditor.vue:153-157, 348`, `ruleSentence.js:248` |
| B7 | **P1** | **Cross plano de 1 sola hoja se degrada a D** al re-editarlo: cambia la semántica de evaluación (árbol por site → comparación por mensaje) y pierde `graceSec`. | `ruleSentence.js:217-219, 278` |
| B8 | **P1** | **Gaps de validación** (`ruleValidation.js`): hojas equipo de cross no validan `op` contra el enum ni `value` numérico (la hoja suma sí — inconsistencia interna); `deviceType`/`variable` de reglas D/C/S/M nunca se validan contra fichas → un typo crea una **regla fantasma** que el motor silencia para siempre (gate `rule.variable !== variable`); `ratio`/`divergence` no exigen `deviceType` por input; `eq`/`neq` sobre floats se permite sin advertencia (casi nunca matchea por precisión). | `ruleValidation.js:59-64, 197-202`; `ruleEngine.js:47-48` |
| B9 | **P2** | PUT de pack es update-replacement: si se creara por PUT sin `version`, el campo queda borrado. Cross anidado pierde `unit` al guardar. Ratio fuerza `unit=''` (borra "L/kWh" de la seed). | `rulepacks.js:165-169`, `SentenceEditor.vue:411-421` |

### C. Reglas vs verdad de datos (7 días de telemetría real)

| # | Sev | Regla / grupo | Realidad medida | Veredicto |
|---|---|---|---|---|
| C1 | **P0** | **ELTEK signo/umbral**: `dc_bus_voltage` es NEGATIVO (rango −49.5…−46.5, avg −48.0). Las seeds asumían positivo (A1 `lt 52`, A2 `lt 48` → siempre verdaderas → 1600+ fires/7d cada una). Hoy A2 es S con `lt −47` → **matchea el 87% de las lecturas** (condición casi permanente + flapping A1/A2). A1 fue editada hoy a `gt 57` → ahora es **inalcanzable** (regla muerta disfrazada de arreglo). `cat-DC-05` (`gt 57`) también inalcanzable. | `tools/seed_rulepacks_f3/manifest.js:146-180`; stats Mongo | Reglas mal planteadas: evaluar magnitud (\|V\|) o comparar contra −54/−48 nominales |
| C2 | **P0** | `eltek-accel-dc-bus-voltage` (acceleration `lt −0.05`): simulación offline sobre 6 h reales → la métrica cruza −0.05 en **24–26% de las ventanas** con sensor sano (p50 ≈ 0, p99 ≈ 0.2). Umbral dentro del ruido. | réplica exacta de `slopePerMin`/`computeMetric` | Subir umbral a ≥ 0.2–0.3 y/o exigir persistencia |
| C3 | **P1** | **Baselines (z>3)**: alcanzable por puro ruido en coolant_temp (0.5% ventanas, z máx 4.05) y exhaust_temp (1.1%, z máx 3.55) → falsos positivos estadísticos; en `fuel_efficiency` z máx 2.91 → reglas **inertes**; `eltek-baseline-temperature` **muerta** (sensor clavado en 28.0, σ=0 → z=0 siempre; el dato constante amerita flatline, no baseline). | simulación 12 h | Umbral z adaptativo o minSamples mayor; reemplazar la muerta |
| C4 | **P1** | **Umbrales inalcanzables**: `cat-GE-04` (coolant_temp gt 105; máx real 100), `cat-GE-07` (rpm gt 1725; máx real 1510), `cat-CR00061-F1b` (mains_voltage gt 242; máx 230). Reglas que nunca pueden disparar = falsa sensación de cobertura. | stats 7d | Recalibrar o eliminar |
| C5 | **P1** | **fuel_level bajo el 25–34% del tiempo** (gen-fuel-warn `lt 25` match 34%, gen-fuel-crit `lt 10` match 25.1%) → 574+392 fires/7d. El tanque pasa un cuarto del tiempo en "crítico": o el simulador drena demasiado, o los umbrales no reflejan la operación. `gen-autonomy-crit` (392 fires) es eco de lo mismo. | stats 7d | Revisar umbrales vs operación real |
| C6 | **P2** | `gen-batt-warn/crit`: 197 fires c/u con solo ~120 lecturas que matchean en 7d — más fires que lecturas matcheantes; requiere verificación adicional (posible tipo mixto en `value` o doble procesamiento). | counts Mongo | Investigar |
| C7 | **P2** | `fault_code` siempre 0 (number) en 7d → GE-12/16/17, AR-02 inertes (correcto como trampas de falla, pero nunca ejercitadas: el simulador no genera fallas → cobertura no demostrable). | distinct fault_code | Simulador debería inyectar fallas |
| C8 | **P2** | Reglas fantasma en historial: `eltek-desbalance`, `gen-sifoneo`, `cummins-pcc-sifoneo` ya no existen en packs (renombradas) — su historial queda huérfano. | notifications vs rulepacks | Convención de ruleId inmutable o migración |
| C9 | — | **Sanas**: staleness (gap máx real 68 s vs umbral 900 s, margen 13×, 0 fires espurios), cross con hojas existentes (todas las hojas referencian variables reales), D con fault_code (tipo correcto), spreads/ratios con inputs existentes, autonomía (jerarquía metered/measured/estimated conforme a spec), EDGE-2 (INFO setpoint + escalada) conforme. | — | — |

---

## Parte 2 — Plan de mejora

Objetivo del plan: **cero falsas alarmas por defectos del motor, cero alarmas mudas por configuración, y una cadena de edición donde lo que el usuario guarda es exactamente lo que el motor evalúa.**

### P0 — Credibilidad inmediata (sprint 1)

1. **Estado por `ruleId:dId` en todo el motor** (A1, A2, parte de A3).
   - Clavear `cooldownState`, `activeState`, `windowState` (S) como `${ruleId}:${dId}`. Ajustar `cleanupStateForRules` (limpieza por prefijo, patrón ya usado para mState) y los resolve-by-edit.
   - Tipo S: resolver solo cuando `count < countThreshold` tras la purga, no ante cualquier mensaje no-matching.
   - Criterio de aceptación: replay del simulador con 2 ELTEK → 0% de resolves con dId cruzado; fire-to-fire de una regla activa = ∞ mientras no resuelva.
2. **Supresión de re-fire mientras la alarma está activa** (A3): si `activeState` ya tiene la regla:device, no re-notificar (el cooldown solo gobierna el primer fire). Decisión de producto: opcionalmente un "recordatorio" cada N horas configurable, nunca cada 300 s.
3. **Tipo C simétrico** (A4): pasar `activeState` en el fireAlarm del caso C y emitir resolve-by-condition cuando deja de cumplirse.
4. **Resolve de M en `insufficient`** (A5): si la regla está activa y la métrica pasa a insufficient por falta de datos, emitir resolve con `reason: 'insufficient-data'`.
5. **Frescura obligatoria en M2** (A6): `readOne`/`evaluateInstant` deben verificar `eventTs − _lastUpdate[variable] ≤ ventana` (config por regla, default 3× cadencia declarada o 5 min). Sin frescura → `insufficient` (retorno neutro, como hojas suma).
6. **Re-plantear las reglas ELTEK con el signo real** (C1, C2): normalizar en la ficha/driver o usar magnitud; umbrales sobre −54 V (flotación) / −48 V (descarga) con hysteresis. A1 hoy está muerta (`gt 57`): corregirla, no dejarla disfrazada. Subir `eltek-accel` a umbral fuera del ruido medido (≥ 0.25 V/min por ventana) con persistencia.
7. **Recalibrar umbrales inalcanzables** (C4): GE-04, GE-07, F1b, DC-05. Proceso: todo umbral nuevo se valida contra 7 días de historial antes de activarse (ver P2-herramientas).

### P1 — Predictibilidad (sprint 2)

8. **Editor: round-trip idempotente** (B1–B7). Regla de oro: `sentenceToRule` debe preservar del `existing` TODO campo que la frase no representa (lista blanca explícita: `fallbackToD, on_missing_ref, escalateAfterMinutes, correlationParent, source_filter, reset_behavior, resolveGraceSec, graceSec, cooldownSec, mWindow.minSamples, mParams extras, inputs con deviceType, unit`). Sin redondeo a minutos (se conservan segundos). Test de idempotencia: `sentenceToRule(ruleToSentence(r)) ≡ r` para las ~68 reglas sembradas, como test unitario permanente.
9. **Revivir superficie de edición de parámetros operativos** (B3, B6): cooldownSec, graceSec, resolveGraceSec visibles/editables; en staleness/flatline/presets, deshabilitar los controles que el guardado ignora (o hacerlos efectivos); en C, explicar el doble rol de `condition.value` (fallback) y no coaccionar `''→0`.
10. **Validación anti-regla-fantasma** (B8): validar `op`/`value` en hojas equipo de cross; validar `deviceType`/`variable` de TODA regla contra equipmentsheets (warning no bloqueante como mínimo; idealmente el PUT devuelve "esta regla no puede disparar con las variables declaradas"); advertir `eq/neq` sobre float y umbral bool vs telemetría booleana (A12: normalizar bool a 0/1 en la ingesta o comparar con coerción explícita).
11. **Reload sin bajas colaterales** (A9, A10): no borrar `mState` de reglas acumuladoras cuando el diff solo tocó umbral/severidad/textos (comparar la "parte evaluativa" de la huella); borrar las keys `resolveStart`; borrar los docs huérfanos de la colección `msoftstate`; flush en SIGTERM (A16).
12. **Staleness por equipo** (A7): cualquier mensaje del dId refresca; la regla mira el silencio del equipo (mantener opcionalmente el modo por-variable como `mParams.watchVariable`).
13. **Persistencia de dutyCycle/flatline largas** (A8): o persistir el buffer resumido en `msoftstate`, o adenda firmada a la spec D2 que las excluya documentando la pérdida en reinicio.
14. **`thresholdUsed`/`value` según spec M** (A11) + eliminar el campo fantasma `cooldownMinutes` (A13) + decidir destino de `source_filter`/`reset_behavior`/`setpointSource.scale`/`register` (A14): implementarlos o sacarlos del schema/editor. Config muerta = credibilidad perdida.

### P2 — Robustez estructural (sprint 3)

15. **Hysteresis / deadband nativo** en typeD (banda de entrada/salida, p.ej. dispara a < −48, resuelve a > −49): elimina el flapping de umbral por ruido sin depender de resolveGraceSec. Ya hay precedente (`seeds/migrate_deadband_p2.js` sugiere que se pensó).
16. **resolveGraceSec para S y M** (hoy solo D y cross lo tienen) — simetría de ciclo de vida entre tipos.
17. **Hoja cross con device ausente → `null` neutro** (A15) en vez de `false`, consistente con la semántica tri-state de las hojas suma.
18. **Herramienta "probar regla contra historial"**: endpoint/CLI que evalúa una regla (o pack) contra los últimos N días de `db.data` y reporta cuántas veces habría disparado → obligatoria antes de activar umbrales nuevos (habría detectado C1, C2, C4 antes de producción). El harness de `docsRefactor/harness/` es el lugar natural.
19. **Simulador con inyección de fallas** (C7): fault_codes, sifoneos, cortes — sin esto la cobertura de reglas trampa no es demostrable en demo.
20. **Higiene** (A17–A20, B9, C6, C8): `SUM_STALENESS_MS` configurable por deviceType; spread sin culpable con 2 miembros; reset de recarga de `cumulativeSince` paramétrico; credenciales fuera de los logs; investigar fires>matches de gen-batt; convención de ruleId inmutable (o migración de historial al renombrar).

### Métricas de éxito (medibles sobre `notifications`)

- Resolves con dId distinto al fire previo: **0%** (hoy 91–96% en reglas ELTEK).
- Fires/día de reglas umbral estables (ELTEK A1/A2, accel): de ~470/día combinados a **< 5/día** (eventos reales).
- % de fires seguidos de resolve en < 90 s: de 96% a **< 5%**.
- Toda regla activa tiene al menos 1 fire o 1 resolve en 30 días, o se reporta como "regla muerta" en un informe semanal automático (anti falsa-cobertura: C4 hoy).
- Test de idempotencia del editor verde en CI sobre todos los packs sembrados.

---

## Parte 3 — Alineación con las decisiones firmadas del refactor (2026-10-05)

Contraste del plan contra `WanomiRefactor.md` (DEC-REF-1..119), las 6 specs de Software, COSTURAS.md y los racionales embebidos en el código. **Conclusión: ninguna contradicción dura; 6 ítems alineados, 4 en terreno libre, 5 requieren adenda firmada antes de implementar.**

### Aligned / terreno libre (implementables sin trámite documental)

| Ítem del plan | Veredicto | Base |
|---|---|---|
| P0-4 Resolve de M en `insufficient` | **Alineado** | spec_motor_m §5 lo exige ("cuando `!fired` y la regla está en activeState → emite resolve"); además DEC-REF-64.a ("ninguna alarma abierta muere en silencio") prohíbe las alarmas M zombie |
| P0-5 Frescura en M2 (ratio/divergence/spread) | **Alineado** | spec_sifoneo §6#1 presupone que con grupo apagado divergence/ratio quedan `insufficient` — imposible sin frescura. Precedente firmado idéntico: DEC-REF-65.b ("nunca totales con valores congelados") |
| P1-12 Staleness por equipo | **Alineado** | spec_motor_m §14 (letra firmada: "si un **equipo** deja de reportar") + §8-D3 + BACKLOG-EDGE-4. El modo por-variable actual es accidente del gate `rule.variable !== variable`, no una decisión |
| P1-8/9 Editor idempotente + campos operativos editables | **Alineado** | DEC-REF-116: "sencillo para el operador **sin perder capacidad del motor**"; spec_reglas: "el payload que se guarda es el mismo RuleDefinition de siempre". La destrucción actual de campos es drift sin decisión |
| P1-10 Validación anti regla-fantasma | **Alineado** | Extiende el patrón firmado #69/S5 (estricto a nivel pack + warning en hojas) y DEC-REF-66. Único límite: NO convertir hojas cross en 400 bloqueante sin adenda a #69 (brickearía cummins-pcc-v1 por sus hojas ATS de la cascada DEC-REF-53) |
| P1-13 Persistir dutyCycle | **Alineado** | spec_motor_m §11-D2 nombra dutyCycle explícitamente como persistente; el comentario "NO persiste" de typeM.js contradice la spec firmada |
| P0-1 Estado por `ruleId:dId` | **Terreno libre** | Ninguna DEC deliberó el scope global; DEC-REF-53-A asumía 1 equipo/regla. Precedente a favor: spec_motor_m §4 ya fijó `${ruleId}:${dId}` para mState ("M aplica por device, no global") |
| P2-15 Hysteresis en typeD | **Terreno libre** | El deadband existente (DEC-REF-105 D-2) es de **publicación** del device, otra capa. La propuesta debe declarar por qué deadband-de-publicación + resolveGraceSec (D-2) no alcanzan para el ruido intra-deadband, y respetar DEC-REF-66.c (campo nuevo → schema primero, commit aparte) |
| P2-17 Hoja cross ausente → null neutro | **Terreno libre** | DEC-REF-65.b decidió tri-state solo para hojas suma; la extensión a hojas equipo es análoga y coherente con spec_umbral_por_referencia §6#5. Documentar en la DEC que en rama AND cambia `false` (cierra alarma) por `null` (no evalúa) |
| P1-12 resolveGraceSec para M | **Terreno libre** | DEC-REF-102 D-2 (#77) es anterior al motor M (#86); no lo excluyó |

### Requieren ADENDA firmada antes de implementar

| Ítem del plan | Decisión a enmendar | Letra vigente | Adenda propuesta |
|---|---|---|---|
| P0-2 (tipo S resolve solo si count < threshold) | DEC-REF-64.e (menor) | Ganchos de resolve documentados como "typeD/S `!triggered` con activeState.has" | Redefinir `!triggered` para S como "ventana ya no cumple countThreshold tras purga" — coherente con DEC-REF-59 (resolve = transición activa→inactiva real) |
| P0-3 (supresión de re-fire) | **DEC-REF-27** + "No tocado" de **DEC-REF-102** | "el motor re-emite cada cooldownSec mientras la condición persiste; al cesar, el pin vuelve a verde solo" (el auto-clareo del pin depende del re-fire); DEC-REF-102 declaró "cooldown intra-fire intacto" | Nueva semántica: un fire por episodio + recordatorio opcional cada N h (configurable). Redefinir el mecanismo del pin para que no dependa del re-fire. Nota: **no** contradice DEC-REF-102 D-1 (que gobierna la recurrencia post-resolve y queda intacta) |
| P0-4-parcial / tipo C resolve (P0-3 del plan, ítem 3 de P0) | DEC-REF-64.c/e | C quedó fuera del resolve por condición deliberadamente ("no-ref/fallback no equivale a condición resuelta") | Variante refinada: marcar `activeState` siempre; emitir resolve-by-condition **solo cuando `mode==='calibrated'`** (el racional de exclusión solo cubre fallback/no-ref) |
| P1-11 (reload no borra acumuladores) | **DEC-REF-58 D-3 / DEC-REF-61.d** | Huella = JSON íntegro; "cualquier cambio semántico — condition, threshold, severity… — cambia la huella" → limpieza total | Adenda: distinguir "huella evaluativa" (cambios que invalidan estado: variable, deviceType, métrica, ventana) de "huella superficial" (umbral, severidad, textos) o eximir el estado `_persist`. Atenuante: 61.d (2026-07-07) es anterior al motor M; nadie ponderó "editar umbral destruye 96 h de vida de aceite" |
| P1-12 resolveGraceSec para S | DEC-REF-102 D-2 | "type S ya es temporal por construcción y no lo necesita" | Atenuante: DEC-REF-106 ya superó D-2 en las reglas sembradas (`resolveGraceSec=0`, el deadband de publicación absorbe el flap) — la adenda registra la simetría entre tipos |
| P1-13 flatline (persistir o excluir) | spec_motor_m §11-D2 | D2 nombra accumulator/dutyCycle/cumulativeSince; flatline (M4) no está | Adenda a la spec cualquiera sea el camino elegido |

### Relación con spec_umbral_por_referencia (trabajo nuevo, untracked, reserva DEC-REF-120)

- **Compatible y complementaria.** El ítem P1-8 (editor idempotente) es **habilitante** de esa spec: hoy el editor destruye `on_missing_ref`, del cual depende la semántica de referencias.
- Conviene implementar junto con P2-17 (tri-state de hojas equipo): la spec §6#5 pide `null` para ref irresoluble — misma mecánica.
- La spec elige implementar `setpointSource.scale` (resuelve parcialmente A14) — pero eso tensiona el corolario de DEC-REF-25 ("register/scale son metadata del driver, no del evaluador"): DEC-REF-120 debe declararlo explícitamente como precisión de DEC-REF-25 o usar otro campo (p.ej. `condition.factor`).
