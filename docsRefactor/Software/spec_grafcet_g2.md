# SPEC — G2 · Coherencia del GRAFCET de punta a punta · 2026-10-15

**Dirección firmada por Franco (2026-10-15, "aprobado"):** después de la prueba de G1b en
producción, G2 arranca con 3 controles + 1 ajuste:
1. Coherencia edge ⇔ consola (invariante QA).
2. El cierre cuenta solo si se guardó.
3. Alerta de cambio del tipo de cálculo de una regla.
4. "Registrar service" cuenta también como reconocimiento.

Lo que estaba previsto antes en G2 (casos de prueba por regla y alineación con el backtest)
pasa a **G2c**, sin cambios.

## 0 · CANDADO
preguntas_abiertas: 0 — Qg1–Qg4 **firmadas por Franco el 2026-10-15** ("aprobado las recomendaciones").

**G2-1 IMPLEMENTADO (2026-10-15).** Desvíos registrados:
- `edge-engine/index.js` **no** se toca: el log "CIERRE NO GUARDADO" y la cola de reintento viven enteros en `notificationRouter.js` (3 archivos en vez de 4).
- El control 4 (service = reconocimiento) **ya existía** desde G1b-2 (`sites.js`, POST …/service completa `ackAt`). Que "Reconocer" desaparezca después del service es correcto: la alarma ya está cerrada y reconocida.
- Huérfanas: margen `ORPHAN_MIN_AGE_MS` = 15 s (un disparo más reciente puede no estar escrito aún en `rulefsm`). Caso raro #11.
**G2-2 IMPLEMENTADO (2026-10-15).** I15 (Capa B, `invariants.js`) lee el historial completo de `notifications` (no la ventana de 48 h): una huérfana vieja sigue siendo huérfana. I14 se emite junto con I13 cuando cambia la identidad del cálculo (los dos hallazgos conviven: I14 grave por el cálculo, I13 leve por el resto del diff).
- **Limitación conocida (UI, fuera de la lista cerrada):** una huérfana **ya reconocida** de una regla sin service (no acumulador) no muestra botón en el detalle ("Reconocer" solo aparece en estado activo). La API la cierra igual con un ack; falta mostrar el botón en estado "reconocida". Va a G3.

| # | Pregunta | Recomendada | Alternativa |
|---|---|---|---|
| Qg1 | Qué pasa si falla el guardado de un cierre | **Reintento:** el GRAFCET mantiene su decisión (la alarma terminó) y el edge reintenta guardar el cierre cada 5 s hasta 10 min (fallo de conexión). Si el fallo es de **validación** (como el de esta prueba), no reintenta: lo registra en el log y lo detecta el control 1. | Si falla el guardado, el GRAFCET vuelve a "Alarma" y reintenta el cierre en la próxima evaluación. |
| Qg2 | Alarma abierta en la consola que el edge ya cerró (huérfana) | **Se puede cerrar desde la UI:** "Reconocer" o "Registrar service" sobre una huérfana guarda el cierre desde la API (modo `resolve-by-ack` / `resolve-by-service`). | Solo se arregla con un script. |
| Qg3 | Margen del control de coherencia | **2 minutos** (cubre el lote de escritura del edge y el reintento); configurable con `QA_I15_GRACE_SEC`. | 30 s. |
| Qg4 | Qué cambios de la regla son "cambio de cálculo" (alerta grave) | **Tipo, cálculo (`metric`), variable o equipo** distintos de la original → **I14, grave**. Umbral, severidad y textos siguen siendo **I13, leve** (cambios legítimos). | Toda diferencia es grave. |

## 1 · Presupuesto — 2 bloques (límite 6 archivos cada uno)
| Bloque | Concern | Archivos (lista cerrada) |
|---|---|---|
| **G2-1 · Cierre fiable** | Controles 2 y 4 + huérfanas (Qg1, Qg2) | `edge-engine/notificationRouter.js` (guardado devuelve resultado + reintento), `edge-engine/index.js` (log del cierre no guardado), `app/api/routes/sites.js` (huérfanas + service = reconocimiento), `tools/test_notif_modes.js` (nuevo: modos vs schemas reales) |
| **G2-2 · Vigilancia QA** | Controles 1 y 3 (Qg3, Qg4) | `qa/checks/invariants.js` (I15), `qa/checks/oracle.js` (I14), `app/components/qa/FichaHallazgo.vue` (textos I14/I15), `app/api/routes/qa.js` (resumen diario) |

## 2 · Recon (prueba en producción, 2026-10-15)
- `notificationRouter.js:161` — `saveToMongo` captura el error y solo lo registra en el log (`Mongo save error`). El GRAFCET ya había pasado a E1, así que la alarma quedó abierta en la consola y cerrada en el edge.
- La causa del fallo fue que el enum `mode` no tenía los modos nuevos. Los enums están **duplicados**: `app/api/models/notifications.js:32` y `edge-engine/notificationRouter.js:26`. Corregido en `134e65e`.
- La prueba de integración de G1b usaba un `notificationRouter` simulado (desvío de DEC-PROC-5).
- `handleCommand` (`index.js:299`) pone el acumulado en 0 aunque el GRAFCET responda `ignored`. Esto ya lo prevé el caso #7 de G1b, pero cada apretada sobre una huérfana volvía a poner el contador en 0.
- `cummins-pcc-oil-life` cambió de `accumulator gte` a `cumulativeSince gt` (pack v102). I13 existe (`oracle.js:303`) pero es leve, y queda mezclado con cualquier cambio de umbral.

