# Wanomi 2.0 — Modelo Conceptual (v0.2)

**Versión**: 0.2 (post-auditoría)
**Fecha**: 2026-05-18
**Estado**: aprobado en sesión #8
**Cambios v0.1 → v0.2**: marca de estado real implementación (✅ / 🟡 / 🔴) según auditoría del repo en feature/telco-support con 28 commits.

---

## Leyenda de estado

| Marca | Significado |
|---|---|
| ✅ | Implementado y funcional en feature/telco-support |
| 🟡 | Parcialmente implementado (backend OK, frontend pendiente o viceversa) |
| 🔴 | No implementado todavía |
| ⚠️ | Implementado pero pendiente revisión funcional |
| 📋 | Decidido en este Doc, requiere implementación nueva |

---

## 1. Filosofía del producto

Wanomi es una **plataforma de automatización operativa reactiva** que orquesta dispositivos IoT para ejecutar acciones físicas, notificaciones inteligentes y trazabilidad forense en respuesta a eventos en el mundo real.

Las tres palabras que definen el producto:

- **Predictivo**: anticipa fallas antes de que ocurran (mantenimiento basado en datos, no en calendario)
- **Preventivo**: monitorea condiciones críticas para evitar pérdidas
- **Reactivo**: cuando algo sucede, el sistema ejecuta acciones físicas inmediatas — no solo notifica

Wanomi NO es:
- Un dashboard de IoT (eso es feature, no producto)
- Un sistema de domótica (mercado dominado por Google, Amazon, Tuya)
- Una plataforma de telemetría pasiva

Wanomi ES:
- Un sistema donde los dispositivos **interactúan entre sí** para formar dispositivos inteligentes que actúan en base a datos
- Una infraestructura **self-hosted** donde los datos del cliente nunca salen de su red
- Un producto fabricado localmente con soporte en el mismo huso horario

### Las 4 patas del valor

| Pata | Estado en feature/telco-support |
|---|---|
| **Disuasión local** (sirena, estrobo, audio en sitio) | 🔴 No implementado |
| **Notificación inteligente** (Telegram con foto+ubicación) | 🔴 No implementado |
| **Acción física automática** (lock, válvula, apagado) | 🔴 No implementado |
| **Trazabilidad forense** (cronología inmutable con HMAC) | ✅ Backend completo, falta frontend |

---

## 2. Arquitectura de hardware

### 2.1. Modelo maestro-esclavo (DEC-HW-1) 📋

Cada sensor individual tiene su propio microcontrolador (ESP). Los sensores comunican con un **maestro** (WN-SEC para seguridad, WN-GEN para generador) que actúa como concentrador y bridge al Hub.

Estado: **decisión de modelo tomada hoy, pendiente implementación hardware**. El simulador actual modela todo en un solo "device" lógico — refactorizar a multi-device en simulator es parte de Sim-3.5.

**Beneficios:**
- Cada sensor es OTA-actualizable individualmente
- Falla aislada
- Reemplazo de unidad sin afectar al resto
- Modular: agregar sensores no requiere rehacer cableado central

### 2.2. Protocolos de comunicación

| Tramo | Protocolo | Estado |
|---|---|---|
| Sensor cercano → Maestro | ESP-NOW | 📋 Decidido, falta firmware |
| Sensor lejano → Maestro | LoRa | 📋 Decidido, falta firmware + hardware SX1278 |
| Maestro → Hub | RS485 | 📋 Decidido, falta MAX3485 + firmware |
| Hub → Backend | WiFi/4G + MQTT | ✅ Infraestructura existente |

### 2.3. Catálogo de dispositivos en Wanomi 2.0

