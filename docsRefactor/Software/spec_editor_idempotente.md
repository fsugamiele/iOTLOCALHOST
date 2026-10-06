# SPEC — P1: editor round-trip idempotente · 2026-10-06

**Dirección firmada por Franco:** primer bloque del P1. Auditoría B1-B7: guardar una regla por el
editor-frase **sin tocar nada la muta** — `sentenceToRule` reconstruye la regla desde la "frase" y
pierde/muta lo que la frase no representa. Síntoma del usuario: editó A1 por UI y quedó corrupta.

Regla de oro (plan de corrección): **`sentenceToRule(ruleToSentence(r), pack, r) ≡ r`** en los campos
evaluativos, para las ~68 reglas sembradas — como test permanente.

## 0 · CANDADO
**preguntas_abiertas: 0.**

Decisiones cerradas:
- `sentenceToRule` **preserva de `existing`** TODO campo que la frase no representa ni re-deriva:
  `correlationParent`, `escalateAfterMinutes`, `on_missing_ref`, `source_filter`, `reset_behavior`,
  `cooldownSec` (incluido 0), `graceSec`, `resolveGraceSec`, `setpointSource.scale`/`register`,
  `fallbackToD` (ya NO se fuerza a `true`), `mWindow.minSamples`.
- **Ventanas sin redondeo espurio:** si `existing` tiene un `durationSec` que redondea al MISMO minuto
  que la frase, se conserva el `durationSec` exacto (50 s no se vuelve 60 s al guardar sin cambio).
- **Unidad derivada (slope):** en round-trip se conserva `existing.unit` (no se re-compone `°C/min` →
  `°C/min/min`).
- **`_packId.vue submitRule`:** se quitan los `delete finalRule.graceSec` (D) y
  `delete finalRule.resolveGraceSec` (C/S/M) — son campos inocuos para esos tipos pero rompen la
  idempotencia. Se conservan los saneos de forma por tipo (crossExpr=null en D, strip de editor-keys en cross).
- **Residual documentado (B7):** un cross de UNA sola hoja degrada a D en el round-trip (la frase plana
  de 1 condición infiere D). No hay reglas así en los packs (todos los cross tienen ≥2 hojas) → fuera
  de alcance de este bloque; se deja anotado.

## 1 · Presupuesto de bloque
- Tipo de bloque: **NORMAL**
- Un concern: el editor corrompe la regla al guardar (pierde campos, redondea ventanas) → "lo que guardás ≠ lo que el motor evalúa".
- Una decisión de diseño: `sentenceToRule` preserva de `existing` lo que la frase no lleva; sin redondeo espurio; `submitRule` no borra campos.
- Archivos a tocar (LISTA CERRADA):
  1. `app/components/rules/ruleSentence.js` — preservación en `sentenceToRule` (campos, ventanas, minSamples, unit, fallbackToD/setpointSource).
  2. `app/pages/rulepacks/_packId.vue` — `submitRule`: quitar los 2 `delete`.
  3. `tools/test_rule_idempotency.js` — test permanente de idempotencia sobre los packs sembrados.
- Total: **3 archivos · Límite: 6.**

## 2 · Recon que lo funda
Auditoría B1-B7; `ruleSentence.js:287-395` (sentenceToRule: `fallbackToD=true` :319, redondeo :322/331/337/346/355/360/370, minSamples hardcode, unit slope :332, preserva solo graceSec/resolveGraceSec :390-392, cooldownSec 0→300 :301); `_packId.vue:691-701` (deletes). `ruleToSentence` :398-479.

## 3 · Consumidores
| Consumidor | archivo:línea | Qué le cambia |
|---|---|---|
| `sentenceToRule` | `ruleSentence.js:287-395` | overlay de preservación desde `existing`; ventanas/minSamples/unit idempotentes; fallbackToD no forzado |
| `submitRule` | `_packId.vue:688-701` | no borra graceSec/resolveGraceSec |
| `onSentenceSave` | `_packId.vue:576-582` | sin cambio (ya pasa `existing` vía ruleDraft) |
| test | `tools/test_rule_idempotency.js` | nuevo; gate de idempotencia |

