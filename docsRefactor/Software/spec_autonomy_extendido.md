# SPEC — Bloque `autonomy` extendido (caudalímetro `metered` + variable de marcha por config) · 2026-09-30

**Dirección firmada por Franco** (sesión actual): llevar el cálculo de autonomía a "producto,
no demo". Dos huecos estructurales hallados en la auditoría DEC-PROC-3 del path productivo:
1. **No hay path para caudalímetro directo** — hoy `autonomy_lph` "medido" es una *inferencia*
   de la pendiente de `fuel_level` (`autonomy.js:186-194`), no una medición. El día que se conecte
   un caudalímetro que publique L/h reales, el código lo **ignora** (`autonomy.js:164` `return false`).
2. **La variable de marcha está por lista hardcodeada** (`autonomy.js:60 RUNNING_ALIASES`), no por
   config: un equipo real que la nombre distinto nunca entra al modo "medido".

Extiende DEC-REF-115 (autonomía calculada por la plataforma). **NO** reemplaza el path de inferencia
por Kalman/RLS — eso quedó marcado como opción secundaria del path `measured` (ver §8), no en este bloque.

## 0 · CANDADO
**preguntas_abiertas: 0.** Toda pregunta que la spec no conteste **frena el bloque** (DEC-PROC-6).
Decisiones cerradas abajo (§4, §6) para no dejar huecos: jerarquía de 3 fuentes; frescura del caudal
por ventana fija; `metered` exige marcha + caudal > 0; `flowVariable`/`runningVariable` viven **solo en
la ficha** (son nombres de variable = del modelo, no de la instalación); `flowScale` cierra la pregunta
de unidad. Sin migración: fichas sin los campos nuevos se comportan **idéntico a hoy**.

## 1 · Presupuesto de bloque
- Tipo de bloque:  **NORMAL**
- Un concern:              El cálculo de autonomía debe usar el **dato exacto** de un caudalímetro cuando exista, y detectar marcha por config (no por lista quemada).
- Una decisión de diseño: **Jerarquía de 3 fuentes** `metered` > `measured` > `estimated`, con `metered` = caudal directo del sensor.
- Archivos a tocar (LISTA CERRADA):
  1. `app/api/models/equipment_sheet.js` — `AutonomySchema` suma `flowVariable`, `flowScale`, `runningVariable` (opcionales).
  2. `app/api/routes/equipmentsheets.js` — `validateAutonomy()` valida los nuevos campos opcionales.
  3. `edge-engine/autonomy.js` — fuente `metered` + `runningVariable` por config + tracking del caudal.
  4. `app/components/Widgets/ProjectedAutonomy.vue` — badge para `'metered'` + **re-etiqueta las 3 fuentes** (ver §5-bis).
- Total: **4 archivos** · Límite: 6

> `Device.autonomy` (override por equipo) **NO se toca**: sigue siendo `tankCapacity`/`consumptionLph`
> (parámetros de la instalación). `flowVariable`/`runningVariable` son **nombres de variable** → del
> modelo/template → viven en la ficha. Por eso `app/api/routes/devices.js` queda fuera de la lista.