| Modelo | Tipo | Función | Plantilla | Estado |
|---|---|---|---|---|
| **WN-DOOR** | Sensor | Apertura magnética | Seguridad | 🔴 |
| **WN-PIR** | Sensor | Movimiento PIR | Seguridad | 🔴 |
| **WN-COPPER** | Sensor | Magnetómetro cobre | Seguridad | 🔴 |
| **WN-FENCE** | Sensor | Vibración cerco | Seguridad | 🔴 |
| **WN-BLE-TRACK** | Sensor | Beacons BLE baterías | Seguridad | 🔴 |
| **WN-TEMP** | Sensor | Temperatura ambiente | Universal | 🔴 |
| **WN-FUEL** | Sensor | Nivel combustible | Generador | 🔴 |
| **WN-VIBE** | Sensor | FFT vibración predictiva | Generador | 🔴 |
| **WN-VOLT** | Sensor | Tensión AC/DC | Universal | 🔴 |
| **WN-CURRENT** | Sensor | Corriente Hall | Generador | 🔴 |
| **WN-EXHAUST** | Sensor | Termocupla escape | Generador | 🔴 |
| **WN-SEC** | Maestro | Concentrador seguridad | (infraestructura) | 🔴 firmware |
| **WN-GEN** | Maestro | Concentrador generador | (infraestructura) | 🔴 firmware |
| **WN-H1** | Hub | Servidor local | (infraestructura) | ✅ existe |
| **WN-SIREN** | Actuador | Sirena + estrobo + audio | Universal | 🔴 |
| **WN-CAM** | Actuador | ESP32-CAM con flash | Seguridad | 🔴 |
| **WN-LOCK** | Actuador | Electroimán gabinete | Seguridad | 🔴 |
| **WN-AUDIO** | Actuador | Bocina pre-grabada | Seguridad | 🔴 |
| **WN-SW1E** | Actuador | Relay 10A + medición | Universal | ⚠️ existe en doc, falta auditar |

**Nota crítica**: en simulación Sim-3.5, los devices se modelan virtualmente (no hay hardware físico). Los `WN-SIREN`, `WN-CAM`, etc. son virtual devices que el simulador instancia y que aceptan comandos `actdata` MQTT.

---

## 3. Modelo de software (plataforma)

### 3.1. Conceptos centrales

**Plantilla (Template)**
- Es un "diseño" reutilizable de configuración
- Contiene N widgets (uno por sensor o actuador)
- Cada widget declara: tipo, nombre humano, tipo de variable, vínculo al dispositivo (dId)
- Estado: ✅ **modelo Template existe**, 🟡 **falta agregar campos `samplingType` + `samplingParams`**

**Dispositivo (Device)**
- Unidad física individual con un dId único
- Pertenece a un sitio (siteId)
- Vinculado a uno o más widgets de una plantilla
- Tiene credenciales MQTT (username/password)
- Estado: ✅ **modelo Device existe**, ✅ **campos telco agregados (commit 330416c)**, falta auditar qué campos exactos

**Sitio (Site)**
- ✅ **MODELO Site IMPLEMENTADO** (commit 13ec33f)
- Campos auditados: userId, siteCode (unique), nombre, lat/lng, dirección, provincia, localidad, cellOwner, devices[], notes, createdTime
- Enum tipo: `['BTS', 'shelter', 'repeater']`
- ✅ **CRUD ROUTES IMPLEMENTADAS** (commit b93b0ab) en `app/api/routes/sites.js`
- 🔴 **Frontend pages NO existen** — auditoría confirma sin pages/sites o componentes Site

**Regla (Rule)**
- Estado actual: ✅ Modelo simple existe (sensor → notif)
- 🟡 Requiere ampliación para soportar:
  - **Condiciones**: array de predicados con operadores AND/OR
  - **Ventana temporal**: "en últimos N segundos"
  - **Modo contextual**: "si NO está en modo X"
  - **Acciones**: múltiples actdata MQTT + notificación + log forense

### 3.2. Vínculo widget ↔ device

Cada widget de una plantilla se vincula a un device mediante su `dId` (id MQTT).
- ✅ **Patrón existente en Wanomi**, se mantiene
- 📋 Documentado como decisión D-DATA-3

### 3.3. Nuevos campos en el modelo Template (🟡 pendiente)

Para soportar el modelo maestro-esclavo con filtrado por sampling type:

```json
{
  "variable": "door_shelter",
  "variableFullName": "Puerta shelter",
  "variableType": "bool",
  "dId": "psKqRYLS",
  "samplingType": "event",
  "samplingParams": {
    "debounce_ms": 1000,
    "threshold": null,
    "heartbeat_min_ms": 300000,
    "aggregation": null
  }
}
```

