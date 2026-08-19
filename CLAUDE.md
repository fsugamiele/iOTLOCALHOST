# CLAUDE.md — Wanomi 3.0

## 1 · Qué es Wanomi 3.0
Plataforma IoT self-hosted para monitoreo de sites de telecomunicaciones,
heredera de IoTicos GL. En piloto con **Claro Argentina (NEA)**.

El pilar del producto es **anticipar y recomendar una acción**, no mostrar
datos. El pitch está anclado en dolor medible del operador (DEC-GTM-2): truck
rolls evitables, sites caídos por tanque vacío, y la cascada de energía
(corte de red → ATS → grupo → rectificador) leída como un evento de sitio y
no como alarmas sueltas. Seguridad física y robo de combustible son capacidad
latente del diseño, no el claim principal.

Dos modos de captura: **Connect** (leer el equipo que ya está en el sitio) y
**Sense** (medir los puntos ciegos con sensor propio).

Cadena: telemetría → EMQX → motor de reglas por site → notificación
(dashboard NOC · Telegram · evento al NOC) + persistencia en Mongo.

## 2 · Los 4 componentes vivos
1. **Infra Docker** — MongoDB + EMQX (broker MQTT). `docker_compose_production.yml`.
2. **App web + API** — Nuxt 2 (SPA) + Express como serverMiddleware, mismo proceso `node`.
3. **edge-engine** — motor de reglas/inferencia por site (contenedor `wanomi-edge`,
   corre `node /home/edge/edge-engine/index.js`). Es donde vive el motor.
4. **Firmware** — ESP32-S3 (línea telco). [ESP8266 = legado, ver §6.]

## 3 · Dónde vive el gobierno (punteros — no se copia contenido)
- Decisiones del refactor de software → `docsRefactor/WanomiRefactor.md` (familias DEC-REF / DEC-PROC / DEC-PRED).
- Bitácora maestra + estado + DEC-11..20 (fabricación PCB) → `docs/wanomi.md`.
- Decisiones de instalación DEC-01..10 → `docs/informe_instalacion.md`.
- Specs de fabricación PCB con netlist → `docs/pcb/{SEC,GEN,H1,FENCE}.md`.

> Dos corpus, sin migración: cada uno gobierna su dominio (software-refactor vs
> hardware/instalación). Se apunta, no se duplica.

