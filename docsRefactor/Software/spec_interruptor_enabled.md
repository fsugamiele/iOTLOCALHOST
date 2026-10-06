# SPEC — Interruptor on/off por regla y por pack (`enabled`) · 2026-10-05

**Dirección firmada por Franco** (sesión actual): cada regla y cada pack deben poder **sacarse de
circulación** con un interruptor, para retirar al instante cualquier parámetro incorrecto —
**sin borrarlo y sin riesgo de corromperlo**. Es la pata de ACCIÓN del Supervisor de Calidad
(`diseno_supervisor_calidad.md` §7.1) y se construye **primero** porque desbloquea la acción aunque
el resto del QA todavía no exista.

Contexto de la auditoría (`auditoria_motor_reglas_2026-10-05.md`): hoy la única forma de desactivar
una regla es borrarla o editarla por el editor-frase, que **reescribe la regla entera y la corrompe**
(B1/B2: pierde `correlationParent`, `on_missing_ref`, redondea ventanas). Hacen falta reglas que
quedaron mal calibradas (DC-05, GE-07, cat-eltek-A2) fuera de circulación **ya**, sin tocar el resto.

## 0 · CANDADO
**preguntas_abiertas: 0.**

Decisiones cerradas:
- El estado vive como campo **`enabled`** en el doc (regla y pack), espejo de `canary`/`version` que
  ya viven en el pack. Default `true`. **Sin migración:** lo que no tiene el campo = habilitado.
- Apagar/encender es un **PATCH quirúrgico** (`$set` de un booleano + meta), **NO** pasa por el
  editor-frase ni re-valida el pack → inocuo sobre el resto de la definición.
- El motor **reusa la maquinaria de reload SF-3**: `loadPacks` filtra lo `enabled:false` → la regla
  "desaparece" → el diff la ve como `removed` → `cleanupStateForRules` + `fireResolve` (cierre
  limpio, no zombie). Re-activar = reaparece como `added` (entra de cero). **No se toca
  `reloadState.js` ni `ruleEngine.js`.**
- Procedencia: `disabledBy`, `disabledAt`, `disabledReason` (quién/cuándo/por qué se sacó).
- La "cuarentena por QA" (tercer estado automático) queda **fuera de este bloque** — la trae el
  supervisor; acá solo el on/off manual del administrador.

## 1 · Presupuesto de bloque
- Tipo de bloque: **NORMAL**
- Un concern: sacar de circulación una regla/pack incorrecto **sin borrarlo y sin corromperlo**.
- Una decisión de diseño: campo `enabled` + **PATCH quirúrgico** + **reuso del diff de reload**
  (disable ≡ removed).
- Archivos a tocar (LISTA CERRADA):
  1. `app/api/models/rule_definition.js` — `enabled {Boolean, default:true}` + `disabledBy/disabledAt/disabledReason`.
  2. `app/api/models/rule_pack.js` — `enabled {Boolean, default:true}` + meta.
  3. `app/api/routes/rulepacks.js` — 2 endpoints PATCH (pack-level + rule-level), superadmin, `$set`+`$inc version`+`publishReload`.
  4. `edge-engine/siteState.js` — `loadPacks` excluye packs y reglas `enabled:false`.
  5. `app/components/rules/RuleCard.vue` — switch por regla (emite evento `toggle`).
  6. `app/pages/rulepacks/_packId.vue` — switch de pack en el header + handler que llama al PATCH.
- Total: **6 archivos · Límite: 6.**

## 2 · Recon que lo funda
`diseno_supervisor_calidad.md` §7.1; auditoría B1/B2 (editor corrompe). Wiring verificado:
`index.js:82,116-163` (`loadPacks`→`buildSnapshot`→`diffSnapshots`→`cleanupStateForRules`);
`siteState.js:21-46` (loadPacks ya tiene el `.filter` de reglas); `rulepacks.js:40-54` (`publishReload`)
`:110-186` (PUT superadmin + patrón de escritura); `reloadState.js:43-63` (`removed`/`added`).

## 3 · Consumidores (grep exhaustivo)
| Consumidor | archivo:línea | Qué le cambia |
|---|---|---|
| Carga de packs | `edge-engine/siteState.js:22` (query), `:29-39` (filter) | Excluye pack/regla `enabled:false` |
| Diff de reload | `reloadState.js:43-63` + `index.js:116-163` | Sin cambio: disable→`removed`→cleanup+resolve ya existente |
| Evaluación | `ruleEngine.js:13-14`, `processStalenessTick:260` | Sin cambio: iteran `packs` ya filtrados |
| Escritura | `app/api/routes/rulepacks.js` | Nuevos PATCH; GET/PUT/DELETE intactos |
| Modelos | `rule_definition.js:27-86`, `rule_pack.js:5-15` | Campos nuevos aditivos |
| UI lista | `_packId.vue` (render de reglas), `RuleCard.vue` | Switch + estado visual "fuera de circulación" |

## 4 · Campos que entran / salen / mutan
| Campo | Entra | Muta | Dónde |
|---|---|---|---|
| `rule_definition.enabled` (Bool, default true) | ✓ | | `rule_definition.js` |
| `rule_definition.disabledBy/disabledAt/disabledReason` | ✓ | | `rule_definition.js` |
| `rule_pack.enabled` (Bool, default true) + meta | ✓ | | `rule_pack.js` |
| `loadPacks`: set de reglas activas | | ✓ (excluye enabled:false) | `siteState.js` |
| `rulepack.version` | | ✓ (+1 en cada toggle) | `rulepacks.js` PATCH |