**Trabajo requerido**: modificar `app/api/models/template.js` (~30 líneas) + actualizar editor `pages/templates.vue` (~80 líneas frontend).

### 3.4. Motor de reglas ampliado (🟡 pendiente)

**Estado actual** (en código de feature/telco-support):
- ✅ Filtrado simple EMQX Rules Engine
- ✅ Webhook a Node como dispatch
- ✅ **Forensic dispatcher existe** (commit 7488fe4) — auditoría confirma `app/api/routes/forensic.js` con 13837 bytes
- ✅ **Webhooks integration con forensic** (commit e7677fc)

**Lo que falta para Wanomi 2.0:**
- 🔴 AND/OR de múltiples sensores
- 🔴 Ventanas temporales ("en últimos 30s")
- 🔴 Estado contextual ("NOT en modo mantenimiento")
- 🔴 Editor frontend para reglas compuestas

**Trabajo requerido**: 3-4 días de desarrollo (backend evaluator + frontend editor).

### 3.5. Notificaciones — Telegram (🟡 parcialmente listo)

**Estado:**
- ✅ Bot creado (@Wanomi_bot)
- ✅ Token rotado y guardado en password manager
- ✅ Chat_id obtenido (8528874867)
- 🔴 Token NO está en `app/.env` todavía
- 🔴 Endpoint backend para dispatch a Telegram NO implementado
- 🔴 Vínculo con motor de reglas NO existe

**Trabajo requerido**: ~1 día (endpoint + integración con dispatcher de reglas + UI de configuración de chat_ids por regla).

### 3.6. Trazabilidad forense (✅ BACKEND COMPLETO, 🔴 frontend pendiente)

**Modelo ForensicEvent** (✅ commit 5919170):
- Auditoría confirma `app/api/models/forensic_event.js` (3294 bytes)
- 17 enums de EVENT_KINDS
- 4 niveles de SEVERITIES (LOW, MEDIUM, HIGH, CRITICAL)
- Campos: userId, siteId, deviceId, eventKind, severity, payload, timestamp, prevHash, hash
- ✅ **HMAC automático en pre-validate hook**
- ✅ **Inmutabilidad en pre-save hook**
- ✅ **Cadena con GENESIS_HASH**

**Forensic service** (✅ commit b99ee81, 7488fe4):
- Auditoría confirma `app/api/routes/forensic.js` (13837 bytes)
- Endpoints expuestos: pendiente listar exactamente cuáles

**HMAC hardening** (✅ commits 75cb914, 2e36d2a):
- Guards de integridad de la cadena
- Hardening adicional

**PDF Export** (✅ commit 0e735c2):
- ✅ pdfkit dependency instalada (commit cb24f8d)
- ✅ Lógica de generación de PDF implementada
- Endpoint: pendiente confirmar URL exacto

**Lo que falta:**
- 🔴 **Vista de auditoría forense** en frontend (`/sites/:id/forensic`)
- 🔴 Cronología visual con filtros (fecha, severidad, evento)
- 🔴 Botón de export PDF
- 🔴 Integración con widgets para mostrar últimos eventos en dashboard

**Trabajo requerido**: ~1 día (frontend solo — el backend está completo).

---

## 4. Dashboard nativo (interfaz del cliente)

### 4.1. Modelo de navegación

```
Dashboard principal
├── Select 1: Sitio (filtrar por instalación)
└── Select 2: Plantilla (vista del dispositivo lógico)
```

**Estado:**
- ✅ Página `/dashboard` existe (75 líneas, auditoría confirma)
- 🟡 Modelo de selects necesita ampliación
- 🔴 Doble select Sitio + Plantilla NO existe todavía

**Trabajo requerido**: 2-3 días (frontend dashboard nuevo + integración con modelos Site y Template existentes).

### 4.2. Widgets soportados

| Widget | Estado | Notas |
|---|---|---|
| Number chart (Rtnumberchart) | ✅ Existe | Auditoría: `app/components/Widgets/` |
| Switch (Iotswitch) | ✅ Existe | |
| Indicator (Iotindicator) | ✅ Existe | |
| Button (Iotbutton) | ✅ Existe | |
| Image (mostrar foto WN-CAM) | 🔴 Crear | Derivado de patrón base |
| Audio indicator (sirena visual) | 🔴 Crear | Variante de Iotindicator |
| Categorical badge (vibration) | 🔴 Crear | Para vibration_signature |

