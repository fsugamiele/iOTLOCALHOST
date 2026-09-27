# Spec — Motor M (soft sensors / reglas predictivas) en el edge-engine

**Dirección firmada por Franco** (#sesión actual): implementar el tipo de regla **M** (soft
sensors) en el `edge-engine`, con el núcleo de sub-familias confirmado. El Hub (Orange Pi)
tiene CPU para correrlas (**DEC-SENSOR-2**). `flapping`/`rate` quedan en **S** (no se duplican).
Diseño base: `docsRefactor/Software/diseno_packs_alarmas.md`.

## §0 · Candado
**preguntas_abiertas: 0.** Toda pregunta que la spec no conteste **frena el bloque** (DEC-PROC-6).
Decisiones cerradas abajo (§11) para no dejar huecos: persistencia de estado M = en memoria (se
re-hidrata como el resto tras reinicio, salvo `accumulator`/`cumulativeSince` → ver §11-D2); baseline
= ventana móvil marcada "madurando" hasta juntar muestras; inputs multivariante = mismo sitio.

## §1 · Objetivo
Agregar `type: 'M'` al motor de reglas, con evaluadores que calculan una **métrica derivada** sobre
la serie reciente (o sobre varias variables del sitio) y la comparan contra un umbral. Habilita las
reglas **predictivas/preventivas** del diseño (autonomía, descarga de planta, vida de aceite,
vibración, divergencia de rectificadores, sifoneo, sensor muerto, pérdida de comunicación).

## §2 · Alcance y archivos (≤6, regla DEC-PROC-6)
1. `app/api/models/rule_definition.js` — enum `type` suma `'M'` + campos M (`metric`, `mWindow`, `inputs`, `mParams`).
2. `app/api/services/ruleValidation.js` — `validateM(rule)` (rechazos por sub-familia).
3. `edge-engine/evaluators/typeM.js` — **NUEVO**: los 13 evaluadores + helpers de serie.
4. `edge-engine/ruleEngine.js` — dispatch `case 'M'` + paso de `mState`.
5. `edge-engine/index.js` — crea `mState` y lo pasa a `processMessage` / `reloadState`.
6. `edge-engine/mState.js` — **NUEVO** (opcional): helpers de buffer/serie (append+purga) para no inflar typeM.

> **UI del editor para reglas M = bloque planificado aparte (§14), no descartado** (firma Franco):
> el motor primero; la UI se suma por ola, sobre motor verificado. Coherente con DEC-PROC-3
> (nada hardcodeado: las M se configuran desde la pantalla, igual que D/C/S/cross).

## §3 · Modelo de datos — forma de la regla M
Campos nuevos en `RuleDefinitionSchema` (todos opcionales salvo con `type:'M'`):

```
type: 'M',
metric: 'slope'|'acceleration'|'projection'|'baseline'|'variance'
      | 'ratio'|'divergence'|'spread'
      | 'accumulator'|'dutyCycle'|'cumulativeSince'
      | 'flatline'|'staleness'|'stepJump',
mWindow: { durationSec: Number, minSamples: Number },   // ventana de la serie (univariante/temporal)
inputs:  [ { deviceType: String, variable: String } ],  // 1 = univariante · 2+ = multivariante
condition: { op, value },   // umbral SOBRE LA MÉTRICA DERIVADA (reusa ConditionSchema)
mParams: { Mixed }          // parámetros específicos de la sub-familia (§6)
```

- `condition` se reinterpreta: **no** compara el valor crudo, compara **el resultado de la métrica**
  (p.ej. `metric:'slope'`, `condition:{op:'lt', value:-0.5}` = "pendiente < −0.5 V/min").
- `variable`/`deviceType` raíz siguen presentes (identifican la variable primaria y el device para
  cooldown/notificación/`activeState`). `inputs[]` es para multivariante; si falta, se usa la raíz.
- `unit` = unidad de la **métrica** (V/min, h, %, σ) para que la notificación lea bien.

## §4 · Estado — `mState`
Espejo de `windowState` (§evaluators/typeS). Mapa en memoria:
- **Clave:** `` `${rule.ruleId}:${dId}` `` (M aplica por device, no global).
- **Valor:** buffer circular `[{ ts, value }]` de la variable primaria, **purgado** a `mWindow.durationSec`
  en cada append (idéntico a la purga deslizante de typeS).
- Multivariante (`ratio`/`divergence`/`spread`): NO usa buffer — lee los **valores actuales** de las
  `inputs` desde `siteState` (que ya guarda el último valor por device/variable). Es cálculo instantáneo.
