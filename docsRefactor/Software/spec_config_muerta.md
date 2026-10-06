# SPEC — P1: matar config muerta (A13/A14) · 2026-10-06

**Dirección firmada por Franco:** último bloque P1. Auditoría A13/A14 — config que miente:
- **A13 `cooldownMinutes` fantasma:** `ruleEngine.js:81` lee `(rule.cooldownMinutes || 60)` — campo
  que NO existe en el schema ni escribe nadie → la cadencia del INFO "setpoint no disponible" queda
  **fija en 60 min**, desacoplada de todo.
- **A14 `setpointSource.scale` muerto:** `typeC.js` compara contra el setpoint **crudo**, ignorando
  `scale` → el usuario lo configura y no hace nada (y es prerequisito de SG-05: umbral = P_nom × 0,9).
- **A14 `source_filter`/`reset_behavior` dormidos:** declarados en el schema pero el motor no ramifica
  sobre ellos (reset_behavior 'manual' = TODO en typeS).

## 0 · CANDADO
**preguntas_abiertas: 0.**

Decisiones cerradas:
- **`cooldownMinutes` → se elimina el read fantasma**; la cadencia del INFO de setpoint faltante pasa
  a una **constante explícita y documentada** (`NO_SETPOINT_INFO_COOLDOWN_MS = 60 min`), no un campo
  inexistente. (Es un aviso de config de baja prioridad → cadencia lenta intencional.)
- **`setpointSource.scale` → se IMPLEMENTA** en el camino calibrado de `typeC`: umbral = `setpoint × scale`.
  `scale` default 1 → **sin cambio para las reglas actuales** (todas tienen scale 1). Mata el campo
  muerto implementándolo (y de paso destraba SG-05/P_nom).
- **`source_filter`/`reset_behavior` → se MARCAN RESERVADOS** en el schema (comentario explícito: no
  consumidos hoy). No se borran (preservan la intención de diseño; el editor no los expone → el
  usuario no puede setear algo que no hace nada). `on_missing_ref` SÍ se consume (typeC) → se aclara.
- `graceSec` en D/S/M: se deja (dormido pero inocuo; borrarlo rompería la idempotencia del editor, P1).

## 1 · Presupuesto de bloque
- Tipo de bloque: **LIGERO**
- Un concern: campos de config que el motor ignora o lee de un campo inexistente → el usuario cree que configuran algo.
- Una decisión de diseño: eliminar el fantasma (constante), implementar scale, marcar reservados los dormidos.
- Archivos a tocar (LISTA CERRADA):
  1. `edge-engine/ruleEngine.js` — `cooldownMinutes` → `NO_SETPOINT_INFO_COOLDOWN_MS`.
  2. `edge-engine/evaluators/typeC.js` — aplicar `setpointSource.scale` en el camino calibrado.
  3. `app/api/models/rule_definition.js` — comentar RESERVADOS `source_filter`/`reset_behavior`.
- Total: **3 archivos · Límite: 6.**

## 2 · Recon que lo funda
Auditoría A13/A14; `ruleEngine.js:70-82` (bloque INFO setpoint + cooldownMinutes); `typeC.js:16-26`
(camino calibrado, usa `setpoint` crudo); `rule_definition.js:47-51,82-84` (setpointSource.scale, source_filter, reset_behavior).

## 3 · Consumidores
| Consumidor | archivo:línea | Qué le cambia |
|---|---|---|
| INFO setpoint faltante | `ruleEngine.js:81` | cadencia por constante explícita (no campo fantasma) |
| camino calibrado typeC | `typeC.js:16-26` | umbral = setpoint × scale (antes crudo) |
| schema | `rule_definition.js:82-84` | comentarios RESERVADO (sin cambio funcional) |

## 4 · Campos que mutan
| Qué | Antes | Después |
|---|---|---|
| cadencia INFO setpoint | `rule.cooldownMinutes || 60` (fantasma) | `NO_SETPOINT_INFO_COOLDOWN_MS` (const 60 min) |
| umbral calibrado typeC | `setpoint` | `setpoint × (scale||1)` |
| source_filter/reset_behavior | sin etiqueta | RESERVADO (doc) |

## 5 · Comportamiento de cada control
| Control | Qué hace | Si falla |
|---|---|---|
| `NO_SETPOINT_INFO_COOLDOWN_MS` | cadencia fija y explícita del INFO | sin él, read de campo inexistente (A13) |
| scale en typeC | umbral = setpoint × scale | sin él, scale es config muerta (A14) |

## 6 · Casos raros — ENUMERADOS
| # | Caso | Esperado |
|---|---|---|
| 1 | C calibrada con scale=1 (todas las actuales) | umbral = setpoint (idéntico a hoy) |
| 2 | C calibrada con scale=0,9 (futuro SG-05) | umbral = setpoint × 0,9 |
| 3 | C en fallback (sin setpoint) | usa `condition.value` crudo (scale NO aplica al fallback) |
| 4 | INFO setpoint faltante | se emite 1 vez por hora (constante), no desde un campo inexistente |
| 5 | Regla con source_filter/reset_behavior seteado | sigue sin efecto (reservado) — ahora documentado |

## 7 · Path real (DEC-PROC-5)
Runtime del edge (ruleEngine/typeC) + schema de la app (sin migración; el comentario no cambia datos).

## 8 · Disenso registrado
| Posición A | Posición B | Estado |
|---|---|---|
| Borrar source_filter/reset_behavior del schema | Marcarlos RESERVADO (no borrar) | **Cerrado:** B (preservar intención; sin data-loss; el editor no los expone) |
| cooldownMinutes real (schema nuevo) | Constante explícita | **Cerrado:** constante (si se quiere configurable, campo real futuro) |
| scale: borrar | scale: implementar | **Cerrado:** implementar (lo pide SG-05; default 1 no rompe nada) |

## 9 · IDs reservados
- **DEC-REF-130** (config muerta: cooldownMinutes→constante; scale implementado; source_filter/reset_behavior reservados).

## 10 · Cómo se prueba
1. **Unit (scale):** `evaluateC` con setpoint=100 y `setpointSource.scale=0,9` → thresholdUsed=90; con scale=1 → 90? no, =100 (sin cambio). Con value por debajo/encima del umbral escalado → fired correcto.
2. **Regresión:** las C actuales (scale 1) → thresholdUsed = setpoint (idéntico a hoy).
3. **cooldownMinutes:** code-review (no se lee más el campo fantasma; INFO usa la constante).

## 11 · Costuras
| CST | Antes | Después | Verif |
|---|---|---|---|
| Config de reglas | campos que mienten (fantasma/ignorados) | fantasma eliminado, scale vivo, dormidos documentados | §10 |

## 12 · Reversión
Revert git de los 3 archivos. Sin migración.
