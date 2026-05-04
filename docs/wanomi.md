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

**Última actualización:** 2026-04-28 (Sesión #4 cerrada)

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
6. **Sesión #5 sugerida:** Iniciar firmware PlatformIO + adaptaciones de plataforma mientras EJ Devices fabrica

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
