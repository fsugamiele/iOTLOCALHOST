# SPEC — Rediseño Reglas de Monitoreo (editor-frase) · 2026-09-23 · #83

> Dirección firmada por Franco (sala de diseño #83): regla = **frase legible**,
> tipo de motor **inferido** (nunca se muestra D/C/S/cross), página de 3 zonas
> (cards + editor + preview), progressive disclosure sin "modo avanzado" con
> jerga, plantillas para arrancar, correlación/cascada = fase 2. Sin perder
> capacidad del motor.

## Partición en bloques (cada uno = spec propio ≤6 archivos)

| Bloque | Concern | Estado |
|---|---|---|
| **B1** | Página 3 zonas + editor-frase para **1 condición (D)** + mapeo frase↔engine (núcleo). cross/C/S siguen editables por el form experto actual (coexistencia, sin regresión). | **spec abajo** |
| B2 | Progressive disclosure: **Y/O (cross)** + **durante/N veces (S)** + **vs setpoint (C)** en el editor-frase. Retira el form experto para esos tipos. | pendiente |
| B3 | **Plantillas/presets** por equipo (biblioteca de reglas probadas). | pendiente |
| B4 | **Salud** en las cards (¿disparó?, última vez) + "ajustes finos" (cooldown/grace/resolve/reset) pulidos. | pendiente |
| B5 (fase 2) | **Correlación/cascada** visual (nodos red→ATS→grupo→rectificador). | diferido (firmado) |

**Invariante transversal:** el payload que se guarda es el mismo `RuleDefinition`
de siempre; el backend (`PUT /rulepacks/:packId` + `validateRule`) NO se toca en
ningún bloque. El editor-frase solo cambia CÓMO se construye ese payload.

---

# SPEC — Bloque 1 · página + editor-frase (type D) · 2026-09-23

## 0 · CANDADO
preguntas_abiertas: **0**

> Decisiones pinneadas para llegar a 0:
> - **Coexistencia, no big-bang:** B1 reescribe la vista pero CONSERVA el form
>   experto actual (crossExpr/C/S/tiempos) accesible con un botón "Modo experto"
>   por regla. Reglas cross/C/S existentes (p.ej. la cascada cummins) se editan
>   por ahí hasta B2. Cero capacidad perdida en B1.
> - **El editor-frase de B1 solo crea/edita type D.** Si una regla no es D, la
>   card la muestra (resumen + severidad + recomendación + toggle) y "Editar"
>   abre el Modo experto, no el editor-frase.
> - **Inferencia de tipo:** en B1 el editor-frase produce SIEMPRE type D (una
>   condición). La inferencia cross/S/C llega en B2.

## 1 · Presupuesto de bloque
- Tipo de bloque: **PESADO** (reescribe la vista central del cerebro del producto)
- Un concern: **la página nueva de Reglas (3 zonas) + editor-frase para reglas de una condición (D), sin regresión de cross/C/S**
- Una decisión de diseño: **regla = frase; tipo inferido; coexistencia con el form experto**
- Archivos a tocar (LISTA CERRADA):
  1. `app/components/rules/ruleSentence.js` (NUEVO) — mapeo frase↔RuleDefinition (D) + resumen legible de cualquier tipo
  2. `app/components/rules/SentenceEditor.vue` (NUEVO) — editor-frase (equipo/severidad/1 condición/recomendación) + preview
  3. `app/components/rules/RuleCard.vue` (NUEVO) — card de regla (resumen + chip severidad + recomendación + toggle on/off + botón Modo experto)
  4. `app/pages/rulepacks/_packId.vue` (REWRITE) — página 3 zonas: lista de cards + editor + preview; conserva el form experto como componente embebido/modal
- Total: **4** archivos · Límite: 6

> El backend (`rulepacks.js`, `ruleValidation.js`, `rule_definition.js`) NO entra.
> `CrossExprNode.vue` NO se toca (lo reusa el Modo experto tal cual).

## 2 · Recon que lo funda
- Capacidades del motor: `rule_definition.js` (4 tipos + severidad + recommendation + correlationParent + cooldown/grace/resolveGrace/escalate + condition/setpointSource/window/crossExpr + source_filter/on_missing_ref/reset_behavior).
- Path de guardado: `PUT /rulepacks/:packId` = upsert del pack completo; `validatePackRules`→`validateRule` valida cada regla (los 4 tipos). El front arma `pack.rules[]` y PUTea el pack.
- UX actual (a reemplazar): wizard 4 pasos (D) + "Opciones avanzadas" con jerga (`_packId.vue`).
- Ficha aporta `deviceType` + `variables[]` (name/label/unit/type) + `domain` → el editor ofrece variables legibles del catálogo (fallback texto libre con aviso, patrón S6).

## 3 · Consumidores (grep exhaustivo)
| Consumidor | archivo:línea | Qué le cambia |
|---|---|---|
| Sidebar "Reglas de monitoreo" | `layouts/default.vue` (`path:/rulepacks`) | ninguno (misma ruta) |
| Lista de packs | `pages/rulepacks/index.vue` | ninguno (navega a `_packId` igual) |
| Editor de pack/regla | `pages/rulepacks/_packId.vue` | **rewrite** (consume los 3 componentes nuevos + form experto embebido) |
| Guardado | `PUT /rulepacks/:packId` (`rulepacks.js:110`) | ninguno — mismo payload `RuleDefinition` |
| Validación | `ruleValidation.js` `validateRule` | ninguno |
| Selector estricto de variable | ficha `GET /equipmentsheet` | ninguno (mismo endpoint) |

## 4 · Campos que entran / salen / mutan (editor-frase B1 → RuleDefinition)
| Campo RuleDefinition | Entra | Sale | Muta | Dónde |
|---|---|---|---|---|
| `type` | ='D' (fijo en B1) | | | ruleSentence |
| `deviceType` | del pack/ficha | | | SentenceEditor |
| `variable` | select de la ficha (o texto libre + aviso) | | | SentenceEditor |
| `condition {op,value}` | comparador español + valor | | | SentenceEditor |
| `severity` | select (Urgencia/Atención/Informativo→critical/warning/info) | | | SentenceEditor |
| `recommendation` | texto (warning suave si vacío) | | | SentenceEditor |
| `label` | autogenerado del resumen, editable | | | ruleSentence |
| `ruleId`, `inferenceId` | **autogenerados ocultos** (slug único en el pack) | | | ruleSentence |
| `cooldownSec` etc. | defaults (300/…); NO se editan en B1 (van en B4) | | | ruleSentence defaults |
| crossExpr/window/setpointSource | **no** (B1 no los crea; el experto sí) | | | — |

## 5 · Comportamiento de cada control
| Control | Qué hace | Validación | Qué pasa si falla |
|---|---|---|---|
| Select equipo | fija deviceType del editor (default = el del pack) | debe existir ficha | sin ficha → variable por texto libre + aviso |
| Select variable | elige variable de la ficha (con unidad) | estricto si la ficha declara vars | ficha sin vars → input libre + aviso (S6) |
| Comparador | `OPERATOR_LABELS` (español) → op interno | enum OPERATORS | — |
| Valor | número/bool/categórico según tipo de la variable | requerido, coercible al tipo | botón Guardar deshabilitado |
| Severidad | mapea etiqueta usuario→info/warning/critical | requerido | default warning |
| Recomendación | texto libre | opcional (warning suave si vacío) | guarda igual |
| Preview | render vivo "🔴 Cuando … → recomendación" | — | — |
| Guardar | arma RuleDefinition (D), lo mete en pack.rules, `PUT /rulepacks/:packId` | validateRule del backend (200/400) | muestra el error del 400; no cierra el editor |
| Toggle on/off (card) | prende/apaga la regla (status) y PUTea el pack | — | revierte visualmente si el PUT falla |
| "Modo experto" (card/editor) | abre el form actual (crossExpr/C/S/tiempos) con la regla precargada | idem hoy | idem hoy |

## 6 · Casos raros — ENUMERADOS
| # | Caso | Comportamiento esperado |
|---|---|---|
| 1 | Regla existente type cross/C/S | card la muestra con resumen legible; "Editar" → Modo experto (no editor-frase) |
| 2 | Ficha del pack sin variables declaradas | variable por texto libre + aviso; se guarda (fallback S6) |
| 3 | Variable categórica/bool | el control de valor cambia a select/toggle según `variableType` de la ficha |
| 4 | Recomendación vacía | warning suave "esta alarma no dice qué hacer"; guarda igual |
| 5 | ruleId autogenerado colisiona en el pack | se sufija `-2`, `-3`… hasta único |
| 6 | Editar una regla D creada por el viejo wizard | abre en el editor-frase (round-trip: ruleSentence parsea D→frase) |
| 7 | Pack nuevo sin reglas | página muestra estado vacío + CTA "Nueva regla" / "Desde plantilla" (plantilla llega en B3, en B1 solo "Nueva regla") |
| 8 | PUT 400 por validateRule | se muestra el detalle; la regla NO se pierde (el editor conserva el draft) |

## 7 · Path real del consumidor (DEC-PROC-5)
- archivo:línea: `app/api/routes/rulepacks.js:110` (`PUT /rulepacks/:packId`)
- Escribe por: **findOneAndUpdate** (upsert del pack completo) tras `validatePackRules`. El front NO escribe la regla suelta: reemplaza/añade en `pack.rules[]` y PUTea el pack entero (idéntico al flujo actual).

## 8 · Disenso registrado
| Posición A | Posición B | Qué evidencia las distinguiría | Estado |
|---|---|---|---|
| Motor: mostrar etiqueta secundaria del tipo (trazabilidad soporte) | UX: cero mención de tipo | feedback de soporte tras piloto | acordado: etiqueta chiquita no-protagonista en la card |
| NOC: correlación en MVP | Consenso: cascada = fase 2 | tiempo de config del operador | resuelto: B5 diferido |
| Confiabilidad: recomendación obligatoria | UX: no bloquear el guardado | tasa de alarmas sin acción en piloto | resuelto: warning suave, no bloqueo |

## 9 · IDs reservados
- Prefijo de `ruleId` autogenerado: `r-<slug(variable)>-<n>`; `inferenceId`: `U<n>` (user-rule), sin colisión con los packs sembrados (A/M/C/G/H…). El generador verifica unicidad dentro del pack.

## 10 · Cómo se prueba
- `node --check` de `ruleSentence.js`; `vm.Script` sobre el `<script>` de los .vue.
- Build `docker_nuxt_build.yml` exit 0; strings del editor en `dist/_nuxt`.
- Smoke E2E (con token superadmin): crear regla D por el editor-frase → `PUT /rulepacks` 200 → la regla aparece en `pack.rules` con condition/severity/recommendation correctos y ruleId único → el motor la evalúa (fire/resolve en `db.notifications` con un `set_sensor` del sim que cruce el umbral).
- Round-trip: editar esa regla D → el editor-frase la reconstruye igual (sin drift).
- No-regresión: una regla cross existente sigue editable por Modo experto y el pack PUTea 200.

## 11 · Costuras que este bloque cambia
| CST | Antes | Después | Verificación |
|---|---|---|---|
| UX de creación de reglas | wizard 4 pasos + avanzado con jerga | página 3 zonas + editor-frase (D) + experto (resto) | smoke E2E + click-through |
| (sin cambio de costura de datos) | payload RuleDefinition | idéntico | validateRule 200 |

## 12 · Reversión
- Los 3 componentes nuevos son aditivos; `_packId.vue` se revierte a la versión en git (`git checkout <commit> -- pages/rulepacks/_packId.vue`) y se borran `components/rules/*`. Backend intacto → reversión limpia sin tocar datos.

---

# SPEC — Bloque 2 · progressive disclosure (Y/O, tiempo, setpoint) · 2026-09-23

## 0 · CANDADO
preguntas_abiertas: **0**

> Pinneado:
> - **Tipo INFERIDO de la frase** (el usuario nunca lo elige): 1 condición → D ·
>   1 condición + "durante/N veces" → S · 1 condición + "vs valor del equipo" → C ·
>   2+ condiciones (Y/O) → cross.
> - **cross PLANO en B2** (una junta Y/O de N condiciones-hoja, cada una sobre su
>   equipo). El anidamiento profundo (grupos dentro de grupos) sigue en Modo
>   experto (CrossExprNode). Cubre la cascada (red caída Y grupo parado).
> - **Retiro del Modo experto** para D/S/C/cross-plano: `onCardEdit` abre SIEMPRE
>   el editor-frase; "Modo experto" queda como escape para cross anidado.
> - **TODO INLINE, sin modal (Franco #83):** la configuración avanzada NO va en
>   un modal ni al pie de la página — se despliega DENTRO del editor (zona
>   derecha), en el mismo lugar del preview. El cross anidado se embebe ahí
>   (CrossExprNode dentro de un desplegable del editor), no en un el-dialog.
>   El modal `ruleDraft` actual se retira.

## 1 · Presupuesto de bloque
- Tipo: **PESADO**
- Concern: **condiciones múltiples Y/O + duración/repetición + comparación contra setpoint en el editor-frase, con tipo inferido**
- Archivos (LISTA CERRADA):
  1. `app/components/rules/ruleSentence.js` (EXTEND) — build/parse/infer de cross-plano, S y C
  2. `app/components/rules/SentenceEditor.vue` (EXTEND) — "＋ condición" (Y/O), "⏱ durante…", "📐 vs valor del equipo"
  3. `app/components/rules/ConditionRow.vue` (NUEVO) — una fila de condición (equipo opcional/variable/op/valor)
  4. `app/pages/rulepacks/_packId.vue` (EDIT) — `onCardEdit` enruta cross-plano/S/C al editor-frase; experto solo para cross anidado
- Total: **4** · Límite: 6

## 2 · Recon que lo funda
- Formas del engine: `crossExpr {op:'AND'|'OR', children:[{deviceType,variable,condition:{op,value}}]}` (leaf plana); `window {durationSec,countThreshold,matchCondition:{op,value}}`; `setpointSource {variable,scale}` + `fallbackToD`. Todas ya validadas por `validateRule` (backend intacto).
- B1 dejó `ruleSentence.js` (D) + `SentenceEditor` + cards + coexistencia con experto.

## 3 · Consumidores
| Consumidor | archivo:línea | Qué le cambia |
|---|---|---|
| `PUT /rulepacks/:packId` | `rulepacks.js:110` | ninguno — mismo payload (ahora con crossExpr/window/setpointSource armados por el editor) |
| `validateRule` / `validateCrossTree` | `ruleValidation.js` | ninguno |
| Modo experto (CrossExprNode) | `_packId.vue` | queda como escape para cross anidado |

## 4 · Inferencia frase → type
| Frase | type | Payload |
|---|---|---|
| 1 cond, sin extras | D | `condition` |
| 1 cond + "durante N min / M veces" | S | `window.matchCondition` + durationSec + countThreshold |
| 1 cond + "vs valor del equipo (setpoint)" | C | `setpointSource.variable` + `condition.op` + `fallbackToD` |
| ≥2 cond (Y/O) | cross | `crossExpr {op, children[]}` |

## 5 · Comportamiento de cada control
| Control | Qué hace | Validación | Falla |
|---|---|---|---|
| ＋ condición | agrega ConditionRow; aparece toggle Y/O global | — | — |
| Y / O | fija `crossExpr.op` (AND/OR) | — | — |
| equipo (por fila) | deviceType de esa hoja (default = pack) | ficha existente | libre + aviso |
| ⏱ durante | agrega durationSec (min→seg) + countThreshold; **deshabilitado si hay ≥2 condiciones** (S es 1 condición) | duration>0, count≥1 | no deja guardar |
| 📐 vs valor del equipo | cambia el valor fijo por el nombre del setpoint que reporta el equipo; **excluyente con ⏱ y con ≥2 cond** | setpoint variable no vacío | no deja guardar |
| Guardar | infiere type + arma payload + PUT pack | validateRule (200/400) | muestra 400, no pierde draft |

## 6 · Casos raros — ENUMERADOS
| # | Caso | Comportamiento |
|---|---|---|
| 1 | Editar cross ANIDADO existente (grupos) | card → "Modo experto" (el editor-frase plano no lo representa; aviso) |
| 2 | Editar cross PLANO existente | round-trip a filas de condición Y/O |
| 3 | Usuario pone "durante" con 2 condiciones | "durante" deshabilitado; tooltip explica (S es una sola condición) |
| 4 | "vs setpoint" + "durante" a la vez | mutuamente excluyentes en la UI |
| 5 | cross con 1 sola fila | al quitar la 2ª fila, vuelve a D |
| 6 | leaf sobre otro equipo sin ficha | variable libre + aviso |
| 7 | S/C existentes (seed) editados | round-trip a la frase (durante / vs setpoint) |

## 7 · Path real (DEC-PROC-5)
- Igual que B1: `PUT /rulepacks/:packId` (`req.body.rulepack`), findOneAndUpdate del pack, validateRule por regla. El editor solo cambia el payload de la regla.

## 8 · Disenso registrado
| A | B | Evidencia | Estado |
|---|---|---|---|
| cross anidado en el editor-frase | plano + experto para anidado | ¿cuántas reglas reales anidan? (el parque: pocas) | resuelto: plano en B2, anidado a experto |
| S multi-condición | S = 1 condición (como el engine) | el schema window tiene UN matchCondition | resuelto: S una condición |

## 9 · IDs reservados: idem B1 (`r-<slug>` / `U…` únicos en el pack).

## 10 · Cómo se prueba
- Módulo: build/parse/infer de D/S/C/cross-plano + round-trip (node .mjs).
- E2E: crear por el editor una regla cross-plana (red caída Y grupo parado) → PUT 200 → crossExpr correcto → validateCrossTree la acepta; ídem una S (durante) y una C (vs setpoint). Round-trip de cada una. No-regresión: un cross anidado del seed sigue en experto.

## 11 · Costuras
| CST | Antes | Después | Verificación |
|---|---|---|---|
| Edición cross/C/S | solo Modo experto (jerga) | editor-frase (plano) + experto (anidado) | E2E + click-through |

## 12 · Reversión
- `ruleSentence.js`/`SentenceEditor.vue`/`_packId.vue` a git; borrar `ConditionRow.vue`. Backend intacto.
