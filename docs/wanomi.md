# wanomi.md — Bitácora del Proyecto

> Archivo maestro de seguimiento. Se consulta al inicio de cada sesión y se actualiza al cierre.

---

## Estructura operativa — Las 4 Áreas

| # | Área | Rol de Claude |
|---|---|---|
| 1 | Estudio de Escenarios | Asesor de industrias, comercios, telco — nuevas tecnologías, IA en embebidos |
| 2 | Desarrollo de Software | Ing. software — Vue.js, Nuxt, MQTT, MongoDB, Node, Docker |
| 3 | Hardware | Ing. electrónico — microcontroladores, sensores, PCBs, electricidad industrial |
| 4 | Marketing y Branding | Arquitecto marketing — prototipado visual, brochures, branding, redes |

---

## Estado General del Proyecto

**Última actualización:** 2026-05-05 (Sesión #5 cerrada)

### Productos vigentes (línea comercial)
- WN-S1 Sense / WN-C1 Cold / WN-SW1E Switch Energy / WN-AIR / WN-IR / WN-F1 Field / WN-H1 Hub

### Productos en pipeline — Línea Telco (piloto Claro)
- 🔧 WN-SITE-SEC — anti-robo e intrusión (BOM ✅, docs taller ✅, arquitectura site ✅, doc fabricación PCB ✅)
- 🔧 WN-SITE-GEN — monitoreo predictivo grupo electrógeno (BOM ✅, docs taller ✅, arquitectura site ✅, doc fabricación PCB ✅)
- 🔧 WN-H1-TELCO — hub endurecido DIN (docs taller ✅, arquitectura site ✅, doc fabricación PCB ✅)
- 🆕 WN-FENCE — sub-nodo inalámbrico para cerco (especificado en sesión #3, doc fabricación PCB ✅)

### Estado por dispositivo

| Dispositivo | BOM | Doc taller | Arquitectura | Doc PCB EJ Devices | PCB fabricada | Firmware | Test bench |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| WN-SITE-SEC | ✅ | ✅ | ✅ | ✅ | 📋 | 📋 | 📋 |
| WN-SITE-GEN | ✅ | ✅ | ✅ | ✅ | 📋 | 📋 | 📋 |
| WN-H1-TELCO | ✅ | ✅ | ✅ | ✅ | 📋 | 📋 | 📋 |
| WN-FENCE | ✅ | 📋 | ✅ | ✅ | 📋 | 📋 | 📋 |

✅ = completado · 📋 = pendiente

---

## Proyectos Activos

### 🟢 Convocatoria Claro SA — Modernización de sites de telecomunicaciones

**Estado:** En marcha — documentación de fabricación PCB lista para enviar a EJ Devices, próximo paso: cotización + fabricación

**Acceso confirmado:**
- ✅ Contacto con cell owners de Claro
- ✅ Acceso a sitios reales vía cell owners
- ✅ Posible préstamo de ComAp para pruebas de bench

**Proveedor de fabricación seleccionado:** EJ Devices — Desarrollos Electrónicos (Buenos Aires, Argentina)

---

## Log de Sesiones

### Sesión #5 — 2026-05-05 ✅ CERRADA
**Foco:** Plataforma Wanomi — backend Fase 4B + 4C.1 + 4C.2 (soporte Telco)

**Sub-fases completadas:**

#### Fase 4A — Refactor preparatorio ✅
- `tasmota_bridge.js` movido a `routes/bridges/tasmota.js`
- Modularización ESP8266 diferida (no necesaria para Telco)

#### Fase 4B — Modelos Mongoose ✅
- `app/api/models/site.js` — agrupa devices por site físico (siteCode, nombre, lat/lng, tipo BTS/shelter/repeater, cellOwner, devices: [String])
- `app/api/models/forensic_event.js` — eventos inmutables con HMAC-SHA256 en cadena por site. Pre-validate calcula hash, pre-save rechaza modificaciones. `verifyChain()` estático para auditoría.

#### Fase 4C.1 — CRUD de sites + extensión de devices ✅
- `app/api/routes/sites.js` — GET/POST/PUT/DELETE /site + POST/DELETE /site/devices (bind/unbind)
- `app/api/models/device.js` extendido con `siteId`, `iccid`, `imei`, `apn`
- Validación funcional completa con scripts curl (4/4 checks)

#### Fase 4C.2 — Dispatcher forense + endpoints + export PDF ✅
- `app/api/services/forensic_dispatcher.js` — queue serializado por site (Promise chain), VARIABLE_MAP hardcoded para piloto Claro, guard fail-fast con `process.exit(1)` si `FORENSIC_HMAC_SECRET` falta, es placeholder o < 32 chars
- Hook en `alarm-webhook`: `dispatchForensicEvent(incomingAlarm)` non-blocking
- `app/api/routes/forensic.js` — GET /forensic-events, GET /forensic-events/verify, GET /forensic-events/export (PDF streaming con pdfkit)
- PDF export: portada + stats + banner verde/rojo (chain integrity) + tabla de eventos + Anexo A (hashes completos) + Anexo B (payloads completos) + fingerprint SHA-256
- `FORENSIC_HMAC_SECRET` agregado a `app/.env` (secret real) y `installer.txt` (placeholder)
- pdfkit 0.13.0 agregado a `package.json`

**Decisiones técnicas tomadas en esta sesión:**

| # | Decisión |
|---|---|
| DEC-21 | siteId como String (= siteCode), no ObjectId — evita populate y simplifica queries cross-collection |
| DEC-22 | Cadena forense por site (no global) — permite verificación independiente por site para peritos |
| DEC-23 | HMAC-SHA256 sobre `siteId|deviceId|eventKind|severity|JSON(payload)|timestamp|prevHash` — incluye todos los campos operativos relevantes |
| DEC-24 | Queue serializado in-memory (Promise chain por siteId) — elimina race condition en prevHash sin overhead de lock distribuido; documentado como single-instance only |
| DEC-25 | VARIABLE_MAP hardcoded para piloto Claro — migrar a campo en emqx_alarm_rule si el sistema escala a multi-cliente |
| DEC-26 | Guard fail-fast con `process.exit(1)` — un secret malo mata el proceso en startup; Docker restart loop hace la misconfiguration visible al operador |
| DEC-27 | PDF export streaming via `doc.pipe(res)` — never bufferiza el PDF completo en memoria |
| DEC-28 | Fingerprint del PDF = SHA-256 de hashes concatenados (no del PDF) — verificable independientemente del viewer PDF |

### Sesión #1 — 2026-04-23 ✅ CERRADA
**Foco:** Estrategia, investigación y propuesta Claro SA
**Entregables:** `wanomi_claro_tecnico.docx` + `wanomi_claro_pitch.pptx`

### Sesión #2 — 2026-04-24 ✅ CERRADA
**Foco:** Paquete de prototipado para taller
**Entregables:** 3 docx de taller (SEC, GEN, H1-TELCO) + 9 PNG (protoboards, carcasas, cableado)

### Sesión #3 — 2026-04-26 ✅ CERRADA
**Foco:** Arquitectura de instalación en site real (informe 5 especialistas)
**Entregables:** `arquitectura_site.png` + `wanomi_informe_instalacion_site.docx` (10 decisiones)

---

### Sesión #4 — 2026-04-28 ✅ CERRADA
**Foco:** Documentos de fabricación PCB para EJ Devices (Área 3)

**Trigger:** El cliente confirmó proveedor de fabricación: **EJ Devices — Desarrollos Electrónicos**. Solicita documentos detallados de fabricación PCB para cada uno de los 4 dispositivos.

**Decisiones técnicas tomadas en esta sesión:**

| # | Decisión |
|---|---|
| DEC-11 | Estructura de los docs EJ Devices: 8 secciones (SoW, espec funcional, BOM ingenieril, netlist textual, spec PCB, layout zonas, mecánico, testing/entrega) |
| DEC-12 | Plan de fabricación en 3 fases: A=5 unidades (prototipo) · B=25 unidades (pre-producción) · C=50-100 (producción condicional al éxito del piloto) |
| DEC-13 | PCBs 2 capas FR-4 Tg≥135°C, 1.6 mm, HASL sin Pb, mascara verde (estándar) |
| DEC-14 | WN-SITE-GEN: aislamiento RS485 ≥2.5kV con ADuM1201 + slot mecánico de 2mm — NO usar opto-acopladores genéricos |
| DEC-15 | WN-H1-TELCO: switch ETH industrial KSZ8794CNX (-40/+85°C), no consumer |
| DEC-16 | WN-FENCE: ESP32-WROOM-32E (no S3) por menor consumo deep sleep + LDO low-Iq MCP1700 + conformal coating obligatorio |
| DEC-17 | WN-FENCE: presupuesto de consumo promedio < 100µA para autonomía solar de 3-4 días |
| DEC-18 | Testing 100% flying probe + funcional con jig provisto por Wanomi a EJ Devices |
| DEC-19 | Entrega: archivos KiCad/Altium fuente quedan en propiedad de Wanomi para evolución futura |
| DEC-20 | Empaque: bolsa antiestática individual + caja con burbuja + etiqueta ESD |

**Entregables generados:**

#### Diagramas de bloques de PCB (4 PNG)
| Archivo | Dimensiones | Notas |
|---|---|---|
| `pcb_sec.png` | 100×70 mm · 2 capas | ZONA POTENCIA + MCU + I²C + RF + conectores |
| `pcb_gen.png` | 95×70 mm · 2 capas | AISLAMIENTO RS485 galvánico ADuM1201 ≥2.5kV con slot 2mm |
| `pcb_h1.png` | 200×150 mm · 2 capas | Placa expansión OPi Zero 3 + UPS + BG95 + switch ETH |
| `pcb_fence.png` | 60×40 mm · 2 capas | Ultra low power, MCP1700, conformal coating |

#### Documentos para EJ Devices (4 DOCX)
| Archivo | Páginas | Contenido |
|---|---|---|
| `WN-SITE-SEC_fabricacion_PCB_EJDevices.docx` | ~15 | SoW + espec + BOM + netlist + spec PCB + diagrama + mecánico + testing |
| `WN-SITE-GEN_fabricacion_PCB_EJDevices.docx` | ~12 | Idem + tabla MODBUS + aislamiento RS485 + ADC con TL431 |
| `WN-H1-TELCO_fabricacion_PCB_EJDevices.docx` | ~10 | Idem + UPS + supercaps + switch ETH industrial |
| `WN-FENCE_fabricacion_PCB_EJDevices.docx` | ~8 | Idem + budget de consumo + conformal coating |

---

## Próximos pasos concretos

### Hardware / Fabricación
1. **Enviar los 4 documentos a EJ Devices** vía email a info@ejdevices.com.ar para cotización
2. **Componentes críticos a comprar / dejar en consigna** (lead time 3-4 sem):
   - Quectel BG95-M3 (×7 mínimo: 5 SEC + 2 H1)
   - Mean Well SD-15B-5, SD-15C-5, SD-25B-5
   - ADuM1201BRZ (×30: 5 GEN + 25 H1 RS485 externo)
   - KSZ8794CNX, KSZ8081RNAIA (Microchip)
   - BQ24295 (UPS controller)
   - ESP32-S3-WROOM-1-N16R8 + ESP32-WROOM-32E-N4
3. **Componentes inmediatos en MercadoLibre AR**: ADXL345, MPU-6050, QMC5883L, DS18B20, SCT-013, JSN-SR04T, OPi Zero 3, terminal blocks Phoenix Contact
4. **Coordinar reunión técnica con EJ Devices** para revisar specs y acordar timeline + condiciones comerciales
5. **Wanomi debe preparar:**
   - Jig de testing funcional para que EJ Devices use durante QC
   - Firmware de test (distinto al firmware de producción) para flashear durante el test funcional
   - SIM de prueba M2M (Claro o cualquier operador) para validación BG95
6. **Firmware ESP32-S3 (Fase 4E):** Iniciar firmware PlatformIO + adaptaciones de plataforma mientras EJ Devices fabrica

### Software — Próximo paso: Fase 4C.3 — NOC Bridge
7. **Fase 4C.3 — `routes/bridges/noc.js`** — dispatcher SNMP traps + syslog RFC 5424 TLS + webhook REST al NetCool de Claro
   - **⛔ BLOQUEANTE:** requiere confirmación de Claro sobre:
     - Protocolo elegido: SNMPv3 / syslog TLS / REST webhook (o combinación)
     - IP del receptor NetCool (o endpoint REST)
     - Credenciales SNMPv3: engineID, authProto (SHA/MD5), privProto (AES/DES), community
     - PEN propio en IANA: ¿Wanomi necesita OID privado para los traps? (trámite IANA ~2 semanas)
   - Sin esta info, el bridge no puede implementarse — diseño queda en standby

---

## Decisiones Registradas (acumuladas — 20 decisiones)

| Fecha | Decisión | Estado |
|---|---|---|
| 2026-04-23 | Equipo completo (4 leads + especialistas) | ✅ |
| 2026-04-23 | Alcance Claro: 2 dolores (robo + GE) + roadmap | ✅ |
| 2026-04-23 | MCU ESP8266 → ESP32-S3 para línea telco | ✅ |
| 2026-04-23 | MODBUS solo-lectura hacia DSE/ComAp | ✅ |
| 2026-04-23 | Self-hosted como diferencial vs Huawei/Vertiv | ✅ |
| 2026-04-23 | SIM M2M Claro como backhaul redundante | ✅ |
| 2026-04-24 | Prototipo en protoboard para muestra rápida | ✅ |
| 2026-04-24 | Enclosure PETG impreso prototipos, ABS/IP54 producción | ✅ |
| 2026-04-26 | 1 controlador por kit, no por sensor | ✅ |
| 2026-04-26 | Sensor↔ctrl cableado (excepto cerco y BLE tags) | ✅ |
| 2026-04-26 | ESP-NOW para WN-FENCE (sin AP) | ✅ |
| 2026-04-26 | Crear WN-FENCE sub-nodo solar | ✅ |
| 2026-04-28 | Estructura 8 secciones para docs EJ Devices | ✅ |
| 2026-04-28 | 3 fases de fabricación: 5 + 25 + 50-100 unidades | ✅ |
| 2026-04-28 | PCB 2 capas FR-4 Tg≥135°C HASL sin Pb | ✅ |
| 2026-04-28 | Aislamiento RS485 ≥2.5kV con ADuM1201 (no opto genérico) | ✅ |
| 2026-04-28 | Switch ETH industrial KSZ8794CNX | ✅ |
| 2026-04-28 | WN-FENCE: ESP32-WROOM-32E + MCP1700 + conformal coating | ✅ |
| 2026-04-28 | WN-FENCE: presupuesto consumo < 100µA promedio | ✅ |
| 2026-04-28 | Testing 100% flying probe + funcional con jig de Wanomi | ✅ |
| 2026-05-05 | siteId como String (= siteCode), no ObjectId | ✅ |
| 2026-05-05 | Cadena forense por site, no global | ✅ |
| 2026-05-05 | HMAC-SHA256 sobre 7 campos concatenados con `\|` | ✅ |
| 2026-05-05 | Queue Promise serializado in-memory por siteId (single-instance) | ✅ |
| 2026-05-05 | VARIABLE_MAP hardcoded para piloto Claro (migrar si escala) | ✅ |
| 2026-05-05 | Guard fail-fast `process.exit(1)` si HMAC secret inválido | ✅ |
| 2026-05-05 | PDF export streaming via `doc.pipe(res)` | ✅ |
| 2026-05-05 | Fingerprint PDF = SHA-256 de hashes concatenados (no del PDF) | ✅ |
| 2026-05-09 | DEC-29 | Demo a Claro: simulador publica MQTT real (no fake en frontend). Honestidad end-to-end. | ✅ |
| 2026-05-09 | DEC-30 | Fidelidad media: cada sensor controlable individualmente, sin física continua | ✅ |
| 2026-05-09 | DEC-31 | Comandos al simulador via MQTT control topic `simulator/{dId}/control`, NO HTTP | ✅ |
| 2026-05-09 | DEC-32 | `SIMULATOR_MODE=true` requerido para activar control channel (defensa en profundidad) | ✅ |
| 2026-05-09 | DEC-33 | Proceso Node en host (no Docker), un proceso N devices | ✅ |
| 2026-05-09 | DEC-34 | Camino X: simulador llama `/api/getdevicecredentials` igual que ESP32 real | ✅ |
| 2026-05-09 | DEC-35 | Datos confidenciales Claro en `sites_real.json` gitignored, repo solo tiene `.example.json` | ✅ |
| 2026-05-09 | DEC-36 | DOS templates (SEC + GEN) y DOS devices por site = 6 devices totales | ✅ |
| 2026-05-09 | DEC-37 | Escenarios pre-grabados declarativos en `SCENARIOS` object (5 escenarios iniciales) | ✅ |
| 2026-05-09 | DEC-38 | `validateState` con `process.exit(1)` en orphans (no continúa con state inconsistente) | ✅ |
| 2026-05-09 | DEC-39 | `device.password` plain en MongoDB es deuda de seguridad — OK piloto, revisar antes de enterprise | ⚠️ deuda |
| 2026-05-09 | DEC-40 | Sistema online/offline real no existe — `DEVICE_ONLINE/OFFLINE` solo manual desde panel | ⚠️ gap |
| 2026-05-09 | DEC-41 | Para evitar deriva LLM: código aprobado va en `docs/CodigoCorregido/` y se COPIA, no se RECREA | ✅ proceso |

---

## Sesión #5 — 2026-05-09 — Sim-1 (simulador WN-SITE-SEC/GEN)

### Contexto

Arranque del simulador como demo comercial para Claro (no solo testing interno). El meeting con Claro es en 2-3 semanas y el plan de 17 días arrancó con esta sub-fase. Datos reales de 3 sites del piloto Claro Corrientes extraídos de KMZ provistos por el cliente: CR00015 (Empedrado), CR00073 (Palmar de San Luis), CR00203 (Corrientes Capital).

### Decisiones nuevas

Ver tabla de Decisiones Registradas: DEC-29 a DEC-41.

### Lección aprendida — Deriva entre código aprobado y código escrito

Durante la sesión hubo un episodio donde Claude Code, al implementar el código, simplificó significativamente el diseño aprobado: faltaron 5 escenarios, faltó `applyCommand`, faltó `SIMULATOR_MODE`, faltaron variables específicas del template, y los datos de sites se hardcodearon con valores genéricos inventados en lugar de leer `sites_real.json`. Los tests funcionales detectaron problemas superficiales (`templateName` faltante, body wrapping incorrecto) pero no los desvíos estructurales.

**Causa raíz:** entre el código aprobado en el chat y la implementación, el LLM "interpreta" en lugar de copiar. Mientras más contexto previo hay, más alta es la probabilidad de deriva.

**Solución implementada (DEC-41):** el código aprobado se guarda como archivos en `docs/CodigoCorregido/` y Claude Code los copia tal cual al destino. Cero re-creación desde el contexto. Esto se aplicó en la reescritura limpia de Sim-1 y los 13 tests pasaron al primer intento.

### Archivos modificados

- `.gitignore` — `tools/device_simulator/devices_state.json` agregado (sites_real.json y site_images/ ya estaban del scaffold)
- `tools/device_simulator/lib/api.js` (NUEVO 126 líneas) — HTTP client nativo, sin deps. Maneja body vacío de getdevicecredentials.
- `tools/device_simulator/lib/sensor-engine.js` (NUEVO 123 líneas) — `initialSecState()`, `initialGenState()`, `evolve()`, `SCENARIOS` con 5 entradas
- `tools/device_simulator/lib/device.js` (NUEVO 214 líneas) — clase `SimulatedDevice` con `connect()`, `applyCommand()`, `_runScenario()`, `disconnect()`, defensa en profundidad con `SIMULATOR_MODE`
- `tools/device_simulator/seed.js` (NUEVO 217 líneas) — provisiona templates+sites+devices, idempotente, valida state contra backend
- `tools/device_simulator/run.js` (NUEVO 110 líneas) — entry point, bootstrappea N devices con `Promise.all`, shutdown limpio
- `tools/device_simulator/package.json` (NUEVO) — solo dep `mqtt ^4.2.5`
- `tools/device_simulator/README.md` — sección `## Limitaciones` agregada (single instance, password rotation, single-instance backend)

### Datos confidenciales de Claro (NUNCA commiteados)

- `tools/device_simulator/sites_real.json` — 3 sites con coordenadas, direcciones y SAP IDs reales
- `tools/device_simulator/devices_state.json` — 6 pares de credenciales `{dId, password}` que dan acceso al broker MQTT
- `tools/device_simulator/site_images/` — capturas satelitales de Google Earth (pendientes para Sim-3)

### Variables de los templates

**WN-SITE-SEC v1** (7 booleanos):
`door_main`, `door_cabinet`, `pir_motion`, `ground_loop` (1=normal), `fence_vib`, `tower_vib`, `battery_tag` (1=presente)

**WN-SITE-GEN v1** (8 mixtas):
`fuel_level` (float), `genset_running` (bool), `genset_temp` (float), `genset_vib` (float), `genset_amps` (float), `genset_temp_alarm` (bool), `genset_door` (bool), `mains_voltage` (float)

**Importante:** los nombres deben matchear exactamente el `VARIABLE_MAP` del `forensic_dispatcher` para que se generen ForensicEvents correctamente al disparar eventos de demo.

### Escenarios pre-grabados (`SCENARIOS` en sensor-engine.js)

| Nombre | Duración | Para qué |
|---|---|---|
| `intrusion` | 60s | Robo nocturno: cerco → puerta → PIR → cabinet → torre, con cleanup automático |
| `fuel_siphon` | 12s | Sabotaje de combustible: 85% → 28% sin motor encendido |
| `maintenance` | 125s | Mantenimiento legítimo: técnico abre, trabaja, cierra |
| `genset_failure` | 65s | Corte de luz → arranque GE → sobre-temp → para |
| `ground_loop_cut` | 5min | Loop de tierra cortado, restaurado a los 5 min |

### Estado del backend después de Sim-1

- 2 templates: `WN-SITE-SEC v1`, `WN-SITE-GEN v1`
- 3 sites: CR00015, CR00073, CR00203 con coordenadas reales
- 6 devices: 1 SEC + 1 GEN por site, todos bindeados al site correcto
- `EmqxAuthRule` para cada device con username (= dId) y MQTT password sha256
- Usuario de pruebas: `telco-test@wanomi.test` (existía de sesiones previas)

### Validación funcional (13/13 pasos pasaron)

1. Sintaxis de los 5 archivos JS — `node --check` OK x 5
2. Carga de módulos — `require()` OK, 7 vars SEC + 8 vars GEN + 5 escenarios confirmados
3. `npm install` — mqtt ^4.2.5 instalado
4. Usuario telco-test@wanomi.test existe en MongoDB
5. Cleanup pre-state — DBs limpias
6. `node seed.js` — 2 templates + 3 sites + 6 devices creados
7. `cat devices_state.json` — estructura correcta `{ siteCode: { SEC: {...}, GEN: {...} } }`
8. Idempotencia confirmada — segunda corrida: 0 created, 6 skipped
9. `node run.js` — bootstrap de 6 devices, conectan al broker, publican 7+8 variables
10. Verificación MQTT — datos llegando en `{userId}/{dId}/{var}/sdata` con `{value, save:1}`
11. Floats con drift correcto: genset_temp ~42.15, mains_voltage ~219.46, genset_vib ~0.019
12. Booleanos con convenciones correctas: ground_loop=1, battery_tag=1
13. Shutdown limpio con SIGINT/SIGTERM — `All devices disconnected.`

### Commit

`467cb62 feat(simulator): WN-SITE-SEC/GEN simulator with MQTT bootstrap and command channel`

9 archivos commiteados, 1332 insertions(+), 1 deletion(-).

### Próximo paso

**Sim-2** (1 día): endpoints `/api/simulator/*` en backend (`/trigger`, `/scenario`, `/devices`) que reciben comandos del panel Vue y los publican al control topic MQTT del simulador correspondiente. Requiere acceso a `global.mqttClient` y validación de que `SIMULATOR_MODE` activo. Sin SIMULATOR_MODE el endpoint debe responder 503 "simulator control disabled".

---

## Sesión #6 — 2026-05-10 — Sim-2 (API endpoints + ACL fix)

### Contexto

Continuación del plan macro de 17 días para la demo a Claro. Sim-1 cerrado con el simulador funcional publicando MQTT real (commits 1224110, 467cb62, 727ec09). Sim-2 implementa los endpoints REST que permiten al panel Vue (Sim-3) controlar el simulador desde una interfaz humana.

### Decisiones nuevas

| Fecha | ID | Decisión | Estado |
|---|---|---|---|
| 2026-05-10 | DEC-42 | DEROGA DEC-41. Volver al método tradicional (diseño → aprobación en chat → implementación con inspección en vivo). DEC-41 fue reacción a un caso aislado en Sim-1. Sin más evidencia, mantener el proceso que funcionó para DEC-01 a DEC-28. | ✅ |
| 2026-05-10 | DEC-43 | Convención del proyecto para routes: `import` para modelos Mongoose (que exportan `export default`), `require()` para módulos CJS (express, middlewares). Funciona porque Nuxt 2 transpila los serverMiddleware con Babel. | ✅ |
| 2026-05-10 | DEC-44 | El ACL de los devices con `firmwareType='wanomi-sim'` se extiende para incluir `simulator/{dId}/control` en la lista de subscribe. Sin esto, EMQX rechaza el subscribe con QoS 128 silenciosamente y el simulador no puede recibir comandos. Implementado en `getDeviceMqttCredentials` (webhooks.js). | ✅ |
| 2026-05-10 | DEC-45 | El endpoint `GET /api/simulator/state/:dId` fue eliminado. Los devices simulados no persisten datos a MongoDB por diseño (el simulador demuestra escenarios en vivo, no historiales). El panel Vue (Sim-3) lee estado via MQTT WebSocket subscription, patrón estándar del proyecto. | ✅ |

### Endpoints implementados (5)

| Método | Path | Función |
|---|---|---|
| GET | `/api/simulator/devices` | Lista devices simulados del usuario logueado |
| GET | `/api/simulator/scenarios` | Lista de escenarios pre-grabados disponibles |
| POST | `/api/simulator/trigger` | Pulso transitorio de un sensor con auto-reset |
| POST | `/api/simulator/set` | Set permanente de valor de un sensor |
| POST | `/api/simulator/scenario` | Ejecutar escenario pre-grabado |

### Defensa en profundidad — 3 niveles

1. **`ENABLE_SIMULATOR_API` env flag** — chequeada por handler. Si está OFF, retorna 404 (no revela existencia del endpoint).
2. **JWT obligatorio** — middleware `checkAuth` en todos los endpoints.
3. **`SIMULATOR_MODE=true` en el simulador** — sin esto, los comandos publicados al control topic caen al vacío. Independiente del backend.

### Validación de inputs

- `dId` con regex `/^[a-zA-Z0-9]{8}$/`
- `sensor` debe existir en widgets del template
- `value` validado según `variableType` (bool: 0|1|true|false; float: número finito)
- `name` de escenario en whitelist de 5 valores
- `duration_ms` número finito no negativo
- Template y device validados con filtro `userId` (defensa en profundidad)

### Lección aprendida — bug latente de Sim-1 cazado por Sim-2

Durante el testing E2E del Grupo D apareció un bug que existía desde Sim-1 pero no era observable: el simulador no procesaba comandos del control topic. Diagnóstico iterativo determinó que **el ACL de los devices del simulador no incluía `simulator/{dId}/control`** en la lista de subscribe. EMQX aceptaba la suscripción con QoS 128 (failure) silenciosamente, y `mqtt.js` no consideraba eso un error en el callback de subscribe.

**Por qué se nos escapó en Sim-1:** los 13 tests funcionales de Sim-1 solo verificaban publicación (el simulador → broker), no subscripción (broker → simulador). El control channel solo se valida cuando hay un cliente publicando al tópico, y eso recién pasó en Sim-2.

**Fix:** modificación quirúrgica en `getDeviceMqttCredentials` (webhooks.js) — agregar la línea condicional por `firmwareType === 'wanomi-sim'`. Total ~10 líneas, 3 puntos de cambio. Commit dedicado anterior al commit de Sim-2 para bisect-friendly (`03bf272`).

### Archivos modificados

- `app/api/routes/simulator.js` (NUEVO, 264 líneas) — los 5 endpoints
- `app/api/routes/webhooks.js` (MODIFICADO, +12 -3) — ACL extiende para wanomi-sim
- `app/api/index.js` (MODIFICADO, +1) — registro de la nueva ruta
- `app/.env` (MODIFICADO, no commiteado — gitignored) — `ENABLE_SIMULATOR_API=true`

### Estado del backend después de Sim-2

- 5 endpoints expuestos en `/api/simulator/*`
- Defensa en profundidad funcional (verificada en Grupos A-D de tests)
- Backend independiente del simulador (no se cuelga si el simulador no corre)
- Validación estricta de inputs en todos los handlers
- Comandos publicados al broker con QoS 1 + callback (entrega confirmada)

### Validación funcional (Grupos A-D)

- **Grupo A** (defensa en profundidad): 7/7 tests OK
- **Grupo B** (validación inputs): 11/11 tests OK
- **Grupo C** (backend resiliencia): 6/6 tests OK
- **Grupo D** (E2E con simulador): 7/7 tests OK (después del fix de ACL)

### Commits

```
0d38a3b  feat(simulator-api): /api/simulator/* endpoints for device control
03bf272  fix(webhooks): include simulator/{dId}/control in ACL for wanomi-sim devices
b898d9a  fix(simulator): use firmwareType=wanomi-sim to distinguish from real firmware
```

### Próximo paso

**Sim-3** (2-3 días): panel Vue `/demo/simulator` con UI de control:
- Lista de devices simulados (de `GET /api/simulator/devices`)
- Por cada device: toggles para sensores bool + sliders para floats
- Botones de escenarios pre-grabados
- Visualización en tiempo real del estado via MQTT WebSocket subscription
- Capturas satelitales de los 3 sites de Corrientes (tarea pendiente, no bloqueante)

---

## Sesión #7 — 2026-05-14 — Sim-1.2 (re-template SEC/GEN v2 alineado con pitch de Claro)

### Contexto

Durante la planificación de Sim-3 (panel Vue) revisamos el pitch de Claro (wanomi_claro_pitch_2.pptx). Detectamos un mismatch importante entre las variables del simulador v1 y la documentación técnica del producto (slides 7 y 8 del pitch). Sim-1.2 alinea los templates y escenarios del simulador con el pitch antes de construir el panel Vue, para evitar maquillar inconsistencias en la UI.

### Decisiones nuevas

| Fecha | ID | Decisión | Estado |
|---|---|---|---|
| 2026-05-14 | DEC-46 | Sim-1.2 es prerequisito de Sim-3. Re-templatear el simulador antes de construir el panel Vue. Razón: el pitch a Claro lista sensores específicos (4 puertas, magnetómetro de cobre, BLE beacons tracking, vibracional FFT, etc.) que no coinciden con el simulador v1. Maquillar en el frontend sería mostrar inconsistencia técnica al cliente. | ✅ |
| 2026-05-14 | DEC-47 | Variables en código: inglés. UI (variableFullName, descripciones): español. Patrón estándar de la industria — código mantenible + producto localizado. | ✅ |
| 2026-05-14 | DEC-48 | Templates v2 introducen dos nuevos tipos de variable usados en widgets: `categorical` (string con enum, como vibration_signature) y `int` (counter, como battery_beacons_count). El modelo Template del backend NO se modifica — el schema es flexible y acepta cualquier string en variableType. La validación se hace en el simulador y en el frontend. | ✅ |
| 2026-05-14 | DEC-49 | Estructura de escenarios v2: objeto con metadata (description, duration_ms, steps, noCleanup?, isMaintenanceEvent?) en lugar de array plano. Permite cleanup automático post-duration_ms y flags semánticos para el sistema de alarmas (a implementar en Sim-3.5). | ✅ |
| 2026-05-14 | DEC-50 | `evolve()` recibe deviceState completo (no solo variable+value). Permite drift contextual: fuel_level solo consume si genset_running=1, alternator_voltage solo tiene tensión si motor corriendo, mains_voltage solo deriva si red está OK (no zero). Aumenta realismo sin agregar complejidad arquitectónica. | ✅ |
| 2026-05-14 | DEC-51 | El handler `_runScenario` valida que TODAS las variables del escenario existan en el device antes de empezar. Si alguna falta (ej. disparar fuel_siphon en device SEC), aborta con warning. Defensa en profundidad — error temprano y visible vs. error silencioso. | ✅ |
| 2026-05-14 | DEC-52 | Escenarios encimados en el MISMO device: el nuevo cancela los timers del anterior. Estado limpio para la demo (re-disparar sin pelear con estado residual). Encimados entre devices DISTINTOS coexisten (correcto, decidido en Sim-3 planning). | ✅ |
| 2026-05-14 | DEC-53 | Whitelist de escenarios en simulator.js (backend) hardcodeada por seguridad — los endpoints solo aceptan scenarios cuyos nombres están en la lista. Debe mantenerse sincronizada con el simulador. Esta sincronización se hace manualmente; un test futuro podría validar consistencia automáticamente. | ✅ |

### Templates v2

**WN-SITE-SEC v2** — 10 sensores (antes 7):

| Variable | Tipo | Display |
|---|---|---|
| door_shelter | bool | Puerta shelter |
| door_front | bool | Puerta frente |
| door_rear | bool | Puerta trasera |
| door_battery_cabinet | bool | Gabinete de baterías |
| pir_motion | bool | Movimiento interior (PIR) |
| fence_vibration | bool | Vibración cerco (corte/golpe) |
| copper_field_anomaly | bool | Movimiento de cobre |
| ground_continuity | bool | Continuidad de tierra (1=íntegra) |
| battery_beacons_count | int | BLE beacons baterías presentes |
| shelter_temp | float | Temperatura shelter (°C) |

**WN-SITE-GEN v2** — 9 sensores (antes 8):

| Variable | Tipo | Display |
|---|---|---|
| fuel_level | float | Nivel combustible (%) |
| genset_running | bool | Motor en marcha |
| exhaust_temp | float | Temperatura escape (°C) |
| vibration_signature | categorical | Firma vibracional (FFT) |
| crank_current | float | Corriente arranque (A) |
| alternator_voltage | float | Tensión alternador (V) |
| battery_voltage | float | Tensión batería arranque (V) |
| crank_attempts_failed | int | Intentos fallidos consecutivos |
| mains_voltage | float | Tensión red eléctrica (V) |

### Escenarios refinados — 7 ahora

| Escenario | Duración | Cleanup | Flag especial |
|---|---|---|---|
| intrusion | 60s | sí | — |
| copper_theft | 75s | sí | NUEVO en v2 |
| fuel_siphon | 15s | **noCleanup** | fuel_level persiste en 30% |
| genset_no_start | 45s | sí | NUEVO |
| genset_vibration_anomaly | 30s | sí | NUEVO — usa string categorical |
| battery_degraded | 20s | sí | NUEVO |
| maintenance | 90s | sí | isMaintenanceEvent (para alarmas) |

### Validación E2E (Grupo G)

| Test | Verificación | Resultado |
|---|---|---|
| G.1 pre-flight | 6 ACL con simulator/control, 7 scenarios en API | ✅ |
| G.2.1 intrusion | 8 steps, cleanup completo | ✅ |
| G.2.2 copper_theft | 4 steps, cleanup completo | ✅ |
| G.2.3 maintenance | flag [MAINTENANCE] en log | ✅ |
| G.2.4 fuel_siphon en SEC | guard abort con warning | ✅ |
| G.3.1 fuel_siphon | noCleanup respetado, fuel queda en 30 | ✅ |
| G.3.2 genset_no_start | 3 intentos crank, multi-var simultáneos | ✅ |
| G.3.3 genset_vibration_anomaly | string categorical con comillas | ✅ |
| G.3.4 battery_degraded | 1 intento + degradación visible | ✅ |

### Bug latente cazado en G.1

Pre-flight de validación E2E reveló que `simulator.js` (backend) tenía whitelist hardcodeada con los 5 escenarios v1. Sin esa actualización, `POST /api/simulator/scenario` con cualquier nombre nuevo (`copper_theft`, `genset_no_start`, etc.) hubiera retornado 400 "scenario not in whitelist" — invisible para el simulador pero bloqueante para la API. Es el tipo de inconsistencia que solo aparece en pruebas E2E cruzando capas.

### Lección de proceso

Sin el deep-dive en el pitch de Claro (slide 7 y 8 del .pptx), hubiéramos construido Sim-3 sobre templates v1 y descubierto la inconsistencia técnica recién durante un Q&A del cliente. Pedir y revisar materiales de venta antes de codear infraestructura demo es un hábito que conviene mantener.

### Archivos modificados

- `tools/device_simulator/seed.js` (templates v1 → v2)
- `tools/device_simulator/lib/sensor-engine.js` (estados, evolve contextual, 7 escenarios v2)
- `tools/device_simulator/lib/device.js` (_runScenario reescrito + helper _cancelActiveTimers)
- `app/api/routes/simulator.js` (whitelist actualizada a 7 escenarios)
- `tools/device_simulator/devices_state.json` (regenerado — gitignored)

### Commits

```
aa02744  feat(simulator): re-template SEC/GEN to match Claro pitch (v2)
```

### Próximo paso

**Sim-3 (panel oculto):** ya re-planificado en sesión #6 como versión simplificada (1-2 días). Panel `/demo/simulator` con lista de devices + toggles + botones de escenarios. Sin pulido visual, solo para que el operador controle la demo desde una segunda pantalla.

---

## Sesión #8 — 2026-05-18/19 — Reset documental + seguridad + Sim-3 paso 3

### Pivot estratégico
Tras debate del equipo (Asesor telco, Ex-técnico, Ing electrónico industrial,
Ing software senior, Backend Mongo/EMQX, Seguridad física, Marketing,
Confiabilidad industrial), se decidió que la demo a Claro debe comunicar
las 4 patas del valor de Wanomi (DEC-PHIL-3), no solo "cards cambiando de
color en un panel":

1. Disuasión local (sirena, estrobo, audio en sitio)
2. Notificación inteligente (Telegram con foto+ubicación)
3. Acción física automática (lock, válvula, apagado)
4. Trazabilidad forense (cronología inmutable con HMAC)

### Incidentes de seguridad
- **DEC-incident-1** (2026-05-18): Token Telegram bot @Wanomi_bot expuesto
  en chat al pegar mensaje de BotFather. Revocado y rotado el mismo día.
- **DEC-incident-2** (2026-05-18): PAT GitHub expuesto en chat durante setup
  del push inicial. Token viejo revocado. PAT nuevo (Fine-grained, scope
  solo iOTLOCALHOST, 90 días) generado y guardado en password manager.
- Protocolo resultante documentado en `SECRETS.md` (DEC-PROC-1).

### Auditoría del repo (28 commits en feature/telco-support)
Antes de proponer trabajo nuevo se auditó el estado real del código (DEC-PROC-2).
Hallazgos clave:
- **Fase 4 backend ya completo**: Site, ForensicEvent, HMAC chain, PDF export,
  forensic dispatcher, webhooks integration — todo implementado.
- **Fase 4 frontend inexistente**: no hay pages/sites/, no hay forensic UI.
- **Sim-3 paso 3 en progreso**: 3 archivos Vue sin commitear con reactividad
  MQTT validada E2E.

### Bugs resueltos
- **Vue 2 reactivity en DevicePanel**: cards no actualizaban al recibir MQTT.
  Causa: keys de `liveValues` no pre-inicializadas → Vue 2 no configura
  getters/setters. Fix: pre-inicializar todas las keys con `null` en `created()`.
- **Vue 2 SPA + template strings inline**: `template: "..."` no funciona en
  runtime SPA (no hay compilador). Fix: mover todo render a SFC `<template>`.

### Decisiones técnicas tomadas (DEC-HW-1..4, DEC-DATA-1..5, DEC-SW-1..6, DEC-PHIL-1..3, DEC-PROC-1..2)
Ver `docs/wanomi_modelo_conceptual.md` sección "Decisiones acumuladas".

### Commits de esta sesión

```
7ebdb5a  chore: tighten .gitignore for stale artifacts and snapshots
3c4eb56  docs: add project documentation structure
d79916f  feat(simulator-api): enrich GET /simulator/devices with templateWidgets
b582a7a  feat(simulator): add demo simulator panel (Sim-3 step 3)
87cf308  chore: track app/README.md, test.html and util/ scripts
```

### Archivos creados/modificados

- `SECRETS.md` — protocolo de manejo de secrets
- `docs/STATUS.md` — estado del proyecto (punto de entrada para nueva sesión)
- `docs/INVENTARIO_AUTO.md` — inventario regenerable del repo
- `docs/wanomi_modelo_conceptual.md` — modelo conceptual v0.2 con auditoría
- `scripts/inventario.sh` — generador de INVENTARIO_AUTO.md
- `.gitignore` — reforzado (node_modules, snapshots, Zone.Identifier, artefactos)
- `app/api/routes/simulator.js` — GET /simulator/devices enriquecido con templateWidgets
- `app/pages/demo/simulator.vue` — panel simulador master-detail
- `app/components/Simulator/DeviceList.vue` — lista agrupada por site
- `app/components/Simulator/DevicePanel.vue` — widgets en vivo con MQTT (631 líneas)

### Próximo paso

**Sim-3 paso 4**: agregar grilla de botones de escenarios al `DevicePanel.vue`.
Filtrado SEC vs GEN, estado activo + countdown, disable durante escenario activo.
Estimado: 1 día. Luego cierre de Sim-3 con commit y arranque de planificación Sim-3.5.
