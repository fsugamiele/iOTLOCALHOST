# Plan de corrección del motor de reglas (priorizado y ejecutable) · 2026-10-05

**Autor:** auditoría independiente (verificada contra código + 7–11 d de Mongo). Acompaña a
`auditoria_motor_reglas_2026-10-05.md`. Reprioriza y corrige su Parte 2 con lo que **medí yo**.

> Regla de método: cada bloque P0/P1 baja a **spec firmada** (plantilla del proyecto, 0 preguntas
> abiertas, ≤6 archivos) **antes** de tocar código (DEC-PROC-6). Este documento es el **roadmap**
> y el **orden**, no la implementación. Todo criterio de aceptación se mide sobre `notifications`/`data`.

## Números de partida (medidos hoy — son la línea base a batir)
- Resolves con `dId` cruzado: **82–89%** (A2/accel).
- Fires/día de A1+A2+accel: **≈829/día**.
- `cat-eltek-A2`: **2755 fires / 11 d**, mediana entre fires **315 s ≈ cooldown**.
- `eltek-accel`: mediana entre fires **33 s**, resolve<90s **94%** (flapping real).
- `dc_bus_voltage` ∈ [−49.5, −46.5], avg **−48.08** (signo negativo).
- Inalcanzables: GE-04 (>105; máx 100), GE-07 (>1725; máx 1510), DC-05 (>57), F1b (>242; máx 230).
- `fuel_level` <25 **11.6%**, <10 **8.4%**. `fault_code` = [0] siempre.

---

## Secuencia (grafo de dependencias)
```
P0-1 estado por dId ──┐
P0-2 anti-refire  ────┼─► recuperan el 80% de la credibilidad (ruido)
P0-3 signo/recalib ───┘   (independiente; en paralelo)
P0-4 ciclo de vida C/M ─► depende de P0-1 (keys por dId)
P0-5 frescura M2 ───────► independiente
P1-6 editor idempotente ─► habilita confiar en cualquier edición futura
P1-7 validación anti-fantasma ─► barrera de entrada
P1-8 reload sin bajas  ─► depende de snapshot evaluativo
P1-9 superficie edición + scale ─► comparte el fix de scale con spec P_nom
P2  robustez (10–13)
```

---

## P0 — Frenar la sangría (falsas alarmas + reglas muertas)

### Bloque 1 · Estado por `ruleId:dId` (A1, A2, A3-parcial) — **el de mayor retorno**
- **Qué:** clavar `cooldownState`, `activeState` y `windowState`(S) como `${ruleId}:${dId}`. `crossState` queda por `${siteCode}:${ruleId}` (correcto: cross se evalúa una vez por site). Tipo S: resolver **solo cuando `count < countThreshold`** tras la purga (no ante cualquier no-match).
- **Archivos (≤6):** `edge-engine/ruleEngine.js`, `edge-engine/evaluators/typeS.js`, `edge-engine/reloadState.js` (limpieza por prefijo `${ruleId}:` en esos maps), `edge-engine/index.js` (tick de staleness + resolve-by-edit con dId).
- **Riesgo:** `cleanupStateForRules` y `resolvedRuleIds` deben pasar a trabajar por prefijo/`dId` (hoy borran por `ruleId` exacto).
- **Aceptación:** replay con 2 ELTEK → **0%** resolves con `dId` cruzado; una regla activa en el device A no es silenciada por el device B; el `activeState` de A no lo cierra un mensaje de B.

### Bloque 2 · Supresión de re-fire mientras la alarma está activa (A3)
- **Qué:** en `fireAlarm`, si `activeState` ya tiene `ruleId:dId`, **no re-notificar**. El cooldown gobierna solo el 1er fire y el re-disparo **tras** un resolve. Opcional de producto: "recordatorio" cada N horas **configurable**, nunca cada 300 s. Unifica semántica con cross (que ya suprime vía `firedKey`).
- **Archivos (≤2):** `edge-engine/ruleEngine.js` (+ `rule_definition.js` si se agrega `reminderSec`).
- **Aceptación:** una regla persistentemente verdadera emite **1 fire** por episodio (+ recordatorio opcional). `cat-eltek-A2`: de 2755 → ~1/episodio.

