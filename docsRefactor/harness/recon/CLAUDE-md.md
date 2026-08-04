# RECON — CLAUDE.md · 2026-08-03 · sesión #54

> Estrena `plantillas/recon.md`. Clasifica y verifica CLAUDE.md contra el
> sistema vivo. NO propone el archivo nuevo (eso es 1.c). NO toca CLAUDE.md
> ni el corpus. Los anexos B1–B6 (exigidos por el gate) van al final.

## 0 · Apertura (verificado hoy, NO de memoria)
- Corpus vigente:      WanomiRefactor.md **v0.86** (2026-08-02, línea 4 leída hoy)
- Branch / HEAD:       feature/telco-support / **e37cd1f** · working tree: **sucio** (solo 7 entradas `??` sin trackear; ninguna dentro del alcance de este gate)
- Contenedores:        `node`, `mongo` (healthy), `emqx` (healthy), `wanomi-edge` — los 4 Up 29 h · compose EN USO por label: **docker_compose_production.yml**
- Estado que este recon NO asume del paso anterior: re-medí git/DB/env HOY. No reuso el conteo previo; con `e37cd1f` incluido, `origin/feature/telco-support..HEAD` = **27** (era 26/27 antes del commit del Paso 0).

## 1 · Alcance
- Pregunta que contesta: ¿qué de CLAUDE.md es hecho verificado que se queda, qué se corta por vivir en otro lado o estar obsoleto, y qué se difiere — con cada afirmación de entorno medida contra el sistema vivo?
- Qué queda fuera:       la PROPUESTA/redacción del archivo nuevo (es 1.c) · el inventario en COSTURAS.md (Paso 2) · cualquier edición a CLAUDE.md o al corpus · el contenido semántico de las 20 DEC (solo verifico presencia de ID, no implementación).

## 2 · Procedencia — OBLIGATORIO
| Pieza | Qué es | De dónde sale | Quién la consume | Qué se rompe si falta |
|---|---|---|---|---|
| CLAUDE.md | Instrucciones de proyecto para Claude | Repo raíz (559 líneas) | Claude en cada sesión | Claude pierde contexto y convenciones |
| docs/wanomi.md | Bitácora maestra (10490 líneas), DEC-11..DEC-42+ | Repo `docs/` | Humano + Claude para decisiones HW/sesiones | Se pierde el log de decisiones de hardware/telco |
| docs/informe_instalacion.md | Topología de site + DEC-01..DEC-10 | Repo `docs/` | Diseño de instalación | Se pierden las 10 decisiones de instalación |
| docsRefactor/WanomiRefactor.md | Corpus del REFACTOR de software (462 líneas), familia DEC-REF/PROC/PRED | Repo `docsRefactor/` | Harness Wanomi 3.0 | Se pierde el estado del refactor |
| app/.env | Config runtime de la app Node | Host (no en repo) | Proceso `node` vía dotenv | La app no arranca / apunta mal |
| /.env | Config de infraestructura Docker | Host (no en repo) | docker-compose | Los contenedores no levantan |
| Contenedores vivos | Estado real de mongo/emqx/node/edge | Docker | Todo el sistema | — (es la fuente de verdad) |
| app/api/middlewares/authentication.js | Contrato de auth (lee header `token`) | Repo | Toda ruta protegida + frontend/tests | Auth rota si el cliente manda otro header |

## 3 · Pregunta de origen — OBLIGATORIO (DEC-PROC-3)
> ¿De dónde salen las piezas con las que se construye esto, y son configurables o hardcodeadas?

**Respuesta:** mezcla. El nombre de la DB, credenciales y hosts salen de `app/.env` (configurable, cargado por dotenv). Los puertos EMQX salen **hardcodeados** en `docker_compose_production.yml`. El nombre del header de auth sale **hardcodeado** en el middleware. CLAUDE.md, en cambio, **hardcodea en prosa** valores que en runtime son configurables — y en un caso (DB) el valor hardcodeado en la doc **contradice** el real.

**Piezas hardcodeadas encontradas:**
1. Puertos EMQX publicados: `1883 / 8083 / 8085→8081 / 18083` literales en `docker_compose_production.yml:61-64`.
2. Header de auth: `req.get('token')` literal en `authentication.js:6` (no `Authorization: Bearer`).
3. `EMQX_API_TOKEN` = valor trivial de dev (6 dígitos repetidos) — presente en `app/.env` (demostrado en H11).
4. `MONGO_DATABASE=ioticos_god_level` **hardcodeado en CLAUDE.md:508** — el runtime real usa `iotix`.

