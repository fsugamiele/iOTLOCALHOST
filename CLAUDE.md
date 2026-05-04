# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Descripción del Proyecto

**IoTicos GL** (God Level) es una plataforma IoT self-hosted que permite gestionar dispositivos, visualizar datos de sensores en tiempo real y configurar alarmas. Fue desarrollada en el curso IoT Bootcamp God Level por IoTicos.org.

La plataforma está compuesta por tres componentes principales:

1. **Infraestructura de servicios** — Docker Compose (MongoDB + EMQX MQTT broker)
2. **Aplicación web** (`./app/`) — Nuxt 2 (SPA) + Express API, en repositorio separado
3. **Firmware ESP8266** (`./ESP8266/`) — Arduino/PlatformIO para microcontroladores

---

## Ramas Git

| Rama | Descripción |
|---|---|
| `master` | Código estable en producción — base de referencia |
| `feature/wifi-ap-provisioning` | Fase 1 del roadmap: WiFi AP Provisioning para ESP8266 (mergeado) |
| `feature/tasmota-esphome-support` | Fase 2 del roadmap: soporte Tasmota / ESPHome |

> Para volver al estado estable: `git checkout master`
> Todo el desarrollo de la Fase 1 va en `feature/wifi-ap-provisioning`. Merge a `master` cuando esté probado.

---

## Estado Actual del Desarrollo

**Última actualización:** 2026-04-04

### Cambios Recientes Implementados ✅

#### Sistema de Reglas - TriggerTime Optimización
- **Frontend (`rules.vue`):** Implementado selector de tiempo H:M:S con conversión automática a segundos
- **Backend (`rules.js`):**
  - Sincronización automática de `variableSendFreq` con `triggerTime * 60` segundos
  - Sistema de backup/restore de frecuencias originales en templates
  - Notificación MQTT de cambios de configuración a dispositivos
  - Validación `triggerTime >= 1 segundo` agregada
- **Webhooks (`webhooks.js`):**
  - Optimización de cooldown: `triggerTime * 900` (90% para absorber jitter)
  - Debug logs disponibles para troubleshooting de timing

#### Widgets - Visualización en Tiempo Real
- **Frontend (`default.vue`):**
  - Corregido `$nuxt.$emit` → `this.$nuxt.$emit` para mensajes sdata/actdata
  - Corregido `$nuxt.$on("mqtt-sender")` → `this.$nuxt.$on(...)` para consistencia
  - La referencia global `$nuxt` y `this.$nuxt` no resolvían al mismo bus de eventos en arrow callbacks; usando `this.$nuxt` garantiza consistencia
- **Frontend (`Rtnumberchart.vue`):**
  - Watcher corregido: solo deregistra `oldTopic` si existe (igual que `Iotswitch.vue`)
  - Evita deregistrar listener vacío `"/sdata"` en primera inicialización

#### Firmware ESP8266 - Actuador / Relé
- **`ESP8266/src/main.cpp` — `process_incoming_msg()`:**
  - **Bug:** `DynamicJsonDocument doc` se declaraba dentro del bloque `if` y se destruía antes de llamar a `process_actuactors()`. Si ArduinoJson almacenaba referencia en lugar de copia profunda, `["last"]["value"]` leía memoria liberada → null → `isNull()` = true → `digitalWrite` nunca ejecutaba → relé no respondía físicamente.
  - **Fix:** Copiar campos directamente al `mqtt_data_doc` (igual que `process_sensors()`):
    ```cpp
    mqtt_data_doc["variables"][i]["last"]["value"] = doc["value"];
    mqtt_data_doc["variables"][i]["last"]["save"]  = doc["save"];
    ```
- **`process_actuactors()`:**
  - Cambiado `(bool)ledCmd` → `ledCmd.as<int>() != 0` para evitar ambigüedades de conversión entre versiones de ArduinoJson
  - Nota: el formato `1`/`0` del backend es correcto (en C++ `(bool)1 = true`), el bug no era de formato sino de referencia colgante

