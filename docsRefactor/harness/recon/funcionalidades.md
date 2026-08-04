# RECON FUNCIONAL — qué hace el sistema HOY · 2026-08-04 · Sesión #54 · GATE 1.f

## 0 · Apertura (verificado hoy, NO de memoria)
- Corpus vigente:      WanomiRefactor.md **v0.86** · 2026-08-02 (línea 4, leída hoy)
- Branch / HEAD:       `feature/telco-support` / `338db91`   · working tree: **sucio** (M CLAUDE.md + untracked)
- Contenedores:        `wanomi-edge`, `node`, `emqx (healthy)`, `mongo (healthy)` — todos Up 12h (`docker ps`)
- Base Mongo:          `iotix`, autenticada con `MONGO_USERNAME/PASSWORD` de `app/.env` (`--authenticationDatabase admin`)
- Estado que este recon NO asume del paso anterior: nada del corpus se toma como "implementado". Toda fila lleva `archivo:línea` o salida de comando.

## 1 · Alcance
- Pregunta que contesta: de las capacidades que el corpus declara, ¿cuáles corren, cuáles existen sin correr, cuáles son solo diseño?
- Qué queda fuera: firmware de campo (no hay `.ino` ni ESP32 en el árbol), correctitud de las reglas, seguridad, performance del panel NOC.

## 2 · Procedencia — OBLIGATORIO
| Pieza | Qué es | De dónde sale | Quién la consume | Qué se rompe si falta |
|---|---|---|---|---|
| RulePacks | reglas por site | colección `rulepacks` en Mongo (`siteState.js:22` `RulePack.find({canary:false})`) | edge-engine `loadPacks(SITE_ID)` | el motor arranca sin reglas → no evalúa nada |
| Reload | hot-reload de packs | MQTT `wanomi/edge/+/reload` (`index.js:169`) | `reloadPacks()` (`index.js:83`) | los cambios de pack no llegan sin reiniciar contenedor |
| Dato de campo | telemetría | **simulador** `tools/device_simulator` → MQTT → webhook → `data` | motor + panel + `data` | sin dato el motor no dispara; **no hay hardware real** |
| Credenciales Mongo | auth | `app/.env` (`MONGO_USERNAME/PASSWORD`) | node + este recon | sin auth Mongo rechaza (`code 13 Unauthorized`, verificado) |

## 3 · Pregunta de origen — OBLIGATORIO (DEC-PROC-3)
> ¿De dónde salen las piezas con las que se construye esto, y son configurables o hardcodeadas?

**Respuesta:** el dato que hoy alimenta al motor es **100 % simulado** — los 13 devices tienen `firmwareType: "wanomi-sim"` (F9, sin excepción). El ingreso desde controlador real (Modbus/RS485) **no tiene código productor**: las únicas apariciones de `modbus` son comentarios del simulador (F5). Las reglas cargadas salen de Mongo (configurable), no hardcodeadas en el motor.

**Piezas hardcodeadas / puntos ciegos encontrados:**
- `SITE_ID` del edge viene de `.env.edge` (`index.js:7`) — configurable, OK.
- Modbus/Connect: **hardcodeado a inexistente** — no hay driver. Hallazgo estructural: la ingesta real de controladores es SOLO-DISEÑO.
- Variables `inferred`: el valor de enum existe (`rule_definition.js:45`) pero **ningún código las produce** (F6). Hallazgo estructural: campo sin productor.

## 4 · Detalle por foco (F1–F9) — evidencia

### F1 · Motor edge
- 4 evaluadores existen y están cableados: `evaluateD/C/S/Cross` (`ruleEngine.js:1-4`). Cross se resuelve **antes** del switch (`ruleEngine.js:16`); D/C/S en el switch (`:52/:56/:155`).
- **Trampa del grep del gate:** `grep -c "typeC"` = `grep -c "typeCross"` = 1715 porque `typeC` es substring de `typeCross`. El vocab real del log es solo `typeCross` (`grep -o 'type[A-Za-z]*' | uniq -c` → **1715 typeCross, 0 más**). Los literales `typeS`/`typeD` **nunca se loguean**.
- El pack cargado `cummins-pcc-v1` tiene 5 reglas: **A0 cross · A1 cross · G2 D · M1 D · C1 cross** (query a Mongo). Las 5 **dispararon** (log: A0=532, A1=572, G2=29, M1=3, C1=10). ⇒ `evaluateD` **sí se ejercita** aunque no loguee su nombre.
- `evaluateC`/`evaluateS`: **no hay ninguna regla tipo C ni S en el único pack cargado** ⇒ código presente, no ejercitado.

### F2 · Router de notificación (`notificationRouter.js`)
4 canales como funciones: `sendMqttNotif` dashboard (`:68`), `sendNocEvent` NOC (`:96`), `saveToMongo` (`:126`), `sendTelegram` (`:167`). `notify()` (`:264`) los llama a los cuatro sin condición.
- **Mongo:** VIVO — `db.notifications.countDocuments` = **2597** (A1=1251, M1=677, A0=645, G2=18, C1=6).
- **Telegram:** VIVO — 121 líneas en el log (OK/retry).
- **dashboard / NOC:** solo loguean en error; en éxito son silenciosos ⇒ el `grep=0` **no prueba ausencia**. Como `notify()` corrió ≥2597 veces, ambos emisores se **invocaron**; pero **no se encontró consumidor** de `wanomi/noc/{siteId}/event` (`dashboard_noc.js` es REST *pull* con caché, no subscriber MQTT). Emisor ejercitado / consumidor no verificado.