## 3 · Consumidores
| Consumidor | archivo | Qué le cambia |
|---|---|---|
| Consola / detalle | `alarms.js`, `_id.vue` | Nada en el contrato. La huérfana se cierra con un `resolve` normal. |
| Bandeja de calidad | `FichaHallazgo.vue`, `qa.js` | 2 tipos nuevos: I14 e I15. |
| Telegram | `notificationRouter.js` | Nada (el aviso sale igual). |

## 4 · Campos
| Campo | Dónde | Entra/Muta |
|---|---|---|
| `ackAt`, `acknowledgedBy` | notificación `fire` al registrar service (si no estaba reconocida) | Muta |
| `findings.type` `'I14'`, `'I15'` | `qualityfindings` (string libre, sin cambio de schema) | Entra |

## 5 · Comportamiento
| Control | Qué hace | Si falla |
|---|---|---|
| **2 · Cierre fiable** | `saveToMongo` devuelve `{ok, transient}`. Un resolve con fallo transitorio va a una cola en memoria y se reintenta cada 5 s, hasta 10 min. Un fallo de validación no se reintenta y deja el log `[notifRouter] CIERRE NO GUARDADO ruleId dId motivo`. | Si pasan los 10 min o es un error de validación: log + I15 lo detecta. |
| **Huérfanas** | `PUT …/ack` y `POST …/service`: si el episodio está abierto en la consola y no hay fila `rulefsm` con `alarmOpen` para esa instancia, la API crea el `resolve` (`.create()` del modelo real) con el modo correspondiente y `recommendation` "Cerrada por …". El comando al edge se publica igual (el service pone el acumulado en 0). | 500 si falla el guardado (la alarma sigue abierta y se puede reintentar). |
| **4 · Service = reconocimiento** | `POST …/service`: si la notificación `fire` no tiene `ackAt`, se completan `ackAt=now` y `acknowledgedBy=actor`. | — |
| **1 · I15 coherencia** (Capa B) | Por cada sitio, compara las instancias `rulefsm.alarmOpen` con los episodios abiertos de la consola (`ruleId+dId`; cross con `ruleId+siteId`). Si difieren por más de 2 min → hallazgo **grave**, con la dirección (`solo-edge` / `solo-consola`). | — |
| **3 · I14 cambio de cálculo** (Capa C) | Compara la regla viva con `rule_snapshots`: `type`, `metric`, `variable`, `deviceType`. Si difiere → **grave**, con el antes y el después. I13 sigue igual para el resto. | Sin foto original → se saltea (igual que I13). |

## 6 · Casos raros
| # | Caso | Comportamiento |
|---|---|---|
| 1 | Mongo caído más de 10 min con cierres en cola | Se descartan con log. I15 los detecta cuando vuelve Mongo. La UI permite cerrarlos (huérfanas). |
| 2 | Reinicio del edge con cierres en cola | La cola se pierde (está en memoria). Mismo camino que #1. |
| 3 | Ack sobre una huérfana de una regla `auto` | Se cierra igual (el edge ya la había cerrado). |
| 4 | Huérfana cross | La instancia es `ruleId:siteId`. Mismo tratamiento. |
| 5 | Notificación legacy sin `ruleId` | Fuera de alcance (no forma episodios). |
| 6 | Service con la alarma ya reconocida | No cambia `ackAt`/`acknowledgedBy`. |
| 7 | I15 en el instante de un disparo o cierre | El margen de 2 min lo absorbe (no genera hallazgo). |
| 8 | Regla borrada con instancia abierta | El resolve-by-edit existente la cierra. Si quedó huérfana, I15 la marca `solo-consola`. |
| 9 | I14 por un cambio de cálculo hecho a propósito | La acción existente "guardar la versión actual como original" lo apaga (igual que I13). |
| 10 | Varias apretadas de service sobre una huérfana | La primera cierra. Las siguientes ven el episodio cerrado y solo publican el comando (idempotente en la consola). |
| 11 | Ack/service a menos de 15 s del disparo y el edge todavía no escribió `rulefsm` | No se trata como huérfana (`ORPHAN_MIN_AGE_MS`). |

## 7 · Path real (DEC-PROC-5)
- Edge: `NotificationRO.create()` (`notificationRouter.js:131`).
- API, huérfanas: `Notification.create()` del modelo `app/api/models/notifications.js` (mismo schema que valida la consola).
- `tools/test_notif_modes.js`: valida **contra los dos schemas reales** (`validateSync`) cada modo que emite el código del edge, y que los dos enums sean iguales. Corre en el contenedor `node`.

## 8 · Disenso
| A | B | Evidencia | Estado |
|---|---|---|---|
| Reintentar el guardado (Qg1-A) | Volver el GRAFCET a "Alarma" (Qg1-B) | B mezcla persistencia con lógica y re-evaluaría una alarma que ya terminó. A mantiene el GRAFCET puro. | A recomendado, a firmar |

## 9 · IDs reservados: DEC-REF-147 (G2)

## 10 · Cómo se prueba
1. `tools/test_notif_modes.js` en verde. Corrido antes de `134e65e`, tiene que fallar con `resolve-by-service`.
2. Unidad: `saveToMongo` con error transitorio → reintenta y guarda. Con error de validación → no reintenta y deja el log.
3. Integración (harness itest con el **modelo real**, sin router simulado): huérfana → ack → resolve guardado. Service → `ackAt` completado.
4. QA: sembrar una fila `rulefsm` abierta sin episodio → I15 `solo-edge`. Episodio abierto sin fila → I15 `solo-consola`. Cambiar el `metric` de una regla → I14.
5. Producción: repetir la prueba de vida de aceite. Service sin reconocer antes → la alarma queda "Resuelta" con reconocimiento del mismo usuario.

## 12 · Reversión
Revert de los 2 commits. No hay cambios de schema (`qualityfindings.type` es libre y las notificaciones ganan campos que ya existían).
