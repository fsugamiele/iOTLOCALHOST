# SPEC — P0-4: ciclo de vida simétrico (C resuelve · M no queda zombie) · 2026-10-06

**Dirección firmada por Franco:** bloque P0-4 del plan de corrección. Dos alarmas que **nunca
cierran** (auditoría A4/A5):
- **A4** — el camino **calibrado** de type C no marca `activeState` al disparar → sus alarmas
  **nunca resuelven por condición** (quedan abiertas para siempre). Es el único tipo que lo omite.
- **A5** — una regla **M activa** que pasa a `insufficient` (buffer bajo minSamples, input que
  desaparece, miembros de spread < 2) hace `if (res.detail) continue` → saltea también el resolve →
  **alarma M zombie** en `activeState`.

## 0 · CANDADO
**preguntas_abiertas: 0.**

Decisiones cerradas:
- **C calibrado** entra a `activeState` (vía `stateKey` P0-1) y **resuelve por condición** cuando el
  valor vuelve a estar bajo el setpoint (espejo de type D). El camino **fallback/no-ref NO** marca
  `activeState`: su cierre es `setpoint-recovered` (DEC-REF-64.c + EDGE-2), que ya existe y queda intacto.
- **M en `insufficient`:** si había alarma activa de la regla en **ese equipo** (`${ruleId}:${dId}`),
  se emite resolve (`reason:'soft-sensor-insufficient'`) antes del `continue`. Cierra el zombie.
- **Residual acotado (spread):** `spread` ancla la alarma al equipo *outlier* (posible ≠ `dId`). Si
  cae a `insufficient` por un mensaje de otro equipo, su instancia podría no resolverse en ese ciclo.
  Es estrecho (spread necesita ≥2 ELTEK y que caiga a <2) y se documenta; refinamiento fino → P2.

## 1 · Presupuesto de bloque
- Tipo de bloque: **LIGERO**
- Un concern: alarmas C/M que se abren y **nunca cierran** (ruido permanente, "la alarma quedó colgada").
- Una decisión de diseño: simetría de ciclo de vida — C calibrado resuelve como D; M resuelve al perder base.
- Archivos a tocar (LISTA CERRADA):
  1. `edge-engine/ruleEngine.js` — case `C` (activeState solo en calibrado + resolve-by-condición); case `M` (resolve en `res.detail` si activo).
- Total: **1 archivo · Límite: 6.**

## 2 · Recon que lo funda
Auditoría A4 (`ruleEngine.js:57-67` C fire sin activeState) + A5 (`:183` `if(res.detail)continue`).
Depende de P0-1 (estado por `ruleId:dId` ya mergeado: `key`/`mkey`).

## 3 · Consumidores
| Consumidor | archivo:línea | Qué le cambia |
|---|---|---|
| Dispatch C | `ruleEngine.js` case C | calibrado pasa `activeState`; nuevo `else if` resolve-by-condición |
| Dispatch M | `ruleEngine.js` case M | `res.detail` → resolve si `activeState.has(${ruleId}:${dId})` antes del `continue` |
| EDGE-2 (fallback/no-ref) | `ruleEngine.js` C block | **sin cambio** (setpoint-recovered sigue cerrando el INFO/escalada) |

## 4 · Campos que mutan
| Qué | Muta | Dónde |
|---|---|---|
| C calibrado | sin cierre → **resuelve por condición** + entra a activeState | ruleEngine case C |
| M insufficient con alarma activa | zombie → **resuelve** (`soft-sensor-insufficient`) | ruleEngine case M |

## 5 · Comportamiento de cada control
| Control | Qué hace | Si falla |
|---|---|---|
| C calibrado fired | fireAlarm con activeState (anti-refire P0-1 aplica) | — |
| C calibrado !fired & activo | fireResolve resolve-by-condición | sin él, C nunca cierra (A4) |
| C fallback/no-ref | igual que hoy (sin activeState; EDGE-2 + setpoint-recovered) | — |
| M `res.detail` & activo | fireResolve `soft-sensor-insufficient` | sin él, M zombie (A5) |

## 6 · Casos raros — ENUMERADOS
| # | Caso | Esperado |
|---|---|---|
| 1 | C calibrado cruza el setpoint y vuelve | fire al cruzar → resolve al volver (como D) |
| 2 | C en fallback (sin setpoint) que luego recupera setpoint | cierre por `setpoint-recovered` si había escalado (EDGE-2, intacto) |
| 3 | C que alterna calibrado↔fallback | el fire calibrado se trackea; el fallback no (semánticas distintas, DEC-REF-64.c) |
| 4 | M activa cuyo buffer cae bajo minSamples | resolve `soft-sensor-insufficient` (no zombie) |
| 5 | M `ratio`/`divergence` con un input que desaparece | `res.detail` → resolve de la instancia de `dId` |
| 6 | `spread` con outlier en otro equipo que cae a <2 miembros | residual acotado: puede no resolver ese ciclo (documentado, P2) |
| 7 | M que nunca estuvo activa y da insufficient | no-op (nada que resolver) |

## 7 · Path real (DEC-PROC-5)
Runtime puro (Maps en memoria + `notify()`); mismo canal fire/resolve. Sin Mongo/`.save()`.

## 8 · Disenso registrado
| Posición A | Posición B | Estado |
|---|---|---|
| Resolver TODAS las instancias `${ruleId}:*` en insufficient | Resolver solo la del `dId` que disparó | **Cerrado:** B (por-equipo es correcto para ratio/divergence/baseline; evitar over-resolve de instancias con datos vivos) |
| C fallback también resuelve por condición | fallback cierra solo por setpoint-recovered | **Cerrado:** B (DEC-REF-64.c; fallback ≠ "condición resuelta") |

## 9 · IDs reservados
- **DEC-REF-124** (ciclo de vida: C calibrado resuelve por condición; M resuelve al perder base).

## 10 · Cómo se prueba (simulador)
1. **C resuelve:** una regla C calibrada (p. ej. `cat-CR00061-C1` coolant vs setpoint) — forzar coolant > setpoint (fire) y luego < setpoint (debe **resolver**, antes no lo hacía).
2. **M no zombie:** una regla M (p. ej. baseline/variance) activa; cortar/degradar el flujo de su variable hasta `insufficient` → debe emitir **resolve** (`soft-sensor-insufficient`), no quedar abierta.
3. **Regresión fallback:** una C sin setpoint sigue emitiendo el INFO EDGE-2 y cerrando por `setpoint-recovered` igual que hoy.
4. **Anti-refire C:** una C calibrada activa no re-notifica mientras siga sobre el setpoint (P0-1).

## 11 · Costuras
| CST | Antes | Después | Verif |
|---|---|---|---|
| Ciclo de vida C | fire sin resolve (colgada) | fire→resolve por condición (como D) | §10.1 |
| Ciclo de vida M | zombie en insufficient | resuelve al perder base | §10.2 |

## 12 · Reversión
Revert git de `ruleEngine.js`. Estado en memoria; un reinicio reconstruye. Sin migración.
