# Mapa de costuras — Wanomi 3.0

Describe el sistema que corre HOY. No es un resumen del corpus.
Lee toda decisión VIGENTE, sin importar su fecha.

- Escritura: hacia adelante. Descripción: el presente. Lectura: lo vigente.
- Formato de fila: `plantillas/costura.md`
- Un bloque NO cierra si dejó una costura desactualizada.
- Contradicción con el corpus ⇒ ADENDA nueva. Fila vieja intacta, nunca edición.
- Ante divergencia: el mapa manda sobre "qué pasa hoy" (tiene verificación);
  el corpus manda sobre "qué se decidió".

## Allocator
- Familia: `CST-`
- Próximo libre: **CST-19**
- Retirados (nunca reusar): (ninguno)

## Estados
| Estado | Significa | Qué se hace |
|---|---|---|
| CONFORME | Como es = como debería ser, verificado | Nada. Son las que no hay que tocar |
| DESVÍO | Hay decisión firmada, la implementación no la cumple | Deuda. Se prioriza por lo que bloquea |
| NO DECIDIDO | No hay decisión firmada | Punto ciego. Necesita sala, no código |
| CONTRADICCIÓN | Dos decisiones firmadas chocan en el mismo lugar | Gobierno. Lo arbitra Franco |
| NO VERIFICADO | Todavía no lo miramos | Cola de la pasada 2 |

## Inventario

