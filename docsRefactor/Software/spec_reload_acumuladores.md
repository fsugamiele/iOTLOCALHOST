# SPEC — P1: reload que no borra acumuladores (A9/A16) · 2026-10-06

**Dirección firmada por Franco:** bloque P1. Auditoría A9: el reload calcula la huella sobre el
**JSON íntegro** de la regla → cualquier edición (umbral/severidad/texto) la marca `changed` →
`cleanupStateForRules` **borra el `mState`**, y el `acc` del acumulador se pierde (editar el umbral de
`cummins-pcc-oil-life` borra las horas de vida de aceite). Además (A9.2) el cleanup **no borra** los
docs de `msoftstate` → una regla recreada con el mismo `ruleId` rehidrata un `acc` obsoleto. Y A16:
el SIGTERM **no flushea** → se pierde hasta `MSOFT_FLUSH_SEC` de acumulado por reinicio.

## 0 · CANDADO
**preguntas_abiertas: 0.**

Decisiones cerradas:
- **Huella de ESTADO** (`stateFingerprint`) sobre los campos que definen CÓMO se computa el estado:
  `type, deviceType, variable, metric, mWindow, mParams, inputs, crossExpr, window, setpointSource`.
  El `mState` (buffers + acumuladores) se limpia SOLO si esa huella cambió (o la regla fue removida).
  Un cambio de `condition`(umbral)/`severity`/textos/`cooldownSec`/grace **NO** invalida el `acc`.
- **`resolve-by-edit`** pasa a dispararse para reglas **removidas o con huella de estado cambiada**
  (no para ediciones cosméticas/de umbral): la evaluación normal del próximo mensaje decide
  fire/resolve con el estado preservado (más limpio, sin churn de resolve/re-fire).
- **`msoftstate` se borra para reglas ELIMINADAS** (no editadas) → una recreación con el mismo
  `ruleId` arranca en cero (no rehidrata un `acc` viejo).
- **SIGTERM flushea** `mState` antes de desconectar (A16).
- A10 (`:resolveStart` huérfano) ya quedó cubierto por la limpieza por prefijo de P0-1.

## 1 · Presupuesto de bloque
- Tipo de bloque: **NORMAL**
- Un concern: editar una regla borra el acumulado (vida de aceite, consumo desde recarga).
- Una decisión de diseño: limpiar estado por **huella de estado**, no por huella íntegra; borrar msoftstate solo en remoción; flush en shutdown.
- Archivos a tocar (LISTA CERRADA):
  1. `edge-engine/reloadState.js` — `stateFingerprint` + `buildStateSnapshot`.
  2. `edge-engine/index.js` — mantener `stateSnapshot`; `toClean = removed ∪ stateChanged`; borrar msoftstate de removidas; flush en SIGTERM.
  3. `edge-engine/msoftstate.js` — `deleteMSoftState(siteId, ruleIds)`.
- Total: **3 archivos · Límite: 6.**

## 2 · Recon que lo funda
Auditoría A9/A16; `reloadState.js:19-21` (hashRule íntegro), `:91-119` (cleanup); `index.js:116-169`
(reloadPacks, `toClean=[...removed,...changed]`), `:96` (flush tick), `:283-288` (SIGTERM sin flush);
`msoftstate.js` (persistencia por `siteId,ruleId,dId`; `_persist`/`dirty`).

## 3 · Consumidores
| Consumidor | archivo:línea | Qué le cambia |
|---|---|---|
| reloadPacks | `index.js:116-169` | `toClean` por huella de estado; borra msoftstate de removidas |
| cleanupStateForRules | `reloadState.js:91` | se invoca con menos ruleIds (solo estado-cambiado + removidas) |
| diff/snapshot | `reloadState.js` | nuevo `buildStateSnapshot`/`stateFingerprint` |
| persistencia | `msoftstate.js` | nuevo `deleteMSoftState` |
| SIGTERM | `index.js:283` | flush final de acumuladores |