#### Sistema de Alarmas - Unificación de Interfaz
- **Frontend (`alarms.vue`):**
  - Implementado selector H:M:S idéntico al de reglas
  - Conversión automática a segundos con preview en tiempo real
  - Validación mejorada del tiempo mínimo (1 segundo)
  - Etiqueta de tabla actualizada a "Verificación (seg)"
- **Backend (`alarms.js`):**
  - Validación `triggerTime >= 1 segundo` agregada
  - Consistencia con sistema de reglas

### Funcionalidades Completadas ✅

#### Configuración de Reglas y Alarmas
- **Estado:** Completado
- **Características:**
  - Interfaz unificada H:M:S para ambos sistemas
  - Validaciones consistentes frontend/backend
  - Sistema de sincronización de frecuencias funcionando
  - Cooldown optimizado para mejor rendimiento

#### WiFi AP Provisioning — Fase 1
- **Estado:** Completado ✅ (mergeado a master 2026-04-05)
- **Características:**
  - ESP8266 arranca en modo AP `Wanomi-Config-XXXXXX` si no tiene config en EEPROM
  - HTTP server en `192.168.4.1` con endpoint `POST /provision` + CORS
  - Config persistida en EEPROM con magic number `"WANOMI"` como validación
  - Validación robusta: rechaza campos vacíos, strings `"null"`, y auto-limpia EEPROM si config inválida
  - Backend auto-genera `dId` (8 chars) y `password` (12 chars), los retorna en la respuesta
  - Wizard de 3 pasos en `devices.vue`: credenciales → WiFi config → envío con preview del payload
  - Botón de provisioning por dispositivo en la tabla (permite re-provisionar)

#### Soporte Tasmota / ESPHome — Fase 2
- **Estado:** Completado ✅ (mergeado a master 2026-04-05)
- **Características:**
  - Bridge MQTT Node.js (`tasmota_bridge.js`): suscribe `tele/+/SENSOR`, `stat/+/POWER`, `+/+/+/actdata`
  - Sensores: extrae valores por `tasmotaPath` (dot-notation, ej. `DHT11.Temperature`) y republica a formato plataforma
  - Actuadores: traduce `actdata` de la plataforma a `cmnd/{tasmotaName}/POWER ON/OFF`
  - Estado de relay: `stat/POWER` → `sdata` con valor 1/0
  - Credenciales EMQX auto-generadas al crear el device (`username=tasmotaName`, topics permitidos por ACL)
  - Modal de MQTT credentials en `devices.vue` para Tasmota devices
  - Campo `tasmotaPath` opcional en todos los widgets del template editor
  - Cache en memoria (60s TTL) para evitar queries DB en cada mensaje
  - Simulador `tools/tasmota_simulator.js` para testing sin hardware real
- **Bugs corregidos durante testing:**
  - `tasmotaPath.trim()` en el bridge — espacios accidentales rompían la resolución de paths
  - `tasmotaName.trim()` en `POST /device` — espacios generaban topics MQTT inválidos
  - `findOneAndUpdate(upsert)` para EmqxAuthRule — evita duplicados al recrear device con mismo tasmotaName
  - Cache-bust en `GET /template` (`?_t=Date.now()`) + `await getTemplates()` — el browser devolvía 304 stale después de guardar un template

### Próximos Pasos 📋
1. Fase 3 — Bridge Zigbee2MQTT (ver Roadmap)

### Problemas Conocidos ⚠️
- Ninguno reportado actualmente

