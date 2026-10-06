# SPEC — P1: staleness por equipo (A7) · 2026-10-06

**Dirección firmada por Franco:** bloque P1. Auditoría A7: `staleness` mide el silencio de UNA
variable (la que mira la regla, `rule.variable`), no del EQUIPO. Si el equipo publica 10 variables y
la observada se corta pero las demás siguen, **dispara aunque el equipo esté vivo**; y al revés, no
refresca con otras variables. La spec §14 dice "si un **equipo** deja de reportar".

## 0 · CANDADO
**preguntas_abiertas: 0.**

Decisiones cerradas:
- El edge marca `deviceState._lastSeen = eventTs` en **cada** mensaje (cualquier variable), junto al
  `_lastUpdate[variable]` ya existente (`index.js:277-278`).
- `evaluateStaleness` mide el silencio del EQUIPO: `now − deviceState._lastSeen`. Deja de usar el
  `mState` por-regla (`lastTs`); lee el estado del equipo en `siteState`.
- **Override por-variable opcional:** `mParams.watchVariable` → mide `_lastUpdate[watchVariable]`
  (comportamiento anterior, para casos donde interesa el silencio de UNA variable puntual).
- **Sin `_lastSeen` aún → `insufficient`** (no dispara). No se hidrata `_lastSeen` del histórico al
  arrancar (evita falsos stale en el boot: un equipo nunca visto en esta sesión no se declara caído
  hasta tener un mensaje vivo que fije la línea de base — comportamiento igual al actual con `mState`).
- El resolve al reconectar: el tick (`processStalenessTick`, cada `EDGE_TICK_SEC`) re-evalúa con
  `_lastSeen` fresco → resuelve dentro de un tick aunque el equipo reconecte publicando otra variable.

## 1 · Presupuesto de bloque
- Tipo de bloque: **LIGERO**
- Un concern: staleness avisa por variable, no por equipo (falsa alarma si el equipo está vivo publicando otras variables).
- Una decisión de diseño: silencio a nivel equipo (`_lastSeen`, cualquier variable), con override por-variable opcional.
- Archivos a tocar (LISTA CERRADA):
  1. `edge-engine/index.js` — `deviceState._lastSeen = eventTs` en cada mensaje.
  2. `edge-engine/evaluators/typeM.js` — `evaluateStaleness` mide `_lastSeen` (o `watchVariable`).
- Total: **2 archivos · Límite: 6.**

## 2 · Recon que lo funda
Auditoría A7; `index.js:270-278` (deviceState + `_lastUpdate` por mensaje); `typeM.js` `evaluateStaleness`
(hoy refresca `mState.lastTs` solo en el mensaje de `rule.variable`); `ruleEngine.js:47-48` (gate que
solo despacha la regla si `rule.variable===variable`); `processStalenessTick` (tick que ya pasa `siteState`).

## 3 · Consumidores
| Consumidor | archivo:línea | Qué le cambia |
|---|---|---|
| handler de mensaje | `index.js:277-278` | + `deviceState._lastSeen = eventTs` |
| `evaluateStaleness` | `typeM.js` | mide `_lastSeen` del equipo (o `watchVariable`); deja de usar `mState.lastTs` |
| `processStalenessTick` | `ruleEngine.js` | sin cambio (ya pasa `siteState`; el tick resuelve al reconectar) |

## 4 · Campos que mutan
| Qué | Antes | Después |
|---|---|---|
| medición de staleness | silencio de `rule.variable` (mState.lastTs) | silencio del EQUIPO (`_lastSeen`, cualquier variable) |
| `deviceState._lastSeen` | no existía | seteado en cada mensaje |
| `mParams.watchVariable` (opcional) | — | fuerza modo por-variable |

## 5 · Comportamiento de cada control
| Control | Qué hace | Si falla |
|---|---|---|
| `_lastSeen` por mensaje | marca que el equipo habló (cualquier variable) | sin él, no hay señal device-level |
| staleness device-level | `now − _lastSeen` vs umbral (min) | sin él, falsa alarma con equipo vivo (A7) |
| `watchVariable` | mide una variable puntual | modo por-variable explícito |

## 6 · Casos raros — ENUMERADOS
| # | Caso | Esperado |
|---|---|---|
| 1 | Equipo publica coolant pero no la variable observada | NO dispara (device vivo: `_lastSeen` fresco) |
| 2 | Equipo deja de publicar TODO | dispara tras el umbral (silencio device-level) |
| 3 | Equipo reconecta publicando otra variable | el tick resuelve la alarma dentro de un `EDGE_TICK_SEC` |
| 4 | Regla con `mParams.watchVariable` | mide esa variable (modo por-variable) |
| 5 | Equipo nunca visto en esta sesión (post-boot) | `insufficient` (no falso stale en el boot) |
| 6 | `eventTs` null | usa `Date.now()` (defensivo) |

## 7 · Path real (DEC-PROC-5)
Runtime del edge: `deviceState` en `siteState` (Map en memoria). `evaluateStaleness` lee ese estado;
el tick (`index.js setInterval → processStalenessTick`) lo re-evalúa. Sin Mongo.

## 8 · Disenso registrado
| Posición A | Posición B | Estado |
|---|---|---|
| Hidratar `_lastSeen` del histórico al boot | No hidratar (insufficient hasta primer mensaje vivo) | **Cerrado:** B (hidratar dispararía falso stale masivo en el boot) |
| Solo device-level | device-level + override `watchVariable` | **Cerrado:** B (conserva el caso por-variable puntual) |

## 9 · IDs reservados
- **DEC-REF-129** (staleness por equipo: `_lastSeen` device-level; `mParams.watchVariable` opcional).

## 10 · Cómo se prueba
1. **Unit (determinista):** `siteState` con un device `_lastSeen=now` (fresco) pero
   `_lastUpdate[battery_voltage]=now−20min` (variable observada vieja) → `evaluateM(staleness, variable=battery_voltage)`
   NO dispara (equipo vivo). Con `mParams.watchVariable='battery_voltage'` → SÍ dispara (modo por-variable).
   Device `_lastSeen=now−20min` → dispara (silencio device-level).
2. **Regresión:** `_lastSeen` presente y reciente → `minsSilent≈0`, no dispara.

## 11 · Costuras
| CST | Antes | Después | Verif |
|---|---|---|---|
| staleness | por variable (falsa con equipo vivo) | por equipo (cualquier variable refresca) | §10 unit |

## 12 · Reversión
Revert git de los 2 archivos. Runtime puro, sin migración.