### 4.3. Páginas existentes

**Auditoría confirma:**
- `pages/login.vue`, `pages/register.vue`
- `pages/dashboard.vue` (75 líneas)
- `pages/devices.vue` (633 líneas)
- `pages/templates.vue` (738 líneas)
- `pages/alarms.vue` (417 líneas)
- `pages/rules.vue` (410 líneas)
- `pages/demo/simulator.vue` (Sim-3 en progreso, sin commit)

**Lo que falta:**
- 🔴 `pages/sites/index.vue` (listado de sitios)
- 🔴 `pages/sites/_id/index.vue` (detalle del sitio)
- 🔴 `pages/sites/_id/forensic.vue` (cronología forense)

---

## 5. Filosofía del kit configurable

**Un kit NO es un producto fijo.** Es una **plantilla configurable según necesidad del cliente**.

**Kit base WN-SEC** (referencia inicial — modificable por cliente):
- 1× WN-SEC (maestro)
- 4× WN-DOOR
- 1× WN-PIR
- 1× WN-COPPER
- 1× WN-FENCE
- 1× WN-BLE-TRACK
- 1× WN-TEMP
- 1× WN-SIREN
- 1× WN-CAM
- 1× WN-LOCK

**El cliente puede agregar/quitar/personalizar.**

---

## 6. Lo que NO incluye Wanomi 2.0

- ❌ Integración con controladora ComAp (descartado)
- ❌ Domótica genérica
- ❌ Mobile app nativa (web responsive es suficiente)
- ❌ Multi-tenant SaaS (cada cliente es self-hosted)
- ❌ Backup automático en cloud (cliente maneja su backup)
- ❌ Integración con sistemas de tickets externos (fase 2)

---

## 7. Stack tecnológico

| Capa | Tecnología | Estado |
|---|---|---|
| Hardware esclavos | ESP32 + ESP-NOW | 📋 Roadmap firmware |
| Hardware maestros | ESP32 + RS485 (MAX3485) | 📋 Roadmap firmware |
| Hub | Orange Pi Zero 3 + Armbian + Docker | ✅ Existe |
| Backend | Node.js + Express + Mongoose | ✅ Existe |
| Base de datos | MongoDB | ✅ Existe |
| Broker MQTT | EMQX | ✅ Existe |
| Frontend | Nuxt 2 + Vue 2 + Black Dashboard | ✅ Existe |
| Notificaciones | Telegram Bot API | 🟡 Bot creado, falta backend |
| Despliegue | Docker Compose | ✅ Existe |

---

## 8. Riesgos identificados

### Técnicos
- **Motor de reglas ampliado** (+3-4 días al cronograma)
- **Firmware maestro WN-SEC**: cuando llegue, hay que escribir lógica de filtrado por sampling type
- **LoRa**: hardware adicional, aprendizaje protocolo, regulación frecuencias en Argentina

### De producto
- **Coherencia técnica del WN-GEN**: rangos de sensores realistas
- **Latencia E2E**: sensor → broker debe ser <500ms para eventos críticos
- **Modo offline del maestro**: si el sitio pierde conectividad, las reglas locales deben seguir disparando

### De negocio
- **Costo del bot Telegram a escala**: gratis hasta cierto límite
- **Cumplimiento normativo en notificaciones**: ¿quién responde si Wanomi notifica falsamente?

---

## 9. Compatibilidad con lo existente

**✅ Se reusa al 100%:**
- Stack (Mongo + EMQX + Node + Nuxt)
- Modelo Template del backend (se amplía, no se reescribe)
- Páginas devices/templates/rules/alarms (se modifican parcialmente)
- Layout `default.vue` con cliente MQTT global
- Widgets base (Iotindicator, Iotswitch, Rtnumberchart, Iotbutton)
- Modelo Site ✅ y CRUD ✅ (Fase 4)
- Modelo ForensicEvent ✅ con HMAC chain ✅ (Fase 4)
- Forensic dispatcher ✅ + webhooks integration ✅ (Fase 4)
- PDF export ✅ (Fase 4)
- Simulator WN-SITE-SEC/GEN ✅ (Sim-1/2/1.2)
- Simulator API endpoints ✅ (Sim-2)
- Simulator reset endpoint ✅ (Sim-3 paso 0)