### Archivos Modificados Recientemente (Fase 2)
- `app/api/models/device.js` - agregados campos `firmwareType` (default "wanomi") y `tasmotaName`
- `app/api/routes/tasmota_bridge.js` - NUEVO: bridge MQTT Tasmota↔Plataforma (suscribe tele/+/SENSOR, stat/+/POWER, +/+/+/actdata)
- `app/api/routes/webhooks.js` - llama `global.startTasmotaBridge(client)` al conectar MQTT
- `app/api/index.js` - require tasmota_bridge para registrar el global
- `app/api/routes/devices.js` - POST /device maneja firmwareType tasmota: crea EmqxAuthRule con publish tele/#/stat/#, retorna mqttUsername+mqttPassword
- `app/pages/devices.vue` - selector firmwareType, campo tasmotaName, modal MQTT credentials para Tasmota, badge de tipo en tabla
- `app/pages/templates.vue` - campo tasmotaPath opcional en todos los widget forms
- `tools/tasmota_simulator.js` - NUEVO: simulador Tasmota para testing sin hardware real

### Flujo Tasmota (Fase 2)
```
1. Usuario crea device con firmwareType=tasmota, tasmotaName="sonoff_01"
2. Backend genera dId, password, crea EmqxAuthRule (username=sonoff_01)
3. Frontend muestra modal con: broker, port 1883, username, password, topic
4. Usuario configura Tasmota → Configuration → MQTT con esas credenciales
5. Tasmota publica tele/sonoff_01/SENSOR → bridge republica a userId/dId/var/sdata
6. EMQX saver rule guarda datos históricos normalmente
7. Frontend envía actdata → bridge traduce a cmnd/sonoff_01/POWER ON/OFF
```

### Archivos Modificados Recientemente (Fase 1 y anteriores)
- `app/api/routes/rules.js` - triggerTime: effectiveFreq dinámico, sin modificar template
- `app/api/routes/webhooks.js` - getdevicecredentials calcula freq efectivo por reglas activas
- `app/api/routes/users.js` - eliminado setTimeout que rotaba credenciales MQTT
- `app/layouts/default.vue` - `this.$nuxt` consistente; reconnect sin rotación; error handler con debounce; keepalive 30s; indicador MQTT en navbar
- `app/store/index.js` - estado `mqttConnected` agregado
- `app/components/Layout/DashboardNavbar.vue` - indicador visual de conexión MQTT
- `app/components/Widgets/Rtnumberchart.vue` - watcher mejorado
- `app/pages/devices.vue` - wizard de provisioning completo
- `app/api/routes/devices.js` - auto-genera dId y password, los retorna en respuesta
- `ESP8266/src/main.cpp` - modo AP provisioning + EEPROM config + modo normal refactorizado
- `ESP8266/platformio.ini` - PubSubClient agregado a lib_deps
- `ESP8266/include/config.h.example` - solo documentación, credenciales ya no van aquí

---

## Roadmap de Expansión — Multi-Dispositivo

### Mapa de Compatibilidad

| Tipo de dispositivo | Protocolo nativo | Integración con Wanomi | Esfuerzo |
|---|---|---|---|
| ESP8266/ESP32 custom | MQTT (firmware propio) | Nativo | Ya implementado |
| Tasmota / ESPHome | MQTT (open source) | Casi nativo — mapear topics | Bajo |
| Sonoff DIY mode | HTTP local + MQTT | Flashear Tasmota o API local | Bajo/Medio |
| Zigbee (IKEA, Aqara, etc.) | Zigbee | Via Zigbee2MQTT como puente → EMQX | Medio |
| Tuya / Smart Life | Cloud + propietario | Via tinytuya (local) o MQTT bridge | Medio/Alto |
| Philips Hue | REST API local + Zigbee | Bridge HTTP → MQTT | Medio |
| Matter devices | Matter/Thread | Bridge Matter → MQTT | Alto (futuro) |

### Fases de Implementación

#### Fase 1 — WiFi AP Provisioning para firmware propio ✅ COMPLETADO
Permite agregar y configurar dispositivos ESP8266 (firmware Wanomi) directamente desde la plataforma sin editar `config.h`.

**Componentes a modificar:**
- `ESP8266/src/main.cpp` — modo AP al iniciar sin config; HTTP server en `192.168.4.1`; endpoint `POST /provision`; guardar config en NVS (Preferences) en lugar de `config.h`
- `app/api/routes/devices.js` — auto-generar `dId` y `password` al crear device
- `app/pages/devices.vue` — wizard de 2 pasos: crear device → provisionar (envía WiFi SSID/pass + dId + devicePass + serverIP al dispositivo vía HTTP)

