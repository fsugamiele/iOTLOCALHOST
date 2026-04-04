# Wanomi IoT Platform

> Plataforma IoT self-hosted para gestión de dispositivos, visualización de datos en tiempo real y automatización inteligente.

---

## ¿Qué es Wanomi IoT?

**Wanomi IoT** es una plataforma de Internet de las Cosas (IoT) diseñada para ser desplegada en infraestructura propia (*self-hosted*), brindando total control sobre los datos y los dispositivos conectados. Está orientada a entornos domóticos, industriales y educativos donde se requiere conectividad, monitoreo y automatización en tiempo real sin depender de servicios en la nube de terceros.

La plataforma permite conectar microcontroladores (como el ESP8266/ESP32) a través del protocolo MQTT, visualizar los datos de los sensores en dashboards interactivos y definir reglas de automatización que activan actuadores de forma autónoma cuando se cumplen condiciones configuradas por el usuario.

---

## Propósito y Casos de Uso

- **Monitoreo ambiental** — temperatura, humedad, sensación térmica y otras variables físicas en tiempo real.
- **Automatización del hogar** — control de relés, luces, ventiladores y otros actuadores mediante reglas definidas por el usuario.
- **Alertas y notificaciones** — sistema de alarmas configurable que notifica cuando una variable supera un umbral definido.
- **Historial de datos** — almacenamiento persistente de lecturas para análisis y trazabilidad.
- **Multi-dispositivo** — soporte para múltiples dispositivos y templates de sensores/actuadores personalizables.

---

## Arquitectura

La plataforma está compuesta por tres componentes principales que trabajan en conjunto:

```
┌─────────────────────────────────────────────────────────┐
│                     Wanomi IoT Stack                    │
├───────────────┬──────────────────┬──────────────────────┤
│   MongoDB     │   EMQX Broker    │   Node.js App        │
│  (base datos) │  (MQTT + WS)     │  (Nuxt 2 + Express)  │
└───────────────┴──────────────────┴──────────────────────┘
                        ▲  ▼
              ┌─────────────────────┐
              │  Dispositivos IoT   │
              │  ESP8266 / ESP32    │
              └─────────────────────┘
```

| Componente | Tecnología | Función |
|---|---|---|
| Base de datos | MongoDB | Almacena usuarios, dispositivos, templates, datos históricos y reglas |
| Broker MQTT | EMQX v4 | Gestiona la comunicación en tiempo real entre dispositivos y la plataforma |
| Aplicación web | Nuxt 2 (SPA) + Express | Dashboard, API REST, autenticación JWT |
| Firmware | Arduino / PlatformIO | Firmware para ESP8266 con soporte de sensores y actuadores |

---

## Funcionalidades Principales

### Dashboard en Tiempo Real
Widgets configurables que muestran el valor actual de cada sensor con actualización en vivo vía MQTT WebSocket, junto a un gráfico histórico de las últimas lecturas.

### Sistema de Reglas
Define reglas del tipo *"si el sensor X supera el valor Y, activar el actuador Z"*. Cada regla tiene un tiempo de verificación configurable (formato H:M:S). Cuando una regla se activa, el dispositivo recibe el comando de forma instantánea vía MQTT y se registra la activación en el historial de notificaciones.

### Sistema de Alarmas
Alertas configurables con umbrales y condiciones. Las alarmas generan notificaciones en la interfaz web y se almacenan en el historial del usuario.

### Templates de Dispositivos
Los dispositivos se configuran a partir de templates reutilizables que definen las variables (sensores/actuadores), sus widgets de visualización, frecuencias de envío y tipos de datos.

### Actualización Dinámica de Frecuencias
Cuando se crea o modifica una regla, la plataforma notifica al dispositivo en tiempo real vía MQTT para que ajuste su frecuencia de envío de datos sin necesidad de reconectarse.

### Seguridad
- Autenticación de usuarios con JWT
- Credenciales MQTT únicas por dispositivo y por sesión de usuario
- Contraseñas MQTT hasheadas con SHA-256
- ACL por usuario/dispositivo gestionada a través de MongoDB

---

## Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | Nuxt 2, Vue.js, Element UI, Highcharts |
| Backend | Node.js 14, Express (serverMiddleware) |
| Base de datos | MongoDB (Mongoose) |
| Broker MQTT | EMQX v4 |
| Firmware | Arduino, PlatformIO, ArduinoJson, PubSubClient |
| Infraestructura | Docker, Docker Compose |

---

## Requisitos