**🟡 Se modifica:**
- Modelo Template agrega `samplingType` + `samplingParams`
- Motor de reglas (rules.js, alarms.js) se amplía con AND/OR + ventanas
- Frontend `/rules` editor se amplía
- Frontend nuevo dashboard con doble select

**🔴 Es nuevo:**
- Sistema de notificaciones Telegram (endpoint + integración)
- Frontend forensic chain (vista de cronología, PDF export button)
- Devices actuadores virtuales en el simulador (sirena, cámara, lock, audio)
- Widget imagen (para WN-CAM)
- Widget audio indicator (para WN-SIREN visual)
- Widget categorical badge (para vibration_signature)
- Pages `/sites/*`

---

## 10. Cronograma realista de Sim-3.5

Con la auditoría aplicada, el cronograma original (15-18 días) baja significativamente:

| Sub-fase | Estado | Días estimados |
|---|---|---|
| Cerrar Sim-3 simple (paso 4 + commit) | 🟡 | 1 |
| Ampliar Template con samplingType | 🔴 | 1 |
| Refactor simulador (10 devices por SEC) | 🔴 | 2 |
| Motor de reglas ampliado | 🔴 | 3-4 |
| Devices actuadores virtuales (sirena/cam/lock) | 🔴 | 2 |
| Telegram bot integration | 🔴 | 1 |
| Frontend dashboard con doble select | 🔴 | 2-3 |
| **Frontend forensic chain** (backend ya hecho) | 🟡 | **1** |
| Pulido + ensayo + bitácora | — | 2 |
| **Total Sim-3.5** | | **13-16 días** |

---

## 11. Cambios v0.1 → v0.2

- ✅ Marcas de estado en cada sección
- ✅ Identificación de qué hay implementado en Fase 4 (Site, ForensicEvent, HMAC, PDF, dispatcher)
- ✅ Cronograma ajustado (-2-3 días por forensic chain ya existente)
- ✅ Mapa claro de "qué reusar, qué modificar, qué crear nuevo"
- ✅ Estados de los 28 commits identificados

---

## Decisiones acumuladas (referencia rápida)

### Hardware
- **D-HW-1**: Modelo maestro-esclavo
- **D-HW-2**: ESP-NOW cercano, LoRa lejano, RS485 maestro→Hub
- **D-HW-3**: ComAp descartado
- **D-HW-4**: Sensores no-invasivos en WN-GEN

### Modelo de datos
- **D-DATA-1**: Cada sensor es device independiente (con su dId)
- **D-DATA-2**: Kit = Plantilla configurable
- **D-DATA-3**: Vínculo widget↔device mediante dId
- **D-DATA-4**: Plantilla amplía con `samplingType` por widget
- **D-DATA-5**: Maestro recibe config remota desde plataforma vía MQTT al boot

### Software
- **D-SW-1**: Motor de reglas se amplía (AND/OR + ventanas temporales + modo contextual)
- **D-SW-2**: Tres tipos de filtrado en maestro (event/telemetry/aggregated)
- **D-SW-3**: Notificación a Telegram bot
- **D-SW-4**: Panel `/demo/simulator` queda como herramienta interna del operador
- **D-SW-5**: Demo a Claro se hace en `/dashboard` nativo
- **D-SW-6**: Forensic chain como capacidad de primera clase (backend ya existe)

### Filosofía
- **D-PHIL-1**: Wanomi = predictivo + preventivo + reactivo
- **D-PHIL-2**: Devices interactúan entre sí para formar "dispositivos inteligentes"
- **D-PHIL-3**: Las 4 patas del valor: disuasión, notificación, acción física, forense

### Proceso
- **D-PROC-1**: Manejo de secrets — protocolo definido en SECRETS.md (incidentes de Telegram + PAT GitHub el 2026-05-18)
- **D-PROC-2**: Auditoría del código existente antes de proponer features nuevas (lección post-confusión con Fase 4)