**Flujo completo:**
```
ESP8266 sin config → AP mode "Wanomi-Config-XXXX"
PC conecta a esa red WiFi
Platform wizard → POST http://192.168.4.1/provision { ssid, wifiPass, dId, devicePass, serverIP }
ESP8266 guarda en NVS → reinicia → conecta WiFi → llama /getdevicecredentials → conecta MQTT
```

#### Fase 2 — Soporte Tasmota / ESPHome ✅ COMPLETADO
Dispositivos que ya hablan MQTT. Requiere:
- Template especial tipo "Tasmota" que mapea topics `tele/+/SENSOR`, `stat/+/RESULT`
- Auto-discovery por suscripción a `tele/+/LWT` en EMQX
- Mínimo cambio en firmware (ninguno — es firmware de terceros)

#### Fase 3 — Bridge Zigbee2MQTT
Agrega soporte para cientos de dispositivos Zigbee (sensores, luces, enchufes).
- Agregar contenedor `zigbee2mqtt` al `docker_compose_production.yml`
- Zigbee2MQTT publica automáticamente en EMQX
- Template tipo "Zigbee" para mapear sus topics estándar
- Requiere hardware: coordinador Zigbee USB (ej. CC2531, Sonoff Zigbee Dongle)

#### Fase 4 — API Bridges para marcas propietarias
- **Tuya/Smart Life**: integración via `tinytuya` (Python) como microservicio → publica en MQTT
- **Philips Hue**: bridge HTTP→MQTT usando la API REST local del hub Hue
- Cada bridge corre como contenedor adicional en Docker Compose

---

## Fase 4 — Soporte Telco (piloto Claro SA)

### Contexto del proyecto

Wanomi está implementando un piloto con **Claro Argentina** para modernizar
sites de telecomunicaciones (BTS celulares, shelters). El alcance del piloto
cubre dos dolores principales del operador:

1. **Anti-robo e intrusión** — detección de apertura de puertas, presencia,
   movimiento del cerco perimetral, vibración en torres, pérdida de
   continuidad de tierra, robo de baterías.
2. **Monitoreo predictivo de grupo electrógeno** — lectura del controlador
   DSE7320/ComAp por MODBUS RTU, vibración del motor, nivel de combustible,
   corriente de arranque, temperatura, anti-sifoneo.

### Productos en pipeline (línea Telco)

| Dispositivo | Función | MCU/SBC | Estado |
|---|---|---|---|
| **WN-SITE-SEC** | Controlador de seguridad del shelter | ESP32-S3 | PCB en cotización con EJ Devices |
| **WN-SITE-GEN** | Controlador de monitoreo del grupo electrógeno | ESP32-S3 | PCB en cotización con EJ Devices |
| **WN-H1-TELCO** | Hub endurecido DIN 4U para shelter | Orange Pi Zero 3 + Docker | PCB en cotización con EJ Devices |
| **WN-FENCE** | Sub-nodo solar inalámbrico para cerco | ESP32-WROOM-32E (deep sleep) | PCB en cotización con EJ Devices |

### Arquitectura de instalación en site

**1 controlador por kit, NO 1 por sensor.** Cada ESP32-S3 agrupa todos los
sensores de su kit. Comunicación sensor↔controlador es CABLEADA (I²C, 1-Wire,
UART, contacto seco) excepto en dos casos específicos:

- **Cerco perimetral**: ADXL345 va en sub-nodo WN-FENCE con ESP-NOW al
  WN-SITE-SEC (sin AP intermedio). Distancia 100-200 m LOS.
- **Tags de baterías VRLA**: iBeacon BLE 5.0 pasivos (CR2032, 2+ años).

Comunicación controlador→hub: **Ethernet Cat6 + MQTT/TLS**. Hub→NOC: backhaul
existente del site (fibra/microondas) + LTE-M failover (SIM M2M Claro).

