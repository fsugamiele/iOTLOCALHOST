# SPEC — Dos datos derivados para detección de sifoneo y deficiencia del grupo · 2026-09-30

**Dirección firmada por Franco** (sesión actual): habilitar dos detecciones que hoy el motor
NO puede armar por falta de datos, **sin inventar métricas nuevas** — las reglas ya existen
(`divergence`, `ratio`). Solo se exponen dos señales derivadas:
1. **`consumption_tank`** (L/h inferido de la pendiente del tanque) → habilita el cruce
   medidor↔tanque = **sifoneo / caudalímetro averiado** (`divergence(fuel_rate, consumption_tank)`).
2. **`genset_power_kw`** (carga eléctrica del grupo) → habilita consumo específico =
   **deficiencia del grupo** (`ratio(fuel_rate / genset_power_kw)`), que aísla la carga.

Continúa `spec_autonomy_extendido` (fuentes metered/measured/estimated). NO cambia esa jerarquía.

## 0 · CANDADO
**preguntas_abiertas: 0.** Toda pregunta que la spec no conteste **frena el bloque** (DEC-PROC-6).
Decisiones cerradas: `consumption_tank` se publica **siempre que sea computable** (grupo en marcha,
≥2 muestras en marcha, pendiente negativa), independiente de qué fuente ganó; `genset_power_kw` lo
simula el sim (real: lo da la controladora del grupo); las **tolerancias** de las reglas se cargan en
la UI por equipo (nada hardcodeado); el sifoneo **con grupo apagado** queda cubierto por `stepJump`
sobre `fuel_level` (fuera de este bloque, ya disponible) — acá se cubre el **sifoneo/mentira en marcha**.

## 1 · Presupuesto de bloque
- Tipo de bloque:  **NORMAL**
- Un concern:              Exponer las dos señales que faltan para que las reglas de cruce (divergence/ratio) detecten sifoneo y deficiencia.
- Una decisión de diseño: El consumo por tanque se calcula y publica **siempre que se pueda**, no solo cuando gana `measured`.
- Archivos a tocar (LISTA CERRADA):
  1. `edge-engine/autonomy.js` — calcular `tankCons` incondicional + publicar `consumption_tank`.
  2. `tools/device_simulator/lib/sensor-engine.js` — `genset_power_kw` (estado+evolve) + drenaje de sifón + escenarios `sifoneo_en_marcha`/`sifoneo_fin`.
  3. DB (runtime, no versionado) — widget `genset_power_kw` en templates `WN-SITE-GEN v2` y `WN-GEN-Cummins-PowerCommand`.
- Total: **2 archivos de código** (+1 cambio de DB) · Límite: 6

> Las reglas `divergence`/`ratio` NO se tocan (ya existen en el motor M). Se crean desde la UI;
> en §10 se siembran de ejemplo solo para verificar el pipeline.

## 2 · Recon que lo funda
- `spec_autonomy_extendido` (coherencia fuel_rate↔fuel_level ya implementada: `consumptionLphNow`).
- `edge-engine/evaluators/typeM.js:133` (`evaluateInstant`) — `divergence` = `|a−b|`, `ratio` = `a/b` sobre 2 entradas de `siteState`.
- `edge-engine/evaluators/typeM.js:62` (`stepJump`) — cubre el sifoneo abrupto / grupo apagado (fuera de este bloque).
- `edge-engine/autonomy.js:computeAndPublish` — ya calcula el consumo por tanque para `measured`; se extrae para publicarlo siempre.

## 3 · Consumidores (grep exhaustivo, no muestreo)
| Consumidor | archivo:línea | Qué le cambia |
|---|---|---|
| Edge — cálculo autonomía | `edge-engine/autonomy.js:computeAndPublish` | Extrae `tankCons` incondicional; publica `consumption_tank` |
| Edge — handler de mensajes | `autonomy.js:maybeComputeAutonomy` | `consumption_tank`/`genset_power_kw` NO disparan recálculo (caen en `!== cfg.fuelVariable`) — verificar anti-loop |
| Regla M `divergence` | `typeM.js:evaluateInstant` | Nueva entrada posible: `fuel_rate` vs `consumption_tank` (sin cambio de código) |
| Regla M `ratio` | `typeM.js:evaluateInstant` | Nueva entrada posible: `fuel_rate` / `genset_power_kw` (sin cambio de código) |
| Sim — evolve | `sensor-engine.js:evolve` | `genset_power_kw` (nuevo case) + `fuel_level` suma drenaje de sifón |
| Sim — estados iniciales | `sensor-engine.js:initialGenState/initialCumminsState` | `genset_power_kw: 0.0` |
| Templates GEN/CUMMINS | DB (widgets) | Widget `genset_power_kw` para que el sim lo publique y la UI lo muestre |

## 4 · Campos que entran / salen / mutan
| Campo | Entra | Sale | Muta | Dónde |
|---|---|---|---|---|
| `consumption_tank` (var MQTT, L/h) | ✔ (publica el edge) | — | — | `autonomy.js` |
| `genset_power_kw` (var MQTT, kW) | ✔ (publica el sim) | — | — | `sensor-engine.js` + template |
| `sharedState.siphon_lph` | ✔ (runtime sim) | — | ✔ | `sensor-engine.js` (escenario) |
| `fuel_level` (decremento) | — | — | ✔ suma drenaje de sifón | `evolve('fuel_level')` |

**Contrato de las variables nuevas:**
```
consumption_tank : L/h — consumo que IMPLICA la caída del tanque (pendiente de fuel_level en marcha).
                   Se publica SOLO cuando es computable (en marcha, ≥2 muestras, pendiente<0).
genset_power_kw  : kW  — potencia eléctrica entregada por el grupo. 0 en reposo.
```

