# SPEC — P1: validación anti-regla-fantasma · 2026-10-06

**Dirección firmada por Franco:** bloque P1. Auditoría B8: un typo en `variable`/`deviceType` crea
una regla que el motor **silencia para siempre** (el gate `rule.variable !== variable` de
`ruleEngine.js:48` nunca matchea) y **nada lo avisa** al guardar. Además las **hojas-equipo de cross
validan menos** que las hojas-suma (no chequean `op` contra el enum ni `value` numérico — inconsistencia interna).

## 0 · CANDADO
**preguntas_abiertas: 0.**

Decisiones cerradas:
- **Hoja-equipo de cross: validación dura (RECHAZO)** de `op` ∈ enum + `value` numérico para ops
  aritméticos (espejo de `validateD`/hoja-suma). Las reglas vivas pasan (op válido; `eq`/`neq` con
  string exentos de numérico) → no brickea (se verifica antes de commit).
- **Chequeo de refs contra fichas = WARNING no bloqueante** (patrón ya existente para hojas cross,
  `rulepacks.js:146-163`): se extiende a `variable`/`deviceType` de TODA regla (D/C/S/M) + inputs de
  M2. Si la variable no está en la ficha → warning "la regla no podrá disparar". No se bloquea el
  save (estricto brickearía por una ficha incompleta).
- **Exención de variables DERIVADAS del edge** (`autonomy_hours`, `fuel_efficiency`, `consumption_tank`):
  las publica el edge (no están en la ficha del equipo) y son targets legítimos → NO warnear sobre ellas.
- `setpointSource.variable` (C) **no** se chequea contra la ficha (es una key de setpoint del controlador,
  no necesariamente una variable declarada). `op`/`value` por input de M2 siguen opcionales (fallback a `rule.deviceType`).

## 1 · Presupuesto de bloque
- Tipo de bloque: **NORMAL**
- Un concern: un typo crea una regla muerta que el motor silencia sin aviso (falsa cobertura).
- Una decisión de diseño: hoja-equipo cross dura; chequeo de refs de TODA regla contra fichas = warning, con exención de derivadas.
- Archivos a tocar (LISTA CERRADA):
  1. `app/api/services/ruleValidation.js` — `validateCrossTree` hoja-equipo (op/value); nuevo `collectRuleRefs(pack)` (cross + top-level + inputs M2).
  2. `app/api/routes/rulepacks.js` — usar `collectRuleRefs`; chequear refs contra fichas con exención de derivadas; warnings.
- Total: **2 archivos · Límite: 6.**

## 2 · Recon que lo funda
Auditoría B8; `ruleValidation.js:59-66` (hoja-equipo laxa) + `:232-257` (`collectCrossLeafRefs`);
`rulepacks.js:138-163` (validatePackRules + chequeo de refs cross = warning); `ruleEngine.js:47-48`
(gate que silencia la regla-fantasma). Variables derivadas: `edge-engine/autonomy.js` (autonomy_hours,
consumption_tank), `efficiency.js` (fuel_efficiency).

## 3 · Consumidores
| Consumidor | archivo:línea | Qué le cambia |
|---|---|---|
| `validateCrossTree` hoja equipo | `ruleValidation.js:59-64` | ahora exige `op`∈enum + `value` numérico (arit.) |
| `collectRuleRefs` (nuevo) | `ruleValidation.js` | refs de cross + top-level D/C/S/M + inputs M2 |
| ruta PUT | `rulepacks.js:151-163` | usa `collectRuleRefs`; exime derivadas; warnings para toda regla |

## 4 · Campos que mutan
| Qué | Antes | Después |
|---|---|---|
| hoja-equipo cross op/value | no validados | RECHAZO si inválidos |
| variable/deviceType de D/C/S/M | no chequeados vs ficha | WARNING si no declarados (no derivada) |
| inputs M2 | no chequeados vs ficha | WARNING si no declarados |

## 5 · Comportamiento de cada control
| Control | Qué hace | Si falla |
|---|---|---|
| hoja-equipo dura | 400 con razón si op/value inválidos en una hoja cross | sin él, hoja fantasma que el motor descarta silenciosa |
| chequeo refs | warning "variable X no declarada en ficha Y → no podrá disparar" | sin él, regla muerta por typo pasa en verde |
| exención derivadas | no warnea autonomy_hours/fuel_efficiency/consumption_tank | sin él, falso warning en reglas legítimas |

## 6 · Casos raros — ENUMERADOS
| # | Caso | Esperado |
|---|---|---|
| 1 | D con `variable: coolant_tmp` (typo) | WARNING: no declarada en la ficha cummins-pcc |
| 2 | Regla sobre `autonomy_hours`/`consumption_tank` | sin warning (derivada del edge) |
| 3 | Hoja cross `gen_status eq "RUNNING"` | pasa (eq no es aritmético → value string permitido) |
| 4 | Hoja cross `load_kw gt "x"` (value no numérico) | **RECHAZO 400** |
| 5 | `deviceType` sin ficha en equipmentsheets | WARNING (deviceType sin ficha) |
| 6 | Ficha con `variables: []` (texto libre) | no warnea (no hay contra qué validar — `vars.size===0`) |
| 7 | C con `setpointSource.variable` no-ficha | no warnea (es key de setpoint, no variable observada) |

## 7 · Path real (DEC-PROC-5)
Validación app-side en el `PUT /rulepacks/:packId` (ya corre validatePackRules + chequeo de refs);
las fichas se leen de `equipmentsheets` (Mongo). Warnings viajan en el 200 (frontend las pinta en ámbar).

## 8 · Disenso registrado
| Posición A | Posición B | Estado |
|---|---|---|
| Chequeo de refs = RECHAZO 400 | WARNING no bloqueante | **Cerrado:** B (estricto brickearía por ficha incompleta; patrón ya usado para cross) |
| Hoja-equipo cross = WARNING | RECHAZO (como hoja-suma) | **Cerrado:** RECHAZO (consistencia interna; las vivas pasan) |
| Exigir deviceType por input M2 | Dejar opcional (fallback) | **Cerrado:** opcional (readOne ya cae a rule.deviceType) |

## 9 · IDs reservados
- **DEC-REF-127** (validación anti-regla-fantasma: refs de toda regla vs ficha + hoja-equipo cross dura).

## 10 · Cómo se prueba
1. **No-regresión (previo a commit):** `validateRule` sobre TODAS las reglas vivas → 0 inválidas (la hoja-equipo dura no brickea nada).
2. **Typo:** PUT (o validación) de una regla con `variable` inexistente en la ficha → el 200 trae un **warning** "no declarada".
3. **Derivada:** una regla sobre `autonomy_hours`/`consumption_tank` → **sin** warning.
4. **Hoja cross inválida:** cross con hoja-equipo `value` no numérico en op aritmético → **400**.

## 11 · Costuras
| CST | Antes | Después | Verif |
|---|---|---|---|
| Validación de reglas | hoja-equipo laxa; refs D/C/S/M no chequeadas | hoja-equipo dura; refs de toda regla vs ficha (warning) | §10 |

## 12 · Reversión
Revert git de los 2 archivos. Sin migración (solo validación en el write-path).