- Docker y Docker Compose instalados
- Puerto `3000` (app web), `1883` (MQTT TCP), `8083` (MQTT WebSocket), `18083` (EMQX dashboard), `27017` (MongoDB) disponibles
- Servidor Linux (Ubuntu LTS recomendado) o entorno compatible

---

## Instalación Rápida

### 1. Clonar el repositorio

```bash
git clone https://github.com/fsugamiele/iOTLOCALHOST.git
cd iOTLOCALHOST
```

### 2. Configurar variables de entorno

Crear el archivo `.env` en la raíz con la configuración de los servicios Docker:

```env
TZ=UTC
MONGO_USERNAME=usuario
MONGO_PASSWORD=contraseña_segura
MONGO_EXT_PORT=27017
EMQX_DEFAULT_USER_PASSWORD=contraseña_emqx
EMQX_DEFAULT_APPLICATION_SECRET=secret_api_emqx
HOST_IP=<IP_del_servidor>
```

Crear el archivo `app/.env` con la configuración de la aplicación Node.js:

```env
API_PORT=3001
WEBHOOKS_HOST=node
MONGO_USERNAME=usuario
MONGO_PASSWORD=contraseña_segura
MONGO_HOST=mongo
MONGO_PORT=27017
MONGO_DATABASE=ioticos_god_level
EMQX_DEFAULT_APPLICATION_SECRET=secret_api_emqx
EMQX_NODE_SUPERUSER_USER=superuser_mqtt
EMQX_NODE_SUPERUSER_PASSWORD=contraseña_superuser
EMQX_API_HOST=<IP_del_servidor>
EMQX_API_TOKEN=token_secreto_webhooks
EMQX_RESOURCES_DELAY=30000
JWT_SECRET=clave_jwt_segura
APP_PORT=3000
AXIOS_BASE_URL=http://<IP_del_servidor>:3001/api
MQTT_PREFIX=ws://
MQTT_HOST=<IP_del_servidor>
MQTT_PORT=8083
SSLREDIRECT=false
```

### 3. Instalar dependencias Node.js

```bash
docker-compose -f docker_node_install.yml up
```

### 4. Build de producción (Nuxt)

```bash
docker-compose -f docker_nuxt_build.yml up
```

### 5. Lanzar la plataforma

```bash
docker-compose -f docker_compose_production.yml up -d
```

La plataforma estará disponible en `http://<IP_del_servidor>:3000`.

---

## Firmware ESP8266

El firmware incluido en `ESP8266/` está desarrollado con PlatformIO y soporta:

- Conexión WiFi con reconexión automática
- Obtención dinámica de credenciales MQTT desde la plataforma
- Publicación de datos de sensores (DHT11 — temperatura, humedad, sensación térmica)
- Recepción de comandos para actuadores (relé)
- Actualización dinámica de frecuencias de envío vía MQTT
- Display TFT ST7789 con visualización de datos en tiempo real

### Configuración del firmware

```bash
cp ESP8266/include/config.h.example ESP8266/include/config.h
```

Editar `config.h` con las credenciales WiFi y los datos del dispositivo:

```cpp
#define WIFI_SSID        "tu_red_wifi"
#define WIFI_PASSWORD    "tu_password_wifi"
#define DEVICE_ID        "id_del_dispositivo"
#define WEBHOOK_PASSWORD "password_del_dispositivo"
#define WEBHOOK_ENDPOINT "http://<IP_servidor>:3001/api/getdevicecredentials"
#define MQTT_SERVER_IP   "<IP_servidor>"
```

### Compilar y flashear

```bash
pio run --target upload   # Compilar y flashear
pio device monitor        # Monitor serial (115200 baud)
```

---

## Flujo de Trabajo de Desarrollo

Después de modificar código del **servidor** (`app/api/routes/*.js`):
```bash
docker restart node
```

Después de modificar código del **frontend** (`app/pages/*.vue`, `app/components/**`):
```bash
docker-compose -f docker_nuxt_build.yml up
docker restart node
```

> `docker-compose up -d` **no reinicia** contenedores ya en ejecución. El proceso Node carga el código en memoria al iniciar — editar archivos en disco no tiene efecto hasta reiniciar el contenedor.

---

## Puertos EMQX

| Puerto | Protocolo |
|---|---|
| `1883` | MQTT TCP |
| `8083` | MQTT sobre WebSocket |
| `8883` | MQTT sobre TLS |
| `18083` | Dashboard web EMQX |
| `8085` | REST API v4 |

---

## Licencia

Desarrollado por **Wanomi IoT**. Basado en el curso IoT Bootcamp God Level de [IoTicos.org](https://ioticos.org).