## 4 · Campos que mutan
| Qué | Antes | Después |
|---|---|---|
| criterio de limpieza de mState | huella íntegra (cualquier edición) | huella de ESTADO (solo cambio de cómputo) |
| acc en edición de umbral/severidad | se perdía | preservado |
| msoftstate de regla eliminada | quedaba huérfano | borrado |
| SIGTERM | sin flush | flush de dirty |

## 5 · Comportamiento de cada control
| Control | Qué hace | Si falla |
|---|---|---|
| `stateFingerprint` | hash de los campos de cómputo | — |
| `toClean = removed ∪ stateChanged` | limpia estado solo cuando corresponde | sin él, edición de umbral borra el acc (A9) |
| `deleteMSoftState(removed)` | borra persistencia de reglas eliminadas | sin él, acc obsoleto al recrear ruleId (A9.2) |
| flush en SIGTERM | persiste dirty antes de salir | sin él, pierde ≤ flush-interval (A16) |

## 6 · Casos raros — ENUMERADOS
| # | Caso | Esperado |
|---|---|---|
| 1 | Editar umbral de `oil-life` (250→300) | `acc` (horas) PRESERVADO; next tick decide fire/resolve con el nuevo umbral |
| 2 | Editar `mParams`/`mWindow`/variable del acumulador | huella de estado cambia → mState limpiado (el cómputo cambió, el acc viejo no aplica) |
| 3 | Eliminar la regla | mState + msoftstate borrados → recreación con mismo ruleId arranca en 0 |
| 4 | Editar severidad/recomendación/cooldown | sin limpieza de estado; sin resolve-by-edit espurio |
| 5 | Regla activa con edición de umbral que ya no se cumple | el próximo mensaje emite resolve-by-condición (estado preservado) |
| 6 | SIGTERM con acumuladores dirty | se flushean (no se pierden) |

## 7 · Path real (DEC-PROC-5)
Runtime del edge (Maps en memoria + `MSoftState` en Mongo por `bulkWrite`/`deleteMany`). El reload
es SF-3; el flush/persistencia es el camino ya existente de `msoftstate.js`.

## 8 · Disenso registrado
| Posición A | Posición B | Estado |
|---|---|---|
| Nunca limpiar mState de acumuladores | Limpiar solo si cambió la huella de estado | **Cerrado:** B (un cambio de variable/mParams SÍ invalida el acc) |
| resolve-by-edit en toda edición | Solo en removidas/estado-cambiado | **Cerrado:** B (edición cosmética no debe cerrar la alarma; la eval normal decide) |
| Borrar msoftstate también al editar | Solo al ELIMINAR | **Cerrado:** B (editar preserva el acc; eliminar lo descarta) |

## 9 · IDs reservados
- **DEC-REF-128** (reload preserva acumuladores: limpieza por huella de estado; msoftstate borrado solo en remoción; flush en SIGTERM).

## 10 · Cómo se prueba
1. **Unit (determinista):** `require('reloadState')` → `stateFingerprint(oilLife)` == `stateFingerprint({...oilLife, condition:{op:'gte',value:300}, severity:'critical'})` (umbral/severidad NO cambian la huella) y `!=` al cambiar `mParams`/`variable`. `hashRule` (íntegra) difiere en ambos.
2. **Live:** leer `msoftstate` del `oil-life` (acc=X>0); PUT que cambia solo su umbral; tras el reload + un flush, el `acc` sigue ≈X (NO reset a 0). Restaurar umbral.
3. **Remoción:** desactivar/eliminar una regla acumuladora → su doc de `msoftstate` se borra.

## 11 · Costuras
| CST | Antes | Después | Verif |
|---|---|---|---|
| Reload de reglas acumuladoras | edición borra el acc | edición de umbral/texto preserva el acc | §10.1/§10.2 |
| Shutdown | pierde acumulado no flusheado | flush en SIGTERM | §6#6 |

## 12 · Reversión
Revert git de los 3 archivos. Sin migración (runtime + persistencia existente).
