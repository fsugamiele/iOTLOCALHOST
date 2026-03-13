# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Descripción del Proyecto

**IoTicos GL** (God Level) es una plataforma IoT self-hosted que permite gestionar dispositivos, visualizar datos de sensores en tiempo real y configurar alarmas. Fue desarrollada en el curso IoT Bootcamp God Level por IoTicos.org.

La plataforma está compuesta por tres componentes principales:

1. **Infraestructura de servicios** — Docker Compose (MongoDB + EMQX MQTT broker)
2. **Aplicación web** (`./app/`) — Nuxt 2 (SPA) + Express API, en repositorio separado
3. **Firmware ESP8266** (`./ESP8266/`) — Arduino/PlatformIO para microcontroladores

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
```

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