- `accumulator`/`cumulativeSince`/`dutyCycle`: mantienen un **acumulador** en `mState` (`{acc, lastTs, lastState}`),
  no un buffer de muestras.

Ciclo de vida: creado en `index.js` (`const mState = new Map()`), pasado a `processMessage`. En
`reloadPacks`, las claves de reglas M que ya no existen se limpian (igual que el resto del estado).

## §5 · Contrato del evaluador
```
evaluateM(rule, value, { mState, siteState, dId, eventTs }) → { fired, metricValue, detail }
```
- `metricValue`: el número derivado (para la notificación: "pendiente = −0.7 V/min").
- `fired`: `evaluateD({condition: rule.condition}, metricValue)` — **reusa la primitiva de comparación
  de typeD** (igual que hace typeS con `matchCondition`). Fuente única de comparadores.
- Si no hay muestras suficientes (`< mWindow.minSamples`) → `{ fired:false, metricValue:null, detail:'insufficient' }`
  (no dispara, no rompe). Consistente con el `console.warn` mudo que hoy evita reglas-fantasma.
- `resolve`: cuando `!fired` y la regla está en `activeState` → emite resolve (mismo camino que D/S).

## §6 · Catálogo de sub-familias (cálculo · params · ventana)

**A · Tendencia (buffer univariante):**
| metric | Cálculo | mParams | Notas |
|---|---|---|---|
| `slope` | regresión lineal simple Δvalue/Δt (unidad/min) sobre el buffer | — | dispara si `slope op value` |
| `acceleration` | Δslope entre 1ª y 2ª mitad de la ventana | — | ¿la caída se acelera? |
| `projection` | tiempo-a-target = (target − valorActual) ÷ slope | `{ target }` | `metricValue` en horas/min; dispara si `< value` |

**B · Estadística (buffer univariante):**
| metric | Cálculo | mParams | Notas |
|---|---|---|---|
| `baseline` | z-score = (valor − media) ÷ σ del buffer | `{ baselineWindowSec }` | "madura" hasta juntar muestras (marca `detail:'maturing'`) |
| `variance` | σ (o varianza) del buffer | — | dispara si dispersión `> value` |