> Sembrado en el BLOQUE HARNESS-2 (#56, tramo paralelo) desde la tabla F10 del recon
> (`recon/funcionalidades.md`). 12 costuras salen de F10 (las 7 filas que son
> lógica interna de una pieza NO entran: evaluadores Cross/D/C/S, panel NOC,
> verify forense, superficie web/API) + 3 costuras extra no presentes en F10.
> "Cómo debería ser" vacío = NO DECIDIDO, y eso es la información.

### CST-01 · Notif · router → Mongo

| Campo | Contenido |
|---|---|
| Costura                  | `notificationRouter.saveToMongo` (edge) → colección `notifications` (Mongo) |
| Qué cruza                | la alarma persistida con su valor numérico y `correlationParent` |
| Cómo es                  | `notify()` llama a `saveToMongo` sin condición; `notifications` = 2597 docs |
| Verificación             | `db.notifications.countDocuments()` → >0 · última corrida: recon #54 (2597) |
| Cómo debería ser         | (VACÍO — DEC-REF-22 fija que persiste; no hay decisión que contradiga lo que hay) |
| Gobernada por            | DEC-REF-21 · DEC-REF-22 |
| Consecuencia del desvío  | sin persistencia el histórico y la vista de cascada se quedan sin fuente |
| Estado                   | CONFORME |
| Bloquea                  | histórico · vista de cascada |
| Sirve al pilar           | recomendación |

### CST-02 · Notif · router → Telegram

| Campo | Contenido |
|---|---|
| Costura                  | `notificationRouter.sendTelegram` (edge) → API de Telegram (red externa) |
| Qué cruza                | la alerta al operador con la acción sugerida |
| Cómo es                  | emisor `notificationRouter.js:167`; 121 líneas OK/retry en el log del edge |
| Verificación             | `grep -c Telegram <log edge>` → >0 · última corrida: recon #54 (121) |
| Cómo debería ser         | (VACÍO — F10 #6 anota feature-flag por env como falta, sin decisión firmada) |
| Gobernada por            | DEC-REF-10 · DEC-REF-21 |
| Consecuencia del desvío  | sin este canal el operador no recibe la alerta fuera del NOC |
| Estado                   | CONFORME |
| Bloquea                  | — |
| Sirve al pilar           | recomendación |

### CST-03 · Notif · router → front (MQTT dashboard, B-narrow)

| Campo | Contenido |
|---|---|
| Costura                  | emisor `sendMqttNotif` (edge) → consumidor front (browser subscriber MQTT) |
| Qué cruza                | la notificación en vivo al dashboard del operador |
| Cómo es                  | emisor `notificationRouter.js:68` invocado por `notify()`; NO loguea en éxito |
| Verificación             | (VACÍO — el emisor es silencioso en éxito; no hay comando que pruebe la entrega) |
| Cómo debería ser         | (VACÍO — no hay decisión firmada sobre verificar el consumo del front) |
| Gobernada por            | DEC-REF-21 · DEC-REF-38 |
| Consecuencia del desvío  | el `grep=0` NO prueba ausencia; consumo del front sin verificar |
| Estado                   | NO VERIFICADO |
| Bloquea                  | — |
| Sirve al pilar           | recomendación |

### CST-04 · Notif · router → consumidor NOC (MQTT event)

| Campo | Contenido |
|---|---|
| Costura                  | emisor `sendNocEvent` `wanomi/noc/{siteId}/event` (edge) → consumidor NOC |
| Qué cruza                | el evento de sitio hacia el NOC |
| Cómo es                  | emisor `notificationRouter.js:96` corre; **sin subscriber**: `dashboard_noc.js` es REST *pull*, no consume el tópico |
| Verificación             | buscar subscriber de `wanomi/noc/+/event` → NO encontrado · última corrida: recon #54 |
| Cómo debería ser         | (VACÍO — pregunta abierta #3 del recon: ¿canal MQTT NOC es diseño muerto o falta el subscriber?) |
| Gobernada por            | DEC-REF-10 |
| Consecuencia del desvío  | el emisor publica a un tópico sin consumidor conocido |
| Estado                   | NO VERIFICADO |
| Bloquea                  | consumo del evento NOC por MQTT |
| Sirve al pilar           | recomendación |

### CST-05 · Correlación · edge → API de lectura

| Campo | Contenido |
|---|---|
| Costura                  | edge (persiste `correlationParent` en `notifications`) → API de lectura que agrupa (`sites.js:141-164`) |
| Qué cruza                | el vínculo padre-hijo del evento de cascada |
| Cómo es                  | se propaga `ruleEngine.js:226`→`notifications.js:34`; el agrupamiento vive en la API de lectura, no en el edge |
| Verificación             | `db.notifications.find({correlationParent:{$exists:true}}).count()` → >0 · última corrida: recon #54 |
| Cómo debería ser         | `correlationParent` persistido en `saveToMongo` para que la vista de cascada tenga la agrupación (implementado) |
| Gobernada por            | DEC-REF-50 · DEC-REF-41 |
| Consecuencia del desvío  | sin el campo persistido la vista de cascada no puede agrupar por evento raíz |
| Estado                   | CONFORME |
| Bloquea                  | vista de cascada |
| Sirve al pilar           | anticipación |

### CST-06 · RulePacks · Mongo → edge (pull al arranque)

| Campo | Contenido |
|---|---|
| Costura                  | colección `rulepacks` (Mongo) → edge `loadPacks(SITE_ID)` (`siteState.js:22`) |
| Qué cruza                | las reglas por site con las que arranca el motor |
| Cómo es                  | pull de `RulePack.find({canary:false})` al arrancar; 1 pack cargado (`cummins-pcc-v1`) |
| Verificación             | `db.rulepacks.distinct("packId")` → ≥1 · última corrida: recon #54 (`["cummins-pcc-v1"]`) |
| Cómo debería ser         | el motor arranca con los packs `production` (canary:false) de su site (anillos DEC-REF-20) |
| Gobernada por            | DEC-REF-20 · DEC-REF-31 |
| Consecuencia del desvío  | el motor arranca sin reglas → no evalúa nada |
| Estado                   | CONFORME |
| Bloquea                  | — |
| Sirve al pilar           | anticipación |

### CST-07 · RulePacks · MQTT reload → edge (hot-reload + rollback)

| Campo | Contenido |
|---|---|
| Costura                  | MQTT `wanomi/edge/${SITE_ID}/reload` → `reloadPacks()` (`index.js:169-182`, `reloadState.js`) |
| Qué cruza                | el disparo de recarga en caliente de los packs sin reiniciar el contenedor |
| Cómo es                  | cableado con snapshot/diff/rollback; **sin evidencia de un reload real disparado hoy** en el log |
| Verificación             | publicar en el tópico de reload y observar `reloadState` → recarga · última corrida: PENDIENTE |
| Cómo debería ser         | reload fire-and-forget con snapshot y rollback ante error (DEC-REF-58 / -61) |
| Gobernada por            | DEC-REF-58 · DEC-REF-61 |
| Consecuencia del desvío  | los cambios de pack no llegan sin reiniciar el contenedor |
| Estado                   | NO VERIFICADO |
| Bloquea                  | siembra en caliente (CST-08 dispara este cruce) |
| Sirve al pilar           | anticipación |

### CST-08 · Siembra · seed HTTP → API → Mongo

| Campo | Contenido |
|---|---|
| Costura                  | seed (`tools/seed_rulepacks_f3/`, `PUT /rulepack` HTTP) → API → `rulepacks` (Mongo) |
| Qué cruza                | los 3 packs / 16 reglas reconciliados del catálogo #18 |
| Cómo es                  | seed **untracked y sin ejecutar** contra `iotix`; Mongo tiene **solo** `cummins-pcc-v1` (5 reglas) |
| Verificación             | `db.rulepacks.distinct("packId")` → debe incluir `ats-inteliats-v1` y `eltek-smartpack-v1` · última corrida: recon #54 (ausentes) |
| Cómo debería ser         | `ats-inteliats-v1` (5, NUEVO) · `eltek-smartpack-v1` (4, NUEVO) · `cummins-pcc-v1` (+2, ampliado) = 16 reglas / 35% del catálogo |
| Gobernada por            | DEC-REF-87 · DEC-REF-80 |
| Consecuencia del desvío  | cobertura del catálogo se queda en 5 reglas; los packs decididos no existen en DB |
| Estado                   | DESVÍO |
| Bloquea                  | cobertura de reglas ATS y ELTEK |
| Sirve al pilar           | anticipación |

> **Adenda #59 — CST-08 RETIRADA DE CURSO por DEC-REF-91.** La fila queda
> intacta y su diagnóstico sigue siendo cierto para la base actual. Lo que
> cambia es que **no se ejecuta**: DEC-REF-91 fija que el pack se recrea desde
> cero en la base nueva, con identificadores definitivos. Sembrar
> `ats-inteliats-v1` sobre la base viva ya no es el camino. El "Cómo debería
> ser" de la fila describe un objetivo **superado**, no incumplido.
> Estado efectivo: **RETIRADA** (no es DESVÍO — no hay nada que corregir).

### CST-09 · Forense · flujo de alarma → escritura de cadena

| Campo | Contenido |
|---|---|
| Costura                  | flujo de alarma → `createForensicEvent`/dispatcher (`forensic_dispatcher.js:77`) → `forensicevents` (Mongo) |
| Qué cruza                | el checkpoint HMAC firmado del evento |
| Cómo es                  | firma y dispatcher existen (`forensic_event.js:52`); **`forensicevents` = 0**: la escritura nunca se ejercitó |
| Verificación             | `db.forensicevents.countDocuments()` → hoy 0 · última corrida: recon #54 |
| Cómo debería ser         | checkpoints HMAC firmados cada N eventos por Hub (DEC-HMAC-1) |
| Consecuencia del desvío  | la cadena forense no existe; verify/export no tienen nada que leer |
| Gobernada por            | DEC-HMAC-1 |
| Estado                   | NO VERIFICADO |
| Bloquea                  | forense verify/export |
| Sirve al pilar           | ninguno |

> Pregunta abierta #1 del recon: ¿`createForensicEvent` está desconectado del
> flujo de alarma o su condición nunca se cumplió? No resuelta acá.

### CST-10 · Connect · controlador físico → ingesta

| Campo | Contenido |
|---|---|
| Costura                  | controlador físico (Modbus TCP/RTU · SNMP · contacto seco) → ingesta de la plataforma |
| Qué cruza                | la telemetría real del equipo que ya está en el sitio (modo Connect) |
| Cómo es                  | **sin código productor**: `grep modbus\|serialport` → solo comentarios del simulador (F5); no hay `.ino`/ESP32/serialport real |
| Verificación             | `grep -rlnE 'modbus\|serialport' app/ edge-engine/ tools/` → solo simulador · última corrida: recon #54 |
| Cómo debería ser         | Connect = framework multi-driver Modbus (TCP+RTU) + SNMP + contacto seco, drivers día 1 ComAp/Eltek |
| Gobernada por            | DEC-REF-8 · DEC-REF-16 · DEC-INTEGRATION-1 |
| Consecuencia del desvío  | toda la ingesta real es inexistente; hoy el dato es 100% simulado |
| Estado                   | DESVÍO |
| Bloquea                  | ingesta desde hardware real |
| Sirve al pilar           | anticipación |

### CST-11 · Soft sensor · productor `inferred` → reglas

| Campo | Contenido |
|---|---|
| Costura                  | productor de soft-sensor (inexistente) → campo `inferred` consumido por reglas (`source_filter`) |
| Qué cruza                | las variables inferibles que el motor filtra por origen |
| Cómo es                  | `inferred` existe como valor de enum (`rule_definition.js:45`); **ningún código lo produce** (F6) |
| Verificación             | grep de productor de `source_filter='inferred'` fuera del modelo → vacío · última corrida: recon #54 |
| Cómo debería ser         | variables inferibles generadas por soft sensor y marcadas `source: inferred` (DEC-SENSOR-3) |
| Gobernada por            | DEC-SENSOR-1 · DEC-SENSOR-3 |
| Consecuencia del desvío  | campo sin productor; las reglas que filtren por `inferred` no reciben nada |
| Estado                   | DESVÍO |
| Bloquea                  | reglas sobre variables inferidas |
| Sirve al pilar           | anticipación |

### CST-12 · Ingesta · telemetría → EMQX → saver-webhook → data

| Campo | Contenido |
|---|---|
| Costura                  | simulador/telemetría → MQTT → EMQX rule `saver-webhook` → colección `data` |
| Qué cruza                | el dato de campo que alimenta motor + panel + persistencia |
| Cómo es                  | vivo hoy: `saver-webhook is_alive=true`, `db.data +70 docs/60s`; el recurso es one-shot al boot, **sin watchdog runtime** (BACKLOG-OPS-1) |
| Verificación             | `bash tools/healthcheck_demo.sh` → OK · última corrida: 2026-08-07 (hoy) |
| Cómo debería ser         | (VACÍO — el watchdog runtime de `is_alive` es propuesta BACKLOG-OPS-1, sin decisión firmada) |
| Gobernada por            | (ninguna) · antecedente BACKLOG-OPS-1 · BACKLOG-OPS-4 |
| Consecuencia del desvío  | `is_alive=False` no se remedia; en #54 dio 16/16 timeouts y cortó la ingesta |
| Estado                   | NO DECIDIDO |
| Bloquea                  | ingesta en vivo |
| Sirve al pilar           | anticipación |

### CST-13 · Forense · fuente de tiempo → cadena firmada

| Campo | Contenido |
|---|---|
| Costura                  | fuente de hora del Hub → timestamp que firma el HMAC de la cadena forense |
| Qué cruza                | la hora que queda sellada en cada checkpoint |
| Cómo es                  | el Hub de campo es Orange Pi **sin RTC con batería**; el HMAC firma timestamps; de dónde sale esa hora **nadie lo decidió** |
| Verificación             | (VACÍO — no hay comando que decida la fuente de tiempo) |
| Cómo debería ser         | (VACÍO — sin decisión firmada sobre el origen del reloj que se firma) |
| Gobernada por            | DEC-HMAC-1 (gobierna la cadena, no la fuente de tiempo) |
| Consecuencia del desvío  | la datación forense no es confiable; deriva de reloj y hereda la duda de los gaps de #54 |
| Estado                   | NO DECIDIDO |
| Bloquea                  | confiabilidad de la datación forense y de la cascada |
| Sirve al pilar           | anticipación |

### CST-14 · Seguridad · disparador de rotación → secretos

| Campo | Contenido |
|---|---|
| Costura                  | disparador de rotación → `EMQX_API_TOKEN` y `MONGO_PASSWORD` (`app/.env`) |
| Qué cruza                | el momento en que se rotan las credenciales de infraestructura |
| Cómo es                  | rotación manual sin disparador automatizado; el disparador "al desplegar a producción" **no disparó en 5 incidentes** |
| Verificación             | `bash tools/secretos.sh app/.env EMQX_API_TOKEN MONGO_PASSWORD` → SET (presencia, NUNCA valor) · última corrida: 2026-08-07 · NOTA: verifica presencia, no rotación |
| Cómo debería ser         | (VACÍO — sin decisión firmada sobre cuándo y cómo se rotan) |
| Gobernada por            | (ninguna) |
| Consecuencia del desvío  | credenciales sin rotar tras incidentes; el disparador nominal nunca actúa |
| Estado                   | NO DECIDIDO |
| Bloquea                  | higiene de credenciales post-incidente |
| Sirve al pilar           | ninguno |

### CST-15 · Panel NOC · caché → buildReadFilter (aislamiento de tenencia)

| Campo | Contenido |
|---|---|
| Costura                  | caché de `/dashboard/noc` → `buildReadFilter` (`dashboard_noc.js:57-59`) |
| Qué cruza                | la clave de caché que decide qué payload por tenencia se reutiliza |
| Cómo es                  | la key es SHA1 de `siteCodes` **sin `userId`**; hoy no fuga porque toda la ingesta es CR00061, presente en ambos scopes — coincidencia empírica, no garantía |
| Verificación             | V-PESADO (paso 4 de DEC-REF-85): el tramo cacheado deriva solo de `siteCodes` + `Device.find` sin `buildReadFilter` · última corrida: PENDIENTE |
| Cómo debería ser         | opción (a) DEC-REF-85-A: cachear solo el tramo PESADO scope-equivalente; el tramo con `notifFilter` nunca se cachea; comentario corregido a por-qué-es-seguro-ahora |
| Gobernada por            | DEC-REF-85-A · DEC-REF-85 |
| Consecuencia del desvío  | con una sola notificación fuera del scope, la respuesta de un superadmin se sirve a un cellowner de igual `siteCodes` |
| Estado                   | DESVÍO |
| Bloquea                  | aislamiento de tenencia del panel NOC entre scopes distintos |
| Sirve al pilar           | recomendación |

### CST-16 · Registro de equipo → selector de reglas del motor

| Campo | Contenido |
|---|---|
| Costura                  | `devices` (Mongo) → gate de `deviceType` en `ruleEngine.js` |
| Qué cruza                | el tipo de equipo con el que el motor decide qué reglas le tocan |
| Cómo es                  | CR00061-ATS (`59XYsglM`) tiene `deviceType: ""` — único de 13 devices |
| Verificación             | `db.devices.find({dId:"59XYsglM"},{deviceType:1})` → "" · última corrida: 2026-08-08 |
| Cómo debería ser         | (VACÍO — nadie decidió de dónde se puebla el campo) |
| Gobernada por            | (ninguna) · antecedente DEC-REF-81(iii) · BACKLOG-RULE-5 |
| Consecuencia del desvío  | `cummins-M1-mains-loss` (deviceType ATS) NO dispara — es la madre de la cascada; y el pack ATS de CST-08, aunque se siembre, tampoco dispararía |
| Estado                   | NO DECIDIDO |
| Bloquea                  | M1 · cascada energética · las 5 reglas del pack ATS |
| Sirve al pilar           | anticipación |

> Nota: esta costura es el ejemplo de `plantillas/costura.md` y NO había
> entrado al inventario del sembrado inicial. Detectada por omisión al
> revisar las 15 contra el carry-over.

> **Adenda #59 — CST-16 ABSORBIDA por DEC-REF-91.** Dos correcciones. **(i) El
> "Cómo es" quedó stale el mismo día que se escribió:** #58 (DEC-REF-90-A) hizo
> `updateOne deviceType:"ATS"` sobre `59XYsglM`; el campo ya no vale `""` y la
> cascada M1→C1 está viva (E2E verificado, M1 a T0+13 ms, C1 a T0+90,898 s).
> **(ii) El "Cómo debería ser" ya no está vacío, pero tampoco se llena con esta
> costura:** DEC-REF-91 retira el `deviceType` como campo que alguien puebla —
> pasa a ser el **identificador de la ficha de equipo**, entidad que hoy no
> existe. La costura describe un cruce (`devices` → gate del motor) que sigue
> existiendo, pero cuyo **origen del dato cambia de entidad**. No se reclasifica
> a DESVÍO: se declara **ABSORBIDA** por las costuras nuevas de la ficha
> (CST-17/18), que son las que gobiernan el dato desde ahora. Se conserva como
> registro del episodio y de su E2E.

### CST-17 · Ficha de equipo → plantilla (referencia, no copia)

| Campo | Contenido |
|---|---|
| Costura                  | ficha de equipo (entidad inexistente) → `templates` (Mongo) y su editor (`templates.vue`) |
| Qué cruza                | el vocabulario de variables, unidades, rangos y cadencias que el fabricante define y la plantilla muestra |
| Cómo es                  | **la ficha no existe.** La plantilla inventa sus variables a mano (`templates.vue:289-298`); el schema no tiene campo de tipo (`template.js:56-62`); los umbrales viven dentro del widget (`template.js:43-48`) |
| Verificación             | (VACÍO — no hay entidad que verificar todavía) |
| Cómo debería ser         | la ficha es madre; la plantilla **referencia** sus variables, no las copia. Una ficha, N plantillas. El límite del fabricante vive en la ficha; el umbral del cliente, en la regla (DEC-REF-91) |
| Gobernada por            | DEC-REF-91 |
| Consecuencia del desvío  | cada plantilla reinventa el vocabulario del equipo; dos plantillas del mismo modelo pueden contradecirse y nadie lo detecta |
| Estado                   | DESVÍO |
| Bloquea                  | criterio de aceptación de DEC-REF-91 (cadena desde base vacía) |
| Sirve al pilar           | anticipación |

### CST-18 · Ficha de equipo → identificador de reglas y equipos

| Campo | Contenido |
|---|---|
| Costura                  | identificador de la ficha → `deviceType` en `rulepacks` (pack y reglas embebidas) y en `devices` |
| Qué cruza                | la etiqueta única por la que el motor decide qué reglas le tocan a qué equipo (`ruleEngine.js:46`, igualdad estricta) |
| Cómo es                  | **texto libre en dos lugares independientes**: el pack (`rulepacks.js:118`, required sin catálogo) y cada regla embebida (`_packId.vue:566`, hereda del pack y es editable). El device lo recibe crudo del payload (`devices.js:92-119`) y nace `""` por la UI. Una letra distinta apaga la regla **sin síntoma** |
| Verificación             | (VACÍO — no hay catálogo contra el cual validar) |
| Cómo debería ser         | el identificador **es** la ficha. Pack, regla y plantilla lo **eligen** de un catálogo único con fabricante como campo; el equipo lo **hereda** de su plantilla. Nadie lo escribe (DEC-REF-91) |
| Gobernada por            | DEC-REF-91 |
| Consecuencia del desvío  | alarmas mudas sin error visible; hoy latente el desfasaje `CUMMINS` (`sensor-engine.js:74`) vs `cummins-pcc` (base) |
| Estado                   | DESVÍO |
| Bloquea                  | criterio de aceptación de DEC-REF-91 · alta de equipo por UI |
| Sirve al pilar           | anticipación |
