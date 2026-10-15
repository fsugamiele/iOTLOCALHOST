# SPEC — G1 · Motor GRAFCET por regla + bitácora · 2026-10-15

**Dirección firmada por Franco (2026-10-15):** *"Quiero que desarrollemos de las reglas y su motor un
protocolo tipo GRAFCET donde se pueda garantizar y corroborar el correcto funcionamiento."*
Q1–Q6 de la propuesta: **"aprobadas las recomendadas"** (2026-10-15). Propuesta y mockup: artifact
"Ciclo de vida de una regla". Origen técnico: `claude/auditoria_editor_reglas_2026-10-15.md` §5 y
`claude/auditoria_motor_y_fichas_2026-10-14.md` (M-05, M-15).

## 0 · CANDADO
preguntas_abiertas: 0

Decisiones firmadas que esta spec aplica:
| # | Decisión | Dónde aplica |
|---|---|---|
| Q1 | Alarma abierta que pasa a SIN DATOS **sigue abierta**, marcada "sin datos" | G1a (§5, §6 #1-#3) |
| Q2 | Puesta en servicio **obligatoria** para reglas nuevas o editadas | G2/G3 (fuera de G1) |
| Q3 | Bitácora con vencimiento de **30 días** | G1a (§4, TTL) |
| Q4 | Orden: E1 → G1 (absorbe E2) → G2 → G3 → G4 | este documento |
| Q5 | Eventos (salto abrupto) **quedan abiertos hasta que el operador confirma** | G1b (spec propia) |
| Q6 | Acumulados se cierran **cuando el técnico registra el service** desde la app | G1b (spec propia) |

> **G1a IMPLEMENTADO** (2026-10-15, DEC-REF-145). Verificado en harness:
> - equivalencia contra el motor anterior: 34/36 reglas de seeds con notificaciones idénticas; las 2 que difieren son las divergencias de sifoneo, por Q1 (ya no cierran al quedar sin datos);
> - 39/39 pruebas de §5, §6 e invariantes I1–I6 (incluidas 5 corridas aleatorias con 124 avisos y cierres);
> - reinicio sin re-aviso (M-05) y C en respaldo con cierre (M-15).
>
> El bloque se parte en **G1a** (esta spec, motor sin campos nuevos) y **G1b** (cierre por acción
> humana: Q5/Q6; necesita campo nuevo + endpoint + UI, y `routes/alarms.js` hoy tiene trabajo local
> sin subir de Franco). G1b se escribe después de G1a. Esta spec **solo autoriza G1a**.

## 1 · Presupuesto de bloque (G1a)
- Tipo de bloque: PESADO
- Un concern: el estado de cada instancia de regla pasa a ser un GRAFCET explícito, persistido y trazado.
- Una decisión de diseño: **los evaluadores quedan como receptividades puras** (`true | false | null`);
  TODO el estado temporal (espera, histéresis, cierre, sin datos, abierta/cerrada) vive en un único módulo.
- Archivos a tocar (LISTA CERRADA):
  1. `edge-engine/ruleFsm.js` (nuevo) — etapas, transiciones, temporizaciones; puro (reloj inyectado).
  2. `edge-engine/fsmStore.js` (nuevo) — persistencia de instancias (`rulefsm`) + bitácora (`ruletransitions`, TTL 30 d).
  3. `edge-engine/ruleEngine.js` — cada tipo calcula su receptividad y delega en `ruleFsm`; `fireAlarm/fireResolve` pasan a ser las ACCIONES de las transiciones.
  4. `edge-engine/evaluators/typeCross.js` — exportar la evaluación pura del árbol; la espera (`graceSec`) y `firedKey` se mudan a `ruleFsm`.
  5. `edge-engine/index.js` — hidratar instancias al arrancar, tick de temporizaciones, reload (apagar/quitar/cambiar tipo).
- Total: 5 archivos · Límite: 6

## 2 · Recon que lo funda
- Estado implícito repartido en 5 Maps en memoria: `index.js:42-53` (`cooldownState`, `windowState`,
  `crossState`, `mState`, `activeState`). `cooldownState` además guarda claves que no son cooldown:
  `:resolveStart` (`ruleEngine.js:274,301`), `:no-setpoint:start|escalated` (`:121-123`).
- Espera (`graceSec`) solo existe en cross (`typeCross.js:224-243`); cierre con persistencia
  (`resolveGraceSec`) solo en D (`ruleEngine.js:292-312`) y cross (`typeCross.js:198-214`).
- Nada persiste salvo acumuladores M3 (`msoftstate.js`). Hallazgo abierto **M-05**: tras un reinicio
  se re-notifican alarmas abiertas y las despejadas durante la caída nunca cierran.
- **M-15**: C en respaldo (fallback) no entra a `activeState` → no cierra nunca (`ruleEngine.js:108`).
- M "no evaluable" hoy **cierra** la alarma activa (`ruleEngine.js:234-246`) — contradice Q1.
- Patrón de escritura del edge: driver nativo con `bulkWrite/updateOne` (`msoftstate.js:43`).

## 3 · Consumidores (grep exhaustivo)
| Consumidor | archivo:línea | Qué le cambia |
|---|---|---|
| Notificaciones (Telegram, NOC, Mongo `notifications`) | `notificationRouter.js:129,275` | Nada en el contrato: mismo payload `kind:'fire'|'resolve'`. Se agrega campo opcional `step` (etapa al emitir). |
| Dashboard / NOC (pines, feed) | lee `notifications` | Nada. |
| QA invariantes | `qa/checks/invariants.js` | Nada en G1a (leen `notifications`). G2 los pasa a leer `ruletransitions`. |
| QA backtest | `qa/lib/backtest.js` | Nada en G1a. Reimplementa la evaluación: G2 lo alinea con `ruleFsm` (hoy ya diverge, auditoría M-20). |
| Reload del edge | `index.js:140-185` | Usa `ruleFsm.closeInstances()` en vez de recorrer `activeState`. |
| Tick de staleness | `index.js:109-111` → `ruleEngine.js:333` | Pasa por `ruleFsm` como cualquier receptividad. |
| Autonomía | `autonomy.js` | Nada (publica variables derivadas; las reglas sobre ellas pasan por el FSM como cualquier otra). |
| Acumuladores M3 | `msoftstate.js` | Nada (siguen persistiendo su serie; el FSM persiste solo la etapa). |

## 4 · Campos que entran / salen / mutan
| Campo | Entra | Sale | Muta | Dónde |
|---|---|---|---|---|
| `rulefsm` (colección) | ✔ | | | `{siteId, key, ruleId, ruleType, dId, step, since, alarmOpen, firedAt, lastReceptivity, lastValue, timers:{graceStart, closeStart}}` · único por `{siteId,key}` |
| `ruletransitions` (colección) | ✔ | | | `{siteId, key, ruleId, dId, from, to, transition, receptivity, value, thresholdUsed, action, ts}` · índice TTL `ts` 30 d (Q3) |
| `notifications.step` | ✔ | | | opcional, informativo |
| `cooldownState` claves `:resolveStart` | | ✔ | | pasan a `timers.closeStart` |
| `crossState` `firedKey`/`startKey` | | ✔ | | pasan a `alarmOpen`/`timers.graceStart` |
| `activeState` | | | ✔ | queda como vista en memoria derivada de `rulefsm` (compat con reload); fuente de verdad = FSM |
| `graceSec` (regla) | | | ✔ | hoy solo cross; **pasa a valer para todos los tipos** (ausente = 0 → igual que hoy) |
| Schema de reglas | | | | **sin cambios** en G1a |

## 5 · Comportamiento (etapas y transiciones)
Receptividad `C` = resultado del evaluador del tipo: `true` (se cumple), `false` (no se cumple),
`null` (no evaluable: dato malo, insuficiente, hoja requerida desconocida). Reloj `now` inyectado:
`eventTs` en mensajes, `Date.now()` en el tick (5 s).

| Etapa | Nombre UI | Entra por | Sale por |
|---|---|---|---|
| E0 | Apagada | regla `enabled:false`, quitada o sin resolver | reload con la regla vigente → E1 |
| E1 | Vigilando | inicio / T21 / T41 / T51 | T12 (`C=true`) · T15 (`C=null`) |
| E2 | Observando | T12 (arranca `graceStart`) | T21 (`C=false`) · T23 (`C=true ∧ now−graceStart ≥ graceSec`) · T25 |
| E3 | Alarma | T23 → **acción NOTIFICAR** (`alarmOpen=true`) · T43 · T53 | T34 (`C=false` con histéresis: `resolveClears`) · T35 |
| E4 | Recuperándose | T34 (arranca `closeStart`) | T43 (`C=true` o vuelve a la banda) **sin notificar** · T41 (`now−closeStart ≥ resolveGraceSec`) → **acción RESOLVER** · T45 |
| E5 | Sin datos | `C=null` desde E1–E4 | T51 (dato, sin alarma abierta) · T53 (dato, con alarma abierta → E3 y se reevalúa) |

- `graceSec = 0` → T12 y T23 en la misma evaluación (la bitácora registra ambas).
- `resolveGraceSec = 0` → T34 y T41 en la misma evaluación.
- Q1: en E5 una alarma abierta **sigue abierta** (no se emite resolve). Cambio deliberado frente a hoy en M (`ruleEngine.js:234-246`).
- `cooldownSec`: se mantiene la semántica actual (no se re-notifica con la alarma abierta; tras resolver, un nuevo fire notifica de inmediato, DEC-REF-102 D-1). La repetición periódica en E3 queda para G1b.
- C sin setpoint: el INFO de configuración y su escalada EDGE-2 quedan **fuera** del FSM (son avisos de configuración, no la alarma). La receptividad de C es: calibrado → su resultado; respaldo → el D de respaldo; sin referencia y sin respaldo → `null`. Esto cierra **M-15** (el respaldo ahora resuelve).
- Instancia (DEC-REF-122 intacto): D/S/C/M `ruleId:dId` (spread se ancla al outlier), cross `ruleId:siteCode`.
- Tick (5 s): reevalúa SOLO temporizaciones con la última receptividad conocida (no inventa datos). Esto hace que "se mantiene 60 s" dispare a los 60 s aunque el equipo publique por excepción.

## 6 · Casos raros — ENUMERADOS
| # | Caso | Comportamiento esperado |
|---|---|---|
| 1 | `C=null` en E1 | E1→E5. Sin notificación. |
| 2 | `C=null` en E2 | E2→E5, se descarta `graceStart` (al volver el dato hay que reconfirmar). |
| 3 | `C=null` en E3 o E4 | →E5 con `alarmOpen=true`. Al volver el dato: T53 →E3 y se reevalúa en la misma evaluación (puede seguir a E4). `closeStart` se descarta. |
| 4 | `graceSec` ausente o 0 | E1→E2→E3 en la misma evaluación (equivale a hoy). |
| 5 | Valor en la banda de histéresis estando en E3 | Queda en E3 (anti-flap, igual que `resolveClears` hoy). |
| 6 | En E4 el valor vuelve a la banda sin cruzar el umbral de disparo | E4→E3 sin notificar. |
| 7 | Reinicio del edge con instancias en E3 | Se hidratan de `rulefsm`: **no** se re-notifica. Si la condición se despejó durante la caída, la primera evaluación lleva a E4/E1 y emite el resolve (cierra **M-05**). |
| 8 | Reinicio con instancia en E2 o E4 | Se hidrata con su `graceStart`/`closeStart`; el tick continúa contando con reloj de pared. |
| 9 | Regla apagada (`enabled:false`) o quitada en reload | Instancias en E3/E4/E5-con-alarma → RESOLVER (motivo `rule-disabled`/`rule-removed`) y se borran. En E1/E2/E5-sin-alarma → se borran sin notificar. Acumuladores M3 intactos (M-10 aparte). |
| 10 | Regla editada sin cambiar tipo | La instancia conserva su etapa; los umbrales nuevos rigen desde la próxima evaluación. |
| 11 | Regla editada cambiando tipo o variable | La instancia se reinicia (RESOLVER si estaba abierta, motivo `rule-changed`). |
| 12 | spread cambia de equipo outlier | Igual que hoy (cada outlier es su instancia); el zombie de M-11 queda fuera de G1a. |
| 13 | staleness por tick | Receptividad por tick; un equipo nunca visto da `null` (E5), igual que hoy `insufficient`. |
| 14 | Hoja cross requerida desconocida (tri-estado) | `null` solo si el resultado depende de ella; si otra hoja ya decide (AND con un `false`), el resultado es `false`. Igual que `typeCross` hoy. |
| 15 | Mongo caído al escribir `rulefsm`/`ruletransitions` | El motor sigue en memoria; log + reintento en la próxima transición. La bitácora puede perder renglones (contador `fsm_trace_dropped`), nunca bloquea la evaluación. |
| 16 | Dos mensajes con el mismo `eventTs` | Se procesan en orden de llegada; cada uno es una evaluación. |
| 17 | `eventTs` anterior al `since` de la instancia (mensaje atrasado) | Se evalúa con `now = max(eventTs, since)`: el reloj de la instancia no retrocede. |
| 18 | Índice TTL o único inexistente al arrancar | `createIndex` idempotente en el arranque. |

## 7 · Path real (DEC-PROC-5)
- `edge-engine/fsmStore.js`: `bulkWrite([{updateOne:{filter:{siteId,key}, update:{$set:…}, upsert:true}}])`
  para `rulefsm` (mismo patrón que `msoftstate.js:43`) e `insertMany(ordered:false)` para
  `ruletransitions`, en lote cada ≤1 s. Borrado de instancia: `deleteOne`.
- Lectores: hidratación `find({siteId})` en `index.js` al arrancar.

## 8 · Disenso registrado
| Posición A | Posición B | Qué evidencia las distinguiría | Estado |
|---|---|---|---|
| Temporizaciones por reloj de pared (tick) | Solo por tiempo de eventos (como cross hoy) | Con telemetría por excepción (latido 300 s, DEC-REF-105) B dispara "se mantiene 60 s" recién al próximo latido | **A**, con reloj inyectado para que el replay sea determinista |
| Persistir cada evaluación | Persistir solo transiciones | Carga de escritura en Mongo por sitio | **Solo transiciones** (la etapa no cambia en la mayoría de los mensajes) |

## 9 · IDs reservados: DEC-REF-145 (G1a)

## 10 · Cómo se prueba
1. **Unidad `ruleFsm`** (reloj inyectado): cada fila de §5 y cada caso de §6.
2. **Equivalencia** (harness `audit_motor` + seeds): misma serie de telemetría por el motor actual y por G1a; las secuencias de notificaciones deben ser **idénticas**, salvo las diferencias documentadas:
   - M no evaluable ya no cierra (Q1);
   - C en respaldo ahora cierra (M-15);
   - reinicio sin re-notificación (M-05).
3. **Invariantes sobre `ruletransitions`**:
   - **I1** una etapa por instancia;
   - **I2** todo NOTIFICAR tiene su RESOLVER o la alarma sigue abierta;
   - **I3** NOTIFICAR solo tras `graceSec` con `C=true` continuo;
   - **I4** RESOLVER solo tras `resolveGraceSec` con `C=false` continuo;
   - **I5** en E5 no hay NOTIFICAR ni RESOLVER;
   - **I6** replay de la misma serie da la misma bitácora.
4. **Reinicio**: fire → restart → mismo valor ⇒ sin segunda notificación; fire → restart → valor normal ⇒ resolve.
5. **Producción**:
   - `docker logs wanomi-edge --since 5m | grep -E "fsm|descartada"` sin errores;
   - `db.ruletransitions.countDocuments()` crece;
   - las alarmas abiertas sobreviven a `docker restart wanomi-edge` sin duplicarse.

## 11 · Costuras que este bloque cambia
| CST | Antes | Después | Verificación nueva o modificada |
|---|---|---|---|
| Motor ↔ Mongo | solo `notifications` + acumuladores M3 | + `rulefsm` + `ruletransitions` | §10.4–10.5 |
| Evaluador cross ↔ motor | cross devuelve `fired/resolved` con su propia espera | devuelve receptividad; la espera la decide el FSM | §10.2 |

## 12 · Reversión
Revert del commit de G1a. Las colecciones `rulefsm` y `ruletransitions` quedan huérfanas sin efecto
(se pueden borrar a mano). El schema de reglas no cambia, así que no hay migración que deshacer.