## 4 · Hechos de entorno VERIFICADOS (2026-08-04)
- **Base MongoDB en uso: `iotix`** (15 colecciones). `ioticos_god_level` está VACÍA — no usar.
- **Compose en producción:** `docker_compose_production.yml` (contenedores: mongo, emqx, node, wanomi-edge). `docker restart node` recarga código de `api/routes/*.js`; cambios de front Nuxt requieren `docker_nuxt_build.yml`; rebuild de imagen solo al cambiar dependencias.
- **Puertos EMQX publicados:** 1883 (MQTT), 8083 (WS), 8085->8081 (REST API v4), 18083 (dashboard). **8883 (TLS) NO está publicado.**
- **Auth:** el middleware `checkAuth` lee el JWT del header **`token`** (NO `Authorization: Bearer`) — `app/api/middlewares/authentication.js:6` (`req.get('token')`). Los grants se releen de DB en cada request. Hay **2 middlewares**: `authentication.js` (JWT) y `scope.js` (RBAC).
- **Patrón POST:** payload envuelto en clave nombrada (`req.body.newDevice`, `newSite`, `newRule`, `newZone`), no objeto plano.
- **Patrón DELETE/filtros:** identificadores por `req.query` (`dId`, `siteCode`), no `req.body`.
- **Dos archivos `.env`:** `/.env` (infra Docker) y `app/.env` (app node, cargado por dotenv). Agregar una variable = actualizar el `.env` correcto + reiniciar el contenedor que la consume.
- **installer.txt (NO DECIDIDO):** no hay decisión firmada de mantener `installer.txt` sincronizado con `app/.env`. Único antecedente: `docs/wanomi.md:339` sumó `FORENSIC_HMAC_SECRET` a ambos. Hoy `installer.txt` y `app/.env` DIVERGEN en 16 claves. Tratar como punto ciego hasta que haya decisión.
- **Variables de `app/.env` (por NOMBRE, jamás valor):** API_PORT, APP_PORT, WEBHOOKS_HOST, MONGO_USERNAME, MONGO_PASSWORD, MONGO_HOST, MONGO_PORT, MONGO_DATABASE, MONGODB_URI, EMQX_DEFAULT_APPLICATION_SECRET, EMQX_NODE_SUPERUSER_USER, EMQX_NODE_SUPERUSER_PASSWORD, EMQX_API_HOST, EMQX_API_TOKEN, EMQX_RESOURCES_DELAY, JWT_SECRET, FORENSIC_HMAC_SECRET, AXIOS_BASE_URL, MQTT_PREFIX, MQTT_HOST, MQTT_PORT, MQTT_USER, MQTT_PASS, MQTT_NOTIFICATION_HOST, SSLREDIRECT, SITE_ID, ENABLE_SIMULATOR_API, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID_DEFAULT, TEST_USER_EMAIL, TEST_USER_PWD.
- **Chequear presencia de una var SIN filtrar su valor:** `[ -n "$VAR" ] && echo "$K=SET" || echo "$K=UNSET"`. NUNCA `${VAR:+SET}${VAR:-UNSET}` — esa construcción imprime el valor cuando la var está definida.
- **Importar modelos desde un script `node` standalone:** `@babel/register` + `@babel/preset-env` (NO `@nuxt/babel-preset-app`, falla por polyfills core-js) + `NODE_PATH=<app>/node_modules` para resolver dotenv/modelos (registrado en `docs/wanomi.md:1903-1904`). Además la mayoría de modelos son `export default` → `require(...).default`, pero `rule_pack.js` y `rule_definition.js` son `module.exports` → sin `.default`. El seed F3 (`tools/seed_rulepacks_f3/seed.js`) esquiva todo esto: siembra por **HTTP** contra la API con un JWT firmado con `JWT_SECRET`, sin importar modelos.
- **Alcance de rotación de `JWT_SECRET`:** invalida a la vez los tokens de la app node y del seed F3 (ambos firman/verifican con él). El edge-engine NO usa `JWT_SECRET` (verificado 2026-08-04: usa MONGODB_URI, MQTT_*, SITE_ID, TELEGRAM_*).
- Estado funcional por capacidad (VIVO / IMPLEMENTADO / PARCIAL / SOLO-DISEÑO):
  `docsRefactor/harness/recon/funcionalidades.md` (tabla F10). Acá no se copia.

## 5 · Reglas duras del método (se cita la fila del corpus, no su contenido)
- Implementar sobre dirección firmada ≠ sobre especificación → `WanomiRefactor.md` · **DEC-PROC-6**.
- Pregunta que la spec no contesta ⇒ frena el bloque y vuelve a diseño → **DEC-PROC-6** + candado §0 de `plantillas/spec.md`.
- Procedencia de cada pieza: ¿configurable o hardcodeada? Toda "hardcodeada" es hallazgo estructural → **DEC-PROC-3**.
- Verificar contra el path productivo real, no un atajo (`insertOne` ≠ `.save()`) → **DEC-PROC-5**.
- No predecir donde no hay evidencia → **DEC-PRED-1**.
- Cierre de sesión: bitácora → corpus → versión → commit → push → verificación con `tools/apertura.sh` → **DEC-PROC-8**.

> El contenido de cada regla vive en el corpus. Acá solo el puntero: si se copia,
> se pudre y termina contradiciendo la fuente.

## 6 · Legado
- **ESP8266:** firmware propio de fases previas. Directorio `./ESP8266/` conservado, SIN uso desde `app/` ni compose. El firmware telco corre en ESP32-S3 (archivos nuevos). No borrar.
- **dashboard-admin:** `app/pages/dashboard-admin.vue` (+ build en `app/dist/`). Referido en WanomiRefactor.md.
- **Colecciones legacy en `iotix`:** las que el mapa de costuras marque en Paso 2.

## 7 · CANDADO
Este archivo NO contiene arquitectura, ni estado actual, ni changelog.
Arquitectura → mapa de costuras. Estado → docs/wanomi.md.
Decisiones → WanomiRefactor.md. Si algo de eso aparece acá, sobra.

---

## Arquitectura de la Aplicación (`./app/`) — ⏸ PENDIENTE DE MIGRAR AL MAPA DE COSTURAS (Paso 2)