## 5 · Comportamiento de cada control
| Control | Qué hace | Validación | Qué pasa si falla |
|---|---|---|---|
| `PATCH /rulepacks/:packId/enabled` | `$set:{enabled, disabled*}` + `$inc:{version}` + `publishReload` | superadmin; pack existe | 403 no-super / 404 no-match |
| `PATCH /rulepacks/:packId/rules/:ruleId/enabled` | `$set:{'rules.$.enabled', 'rules.$.disabled*'}` + version + reload | superadmin; regla existe | 403 / 404 |
| Switch regla (RuleCard) | emite `toggle(ruleId, enabled)` | — | el handler muestra error del PATCH |
| Switch pack (header) | llama al PATCH de pack | — | ídem |

> El PATCH **no** corre `validatePackRules` ni re-serializa la regla: es el punto del bloque (apagar
> debe ser seguro aunque la regla esté mal). La validación ya ocurrió cuando se creó/editó.

## 6 · Casos raros — ENUMERADOS
| # | Caso | Comportamiento esperado |
|---|---|---|
| 1 | Regla/pack histórico sin `enabled` | Habilitado (`enabled !== false`). Sin migración. |
| 2 | Pack `enabled:false` | Todas sus reglas salen de circulación aunque estén `enabled:true` (kill-switch). |
| 3 | Desactivar una regla **activa** (alarma abierta) | Reload la ve `removed` → `fireResolve` (cierre limpio, no zombie). |
| 4 | Re-activar | Reaparece como `added` → entra sin estado previo (cooldown/active en cero). |
| 5 | Desactivar/reactivar un acumulador (oil-life) | `mState` en memoria se limpia; `msoftstate` persiste → al reactivar **rehidrata** lo acumulado (no reinicia). Igual que editar hoy; documentado, no se cambia acá (lo aborda A9 del plan). |
| 6 | PATCH a pack/regla inexistente | 404 (`matchedCount:0`). |
| 7 | PATCH sin superadmin | 403 fail-close (patrón `isSuperadmin`). |
| 8 | `publishReload` falla | Fire-and-forget: el motor toma el cambio en el próximo reload/arranque (DEC-REF-61). |
| 9 | Toggle de una regla corrupta por el editor | Funciona igual: el PATCH no mira la forma, solo flip del booleano. |

## 7 · Path real del consumidor (DEC-PROC-5)
- PATCH: `RulePack.updateOne({packId[, 'rules.ruleId':ruleId]}, {$set,$inc})` — **surgical, no `.save()`
  del doc entero, no `findOneAndUpdate` con validadores** (evita re-tocar el resto).
- Lectura en edge: `siteState.loadPacks` → `RulePack.find(...).lean()` (mismo path que ya corre).
- Reload: `publishReload` (MQTT QoS1) ya existente en `rulepacks.js:40-54`.

## 8 · Disenso registrado
| Posición A | Posición B | Evidencia que las distingue | Estado |
|---|---|---|---|
| `enabled` como campo en el doc | Colección separada de "estado operativo" | Superficie / acoplamiento | **Cerrado:** A (espejo de `canary`, mínima superficie) |
| El PATCH corre `validatePackRules` igual | PATCH no valida (quirúrgico) | ¿apagar una regla inválida debe fallar? | **Cerrado:** B (apagar debe ser seguro aunque la regla esté mal) |
| Un estado binario enabled | Tri-estado (enabled/disabled-user/quarantined-QA) | Procedencia humano vs QA | **Diferido:** el tri-estado lo trae el bloque del supervisor |

## 9 · IDs reservados
- DEC propuesta: **DEC-REF-121** (interruptor `enabled` por regla/pack; linaje `canary`/SF-3). A anexar
  a `WanomiRefactor.md` al firmar. (DEC-REF-120 reservado por `spec_umbral_por_referencia`.)
- Sin ruleIds nuevos.

## 10 · Cómo se prueba
1. **API:** PATCH regla `enabled:false` → GET pack: `rules[i].enabled=false`, `version+1`, `disabledBy` seteado. PATCH `true` → revierte. PATCH sin super → 403. PATCH ruleId inexistente → 404.
2. **Motor (simulador publicando la variable):** desactivar `cat-DC-05`/una regla viva → el edge **deja de evaluarla** (log de reload: `eliminadas: [..]`); re-activar → vuelve (`nuevas: [..]`).
3. **Cierre limpio:** desactivar una regla con alarma **activa** → aparece un `resolve` en `notifications` (no queda zombie).
4. **Kill-switch de pack:** desactivar el pack → todas sus reglas salen; reactivar → vuelven.
5. **Regresión:** reglas sin el campo `enabled` siguen disparando igual (default true).

## 11 · Costuras que este bloque cambia
| CST | Antes | Después | Verificación |
|---|---|---|---|
| Carga de packs | entra toda regla cross-válida | + se excluye `enabled:false` (regla y pack) | §10.2 |
| Baja de regla | solo borrar o editar (corrompe) | **toggle quirúrgico reversible** con procedencia | §10.1/§10.3 |

## 12 · Reversión
Campos aditivos con default `true`; endpoints nuevos. Quitar el filtro de `loadPacks` + los PATCH +
el switch de la UI → comportamiento **idéntico a hoy**. Sin migración de datos (todo lo existente =
habilitado). Revert por git de los 6 archivos.