> Toda respuesta "hardcodeado" es HALLAZGO ESTRUCTURAL, nunca "asimetría menor".
> Ítems 1, 2 y 4 escalan a §4 como estructurales.

## 4 · Hallazgos
| # | Hallazgo | Evidencia (archivo:línea / comando + salida) | ¿Estructural? | CST |
|---|---|---|---|---|
| H1 | CLAUDE.md declara `MONGO_DATABASE=ioticos_god_level` pero el runtime usa `iotix`; el MISMO CLAUDE.md se autocontradice (l.536 dice `iotix`). `iotix` tiene 15 colecciones, `ioticos_god_level` vacía. | CLAUDE.md:508 vs :536 · `grep MONGO_DATABASE app/.env`→`iotix` · `MONGODB_URI` apunta a `/iotix` · mongo eval: iotix=15 colls, ioticos_god_level=[] | **SÍ** | CST-CAND-A |
| H2 | "20 decisiones" (l.329) obsoleto: la bitácora llega a DEC-42+ | `grep DEC- docs/wanomi.md`: DEC-21..29, DEC-42 en wanomi.md:588 | No (drift de doc) | — |
| H3 | Ninguna DEC-01..20 está en WanomiRefactor.md; viven en docs/wanomi.md (11-20) e informe_instalacion.md (01-10). Dos corpus, dos familias de ID (DEC-NN vs DEC-REF/PROC/PRED). | greps B2 abajo | **SÍ** | CST-CAND-B |
| H4 | EMQX `8883` (TLS) declarado pero NO publicado en el compose en uso | CLAUDE.md:532 vs `docker_compose_production.yml:61-64` (sin 8883) · `docker ps` sin 8883 | No (verificado, drift) | CST-CAND-C |
| H5 | Sección Variables de Entorno incompleta: `app/.env` real tiene 12 claves no documentadas | `grep -oE '^KEY=' app/.env`: FORENSIC_HMAC_SECRET, SITE_ID, ENABLE_SIMULATOR_API, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID_DEFAULT, MQTT_USER, MQTT_PASS, MQTT_NOTIFICATION_HOST, MONGODB_URI, TEST_USER_EMAIL, TEST_USER_PWD, (MONGO_DATABASE valor divergente) | **SÍ** | CST-CAND-A |
| H6 | La rama activa `feature/telco-support` no figura en la tabla "Ramas Git" (solo master, wifi-ap, tasmota) | CLAUDE.md:17-28 vs `git branch --show-current` | No (drift) | — |
| H7 | "tres componentes principales" (Descripción) omite un 4º componente VIVO: `edge-engine` (contenedor `wanomi-edge` Up 29h, arranca `node /home/edge/edge-engine/index.js`) | CLAUDE.md:9-13 vs `docker inspect wanomi-edge` · `ls -d edge-engine/` | **SÍ** | CST-CAND-D |
| H8 | Lista de modelos Mongoose incompleta vs DB: faltan site, forensicevents, rulepacks, operators, zones, saverrules | CLAUDE.md:393 vs `db.getCollectionNames()` iotix (15 colls) | No (drift) | — |
| H9 | El gate dice "11 secciones ##"; el disco tiene **10** headers de nivel `##` (+1 título `#`) | `grep -n '^## ' CLAUDE.md` = 10 líneas | No (conteo) | — |
| H10 | `EMQX_API_TOKEN` = valor trivial de dev (6 dígitos repetidos, hardcodeado) | `FOO=abc; echo "${FOO:+SET}${FOO:-UNSET}"` → SETabc (demo con var dummy, cero secretos) | Seguridad | — |
| H11 | El idioma `${VAR:+SET}${VAR:-UNSET}` que el gate declara seguro FILTRA el valor cuando la var está definida | `FOO=abc; echo "${FOO:+SET}${FOO:-UNSET}"` → SETabc (demo con var dummy, cero secretos) | **SÍ (meta/seguridad)** | — |