### Bloque 3 · Signo del bus DC + recalibración de umbrales inalcanzables (C1, C4) — **arregla lo que rompí hoy**
- **Qué:** decidir el tratamiento del signo (3 opciones en la spec): (a) normalizar en el driver/ingesta a magnitud; (b) evaluar `|V|`; (c) umbrales sobre el valor negativo real (−54 flote / −48 descarga). Luego **recalibrar** contra 7 d: `cat-eltek-A1/A2`, `cat-DC-05`, y la hoja `dc_bus_voltage lt 50` de `cat-TR-09`. Para GE-04/GE-07/F1b: decidir si son **trampas de falla reales** (umbral alto a propósito, se mantienen) o se recalibran — son distintas de las de signo.
- **Archivos:** sin cambio de motor; es **config/seed** por la API (`PUT /rulepacks`) + posible normalización en el driver/ficha. Decisión de signo = la pregunta que cierra la spec.
- **Aceptación:** A1/A2/DC-05 **alcanzables y no permanentes**; hoja DC de TR-09 significativa (no siempre-true); 0 reglas "muertas disfrazadas de arreglo". Validar con el backtest (Bloque 11).

### Bloque 4 · Ciclo de vida simétrico: C marca activeState + M resuelve en `insufficient` (A4, A5)
- **Qué:** pasar `activeState` en el `fireAlarm` del caso C y emitir resolve-by-condición cuando el calibrado deja de cumplirse. En M: si la regla está activa y la métrica pasa a `insufficient`, emitir resolve `reason:'insufficient-data'` (hoy `if(res.detail)continue` la deja zombie).
- **Archivos (≤1):** `edge-engine/ruleEngine.js` (líneas 61-66 y 183-198). Depende del Bloque 1 (keys por dId).
- **Aceptación:** toda alarma C que se normaliza resuelve; ninguna M queda activa sin poder evaluarse.

