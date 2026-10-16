# SPEC — G1b · Cierre por acción humana (confirmación y service) · 2026-10-15

**Dirección firmada por Franco (2026-10-15):** Q5 *"eventos (salto abrupto) quedan abiertos hasta
que el operador confirma"* y Q6 *"acumulados se cierran cuando el técnico registra el service desde
la app"* (`spec_grafcet_g1.md` §0). Base: G1a en producción (`9945656`) + consola de alarmas
(`feature/consola-alarmas`, `c813034`).

## 0 · CANDADO
preguntas_abiertas: 0 — Qb1–Qb4 **firmadas por Franco el 2026-10-15** ("aprobadas", opción recomendada).

**IMPLEMENTADO (2026-10-15):** G1b-1 `0fc7d57`, G1b-2 (commit siguiente). Desvíos registrados:
- `fsmStore.js` entra a G1b-1 (2 campos: `acked`, `ackedBy`). Sin ellos la confirmación no sobrevive un reinicio.
- `notifications.closeAction` **no** se agrega. El cierre humano queda en el `mode` del resolve (`resolve-by-ack` / `resolve-by-service`) y en la recomendación ("Confirmada por …" / "Service registrado por …"). No hay cambio de schema.
- **Limitación conocida:** un service registrado con el edge caído **no** se reaplica al arrancar (la confirmación sí, caso #4). La alarma queda confirmada pero abierta; se vuelve a presionar "Registrar service".

| # | Pregunta | Recomendada | Alternativa |
|---|---|---|---|
| Qb1 | Canal API → edge para la confirmación | **El mismo tópico de recarga** (`wanomi/edge/all/reload`) con payload tipado `{cmd:'ack'\|'service', …}`. Sin cambios de ACL en EMQX: el ACL `wanomi/edge/+/reload` ya lo cubre. | Tópico nuevo `wanomi/edge/+/cmd` (requiere ACL nuevo en EMQX). |
| Qb2 | Confirmar con la condición todavía activa | Queda **confirmada pero abierta**; cuando se normaliza cierra sola (sin pedir otra confirmación). | La confirmación cierra en el acto. |
| Qb3 | Reglas con cierre manual | **Salto abrupto (stepJump) y vida de aceite (accumulator).** "Acumulado desde recarga" (cumulativeSince) sigue automático: la recarga lo reinicia. | Todos los eventos y todos los acumulados. |
| Qb4 | Dónde se registra el service | **Detalle de la alarma** (`/alarmas/:id`), botón "Registrar service". | También en la página del equipo. |

## 1 · Presupuesto — 2 bloques (límite 6 archivos c/u)
| Bloque | Concern | Archivos (lista cerrada) |
|---|---|---|
| **G1b-1 · Motor** | Etapa "esperando confirmación" + comandos ack/service | `edge-engine/ruleFsm.js`, `edge-engine/index.js`, `tools/seed_packs_preset/seed.js` (oil-life → manual), `tools/set_reset_behavior.js` (nuevo: marca las reglas existentes vía API, dry-run/--apply) |
| **G1b-2 · API + UI** | Publicar la confirmación, endpoint de service, mostrarlo | `app/api/routes/sites.js` (ACK publica cmd; `POST …/service`), `app/api/models/notifications.js` (`closeAction`), `app/api/routes/alarms.js` (detalle expone `resetBehavior`, `metric` y la etapa del GRAFCET), `app/pages/alarmas/_id.vue` (estado "normalizada, falta confirmar" + botón "Registrar service") |

Campo de regla: **`reset_behavior: 'auto' | 'manual'` ya existe** en `rule_definition.js:98` (reservado, "manual = TODO"). No se agregan campos a las reglas.

## 2 · Recon
- ACK actual: `sites.js` `PUT /site/:siteCode/alarms/:notificationId/ack` → `ackAt`, `acknowledgedBy` en la notificación (idempotente). No le avisa al edge.
- Detalle: `pages/alarmas/_id.vue:390` `ack()` → mismo endpoint; estado `ack` en la consola = `ackAt != null` y último evento ≠ resolve.
- Vida de aceite: acumulador persistido (`msoftstate`), sin reset (auditoría M-10: "una vez ≥ 250 h la alarma no se puede cerrar nunca").
- El edge ignora el payload del tópico de recarga (`index.js`, "Payload ignorado DEC-REF-61.c").

## 3 · Consumidores
| Consumidor | archivo | Qué le cambia |
|---|---|---|
| Reload del edge | `index.js` | Payload con `cmd` → comando (NO recarga). Payload vacío/otro → recarga como hoy. |
| Consola y feed NOC | `alarms.js`, `NocAlarmsFeed.vue` | Nada: el cierre llega como `resolve` normal. |
| QA invariantes | `qa/checks/invariants.js` | Nada en G1b. |

## 4 · Campos
| Campo | Dónde | Entra/Muta |
|---|---|---|
| `reset_behavior: 'manual'` | reglas stepJump y accumulator (Qb3) | Muta (de 'auto') |
| `rulefsm.acked`, `ackedBy` | instancia GRAFCET | Entra |
| `notifications.closeAction: 'ack' \| 'service' \| null` | notificación de **resolve** | Entra (auditoría de quién cerró) |

## 5 · Comportamiento
Etapa nueva **E6 · Esperando confirmación** (solo `reset_behavior:'manual'`):

| Desde | Receptividad / comando | Hacia | Acción |
|---|---|---|---|
| E3 | `off` ∧ manual ∧ no confirmada | **E6** | — (no resuelve) |
| E3 | `off` ∧ manual ∧ confirmada (Qb2) | E4 | cierre normal por tiempo |
| E6 | `on` | E3 | sin re-avisar |
| E6 | `null` | E5 | sigue abierta (Q1) |
| E6 | **cmd ack** | E1 | RESOLVER (`closeAction:'ack'`) |
| E3 | **cmd ack** | E3 | marca `acked` (Qb2) |
| E3/E6 accumulator | **cmd service** | E1 | acumulado a 0 + persistido + RESOLVER (`closeAction:'service'`) |
| E1/E2/E4 | cmd ack | sin cambio | se ignora (log) |

Reglas `auto`: el ack solo queda registrado (sin cambio de comportamiento).

## 6 · Casos raros
| # | Caso | Comportamiento |
|---|---|---|
| 1 | Ack de una notificación sin `ruleId` (legacy EMQX) | No publica comando. |
| 2 | Ack de regla cross | Comando con `ruleId`; el edge aplica a la instancia `ruleId:siteCode` del sitio de la notificación. |
| 3 | Comando para un `ruleId` inexistente o sin instancia | Se ignora con log. |
| 4 | Edge caído al confirmar | El ack queda en Mongo; al arrancar, el edge consulta las notificaciones `fire` confirmadas de sus instancias abiertas `manual` y aplica el ack (no se pierde). |
| 5 | Dos confirmaciones | Idempotente (la API ya lo es; el FSM ignora el segundo). |
| 6 | Service en una regla que no es accumulator | 400 en la API. |
| 7 | Service con la alarma ya cerrada | Igual pone el acumulado en 0 (mantenimiento hecho) y lo registra; sin notificación. |
| 8 | Reinicio con instancia en E6 | Se hidrata en E6 (persistida). |
| 9 | Regla pasada de manual a auto con instancia en E6 | En la próxima evaluación, `off` en E6 de una regla auto → E4 → cierre normal. |

## 7 · Path real
- API publica con `global.mqttClient.publish('wanomi/edge/all/reload', JSON.stringify({cmd, ruleId, dId, siteId, by, ts}), {qos:1})` (mismo cliente que `equipmentsheets.js publishEdgeReload`).
- Edge: estado del acumulador en `mState` (`acc=0, dirty=true`) → `flushMSoftState` existente.
- `tools/set_reset_behavior.js`: `PUT /api/rulepacks/:packId` (camino productivo, DEC-PROC-5), dry-run por defecto.

## 8 · Disenso
| A | B | Evidencia | Estado |
|---|---|---|---|
| Reusar tópico de recarga (Qb1) | Tópico propio de comandos | Hoy ningún consumidor usa el payload de recarga; el ACL ya existe | A recomendado, a firmar |

## 9 · IDs reservados: DEC-REF-146 (G1b)

## 10 · Cómo se prueba
1. Unidad `ruleFsm`: cada fila de §5 y casos §6 #5, #8, #9.
2. Integración (harness itest + edge con stub): ack desde la API → comando publicado → resolve emitido; service → acumulado 0 + resolve con `closeAction`.
3. Producción: sifoneo simulado con `fuel_siphon` → alarma queda abierta tras normalizar → "Reconocer" → se cierra. Vida de aceite: "Registrar service" → cierra y el acumulado arranca de 0.

## 12 · Reversión
Revert de ambos commits + `tools/set_reset_behavior.js --revert` (vuelve las reglas a `auto`).