## 5 · Qué NO verifiqué y por qué
| Qué | Por qué | Qué haría falta |
|---|---|---|
| Que el proceso `node` en runtime realmente consulte `iotix` (no solo que el URI lo diga) | Requeriría introspección del proceso vivo / logs de conexión; riesgo de exponer URI con password | `docker logs node` filtrado por la línea de conexión Mongo sin volcar el URI |
| Si EMQX escucha 8883 internamente aunque no esté publicado | Solo miré puertos publicados en compose/`docker ps` | Query a los listeners de EMQX (dashboard/REST) |
| Que el frontend/tests envíen efectivamente el header `token` | Solo verifiqué el lado servidor (middleware) | grep en `app/pages`/`app/plugins`/`app/store` y en los tests |
| Contenido semántico de las 20 DEC contra su implementación | El gate pide reconciliación de PRESENCIA, no auditoría de cumplimiento | Leer cada DEC y cruzar con código/PCB (Área 3) |
| Cada una de las 559 líneas de CLAUDE.md | Clasifiqué por sección + rangos clave (329-372, 436-559) | Lectura línea a línea (bajo ROI para este gate) |
| Si docs/wanomi.md contradice WanomiRefactor.md en CONTENIDO (no solo IDs) | Fuera de alcance; solo crucé presencia de ID | Diff temático entre ambos corpus |
| Si la verificación de forensicevents usa la clave VIGENTE o la clave con que se firmó cada evento | Fuera del alcance de este gate; condiciona si FORENSIC_HMAC_SECRET se puede rotar sin invalidar el histórico | grep del verificador HMAC en app/api/ + edge-engine/ |

## 6 · Salida
- Habilita: **1.c** (propuesta/redacción del archivo nuevo) con la clasificación B1 cerrada y los hechos B3 medidos.
- Preguntas que este recon ABRIÓ:
  1. ¿Cuál es el corpus canónico de las 20 DEC de hardware — `docs/wanomi.md`+informe, o hay que reflejarlas en `WanomiRefactor.md`? (el gate nombró solo el segundo, pero viven en el primero).
  2. ¿ESP8266 se corta de CLAUDE.md o se preserva como legado? (evidencia: legado; decisión = Área 3).
  3. ¿`edge-engine` (4º componente vivo) entra al archivo nuevo de arquitectura?
  4. ¿Se corrige la contradicción de DB (`iotix` vs `ioticos_god_level`) en el archivo nuevo, y se documentan las 12 env faltantes?

---

# ANEXO B1 · Clasificación sección por sección

> El gate pide "11 secciones ##". **Medición: 10 headers de nivel `##`** (+ el
> título `# CLAUDE.md`, nivel `#`). Clasifico las 10 `##`; el título es H9.