> Bloque conservado VERBATIM del CLAUDE.md previo al reemplazo (decisión C1.8):
> describe la arquitectura y por eso viola el CANDADO de §7 — se conserva
> transitoriamente porque el mapa de costuras todavía no existe. Migrarlo =
> CORTAR estas líneas. El original íntegro vive en git history (commit previo
> al reemplazo) y está citado en el recon 338db91.
> Advertencia: el contenido es del archivo viejo y NO fue actualizado — por
> ejemplo menciona ESP8266 donde §6 declara que el firmware telco es ESP32-S3.

Stack: **Nuxt 2** (SSR desactivado, modo SPA) + **Express** como serverMiddleware en el mismo proceso Node 14.

### API (Express) — `app/api/`

El servidor Express es montado por Nuxt como `serverMiddleware` en `/api`. El punto de entrada es `app/api/index.js`, que conecta a MongoDB y registra todas las rutas.

**Rutas disponibles:**

| Archivo | Descripción |
|---|---|
| `routes/users.js` | Registro, login, JWT |
| `routes/devices.js` | CRUD de dispositivos, saver rules, alarm rules |
| `routes/templates.js` | CRUD de templates (definen variables/widgets del dispositivo) |
| `routes/alarms.js` | CRUD de reglas de alarma (se crean en EMQX vía API) |
| `routes/webhooks.js` | Webhooks llamados por EMQX + endpoint de credenciales para dispositivos |
| `routes/emqxapi.js` | Gestión de recursos webhook en EMQX al arrancar |
| `routes/dataprovider.js` | Consulta de datos históricos almacenados |

**Modelos Mongoose** (`app/api/models/`): `user`, `device`, `template`, `data`, `emqx_auth`, `emqx_saver_rule`, `emqx_alarm_rule`, `notifications`.

**Autenticación:** JWT via middleware `app/api/middlewares/authentication.js` (`checkAuth`). El secret se lee de `process.env.JWT_SECRET`.

### Frontend (Nuxt/Vue) — `app/pages/`

SPA con las siguientes páginas: `login`, `register`, `dashboard`, `devices`, `templates`, `alarms`.

El frontend se conecta al broker MQTT directamente desde el browser vía WebSocket (`mqtt.js`), usando las variables de entorno `MQTT_PREFIX`, `MQTT_HOST`, `MQTT_PORT` expuestas en `nuxt.config.js`.

### Flujo de arranque de Node

1. Nuxt inicia Express como serverMiddleware
2. Docker espera health checks de mongo y emqx antes de iniciar el contenedor node
3. Express conecta a MongoDB
4. Al conectar, ejecuta `await global.check_mqtt_superuser()` — crea el superusuario MQTT en la colección `emqxauthrules` si no existe
5. Una vez que el superusuario está garantizado, llama `global.startMqttClient()` (definido en `routes/webhooks.js`)
6. Después de `EMQX_RESOURCES_DELAY` ms, `emqxapi.js` verifica que existan exactamente 2 recursos webhook en EMQX (`saver-webhook` y `alarm-webhook`). Si no existen los crea; si hay un número incorrecto, lanza advertencia en loop hasta corrección manual.

### Esquema de tópicos MQTT

```
{userId}/{dId}/{variable}/sdata    → dispositivo publica datos al broker
{userId}/{dId}/{variable}/actdata  → plataforma envía comandos al dispositivo
{userId}/dummy-did/dummy-var/notif → plataforma envía notificaciones de alarma
```

El payload de `sdata` sigue el formato: `{ "value": <número>, "save": 0|1 }`. EMQX filtra los mensajes con `save=1` y los reenvía vía webhook al endpoint `/api/saver-webhook` para persistirlos en MongoDB.

### Integración EMQX ↔ Node

EMQX llama a la app Node mediante dos webhooks (configurados como "recursos" en EMQX Rules Engine):
- `POST /api/saver-webhook` — guarda datos en la colección `data`
- `POST /api/alarm-webhook` — procesa alarmas y envía notificaciones MQTT

Ambos endpoints validan el header `token` contra `EMQX_API_TOKEN`.

### Credenciales de dispositivos

Los dispositivos físicos (ESP8266) obtienen sus credenciales MQTT haciendo `POST /api/getdevicecredentials` con `dId` y `password`. La respuesta incluye username/password MQTT, el tópico raíz y la lista de variables definidas en el template asignado al dispositivo.

---