## 5 · Comportamiento de cada control
| Control | Qué hace | Validación | Qué pasa si falla |
|---|---|---|---|
| `consumption_tank` | Expone el consumo por tanque para el cruce | Solo publica si `tankCons !== null` | No publica (la regla divergence queda "insufficient" hasta tener dato) |
| `genset_power_kw` | Carga del grupo para consumo específico | `0` en reposo; kW realista en marcha | ratio con `b=0` → `typeM` ya devuelve `fired:false` (b===0) |
| `siphon_lph` (escenario) | Drena fuel_level extra sin tocar fuel_rate | Número ≥0 vía `sharedSet` | Ausente/0 = sin sifón |

## 6 · Casos raros — ENUMERADOS (prohibido "etc.")
| # | Caso | Comportamiento esperado |
|---|---|---|
| 1 | Grupo apagado | `consumption_tank` NO se publica (no computable); `genset_power_kw`=0; divergence/ratio quedan insufficient |
| 2 | Grupo en marcha normal (sin sifón) | `consumption_tank` ≈ `fuel_rate` → divergence baja (no alarma); ratio = consumo/kW normal |
| 3 | Sifoneo en marcha | `fuel_level` cae más rápido → `consumption_tank` >> `fuel_rate` → divergence ALTA → alarma |
| 4 | Deficiencia (consumo_ineficiente) | `fuel_rate` y `consumption_tank` suben JUNTOS → divergence NO dispara; `ratio` sube → alarma de eficiencia |
| 5 | Repostaje durante marcha | Salto + de fuel → `tankCons` no se computa ese tramo (refuel reset) → `consumption_tank` no publica hasta rearmar ventana |
| 6 | `genset_power_kw`=0 con grupo en marcha (arranque/ralentí) | ratio con b=0 → `typeM` devuelve fired:false (ya cableado) |
| 7 | `consumption_tank`/`genset_power_kw` llegan al edge por su propia suscripción | NO disparan recálculo de autonomía (anti-loop: `!== cfg.fuelVariable`) |
| 8 | Sifón con grupo APAGADO | `consumption_tank` no computable → divergence no aplica; lo cubre `stepJump` sobre `fuel_level` (otro bloque) |

## 7 · Path real del consumidor (DEC-PROC-5)
- `edge-engine/autonomy.js:computeAndPublish` — publica por `client.publish({userId}/{dId}/consumption_tank/sdata, {value, save:1})`. Round-trip: saver-webhook → `data`; edge lo recibe por `+/+/+/sdata` → `siteState[dId].consumption_tank` → reglas lo leen.
- `sensor-engine.js:evolve` — `genset_power_kw` lo publica `device.js:_publish` como cualquier variable del template.
- Reglas: `evaluateInstant` lee de `siteState` (no buffer) — instantáneo.

## 8 · Disenso registrado
| Posición A | Posición B | Qué evidencia las distinguiría | Estado |
|---|---|---|---|
| Eficiencia por `ratio` + umbral fijo (v1) | `baseline` auto-calibrante sobre un `fuel_efficiency` ya dividido por el edge | Falsos positivos del umbral fijo en campo | v1 = ratio+umbral (UI); baseline queda para después si hace falta |
| `genset_power_kw` lo simula el sim | Traer `load_kw` del ATS (cross-device) | — | Simulado en el grupo (real: la controladora lo da) — más fiel al producto |

## 9 · IDs reservados
Variables: `consumption_tank`, `genset_power_kw`. Flag runtime sim: `siphon_lph`. Escenarios: `sifoneo_en_marcha`, `sifoneo_fin`. (Reglas de ejemplo en §10: `gen-sifoneo-divergencia`, `gen-eficiencia-ratio`.)

## 10 · Cómo se prueba
1. **Coherencia base (no alarma):** grupo en marcha normal → `consumption_tank` ≈ `fuel_rate` (±ruido) → una regla `divergence` con umbral p.ej. 5 L/h NO dispara.
2. **Sifoneo en marcha:** `generador_marcha` + `sifoneo_en_marcha` → `fuel_level` cae ~+20 L/h extra → `consumption_tank` >> `fuel_rate` → `divergence` dispara. `sifoneo_fin` lo normaliza.
3. **Deficiencia:** `generador_marcha` + `consumo_ineficiente` (+8%) → `fuel_rate` y `consumption_tank` suben juntos (divergence NO dispara) y `ratio = fuel_rate/genset_power_kw` sube → regla de eficiencia dispara. **Verifica que distingue robo de deficiencia.**
4. **Reposo:** grupo apagado → `genset_power_kw`=0, `consumption_tank` ausente → ninguna regla dispara.
5. Sembrar reglas de ejemplo (`divergence` y `ratio`) para correr 1-3 contra el motor real.

## 11 · Costuras que este bloque cambia
| CST | Antes | Después | Verificación nueva o modificada |
|---|---|---|---|
| Autonomía (edge) | Publica solo la fuente ganadora | + publica `consumption_tank` siempre que sea computable | Test 1-3 §10 |
| Grupo (sim) | No publica carga | Publica `genset_power_kw` | Test 3-4 §10 |
| Detección fuel | Solo nivel/autonomía | Sifoneo (divergence) + deficiencia (ratio) armables desde UI | Reglas de ejemplo §10 |

## 12 · Reversión
`consumption_tank` y `genset_power_kw` son aditivos: quitar la publicación en `autonomy.js`, el case
`genset_power_kw` + drenaje de sifón + escenarios en `sensor-engine.js`, y los widgets de los templates.
Las reglas de ejemplo se borran de `rulepacks`. **Cero migración**: sin estas variables el sistema
calcula autonomía igual que hoy; las reglas de cruce simplemente quedan "insufficient".
