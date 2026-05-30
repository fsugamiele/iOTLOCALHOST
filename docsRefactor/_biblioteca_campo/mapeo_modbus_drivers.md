# Mapeo de drivers Connect — Fichas técnicas Modbus

**Sesión #14 · Área 2 (Software) + Área 1 (Estrategia)**
Fuente: biblioteca de campo Cinetik. Datos extraídos de los manuales oficiales, no inferidos.
Cobertura: 2 drivers prioritarios caracterizados. Pendientes marcados al final.

> **Nota de honestidad arquitectónica (DEC-SENSOR-3):** todas las variables aquí provienen del bus del equipo → `source: connect`. Ninguna requiere sensor físico Wanomi. Esto alimenta directamente la tabla 8.2 del `informe_marcas_claro` ("sensores que Wanomi NO necesita instalar").

---

## Driver 1 · Eltek Smartpack S — Rectificación ★ MVP

**Manual:** `controladora eltek flatpack.pdf` — *Smartpack S Controller User's Guide* · PN 242100.410

### Capa de transporte

| Parámetro | Valor |
|---|---|
| Protocolo primario | **Modbus TCP** (sobre Ethernet 10/100 BASE-T, Auto MDI/MDI-X) |
| Otros protocolos IP | HTTP/SSL, SNMP v3, pComm UDP (PowerSuite) |
| Protocolo serie | RS-232 / RS-485 en RJ11 → Modbus RTU **(marcado "pending" en este firmware)** |
| IP por defecto | `192.168.10.20` (estática, configurable vía Eltek Network Utility / EVIPSetup.exe) |
| Puerto Modbus TCP | 502 (estándar; confirmar en firmware del sitio) |
| Display local | 2.2" TFT color QVGA + 4 teclas |

### Variables disponibles por el bus (`source: connect`)

Derivadas de las System Connections del controlador:

| Variable Wanomi | Origen en Smartpack S | Nota |
|---|---|---|
| `dc_bus_voltage` | Voltage sense (soporta 12/24/**48**/60 VDC) | Coincide con planta −48 VDC telco |
| `dc_load_current` | Current sense vía shunt (0–20 mV / 0–60 mV) | Requiere conocer ratio del shunt del sitio |
| `rectifier_status[]` | CAN bus addressing (cada rectificador con ID 01, 02…) | El controlador agrega N rectificadores por CAN |
| `battery_fuse_status` | Battery fuse monitoring (aux switch NO/NC) | Booleano |
| `load_fuse_status` | Load fuse monitoring (aux + diode matrix) | Booleano |
| `alarm_relays[1..6]` | 6× relay dry/Form C configurables NO/NC (75V/2A/60W) | Alarmas físicas mapeables a eventos NOC |
| `temperature` | Sensado de sistema | Rango operativo −20 a +60 °C |

### Acción para el equipo
La **lista exacta de registros Modbus TCP** no viene en este User's Guide: Eltek la documenta en el archivo `350020.073` (Functionality Description) y en el WebPower Online Help. **Pendiente:** obtener ese documento de registros, o leer el mapa vía PowerSuite contra un controlador físico en lab.

---

## Driver 2 · ComAp InteliATS NT PWR — ATS/GEF ★ MVP

**Manual:** `GE- ComAp ATS.pdf` — *InteliATSNT PWR Reference Guide* SW v2.0 (ComAp, jun 2010)

### Capa de transporte

| Parámetro | Valor |
|---|---|
| Protocolo | **Modbus RTU register-oriented** (vía COM1 o COM2) |
| Interfaz física | RS232 (COM1) + RS485 (COM2), tarjeta plug-in `IL-NT-RS232-485` |
| Velocidades | **9600 / 19200 / 38400 / 57600 bps** (`ModbusComSpeed`) |
| Direccionamiento | `ControllerAddr` 1–32 → multi-drop RS485, varios controladores en una línea |
| Modo COM | `COM1 Mode` y `COM2 Mode` = `MODBUS` |
| Modelo de registro | Communication object de 16 bits = dirección de registro; longitud en nº de registros |

### Registros confirmados (communication object = dirección Modbus)

Extraídos de la *Communication object list* (archivo default IA-NT-PWR). Una lectura = un communication object.

| Variable | Com. obj (reg.) | Tipo | Unidad |
|---|---|---|---|
| Nominal Power | 8276 | Unsigned 16 | kW |
| Nominal Current | 8275 | Unsigned 16 | A |
| Nominal Volts | 8277 | Unsigned 16 | V |
| Nominal Freq | 8278 | Unsigned 16 | Hz |
| CT Ratio | 8274 | Unsigned 16 | /5A |
| Controller Address | 24537 | Unsigned 8 | — |
| Batt Undervolt thr. | 8387 | Integer 16 | V |
| Batt Overvolt thr. | 9587 | Integer 16 | V |
| Mains >V trip | 8305 | Unsigned 16 | % |
| Mains <V trip | 8307 | Unsigned 16 | % |
| Mains >Freq trip | 8310 | Unsigned 16 | % |
| Mains <Freq trip | 8312 | Unsigned 16 | % |
| Transfer Delay | 8303 | Unsigned 16 | s |
| Mains Return Delay | 8302 | Unsigned 16 | s |
| Connection Type | (string list) | — | 3Ph4W/3Ph3W/Split/Mono |

> Los anteriores son **setpoints** (configuración). Las **mediciones en vivo** (V/A/Hz reales, posición ATS, estado de transferencia, alarmas activas) están en otra sección de communication objects que se obtiene exportando la descripción del controlador con LiteEdit ("export data") on-line o desde el archivo `.ail`.

### Variables vivas esperadas (`source: connect`)
Posición ATS (red/grupo), estado de transferencia, eventos, tensión/frecuencia de red y de grupo, alarmas. Coherente con la fila "ATS ComAp → posición lógica, estado" de la tabla 8.1 del `informe_marcas_claro`.

### Acción para el equipo
Para el mapa de registros de **mediciones vivas** (no setpoints): exportar con LiteEdit la descripción del IA-NT-PWR del sitio, o leer contra controlador físico. El protocolo y el modelo de registro ya están confirmados — el parser es construible hoy en su esqueleto.

---

## Pendientes de caracterización

| Driver | Estado | Qué falta |
|---|---|---|
| **Cummins PCC** (GEF) | Parcial | El manual presente (`25225695`) es de transferencia/ATS, no expone el mapa de registros PCC 2.x/3.x. Conseguir el "PowerCommand Modbus register table". |
| **Westric SW-302** (AA secuenciador) | Sin abrir | Verificar si expone Modbus o si va a Sense puro (DEC-INTEGRATION-1 lo deja como "Modbus o termostato manual → Sense"). |
| **Vertiv/Emerson SC200** (rectif.) | Sin abrir | `sc200.pdf` (150 pp.) — confirmar Modbus/SNMP y mapa. |
| **Delta / ZTE ZXDU CSU** (rectif.) | Sin abrir | Segundos en prioridad tras Eltek. |

## Conclusión para Bloque 3 (MVP)
Con Eltek SmartPack S (Modbus TCP) + ComAp InteliATS NT (Modbus RTU) caracterizados a nivel protocolo, el **driver framework multi-driver (DEC-INTEGRATION-1) tiene dos targets reales para el MVP**, no inferencia. El único insumo que la documentación no reemplaza es **un equipo físico en lab** para validar el mapa de registros vivos de cada uno.
