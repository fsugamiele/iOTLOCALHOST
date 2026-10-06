# SPEC — P0-5: frescura obligatoria en M2 (ratio/divergence/spread) · 2026-10-06

**Dirección firmada por Franco:** último bloque P0. Auditoría **A6**: las métricas M2 instantáneas
(`ratio`/`divergence`/`spread`) leen el **último valor** de `siteState` **sin control de antigüedad**.
Consecuencia medida/esperada: `divergence` (sifoneo) usa `consumption_tank` **congelado** cuando el
grupo se apaga → la alarma de **sifoneo persiste/dispara con el grupo apagado**, caso que
`spec_deteccion_sifoneo_eficiencia §6#1` prohíbe explícitamente. El patrón de frescura ya existe en
la hoja suma de `typeCross` (`SUM_STALENESS_MS`, `_lastUpdate`), pero M2 no lo usa.

## 0 · CANDADO
**preguntas_abiertas: 0.**

Decisiones cerradas:
- M2 verifica `eventTs − deviceState._lastUpdate[variable] ≤ ventana` por cada entrada (igual que la
  hoja suma de cross). Entrada **vieja o sin timestamp → se trata como ausente** → `insufficient`
  (retorno neutro: ni fire ni señal). `_lastUpdate` ya lo puebla `index.js:263-264`; `eventTs` ya
  viaja en el `ctx` de `evaluateInstant`.
- **Ventana por defecto 180 s** (≈3× cadencia ~60 s; `consumption_tank` lo publica el edge ~1/min →
  no hay falso `insufficient` en operación normal), **overridable** por `mParams.freshnessSec`.
- **Sinergia con P0-4 (A5):** entrada stale → `insufficient` → si había alarma M2 activa, el camino
  A5 la **resuelve** → el sifoneo **se cierra solo** cuando el grupo se apaga.
- `spread`: solo cuentan como miembros los equipos con la variable **fresca**; si quedan <2 → `insufficient`.

## 1 · Presupuesto de bloque
- Tipo de bloque: **LIGERO**
- Un concern: alarmas M2 que disparan/persisten con datos congelados (sifoneo con grupo apagado).
- Una decisión de diseño: frescura obligatoria por entrada (espejo de la hoja suma de cross), neutro si stale.
- Archivos a tocar (LISTA CERRADA):
  1. `edge-engine/evaluators/typeM.js` — constante + `isFresh`/`freshnessMs`; `readOne` chequea frescura; `evaluateInstant` pasa `eventTs`/ventana y filtra miembros de `spread`.
- Total: **1 archivo · Límite: 6.**

## 2 · Recon que lo funda
Auditoría A6; `typeM.js:113-173` (readOne/evaluateInstant sin frescura); `index.js:263-264`
(`_lastUpdate[variable]=eventTs`); `typeCross.js:80-93,25` (patrón `SUM_STALENESS_MS`). `eventTs` ya
está en el `ctx` que `evaluateM` pasa a `evaluateInstant` (`typeM.js:274`).

## 3 · Consumidores
| Consumidor | archivo:línea | Qué le cambia |
|---|---|---|
| `readOne` | `typeM.js:122-131` | firma `(..., eventTs, staleMs)`; descarta valores viejos/sin timestamp |
| `evaluateInstant` | `typeM.js:133-173` | destructura `eventTs`; calcula `staleMs`; filtra miembros spread por frescura |
| `evaluateM` dispatch | `typeM.js:274` | **sin cambio** (ya pasa el `ctx` con `eventTs`) |

## 4 · Campos que mutan
| Qué | Muta | Dónde |
|---|---|---|
| lectura M2 de una entrada | último valor crudo → **último valor FRESCO** (o ausente) | typeM readOne/evaluateInstant |
| `mParams.freshnessSec` (opcional) | nuevo override de ventana | regla (config) |

## 5 · Comportamiento de cada control
| Control | Qué hace | Si falla |
|---|---|---|
| `isFresh(st,var,eventTs,staleMs)` | true si la variable llegó ≤ ventana; false si vieja/sin ts | — |
| `freshnessMs(rule)` | `mParams.freshnessSec*1000` o 180 000 por defecto | default 180 s |
| ratio/divergence con entrada stale | a/b = null → `insufficient` | sin él, dispara con dato viejo (A6) |
| spread | miembros frescos; <2 → `insufficient` | sin él, culpa con lecturas viejas |

## 6 · Casos raros — ENUMERADOS
| # | Caso | Esperado |
|---|---|---|
| 1 | Grupo en marcha normal | `consumption_tank` fresco (edge ~1/min < 180 s) → divergence evalúa normal |
| 2 | Grupo apagado > ventana | `consumption_tank` stale → divergence `insufficient` → NO dispara; si estaba activa, A5 la resuelve |
| 3 | Variable sin `_lastUpdate` (nunca publicada) | tratada como ausente → `insufficient` |
| 4 | `eventTs` null (defensivo) | no filtra (no romper el tick/paths sin reloj de evento) |
| 5 | spread con <2 miembros frescos | `insufficient` (no culpa a nadie) |
| 6 | ratio con b=0 | `Infinity` (sin cambio; no es insufficient) |
| 7 | Regla con `mParams.freshnessSec` | usa esa ventana en vez de 180 s |

## 7 · Path real (DEC-PROC-5)
Runtime puro: `evaluateInstant` lee `siteState` (Map en memoria, poblado por `index.js` en cada
mensaje) + `_lastUpdate`. Sin Mongo. Mismo canal fire/resolve vía `notify()`.

## 8 · Disenso registrado
| Posición A | Posición B | Estado |
|---|---|---|
| Ventana fija global (como cross 90 s) | Default 180 s + override `mParams.freshnessSec` | **Cerrado:** B (distintas cadencias por variable; consumption_tank ~1/min) |
| Normalizar frescura en siteState (expiró→borrar) | Chequear en el evaluador (como cross) | **Cerrado:** B (no mutar siteState; consistente con typeCross) |

## 9 · IDs reservados
- **DEC-REF-125** (frescura obligatoria en M2; espejo de SUM_STALENESS de cross).

## 10 · Cómo se prueba
- **Unit (determinista):** `require('typeM')`, construir un `siteState` Map con un GEN que tenga
  `fuel_rate` fresco y `consumption_tank` con `_lastUpdate` viejo → `evaluateM(divergence)` debe
  devolver `detail:'insufficient'` (no dispara). Control: ambos frescos → evalúa (fired según umbral).
- **Regresión:** con ambas entradas frescas, divergence/ratio evalúan igual que hoy.

## 11 · Costuras
| CST | Antes | Después | Verif |
|---|---|---|---|
| Lectura M2 | último valor (aunque viejo) | último valor FRESCO o ausente | §10 unit |
| Sifoneo con grupo apagado | podía disparar/persistir | `insufficient` → no dispara; A5 cierra | §6#2 |

## 12 · Reversión
Revert git de `typeM.js`. Runtime puro, sin migración.