## 2 · Recon que lo funda
- Auditoría DEC-PROC-3 de esta sesión sobre `edge-engine/autonomy.js` (huecos #1 y #2 arriba).
- DEC-REF-115 (#85) — autonomía calculada por la plataforma (fuente de la jerarquía `measured`/`estimated`).
- `edge-engine/autonomy.js:148-221` (`maybeComputeAutonomy`) — path productivo real que se extiende.

## 3 · Consumidores (grep exhaustivo, no muestreo)
| Consumidor | archivo:línea | Qué le cambia |
|---|---|---|
| Edge — cálculo de autonomía | `edge-engine/autonomy.js:150-221` | Suma rama `metered` antes de `measured`; lee `cfg.runningVariable`/`cfg.flowVariable` |
| Edge — carga de config | `edge-engine/autonomy.js:101-119` | El `configs` sumado con `flowVariable`, `flowScale`, `runningVariable` |
| API — validación ficha | `app/api/routes/equipmentsheets.js:25-33` (`validateAutonomy`) | Acepta/valida los 3 campos opcionales |
| API — POST/PUT ficha | `app/api/routes/equipmentsheets.js:61-64,138-141` | Reusan `validateAutonomy` (sin cambio propio) |
| Modelo ficha | `app/api/models/equipment_sheet.js:35-39` (`AutonomySchema`) | 3 campos nuevos opcionales |
| Widget autonomía (presenter) | `app/components/Widgets/ProjectedAutonomy.vue:37,48-64` | Reconoce `source:'metered'` + re-etiqueta las 3 fuentes (§5-bis) |
| Widget autonomía (live) | `app/components/Widgets/ProjectedAutonomyLive.vue:32` | **Sin cambio**: pasa `source` como string; ya soporta cualquier valor |
| Variable hermana `autonomy_source` | publicada en `autonomy.js:217` | Nuevo valor posible `'metered'` (además de `measured`/`estimated`) |

## 4 · Campos que entran / salen / mutan
| Campo | Entra | Sale | Muta | Dónde |
|---|---|---|---|---|
| `autonomy.flowVariable` | ✔ (String, opcional) | — | — | `AutonomySchema` (ficha) |
| `autonomy.flowScale` | ✔ (Number, opcional, default 1) | — | — | `AutonomySchema` (ficha) |
| `autonomy.runningVariable` | ✔ (String, opcional) | — | — | `AutonomySchema` (ficha) |
| `cfg.flowVariable/flowScale/runningVariable` | ✔ | — | — | `loadAutonomyConfigs` → `configs` |
| `rt.lastFlow` `{value,ts}` | ✔ (runtime en memoria) | — | ✔ | `runtimeFor(dId)` |
| `autonomy_source` | — | — | ✔ suma `'metered'` | publicación edge |
| `autonomy_lph` | — | — | ✔ puede venir del caudalímetro | publicación edge |

**Forma final de `AutonomySchema` (ficha):**
```
fuelVariable:    String   // (ya existe) nivel de combustible 0-100 %
tankCapacity:    Number   // (ya existe) capacidad del tanque
consumptionLph:  Number   // (ya existe) consumo nominal (unidad/h) — fallback estimated
flowVariable:    String   // NUEVO opcional — variable de caudal instantáneo del caudalímetro
flowScale:       Number   // NUEVO opcional (default 1) — multiplicador a unidad/hora (L/min→60, etc.)
runningVariable: String   // NUEVO opcional — variable de marcha; ausente → fallback a RUNNING_ALIASES
```

## 5 · Comportamiento de cada control
| Control | Qué hace | Validación | Qué pasa si falla |
|---|---|---|---|
| `flowVariable` | Nombre de la variable de caudal instantáneo (contrato: consumo en unidad/h tras `flowScale`) | String no vacío si presente; **≠ `fuelVariable`** | 400 en la ruta si `== fuelVariable` o vacío-pero-presente |
| `flowScale` | Multiplicador de normalización a unidad/hora | Si presente, `> 0`; default 1 | 400 si `<= 0` |
| `runningVariable` | Variable que indica marcha del grupo (pisa a la lista de alias) | String no vacío si presente | 400 si presente y vacío |
| Trío base | `fuelVariable`+`tankCapacity>0`+`consumptionLph>0` | **Sigue requerido** (retrocompat) | 400 (mensaje actual) |

> Los 3 nuevos son **opcionales y aditivos**: sin ellos el bloque valida y se comporta como hoy.

## 5-bis · Etiquetas de fuente en el widget (decisión Franco, sesión actual)
La medición **real** (caudalímetro) pasa a llamarse "Medida"; la inferencia por tanque (que hoy se
llama "medida") pasa a "Calculada"; el nominal de fábrica pasa a "Nominal". "Aforada" se descarta (jerga).
| `autonomy_source` | Etiqueta (badge) | Tooltip |
|---|---|---|
| `metered` | **Medida** | Consumo medido por el sensor de caudal |
| `measured` | **Calculada** | Deducida de cómo baja el tanque |
| `estimated` | **Nominal** | Consumo de fábrica del equipo |

> El L/h del pie de widget sigue el mismo criterio: `metered`→"(medido)", `measured`→"(calculado)",
> `estimated`→"(nominal)". Los colores de badge: `metered`/`measured` = verde-teal (confiable),
> `estimated` = gris (referencia).

## 6 · Casos raros — ENUMERADOS (prohibido "etc.")
| # | Caso | Comportamiento esperado |
|---|---|---|
| 1 | `flowVariable` configurada pero nunca publica | `rt.lastFlow` vacío → nunca `metered` → cae a `measured`/`estimated` |
| 2 | Caudal llega pero grupo **apagado** | No `metered` (exige marcha) → `estimated` |
| 3 | Grupo en marcha pero caudal `== 0` (grupo en vacío o sensor colgado) | No `metered` (exige `flow > 0`) → cae a `measured`/`estimated` |
| 4 | Grupo en marcha, caudal **viejo** (`> FLOW_FRESH_MS`) | No `metered` (frescura) → cae a `measured` |
| 5 | Repostaje mientras `metered` activo | `metered` **no se afecta** (mide flujo instantáneo, no historial); solo `measured` resetea buffer |
| 6 | `flowScale` ausente | Default `1` |
| 7 | `runningVariable` seteada **y** device publica también un alias viejo | Gana `runningVariable`; los alias se **ignoran** si `runningVariable` está seteada (sin doble-track) |
| 8 | Caudal negativo (ruido/sensor) | Inválido (`flow > 0` requerido) → cae a `measured` |
| 9 | Cambio de fuente `metered`↔`measured`↔`estimated` | Publica siempre (rompe debounce), como hoy con measured↔estimated |
| 10 | `flowVariable == fuelVariable` (config errónea) | Rechazado por `validateAutonomy` (400) |
| 11 | Update de caudal (no de fuel) con fuel ya conocido | **Re-dispara** el cálculo usando el último `fuel_level` conocido (`rt.samples` último) → `metered` se mantiene fresco sin esperar al fuel |
| 12 | Update de caudal sin ningún fuel previo (arranque) | Sin fuel no hay % → no calcula horas; guarda `rt.lastFlow` y espera el primer fuel |

**Jerarquía de fuentes (decisión de diseño central):**
```
1. metered   → cfg.flowVariable presente ∧ rt.lastFlow fresco (≤FLOW_FRESH_MS) ∧ marcha ∧ flow>0
               observedCons = rt.lastFlow.value × cfg.flowScale
2. measured  → (actual) pendiente de fuel en marcha, sin repostaje
3. estimated → (actual) nominal cfg.consumptionLph
```
`autonomy_hours = fuel% × tankCapacity / 100 / observedCons` (misma fórmula, cambia el origen de `observedCons`).
**Marcha:** `variable === (cfg.runningVariable || alias∈RUNNING_ALIASES)`. Nueva constante `FLOW_FRESH_MS = 10*60*1000` (2× heartbeat de 5 min).

## 7 · Path real del consumidor (DEC-PROC-5)
- `edge-engine/autonomy.js:150` `maybeComputeAutonomy(...)` — se extiende in-place.
- `edge-engine/autonomy.js:79` `loadAutonomyConfigs(...)` — driver crudo Mongo (`db.collection('equipmentsheets')...project`), **NO** models Babel. Sumar los 3 campos al `.project` y al objeto de `configs`.
- Escribe por: `client.publish(...)` MQTT (`publishVar`) → saver-webhook → `insertOne` en `data`. Sin cambio en el shape publicado (solo nuevo valor de `autonomy_source`).
- Ruta ficha escribe por: `.save()` / `updateOne` (Mongoose) en `equipmentsheets.js`.

## 8 · Disenso registrado
| Posición A | Posición B | Qué evidencia las distinguiría | Estado |
|---|---|---|---|
| Path `measured` = regresión de ventana 6h (actual) | Cambiar a Kalman/RLS-con-olvido (más responsivo, recursivo) | Ruido real del aforador de nivel en campo (Claro NEA) | **Fuera de este bloque** (Franco: primero `metered`, luego evaluar) |
| `metered` re-dispara con caudal (caso #11) | Solo disparar con fuel (menos cómputo) | Frecuencia real de publish de fuel vs caudal | Resuelto → re-dispara con caudal (precisión > cómputo; el debounce ya limita a 1/min) |

## 9 · IDs reservados
Ninguna regla nueva. Nombre de fuente reservado: `'metered'` (valor de `autonomy_source`). Variables hermanas sin cambio de nombre (`autonomy_hours/source/lph/liters`).

## 10 · Cómo se prueba
1. **Retrocompat (sin campos nuevos):** ficha existente → autonomía calcula `measured`/`estimated` exactamente como hoy (0 regresión). Verificar en un GEN del sim con fuel bajando en marcha.
2. **`metered` feliz:** ficha con `flowVariable='fuel_rate'`, `flowScale=1`. Sim publica `fuel_rate=30` con grupo en marcha y `fuel_level` bajando → `autonomy_source='metered'`, `autonomy_lph≈30`, `autonomy_hours = fuel%×tank/100/30`.
3. **Frescura (caso #4):** dejar de publicar `fuel_rate` > 10 min → la fuente cae a `measured` en el próximo cálculo.
4. **Marcha por config (hueco #2):** ficha con `runningVariable='gen_status'`; sim publica marcha por `gen_status` (no por alias) → `measured`/`metered` se activan (antes quedaba `estimated`).
5. **Validación:** POST ficha con `flowVariable==fuelVariable` → 400; `flowScale=0` → 400; `flowVariable` presente vacío → 400.
6. **Cambio de fuente (caso #9):** encender/apagar el caudal y verificar publicación inmediata (rompe debounce).

## 11 · Costuras que este bloque cambia
| CST | Antes | Después | Verificación nueva o modificada |
|---|---|---|---|
| Autonomía (edge) | 2 fuentes `measured`/`estimated`, inferidas del tanque | 3 fuentes: `metered` (caudalímetro) > `measured` > `estimated` | Test #2, #3 de §10 |
| Detección de marcha | Lista hardcodeada `RUNNING_ALIASES` | Config `runningVariable` (alias = fallback) | Test #4 |
| Contrato ficha `autonomy` | Trío requerido | Trío requerido + 3 opcionales aditivos | Test #1, #5 |

## 12 · Reversión
Los 3 campos son opcionales `default undefined`; sin ellos el comportamiento es idéntico a hoy.
Revertir = quitar los 3 campos del schema + la rama `metered`/`runningVariable` en `autonomy.js` + el
label `'metered'` del widget. **Cero migración de datos**: fichas sin los campos siguen válidas y
calculan `measured`/`estimated` como antes. Fichas que ya tuvieran los campos → se ignoran (no rompen).