**C · Multivariante instantáneo (lee siteState, sin buffer):**
| metric | Cálculo | inputs | Notas |
|---|---|---|---|
| `ratio` | inputs[0] ÷ inputs[1] | 2 | eficiencia (kW/consumo) |
| `divergence` | \|inputs[0] − inputs[1]\| | 2 | dos señales que deberían ir juntas |
| `spread` | max − min de la variable entre TODOS los devices del deviceType en el site | 1 var (N devices) | spread de celdas / balance de rectificadores. **A+B (firma Franco #86):** dispara a nivel conjunto (detecta el desbalance) **y** señala el equipo puntual a intervenir = el **outlier** (el más alejado de la mediana del grupo); la alarma se ancla a ESE `deviceId`. Con 2 devices avisa sin culpar; con 3+ el culpable es claro. |

**D · Acumulación (acumulador en mState):**
| metric | Cálculo | mParams | Notas |
|---|---|---|---|
| `accumulator` | Σ (Δt × factor(weightVar)) | `{ weightVariable, weightFn }` | vida de aceite; persistir → §11-D2 |
| `dutyCycle` | % del tiempo con la variable en `state` sobre la ventana | `{ state }` | % tiempo en grupo |
| `cumulativeSince` | acumulado desde el último hito de reset | `{ resetVariable, resetCondition }` | combustible desde recarga → sifoneo |

**E · Forma / consistencia (buffer o últimoTs):**
| metric | Cálculo | mParams | Notas |
|---|---|---|---|
| `flatline` | ¿varianza ≈ 0 durante toda la ventana? | `{ epsilon }` | sensor muerto / lectura falsa (forense) |
| `staleness` | ahora − último ts de muestra | — | pérdida de comunicación; se evalúa por tick/timer, no solo por mensaje entrante (§8) |
| `stepJump` | \|valor − valorPrevio\| en un solo paso | `{ minStep }` | salto abrupto (sifoneo vs consumo suave) |

## §7 · Validación (`validateM`, espejo de validateD/S)
Rechazos duros (400 en el PUT, patrón de `validateS`):
- `metric` presente y ∈ enum. `condition` con `op` válido y `value` numérico.
- Ventana requerida para A/B/E-temporal: `mWindow.durationSec > 0` y `minSamples ≥ 2`.
- Multivariante (`ratio`/`divergence`): exactamente 2 `inputs`; `spread`: ≥2. Cada input con `deviceType`+`variable`.
- `projection` requiere `mParams.target` numérico. `accumulator` requiere `weightVariable`.
  `dutyCycle` requiere `state`. `cumulativeSince` requiere `resetVariable`+`resetCondition`.
- Advertencias (no bloquean, viajan en el 200): `baseline` sin datos aún ("madurando"); `accumulator`
  sin persistencia ("se reinicia con el edge" hasta D2).

## §8 · Integración
- `ruleEngine.js`: sumar `case 'M'` en el `switch` (junto a D/C/S). Llama `evaluateM(...)`, y con
  `{fired, metricValue}` entra al **mismo camino de emisión** (fire/resolve/cooldown/activeState) que D/S —
  `thresholdUsed = metricValue`, `mode:'M'`.
- `staleness` no llega por mensaje entrante (si no hay mensaje, no se evalúa). Se resuelve con un **tick
  periódico** en `index.js` (setInterval cada `TICK_SEC`) que recorre reglas `metric:'staleness'` y evalúa
  contra el último ts en `mState`. Decisión cerrada (§11-D3).
- `index.js`: `const mState = new Map()`; pasar a `processMessage`; limpiar claves huérfanas en `reloadPacks`.
- `notificationRouter`: sin cambios — ya acepta `mode`, `thresholdUsed`, `unit`, `severity`, `recommendation`.
  Sumar `'M'` al enum `mode` de `notifications.js` (paridad con 'window'/'cross').

## §9 · Verificación (E2E, path productivo — DEC-PROC-5)
Por ola (§12), con simulador publicando la serie:
1. **slope** sobre `dc_bus_voltage` en descenso simulado → dispara `slope < −X`; al estabilizar → resolve.
2. **projection** de autonomía → `metricValue` en horas coherente con la pendiente.
3. **spread** de dos ELTEK con corrientes distintas → dispara sobre el max−min.
4. **staleness**: cortar la publicación de un device → dispara por el tick; reanudar → resolve.
Criterio: la notificación aparece en Mongo con `mode:'M'`, `siteId`, `thresholdUsed=metricValue`, y el
resolve cierra. Cada ola valida su sub-familia representativa antes de seguir.

## §10 · Riesgos
- **Estado en memoria** se pierde al reiniciar el edge → slope/baseline tardan `minSamples` en re-armar
  (aceptable; el resto del estado ya es así). `accumulator`/`cumulativeSince` sí pierden el acumulado →
  D2 propone hidratar desde Mongo (fuera de la 1ª ola).
- **Carga CPU**: buffers acotados por `mWindow` + regresión lineal O(n) → trivial para el Orange Pi
  (DEC-SENSOR-2). Se mide en la verificación.
- **Falsos positivos de baseline** hasta madurar: se marca `detail:'maturing'` y no dispara con <N muestras.

## §11 · Decisiones cerradas (para preguntas_abiertas: 0)
- **D1 · flapping/rate:** quedan en **S** (firma Franco). M no los implementa.
- **D2 · Persistencia de acumuladores:** 1ª ola = en memoria (se reinicia con el edge, advertencia
  visible). Hidratación desde Mongo = mejora posterior, no bloquea.
- **D3 · staleness por tick:** un `setInterval` en index.js evalúa las reglas de staleness (no dependen
  de mensaje entrante). `TICK_SEC` configurable (default 30 s).
- **D4 · baseline:** ventana móvil; "madurando" (DEC-PRED-1) hasta `minSamples`. No es ML.
- **D5 · inputs multivariante:** solo variables del **mismo sitio** (siteState es per-site). Coherente con DEC-ARCH-1.

## §12 · Partición en olas (cada una verificable, ≤ el alcance)
- **Ola M1 — infra + tendencia:** schema+validación+dispatch+mState + `slope`, `acceleration`, `projection`.
  (Prueba E2E slope/projection sobre dc_bus_voltage.) Es el enabler predictivo del pitch.
- **Ola M2 — multivariante:** `ratio`, `divergence`, `spread` (instantáneo, lee siteState).
- **Ola M3 — acumulación:** `accumulator`, `dutyCycle`, `cumulativeSince`.
- **Ola M4 — consistencia/forense:** `flatline`, `staleness` (tick), `stepJump`.
- **Ola M5 — estadística:** `baseline`, `variance`.

Cada ola cierra con **su exposición en UI** (§14): las sub-familias "de operador" quedan creables desde
el editor; las técnicas (`accumulator`, `baseline`, `acceleration`) se siembran como **preset** y la UI
solo edita su umbral. Así, al terminar una ola, sus reglas son configurables (o preset-editables) — no
queda capacidad solo-seed sin camino de UI.

## §13 · Escenarios del simulador (demostrar las reglas M)
Las reglas M no se disparan con valores fijos ni ruido aleatorio: necesitan **series con forma**.
El simulador (`simulator.js` / `tools/device_simulator/`) hoy publica por rango; hay que sumarle
**generadores de forma temporal** (rampa, escalón, silencio, dispersión creciente) y un escenario
por sub-familia para la demo. Es dominio aparte del motor → **bloque de demostración** (se hace junto
a cada ola M, para poder verificarla end-to-end).

**Primitivas de forma a agregar al simulador:**
`ramp(from,to,durSec)` · `step(at,delta)` · `hold(value)` (congelado) · `silence(durSec)` (deja de publicar)
· `noise(σ)` creciente · `sawtooth`/`toggle(state, dutyPct)`.

**Escenarios de demostración (uno por regla M representativa):**
| Escenario | Serie generada | Demuestra |
|---|---|---|
| `dc-descarga` | `dc_bus_voltage` rampa 54→46 V en ~10 min | `slope` (V/min) + `projection` (tiempo a LVD 48 V) |
| `dc-caida-acelerada` | descenso que se empina | `acceleration` |
| `rect-divergencia` | 2× ELTEK `dc_load_current` que se separan (uno sube, otro baja) | `divergence` / `spread` |
| `sifoneo` | `fuel_level` escalón ↓ abrupto con `genset_running=off` | `stepJump` + `cumulativeSince` |
| `vibracion-anomala` | `vibration_signature` con dispersión creciente | `variance` / `baseline` |
| `sensor-muerto` | una variable en `hold` (valor exacto congelado) | `flatline` |
| `perdida-comm` | device en `silence` N seg | `staleness` (vía tick, §8) |
| `vida-aceite` | `run_hours` acumulando con `coolant_temp` alta | `accumulator` |
| `grupo-uso-alto` | `genset_running` on gran % de la ventana | `dutyCycle` |

Cada escenario debe quedar en la **lista blanca del simulador** (la que valida los nombres, ya
sincronizada manualmente hoy) y ser lanzable por sitio/device para la demo al NOC. La verificación E2E
de §9 usa exactamente estos escenarios.

## §14 · UI de configuración de reglas M (firma Franco)
Objetivo: crear/editar reglas M desde el **editor de reglas** (mismo `SentenceEditor` que D/C/S/cross),
sin tocar el backend. Se suma **por ola** (cada sub-familia se expone en la UI cuando su motor está
verificado). Dos modos de exposición según decisión firmada:

**A · Creación libre desde el editor-frase** (sub-familias "de operador", pocos params y frase legible):
`slope`, `projection`, `spread`, `divergence`, `ratio`, `dutyCycle`, `stepJump`, `flatline`, `staleness`.
El editor gana un **eje "qué medir"**: además del valor directo, ofrece la métrica derivada. Ejemplos de frase:
- slope → *"avisame si la **tensión DC** **cae más de** **0,5 V/min**"*
- projection → *"si la **autonomía proyectada** **baja de** **2 h**"*
- spread/divergence → *"si el **desbalance** entre **rectificadores** supera **X A**"*
- staleness → *"si un equipo **deja de reportar** por más de **N min**"*

**B · Presets con umbral editable** (sub-familias técnicas): `accumulator`, `baseline`, `acceleration`.
Vienen **sembradas por seed**; en la UI el usuario **NO** ve los params técnicos (weightFn, ventana
estadística) — solo edita **umbral (`condition.value`), severidad y recomendación**. `RuleCard` las marca
como *"preset · umbral editable"* y el editor abre en modo restringido.

**Archivos (≤6):** `components/rules/ruleSentence.js` (mapeo frase↔engine para M + `describe`/`summarize`),
`components/rules/SentenceEditor.vue` (eje "qué medir" + inputs multivariante + modo restringido de preset),
`components/rules/ConditionRow.vue` (umbral sobre la métrica, reuso), `components/rules/RuleCard.vue`
(badge M + "preset"), `pages/rulepacks/_packId.vue` (routing).

**Verificación:** crear desde la UI una regla `slope` y una `projection`, PUT 200, y confirmar round-trip
+ disparo en el edge con el escenario `dc-descarga` (mismo patrón E2E que se usó para el cross anidado).