### Bloque 5 · Frescura obligatoria en M2 (A6) — sifoneo no debe sonar con el grupo apagado
- **Qué:** `readOne`/`evaluateInstant` verifican `eventTs − _lastUpdate[variable] ≤ ventana` (default 3× cadencia o 5 min, configurable por regla). Sin frescura → `insufficient` (neutro, como la hoja suma de cross).
- **Archivos (≤2):** `edge-engine/evaluators/typeM.js` (+ `siteState.js` si hay que exponer `_lastUpdate` a M).
- **Aceptación:** con el grupo apagado y `consumption_tank` viejo, `divergence` **no dispara** (spec_deteccion_sifoneo §6#1).

---

## P1 — Predictibilidad (editor + higiene de reload)

### Bloque 6 · Round-trip del editor idempotente (B1–B8) — "lo que guardás es lo que evalúa el motor"
- **Qué:** `sentenceToRule` + `submitRule` preservan del `existing` **todo** campo que la frase no representa: `correlationParent` (clave para la cascada TR-03/TR-09), `escalateAfterMinutes`, `on_missing_ref`, `fallbackToD` (no forzar `true` en C), `source_filter`, `reset_behavior`, `cooldownSec`, `mWindow.minSamples` de seeds, `inputs` con `deviceType`, `unit`. **Sin redondeo a minutos** (conservar segundos). No degradar cross de 1 hoja a D.
- **Archivos (≤4):** `app/components/rules/ruleSentence.js`, `app/pages/rulepacks/_packId.vue` (`submitRule` strip), `app/components/rules/SentenceEditor.vue`, + test.
- **Nota de auditoría:** el borrado de `graceSec`/`resolveGraceSec` que el informe marcaba es **inocuo** (el motor no los consume para esos tipos); lo que **sí** duele es `correlationParent`/`on_missing_ref`/`fallbackToD`. Priorizar esos.
- **Aceptación:** **test de idempotencia permanente** `sentenceToRule(ruleToSentence(r)) ≡ r` para las ~68 reglas sembradas (CI verde). Editar una regla cambia **solo** lo que tocaste.

### Bloque 7 · Validación anti-regla-fantasma (B8)
- **Qué:** validar `deviceType`/`variable` de **toda** regla contra `equipmentsheets` (warning no bloqueante mínimo; ideal: "esta regla no puede disparar con las variables declaradas"); validar `op`/`value` numérico en hojas equipo de cross (hoy solo la hoja suma lo valida); advertir `eq/neq` sobre float y bool vs telemetría booleana.
- **Archivos (≤2):** `app/api/services/ruleValidation.js`, `app/api/routes/rulepacks.js` (ya corre `collectCrossLeafRefs`).
- **Aceptación:** un typo en variable/deviceType → el PUT **advierte**; no se crea una regla que el motor silencia para siempre.

### Bloque 8 · Reload sin bajas colaterales (A9, A10, A16)
- **Qué:** no borrar `mState` de acumuladores cuando el diff tocó **solo** umbral/severidad/textos (huella sobre la "parte evaluativa", no el JSON íntegro); limpiar las keys `:resolveStart` (D y cross); borrar docs huérfanos de `msoftstate`; flush en SIGTERM.
- **Archivos (≤3):** `edge-engine/reloadState.js`, `edge-engine/index.js`, `edge-engine/msoftstate.js`.
- **Aceptación:** editar el umbral de `cummins-pcc-oil-life` **conserva** las horas acumuladas; una regla en ventana de resolve editada no cierra una alarma nueva antes de tiempo.

### Bloque 9 · Superficie de edición operativa + matar config muerta (A13, A14, B3, B6) — **comparte el fix de scale con la spec P_nom**
- **Qué:** exponer `cooldownSec`/`graceSec`/`resolveGraceSec` editables; **aplicar `setpointSource.scale`** en `typeC` (hoy muerto — y es prerequisito de SG-05 del plan P_nom); eliminar el fantasma `cooldownMinutes`; decidir destino de `source_filter`/`reset_behavior` (implementar o sacar del schema/editor).
- **Archivos (≤4):** `app/components/rules/SentenceEditor.vue`, `app/components/rules/ruleSentence.js`, `edge-engine/evaluators/typeC.js`, `edge-engine/ruleEngine.js`.
- **Aceptación:** el usuario puede editar cooldown/grace por UI; `scale` surte efecto; cero campos configurables que no hacen nada.

---

## P2 — Robustez estructural
- **Bloque 10:** hysteresis/deadband nativo en `typeD` (banda entrada/salida) — mata el flapping por ruido sin depender de `resolveGraceSec`; `resolveGraceSec` para S y M; hoja cross con device ausente → `null` neutro (A15); `SUM_STALENESS_MS` configurable por deviceType (A17); `spread` sin culpable con 2 miembros (A18); reset de `cumulativeSince` paramétrico (A19).
- **Bloque 11:** **Herramienta "probar regla contra historial"** — endpoint/CLI que evalúa una regla (o pack) contra los últimos N días de `db.data` y reporta cuántas veces habría disparado. **Gate obligatorio antes de activar umbrales** (habría frenado C1/C4/C2 antes de producción). Vive en `docsRefactor/harness/`.
- **Bloque 12:** simulador con **inyección de fallas** (fault_codes, sifoneo, cortes) para ejercitar reglas-trampa (C7); staleness **por equipo** (A7); persistencia de `dutyCycle`/`flatline` largas o adenda a la spec (A8).
- **Bloque 13:** higiene — credenciales fuera de logs (A20), `thresholdUsed`/`value` según spec M (A11), convención de `ruleId` inmutable o migración de historial al renombrar (C8).

---

## Métricas de éxito (medibles sobre `notifications`/`data`)
| Métrica | Hoy | Meta |
|---|---|---|
| Resolves con `dId` distinto al fire previo | 82–89% | **0%** |
| Fires/día de reglas umbral estables (A1+A2+accel) | ≈829 | **< 5** (eventos reales) |
| % de fires con resolve en < 90 s (flapping) | 86–94% | **< 5%** |
| Reglas inalcanzables contra 30 d de datos | ≥4 | **0** (gate del backtest) |
| Test de idempotencia del editor en CI | — | **verde** sobre todos los packs |
| Alarmas sin fire ni resolve en 30 d ("regla muerta") | varias | **reportadas** en informe semanal |

## Orden recomendado de ejecución
1. **Bloque 1 + Bloque 2** juntos (misma zona de `ruleEngine.js`; recuperan el ruido). 
2. **Bloque 3** en paralelo (config/seed; arregla las reglas que quedaron rotas hoy) con el **Bloque 11** (backtest) como su red de validación.
3. **Bloque 4 + 5** (ciclo de vida).
4. **Bloque 6** (editor idempotente) — después de esto, cualquier recalibración manual futura es confiable.
5. **7 → 8 → 9**, luego P2.