## 4 · Campos que mutan
| Qué | Antes | Después |
|---|---|---|
| correlationParent/escalateAfterMinutes/on_missing_ref/source_filter/reset_behavior | se perdían | preservados de `existing` |
| fallbackToD (C) | forzado `true` | preservado de `existing` |
| cooldownSec=0 | → 300 | preservado 0 |
| window/mWindow.durationSec | redondeado a minuto | exacto si no cambió |
| mWindow.minSamples | hardcode 3/2 | preservado de `existing` |
| unit (slope) | re-compuesto `/min/min` | preservado de `existing` |
| graceSec/resolveGraceSec | borrados por submitRule | conservados |

## 5 · Comportamiento de cada control
| Control | Qué hace | Si falla |
|---|---|---|
| overlay de preservación | copia de `existing` los campos no-frase, al final de sentenceToRule | sin él, se pierden al guardar (B1) |
| ventana idempotente | conserva durationSec si redondea al mismo minuto | sin él, 50 s→60 s (B2) |
| minSamples preservado | usa existing.mWindow.minSamples o default | sin él, seeds 6/10 → 3/2 (B4) |

## 6 · Casos raros — ENUMERADOS
| # | Caso | Esperado |
|---|---|---|
| 1 | Editar solo la severidad de una regla cross con correlationParent | se conserva correlationParent (antes se perdía → rompía la cascada) |
| 2 | Regla C con fallbackToD:false / on_missing_ref:alarm | se conservan (antes fallbackToD volvía a true) |
| 3 | Regla S con durationSec 50 guardada sin tocar | queda 50 (no 60) |
| 4 | Regla M preset (baseline, minSamples 10) editada en umbral | minSamples sigue 10 |
| 5 | Regla NUEVA (sin existing) | usa defaults (fallbackToD true, minSamples por metric, durationSec de la frase) |
| 6 | cross de 1 sola hoja | degrada a D (residual documentado; no ocurre en los packs) |
| 7 | cross con hoja categórica (gen_status eq "RUNNING") | value string preservado (coerceValue devuelve el string) |

## 7 · Path real (DEC-PROC-5)
Frontend puro (módulo sin Vue + componente). El guardado va por `PUT /rulepacks` (validateRule) ya
existente. El test corre el módulo real con `@babel/register` contra los packs reales (Mongo).

## 8 · Disenso registrado
| Posición A | Posición B | Estado |
|---|---|---|
| Cambiar el modelo de frase a segundos (no minutos) | Conservar minutos + preservar durationSec exacto si no cambió | **Cerrado:** B (mínimo cambio de UI; idempotente igual) |
| submitRule sigue borrando campos "inocuos" | No borrar (idempotencia) | **Cerrado:** B |
| Resolver B7 (cross 1 hoja) ahora | Documentar (no hay casos reales) | **Cerrado:** documentar |

## 9 · IDs reservados
- **DEC-REF-126** (editor round-trip idempotente: `sentenceToRule` preserva de `existing`).

## 10 · Cómo se prueba
- **Test de idempotencia (nuevo, permanente):** `tools/test_rule_idempotency.js` — por cada regla de
  cada pack sembrado: `sentenceToRule(ruleToSentence(r), pack, r, idx)` debe igualar `r` en los campos
  evaluativos (type, condition, crossExpr, window, mWindow, mParams, inputs, setpointSource,
  fallbackToD, on_missing_ref, correlationParent, escalateAfterMinutes, cooldownSec, graceSec,
  resolveGraceSec, severity, unit, deviceType, variable). **0 diffs = verde.**
- **Antes/después:** correr el test ANTES del fix (debe reportar diffs en varias reglas) y DESPUÉS (0).

## 11 · Costuras
| CST | Antes | Después | Verif |
|---|---|---|---|
| Round-trip del editor | muta la regla (pierde/redondea) | idempotente en campos evaluativos | §10 test |

## 12 · Reversión
Revert git de los 3 archivos. Sin migración (frontend + test). Las reglas ya guardadas no cambian.