### Cambios planificados al codebase (Fase 4)

#### Refactor preparatorio (Fase 4A)

- ✅ Mover `app/api/routes/tasmota_bridge.js` → `app/api/routes/bridges/tasmota.js`
  (commit 42f30ca)
- ⏸ Modularizar `ESP8266/src/main.cpp` — DEFERIDO. Se retoma cuando aparezca
  necesidad concreta (línea comercial/agro/hogar). Para Fase 4E (Telco) no es
  necesario porque el firmware ESP32-S3 va en archivos nuevos.

#### Backend (Fase 4B + 4C)

**Nuevos modelos Mongoose:**
- `app/api/models/site.js` — agrupa devices por site físico telco. Campos:
  `siteCode`, `nombre`, `lat`, `lng`, `direccion`, `tipo` (BTS/shelter/repeater),
  `cellOwner`, `devices: [ObjectId]`.
- `app/api/models/forensic_event.js` — eventos inmutables con HMAC para uso
  judicial. Campos: `siteId`, `deviceId`, `eventKind`, `severity`, `payload`,
  `hash`, `prevHash`, `hmac`, `timestamp`.

**Nuevas rutas:**
- `app/api/routes/sites.js` — CRUD de sites.
- `app/api/routes/forensic.js` — query y export PDF de eventos forenses.
- `app/api/routes/bridges/noc.js` — dispatcher SNMP traps + syslog RFC 5424
  TLS + webhook REST al NetCool de Claro.

**Rutas a extender:**
- `app/api/routes/devices.js` — agregar `siteId`, `iccid`, `imei`, `apn`.
  Sumar `'telco'` al enum de `firmwareType`.
- `app/api/routes/webhooks.js` — hook al forensic service en eventos críticos
  (severity HIGH/CRITICAL).
- `app/api/index.js` — registrar nuevas rutas.

#### Frontend (Fase 4D)

- `app/pages/sites/index.vue` — listado + mapa Leaflet con sites geolocalizados.
- `app/pages/sites/_siteCode.vue` — detalle de site con widgets en tiempo real
  + cadena de eventos forenses con verificación de HMAC visible.

#### Firmware ESP32-S3 (Fase 4E)

- Nuevo target en `ESP8266/platformio.ini`: `esp32-s3-telco` (pese al nombre de
  carpeta `ESP8266/`, el firmware de Fase 4 corre en ESP32-S3).
- `src/sensors_sec.cpp` — drivers ADXL345 + MPU-6050 + QMC5883L + PIR + reed
  switches + PC817 loop tierra + BLE scan tags iBeacon.
- `src/sensors_gen.cpp` — MODBUS RTU master (DSE7320/ComAp) + DS18B20 +
  JSN-SR04T + SCT-013 con TL431 + MPU-6050 con FFT on-edge.
- `src/comms.cpp` — MQTT/TLS sobre Ethernet W5500 (primario) + LTE-M failover
  via Quectel BG95-M3.

### Convenciones del proyecto descubiertas durante implementación

- **Auth header**: el middleware checkAuth lee el JWT del header
  `token` (NO `Authorization: Bearer`). El frontend y los tests deben
  enviarlo así. Verificado en app/api/middlewares/authentication.js
  durante validación de Fase 4C.1.

- **Patrón de body en POST**: los endpoints existentes esperan el
  payload envuelto en una clave nombrada (ej. `req.body.newDevice`,
  `req.body.newSite`), no el objeto plano. Las nuevas rutas siguen
  este patrón.

- **Query params para DELETE y filtros**: los DELETE y endpoints que
  filtran por identificadores usan req.query (no req.body) para
  parámetros como dId, siteCode, force.