| líneas | sección (##) | qué afirma | ¿verificable? | ¿vigente? | ¿duplica a quién? | destino |
|---|---|---|---|---|---|---|
| 5–16 | Descripción del Proyecto | 3 componentes (infra, app Nuxt2+Express, firmware ESP8266) | Sí | Parcial (omite edge-engine, telco) | docs/wanomi.md | **REESCRIBIR** (H7) |
| 17–29 | Ramas Git | master + wifi-ap + tasmota | Sí (git) | **No** (falta telco-support) | git | **REESCRIBIR** (H6) |
| 30–159 | Estado Actual del Desarrollo | changelog Fase 1/2, "act. 2026-04-04" | Sí | **No** (hoy v0.86 / #53) | docs/wanomi.md (log de sesiones) | **CORTAR-YA-VIVE-EN(docs/wanomi.md)** |
| 160–211 | Roadmap Multi-Dispositivo | Fases 1-4 | Parcial | Parcial (1/2 hechas) | docs/wanomi.md | **DIFERIR-A-PASO-2** |
| 212–372 | Fase 4 — Soporte Telco | arquitectura, productos, cambios planificados, convenciones, 20 DEC, PCB | Mixto | Mixto | docs/wanomi.md + informe | **REESCRIBIR** (partir: "Convenciones descubiertas" l.299-327 = QUEDA-VERIFICADO; 20 DEC + PCB = CORTAR-YA-VIVE-EN(docs/wanomi.md)) |
| 373–435 | Arquitectura de la Aplicación | rutas, modelos, auth, topics, EMQX | Sí | Parcial (modelos incompletos) | — | **REESCRIBIR** (H8) |
| 436–484 | Comandos de Desarrollo | npm, docker compose, pio | Sí | Sí (production compose confirmado) | — | **QUEDA-VERIFICADO** (nota: `docker_compose_dev.yml` existe y no está listado) |
| 485–525 | Variables de Entorno | claves /.env y app/.env | Sí | **No** (12 faltan, DB contradice) | — | **REESCRIBIR** (H1, H5) |
| 526–541 | EMQX — Puertos y Configuración | puertos + DB `iotix` + sha256 | Sí | Parcial (8883 no publicado; DB `iotix` correcta acá) | — | **REESCRIBIR** (H4; nota: acá l.536 SÍ dice iotix — es la l.508 la equivocada) |
| 542–559 | Firmware ESP8266 — Configuración | config.h del firmware | Sí | Legado (B5) | — | **DIFERIR-A-PASO-2** (decisión = Área 3) |

# ANEXO B2 · Las 20 decisiones — reconciliación

CLAUDE.md:329 **no enumera** las 20; lista 6 "clave" (DEC-01,02,06,07,14,19) y
apunta a `docs/wanomi.md`. Las 20 se reparten en DOS archivos:
- **DEC-01..DEC-10** → `docs/informe_instalacion.md:747-781` (Sesión #3, informe de instalación).
- **DEC-11..DEC-20** → `docs/wanomi.md:378-387` (Sesión #4, fabricación PCB).

| # | decisión (resumen 1 línea) | ¿está en WanomiRefactor.md? | fila / fuente real | veredicto |
|---|---|---|---|---|
| DEC-01 | 1 ESP32-S3 por kit, no por sensor | No | informe:747 | REGISTRADA |
| DEC-02 | sensor→ctrl cableado | No | informe:750 | REGISTRADA |
| DEC-03 | única excepción wireless: WN-FENCE | No | informe:753 | REGISTRADA |
| DEC-04 | tags iBeacon VRLA pasivos | No | informe:757 | REGISTRADA |
| DEC-05 | ctrl→hub Ethernet Cat6 + MQTT | No | informe:761 | REGISTRADA |
| DEC-06 | hub→NOC backhail + LTE-M failover | No | informe:765 | REGISTRADA |
| DEC-07 | protección -48 VDC obligatoria | No | informe:769 | REGISTRADA |
| DEC-08 | MPU-6050 calibrado in-situ | No | informe:773 | REGISTRADA |
| DEC-09 | cables en canaleta | No | informe:777 | REGISTRADA |
| DEC-10 | protoboard solo para fabricación | No | informe:781 | REGISTRADA |
| DEC-11 | estructura docs EJ Devices (8 secciones) | No | wanomi.md:378 | REGISTRADA |
| DEC-12 | fabricación 3 fases A/B/C | No | wanomi.md:379 | REGISTRADA |
| DEC-13 | PCB 2 capas FR-4 Tg≥135 | No | wanomi.md:380 | REGISTRADA |
| DEC-14 | RS485 ≥2.5kV ADuM1201 + slot 2mm | No | wanomi.md:381 | REGISTRADA |
| DEC-15 | switch ETH industrial KSZ8794CNX | No | wanomi.md:382 | REGISTRADA |
| DEC-16 | WN-FENCE ESP32-WROOM-32E deep sleep | No | wanomi.md:383 | REGISTRADA |
| DEC-17 | WN-FENCE <100µA promedio | No | wanomi.md:384 | REGISTRADA |
| DEC-18 | testing flying probe + jig Wanomi | No | wanomi.md:385 | REGISTRADA |
| DEC-19 | archivos KiCad/Altium propiedad Wanomi | No | wanomi.md:386 | REGISTRADA |
| DEC-20 | empaque antiestático + ESD | No | wanomi.md:387 | REGISTRADA |

**Conteo de veredictos:** REGISTRADA = **20** · HUÉRFANA = **0** · CONTRADICE = **0**.

> **HUÉRFANA = 0 → el Paso 1 NO crece por este eje.** Todas las 20 están
> registradas en la bitácora maestra (`docs/wanomi.md` + `informe_instalacion.md`),
> por lo que son cortables de CLAUDE.md sin pérdida. **Matiz que sí importa:**
> contra el archivo LITERAL que nombró el gate (`WanomiRefactor.md`) son 20/20
> ausentes — pero ese archivo es el corpus del *refactor de software* (familia
> DEC-REF/PROC/PRED), no el hogar de las decisiones de *hardware*. Eso NO es
> orfandad; es que hay **dos corpus con dos familias de ID** (→ H3 / CST-CAND-B).
> La pregunta de gobierno "¿cuál es canónico para HW?" queda ABIERTA para Franco.

# ANEXO B3 · Verificación de hechos que se quedan (436–541)

| línea | afirma | comando de verificación | resultado | ¿coincide? |
|---|---|---|---|---|
| 463 | producción = `docker_compose_production.yml` | `docker inspect node --format '{{...config_files}}'` | `/root/IotLocalhost/docker_compose_production.yml` | ✅ |
| 466-467 | tras cambios en routes hay que `docker restart node` (no rebuild) | runtime Args=`[sh -c npm run start]`, code montado por volumen → restart basta para código; rebuild solo si cambia `package.json`/Nuxt | consistente | ✅ (matiz: cambios de front Nuxt sí requieren `docker_nuxt_build.yml`) |
| 508 | `MONGO_DATABASE=ioticos_god_level` | `grep MONGO_DATABASE app/.env` | `iotix` | ❌ **contradice** |
| 530-534 | puertos 1883/8083/18083/8085→8081 | `docker ps` + compose:61-64 | los 4 presentes | ✅ |
| 532 | 8883 MQTT TLS | `docker ps` / compose | **no publicado** | ❌ |
| 536 | colección `emqxauthrules` en base `iotix` | mongo eval iotix | `emqxauthrules` presente en iotix | ✅ |
| 490-521 | set de claves .env | `grep -oE '^KEY=' /.env` y `app/.env` | app/.env: 31 claves (12 no documentadas); /.env: 9 claves | ⚠️ parcial |

**Claves declaradas vs existentes (nombres, sin valores):**
- `/.env` real: `TZ, MONGO_USERNAME, MONGO_PASSWORD, MONGO_EXT_PORT, EMQX_DEFAULT_USER_PASSWORD, EMQX_DEFAULT_APPLICATION_SECRET, EMQX_NODE_SUPERUSER_USER, EMQX_NODE_SUPERUSER_PASSWORD, HOST_IP` → doc l.489-497 coincide salvo que **omite** `EMQX_NODE_SUPERUSER_USER/PASSWORD`.
- `app/.env` real: las 19 documentadas **más** 12 no documentadas (H5): `FORENSIC_HMAC_SECRET, SITE_ID, ENABLE_SIMULATOR_API, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID_DEFAULT, MQTT_USER, MQTT_PASS, MQTT_NOTIFICATION_HOST, MONGODB_URI, TEST_USER_EMAIL, TEST_USER_PWD` (+ `MONGO_DATABASE` con valor divergente).
- DB en uso: **`iotix`** (15 colecciones) · `ioticos_god_level` vacía.
- Compose en uso: **producción** · rebuild vs restart: **restart** basta para código de rutas; rebuild solo para dependencias/Nuxt.

# ANEXO B4 · Contrato de auth (cierra el hueco del item 13)

- `ls app/api/middlewares/` → **`authentication.js`, `scope.js`** (hay un 2º middleware, `scope.js`, no mencionado en CLAUDE.md).
- El middleware lee el token con **`req.get('token')`** en **`app/api/middlewares/authentication.js:6`** — header exacto: **`token`** (case-insensitive por `req.get`), NO `Authorization: Bearer`. Confirma la convención de CLAUDE.md:301-305.
- Detalle vivo: los grants se releen de DB en cada request (`User.findById(...).select('grants')`, l.~22), no del JWT.
- Aparte, 3 webhooks comparan `req.headers.token` contra `EMQX_API_TOKEN` (`webhooks.js:90,136,164`) — es otro contrato de header `token`, distinto (token de EMQX, no JWT).

# ANEXO B5 · ESP8266

- `./ESP8266/` **existe** (include, lib, src, test, platformio.ini, test_mqtt.py).
- Referencias vivas: **solo autorreferencias** dentro de `ESP8266/` (`.vscode/c_cpp_properties.json`, `lib/pubsubclient-master/`). **Cero** referencias desde `app/`, compose o cualquier `.js`/`.yml` del backend.
- Corpus refactor: **ausente** de `WanomiRefactor.md`. En CLAUDE.md aparece como firmware "propio" de Fase 1/2 (histórico).
- Evidencia ⇒ **legado**. CLAUDE.md:288-289 aclara que el firmware de Fase 4 corre en **ESP32-S3** en archivos nuevos (pese al nombre de carpeta `ESP8266/`). Decisión de cortar/preservar = **Área 3** (no de este recon).

# ANEXO B6 · Costuras detectadas (formato plantillas/costura.md, estado NO VERIFICADO)

> No consumen ID del allocator (eso es Paso 2). Etiquetadas CST-CAND-* como candidatas.

### CST-CAND-A · Config de app → base MongoDB real
| Campo | Contenido |
|---|---|
| Costura | app/.env (`MONGODB_URI`/`MONGO_DATABASE`) → MongoDB en uso |
| Qué cruza | qué base consulta el proceso node en runtime |
| Cómo es | app/.env dice `iotix`; CLAUDE.md:508 dice `ioticos_god_level`; DB `iotix` tiene 15 colls, `ioticos_god_level` vacía |
| Verificación | `grep MONGO_DATABASE app/.env`→iotix · mongo eval getCollectionNames · corrida: 2026-08-03 (parcial: falta confirmar conexión viva del proceso) |
| Cómo debería ser | (VACÍO — no hay decisión firmada sobre el nombre canónico de la DB) |
| Gobernada por | (ninguna) |
| Consecuencia del desvío | doc induce a apuntar a una DB vacía; nuevo dev/instalador rompe la app |
| Estado | NO VERIFICADO |
| Bloquea | 1.c (doc de arquitectura), instalación limpia |
| Sirve al pilar | ninguno |

### CST-CAND-B · Bitácora HW (docs/wanomi.md) → Corpus refactor (WanomiRefactor.md)
| Campo | Contenido |
|---|---|
| Costura | docs/wanomi.md + informe (DEC-NN) → docsRefactor/WanomiRefactor.md (DEC-REF/PROC/PRED) |
| Qué cruza | dónde vive la decisión canónica según su tipo (hardware vs software-refactor) |
| Cómo es | dos archivos, dos familias de ID sin puente explícito; las 20 DEC de HW no están en el corpus refactor |
| Verificación | greps DEC-01..20 en ambos archivos · corrida: 2026-08-03 |
| Cómo debería ser | (VACÍO — no hay decisión firmada de cuál corpus es canónico para HW) |
| Gobernada por | (ninguna) |
| Consecuencia del desvío | ambigüedad de gobierno; una decisión puede "existir" en un corpus y no en el otro |
| Estado | NO VERIFICADO |
| Bloquea | reconciliación del Paso 1; pregunta abierta §6.1 |
| Sirve al pilar | ninguno |

### CST-CAND-C · Doc de puertos EMQX → listeners publicados
| Campo | Contenido |
|---|---|
| Costura | CLAUDE.md (tabla de puertos) → EMQX publicado en compose |
| Qué cruza | qué puertos EMQX están realmente accesibles |
| Cómo es | doc lista 8883 (TLS); compose productivo no lo publica |
| Verificación | `docker ps` + `grep 8883 docker_compose_production.yml` (ausente) · corrida: 2026-08-03 (falta: listener interno de EMQX) |
| Cómo debería ser | (VACÍO — no hay decisión firmada sobre si TLS debe estar activo) |
| Gobernada por | (ninguna) |
| Consecuencia del desvío | quien confíe en la doc intenta TLS a un puerto cerrado |
| Estado | NO VERIFICADO |
| Bloquea | — |
| Sirve al pilar | ninguno |

### CST-CAND-D · Componentes documentados → contenedores vivos
| Campo | Contenido |
|---|---|
| Costura | CLAUDE.md "3 componentes" → contenedores en ejecución |
| Qué cruza | inventario real de servicios del sistema |
| Cómo es | doc describe 3 (infra/app/firmware); corren 4 (mongo, emqx, node, **wanomi-edge**/edge-engine) |
| Verificación | `docker ps` (4 contenedores) · `ls -d edge-engine/` · `docker inspect wanomi-edge` · corrida: 2026-08-03 |
| Cómo debería ser | (VACÍO — no hay decisión firmada sobre documentar edge-engine) |
| Gobernada por | (ninguna) |
| Consecuencia del desvío | edge-engine (componente vivo Up 29h) es invisible para quien lee solo CLAUDE.md |
| Estado | NO VERIFICADO |
| Bloquea | 1.c (doc de arquitectura), pregunta abierta §6.3 |
| Sirve al pilar | anticipación |