### F3 · Cascada / correlación
`correlationParent` viaja como campo en todo el pipeline (`ruleEngine.js:226/265` → `notificationRouter.js:84/105/138` → `notifications.js:34` / `rule_definition.js:20`, DEC-REF-50). La **agrupación** por evento padre NO ocurre en el edge: viaja **crudo** y "la agrupación" queda del lado de `sites.js:141-164`. ⇒ el campo se propaga (implementado); el agrupamiento vive en la API de lectura.

### F4 · RulePacks: cómo llegan al motor
Tres caminos, **coexisten**: (a) pull desde Mongo al arrancar (`siteState.js:22`); (b) hot-reload por MQTT `wanomi/edge/+/reload` (`index.js:169-182`, fire-and-forget con snapshot/rollback en `reloadState.js`); (c) siembra por HTTP (`tools/seed_rulepacks_f3/`). **Hoy se usa (a)+(b).** La siembra (c) **está sin ejecutar** contra esta DB (ver F10 #12).

### F5 · Connect / drivers Modbus  ← confirmado SOLO-DISEÑO
`grep -rln modbus|Modbus|RS485|serialport` en `app/ edge-engine/ tools/` → **solo 3 archivos, todos del simulador** (`device_simulator/seed.js:107`, `lib/device.js:164`, `lib/sensor-engine.js:100/256/454/461`) y **todos son comentarios** que *modelan* pérdida de comm Modbus. **No hay `.ino`, ni dir ESP32, ni `serialport` real.** Connect (ingesta de controlador físico) = **SOLO-DISEÑO / NO EXISTE en código**.

### F6 · Soft sensors / variables inferred
`inferred` aparece **una sola vez**: como valor de enum en `rule_definition.js:45` (`source_filter`). Búsqueda de productor (`'inferred'`/`source_filter` fuera del modelo) → **vacío**. Campo existe, **sin nada que lo genere**.

### F7 · Forense
Firma (`forensic_event.js:52`) y verificación (`:81`, `verifyChain`) existen; ruta con `GET /forensic-events`, `/verify`, `/export` (`forensic.js:13/42/300`); dispatcher `createForensicEvent` (`forensic_dispatcher.js:77`). **`db.forensicevents.countDocuments` = 0** ⇒ el camino de **escritura nunca se ejercitó**; lectura/verify existen pero sin nada que leer.

### F8 · Superficie de operación
- **Páginas** (`app/pages/`): `dashboard`, `devices`, `history`, `index`, `login`, `register`, `templates`, `sites/{index,_siteCode}`, `rulepacks/{index,_packId}`, `demo/simulator`. **Legado:** `dashboard-admin.vue` (§6 CLAUDE.md).
- **Rutas API** (`api/index.js:26-40`): `devices, sites, zones, forensic, simulator, users, templates, webhooks, emqxapi, alarms, rules, rulepacks, dataprovider, dashboard_noc` + bridge `tasmota`.

### F9 · Qué corre hoy de punta a punta
- **Devices:** 13, **todos `firmwareType: wanomi-sim`** — 0 hardware real. Types: SEC/GEN/cummins-pcc/ELTEK/ATS(vacío).
- **Packs cargados:** **1 solo** — `cummins-pcc-v1` v51 (`canary:false`, 5 reglas). `distinct("packId")` = `["cummins-pcc-v1"]`.
- **Frescura:** `now=1785857710618`; último `data` hace **~14,1 h** (50921 s), última `notification` hace **~14,4 h** (51805 s). ⇒ el simulador **corrió y está detenido**; hay historia real, no flujo en vivo ahora mismo.

## F10 · TABLA FINAL — capacidades
| # | Capacidad | Clasificación | Evidencia (archivo:línea / comando) | Qué falta |
|---|---|---|---|---|
| 1 | Motor: evaluador **Cross** | **VIVO** | `ruleEngine.js:16`; log 1715 evals; A0/A1/C1 dispararon | — |
| 2 | Motor: evaluador **D** | **VIVO** | `ruleEngine.js:53`; G2=29/M1=3 en log, G2=18/M1=677 en `notifications` | — |
| 3 | Motor: evaluador **C** | **IMPLEMENTADO** | `typeC.js` (44 L) cableado `ruleEngine.js:57` | ninguna regla tipo C en el pack cargado |
| 4 | Motor: evaluador **S** (ventanas) | **IMPLEMENTADO** | `typeS.js` (46 L) cableado `ruleEngine.js:155` | ninguna regla tipo S en el pack cargado |
| 5 | Notif · **Mongo** | **VIVO** | `notificationRouter.js:126`; `notifications` = 2597 docs | — |
| 6 | Notif · **Telegram** | **VIVO** | `notificationRouter.js:167`; 121 líneas en log | feature-flag por env |
| 7 | Notif · **MQTT dashboard** (B-narrow) | **PARCIAL** | emisor `notificationRouter.js:68`, invocado por `notify()`; sin log de éxito | consumidor (front) no verificado en este recon |
| 8 | Notif · **NOC event** MQTT | **PARCIAL** | emisor `notificationRouter.js:96` (`wanomi/noc/{siteId}/event`) | **sin subscriber**: `dashboard_noc.js` es REST *pull*, no consume el tópico |
| 9 | Correlación `correlationParent` | **PARCIAL** | se propaga `ruleEngine.js:226`→`notifications.js:34`; agrupa `sites.js:141-164` | agrupamiento en API de lectura, no en edge |
| 10 | RulePacks pull desde Mongo | **VIVO** | `siteState.js:22`; 1 pack cargado | — |
| 11 | RulePacks hot-reload MQTT + rollback | **VIVO (cableado)** | `index.js:169-182`, `reloadState.js` snapshot/diff | sin evidencia de un reload real disparado hoy en el log |
| 12 | Siembra DEC-REF-87 (3 packs / 11 reglas) | **SOLO-DISEÑO** | corpus v0.86 DEC-REF-87/-80; `tools/seed_rulepacks_f3/` **untracked**; Mongo tiene **solo** `cummins-pcc-v1` | ejecutar el seed; `ats-inteliats-v1` y `eltek-smartpack-v1` **no existen en DB** |
| 13 | Panel NOC (dashboard) | **IMPLEMENTADO** | `dashboard_noc.js:129` `GET /dashboard/noc` + `/trend`, caché split DEC-REF-85 | sin evidencia de tráfico/consumo hoy |
| 14 | Forense — escritura de cadena | **IMPLEMENTADO** | `forensic_event.js:52`, `forensic_dispatcher.js:77` | `forensicevents` = **0**: nunca se ejercitó |
| 15 | Forense — verify/export | **IMPLEMENTADO** | `forensic.js:13/42/300`, `verifyChain :81` | nada que leer (colección vacía) |
| 16 | **Connect / driver Modbus real** | **SOLO-DISEÑO** | `grep modbus` → solo comentarios del simulador (F5); sin firmware/serialport | todo el driver + firmware |
| 17 | Variables **inferred** (soft sensor) | **SOLO-DISEÑO** | enum `rule_definition.js:45`; sin productor (F6) | el productor que las genere |
| 18 | Simulador de campo | **VIVO (histórico, detenido)** | `tools/device_simulator`; 13 devices `wanomi-sim`; último dato hace ~14 h | está parado ahora; relanzar para flujo vivo |
| 19 | Superficie web/API | **VIVO** | `api/index.js:26-40` (14 rutas + bridge); `app/pages/` (11 páginas) | `dashboard-admin.vue` es legado (§6) |

## §5 · Qué NO verifiqué y por qué — obligatorio
| Qué | Por qué | Qué haría falta |
|---|---|---|
| Consumo real de `wanomi/noc/.../event` y del tópico dashboard | los emisores no loguean en éxito; no encontré subscriber MQTT | trazar suscripciones EMQX o instrumentar un consumidor de prueba |
| Que el hot-reload (#11) se haya disparado hoy | el log no mostró un reload; solo verifiqué el cableado | inspeccionar el log completo por el handler de reload o disparar uno |
| Correctitud de las reglas que dispararon | fuera de alcance (recon funcional, no de correctitud) | banco de casos contra `sensor-engine` |
| Firmware de campo | **no existe** `.ino`/ESP32 en el árbol; nada que leer | el repo de firmware telco (fuera de este árbol) |
| Escritura forense end-to-end | colección vacía; no rastreé por qué `createForensicEvent` nunca corrió | ver si `dispatchForensicEvent` está cableado al flujo de alarma o quedó desconectado |
| Contenido/valores de `app/.env` | regla dura: chequear presencia sin filtrar valor | — (respetado: solo SET/UNSET) |
| Bridge Tasmota (`routes/bridges/tasmota.js`) | apareció en `index.js:26` pero no lo abrí | leer el bridge y buscar tráfico Tasmota |

## 6 · Salida
- **Habilita:** el mapa de costuras (Paso 2) con clasificación por capacidad; prioriza qué "decidido" del corpus todavía es SOLO-DISEÑO (Connect #16, inferred #17, siembra #12, forense-escritura #14).
- **Preguntas que este recon ABRIÓ:**
  1. ¿Por qué `createForensicEvent` nunca escribió un evento? ¿Está desconectado del flujo de alarma o nunca se cumplió su condición?
  2. La siembra DEC-REF-87 está reconciliada en corpus pero **el seed es untracked y no corrió** contra `iotix`: ¿se ejecuta ahora o queda pendiente de decisión?
  3. `sendNocEvent` publica a un tópico **sin consumidor conocido**: ¿el panel NOC lee por REST (pull) y el canal MQTT NOC es diseño muerto, o falta el subscriber?