- **Configuración de variables de entorno**: el proyecto tiene DOS
  archivos .env distintos:
  - `/.env` en la raíz → variables de infraestructura Docker
    (MongoDB, EMQX dashboard, HOST_IP). Las inyecta docker-compose.
  - `/app/.env` → variables de la aplicación Node (JWT_SECRET,
    FORENSIC_HMAC_SECRET, MQTT_HOST, etc.). Las carga dotenv al
    iniciar el proceso Node.

  Cuando se agrega una variable nueva, hay que actualizar TRES
  lugares: `installer.txt` (template usado en instalación nueva),
  el `.env` correcto según el ámbito de la variable, y reiniciar el
  contenedor que la consume (`docker restart node` para variables
  de app).

### Decisiones de arquitectura registradas (20 decisiones)

Las 20 decisiones técnicas tomadas durante el diseño están documentadas en el
archivo `docs/wanomi.md` del proyecto (bitácora maestra). Decisiones clave:

- DEC-01: 1 ESP32-S3 por kit, no por sensor.
- DEC-02: Sensor↔ctrl cableado (excepto cerco y BLE tags).
- DEC-06: Hub→NOC vía backhaul del site + LTE-M failover.
- DEC-07: Protección -48 VDC obligatoria (polifuse + MOV + TVS + ferrita +
  diodo polaridad).
- DEC-14: WN-SITE-GEN aislamiento RS485 ≥2.5 kV con ADuM1201 + slot 2 mm.
- DEC-19: Archivos KiCad/Altium fuente quedan en propiedad de Wanomi.

### Proveedor de fabricación PCB

**EJ Devices — Desarrollos Electrónicos** (Buenos Aires, Argentina).
Contacto: info@ejdevices.com.ar · +54 11 5102-8347.

Plan de fabricación en 3 fases:
- Fase A: 5 unidades de cada PCB (prototipo) — 4-6 semanas
- Fase B: 25 unidades (pre-producción / piloto Claro 10 sites) — 6-8 semanas
- Fase C: 50-100 unidades (condicional al éxito del piloto)

### Estado actual de la Fase 4

- ✅ Arquitectura de instalación definida (informe 5 especialistas)
- ✅ Documentos de fabricación PCB enviados a EJ Devices (4 docx)
- ✅ Componentes de lead time largo identificados (Quectel, Mean Well, ADuM1201)
- 🔧 EN CURSO: implementación backend + firmware en feature/telco-support
- 📋 PENDIENTE: jig de testing funcional para EJ Devices QC

### Documentación de referencia en el repo

Toda la documentación del proyecto Wanomi (bitácora, arquitectura, specs PCB)
vive en `docs/`. Claude debe leer estos archivos cuando necesite contexto:

- `docs/wanomi.md` — Bitácora maestra (decisiones, log de sesiones, estado).
- `docs/informe_instalacion.md` — Topología completa de instalación en site.
- `docs/pcb/SEC.md`, `GEN.md`, `H1.md`, `FENCE.md` — Specs de fabricación con
  netlist completo (consultar antes de cualquier cambio en el firmware).
- `docs/arquitectura_site.png` — Diagrama visual (consulta humana, no IA).

---

## Arquitectura de la Aplicación (`./app/`)

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

## Comandos de Desarrollo

### App Node.js (`./app/`)

```bash
# Desarrollo local (hot-reload, requiere .env configurado)
npm run dev

# Build de producción (Nuxt)
npm run build

# Iniciar en producción (después del build)
npm run start
```

### Docker Compose — flujo completo

Los tres compose files se ejecutan en orden para evitar saturar servidores pequeños:

```bash
# 1. Instalar dependencias npm (una vez, o al agregar paquetes)
docker-compose -f docker_node_install.yml up

# 2. Build Nuxt (después de cambios en ./app/)
docker-compose -f docker_nuxt_build.yml up

# 3. Lanzar producción: mongo + emqx + node (con -d para correr como servicio)
docker-compose -f docker_compose_production.yml up -d

# IMPORTANTE: después de cambios en código del servidor (api/routes/*.js),
# el contenedor node DEBE reiniciarse para cargar el nuevo código en memoria:
docker restart node
```

> `docker-compose up -d` no reinicia contenedores ya corriendo. El proceso Node carga
> el código en memoria al iniciar — editar el archivo en disco no tiene efecto hasta reiniciar.

`docker-compose.yml` (sin sufijo) levanta solo mongo + emqx — útil para probar el broker sin la app. Requiere `HOST_IP` en el `.env` de servicios (IP del host accesible desde los contenedores).

### Firmware ESP8266 (PlatformIO — `./ESP8266/`)

```bash
pio run                    # Compilar
pio run --target upload    # Compilar y flashear
pio device monitor         # Monitor serial (115200 baud)
```

---

## Variables de Entorno

### `/.env` (servicios Docker)

```
TZ=UTC
MONGO_USERNAME=...
MONGO_PASSWORD=...
MONGO_EXT_PORT=27017
EMQX_DEFAULT_USER_PASSWORD=...       # Password del dashboard EMQX
EMQX_DEFAULT_APPLICATION_SECRET=...  # Secret de la API REST de EMQX
HOST_IP=...                          # IP del host (usado por docker-compose.yml dev)
```

### `/app/.env` (app Node.js)

```
API_PORT=3001
WEBHOOKS_HOST=node          # hostname del contenedor node (para que EMQX llame los webhooks)
MONGO_USERNAME=...
MONGO_PASSWORD=...
MONGO_HOST=mongo
MONGO_PORT=27017
MONGO_DATABASE=ioticos_god_level
EMQX_DEFAULT_APPLICATION_SECRET=...
EMQX_NODE_SUPERUSER_USER=...
EMQX_NODE_SUPERUSER_PASSWORD=...
EMQX_API_HOST=<ip-servidor>          # IP accesible por EMQX y el browser
EMQX_API_TOKEN=...                   # Token secreto para los webhooks
EMQX_RESOURCES_DELAY=30000           # ms de espera antes de verificar recursos EMQX
JWT_SECRET=...                       # Clave secreta para firmar/verificar tokens JWT
APP_PORT=3000
AXIOS_BASE_URL=http://<dominio>:3001/api
MQTT_PREFIX=ws://            # o wss:// con SSL
MQTT_HOST=<ip-o-dominio>
MQTT_PORT=8083               # o 8084 con SSL
SSLREDIRECT=false            # true si hay balanceador SSL (habilita redirect en puerto 3002)
```

---

## EMQX — Puertos y Configuración

| Puerto | Uso |
|---|---|
| `1883` | MQTT TCP |
| `8083` | MQTT sobre WebSocket |
| `8883` | MQTT sobre TLS |
| `18083` | Dashboard web |
| `8085` (→ `8081`) | REST API v4 |

La autenticación EMQX usa MongoDB: colección `emqxauthrules` en la base `iotix`. Campos: `username`, `password` (**sha256** del password plano), `is_superuser`.

Las contraseñas MQTT se hashean con `sha256` antes de guardarse en MongoDB (`crypto.createHash('sha256')`). El password plano se retorna al cliente solo en el momento de creación/renovación. En instalaciones existentes con `plain`, regenerar todas las credenciales al migrar.

---

## Firmware ESP8266 — Configuración

Las credenciales se configuran en `ESP8266/include/config.h` (excluido del repo). Copiar el template y completar los valores:

```bash
cp ESP8266/include/config.h.example ESP8266/include/config.h
```

```cpp
#define WIFI_SSID        "tu_red_wifi"
#define WIFI_PASSWORD    "tu_password_wifi"
#define DEVICE_ID        "id_del_dispositivo"
#define WEBHOOK_PASSWORD "password_del_dispositivo"
#define WEBHOOK_ENDPOINT "http://<ip-servidor>:3001/api/getdevicecredentials"
#define MQTT_SERVER_IP   "<ip-servidor>"
```

Librerías: `ArduinoJson`, `DHT sensor`, `Adafruit GFX`, `Adafruit ST7735/ST7789`. La librería local `IoTicosSplitter` (`ESP8266/lib/IoTicosSplitter/`) divide strings de tópicos MQTT por separador.
