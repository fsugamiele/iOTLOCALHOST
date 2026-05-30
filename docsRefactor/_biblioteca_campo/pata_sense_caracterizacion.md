# Caracterización de la pata Sense + datos crudos

**Sesión #14 · Camino A4 · Área 3 (Hardware/Sensores) + Área 2 (soft sensors)**
Fuente: biblioteca de campo Cinetik. Datos reales de equipos y de telemetría de campo.

---

## 1 · Batería de litio — modelo de datos real (de `Record2024_*.csv`)

**Corrección al índice:** estos CSV **no son telemetría genérica de sitio** — son **logs de BMS de batería de litio** (familia ZX/ZTE, exportados por la herramienta de mantenimiento). Igual son muy valiosos: revelan el modelo de datos real de una batería en campo.

### Esquema por registro
`Date, Time, Battery No., Bar Code, SW Version, Capacity, Module Mode, SOC, Pack Voltage, Discharge AH, Battery Current, Battery Voltage, Pack Current, Cell1..24 Voltage, Cell1..24 Temper, Alarms`

### Muestra real (file 0905, batería UB23A0007912, 150 AH)
- Modo: `Offline`, SOC 100%, pack ≈ 52,57 V, corriente 0 A.
- Celdas activas: 11 de 24 pobladas; tensión 3,362–3,423 V; **Cell1 = 3,362 V** (la más baja → candidata a spread de celda).
- Temp celdas: 14–15 °C.
- **Alarma activa: `Break Lock Failure`** sostenida en toda la captura.

### ⚠ Gotcha de parsing crítico (para el pipeline)
El CSV usa **coma decimal** (locale AR): `52,57 V` = 52.57 V, `3,362 V` = 3.362 V — y la coma es **también** el separador de campos. El parser de ingestión **no puede hacer split ingenuo por coma**; hay que tratar el locale o el formato exacto del export. Esto aplica a cualquier ingestión de exports de herramientas de campo AR.

### Oportunidad de soft sensor (DEC-PRED-1)
La sesión #8 nombró explícitamente "degradación de batería por regresión de voltaje". Con este esquema, dos soft sensors construibles:
- **`cell_voltage_spread`** = max(cell) − min(cell). En la muestra ≈ 61 mV; spread creciente = desbalanceo/degradación.
- **`cell_temp_spread`** = max(temp) − min(temp). Celda caliente aislada = falla incipiente.

Ambos derivan de variables ancla (`source: inferred`), coherente con DEC-SENSOR-1.

---

## 2 · Puesta a tierra — referencia para SURGE (telurímetro UNI-T UT522)

El add-on SURGE (rayos) depende de buena puesta a tierra. El UT522 documenta la metodología y rangos de referencia:

| Medición | Rango | Precisión |
|---|---|---|
| Resistencia de tierra | 0–40 Ω / 0–400 Ω | (2.0%+3); señal de prueba ≈ 820 Hz |
| Tensión de tierra | 0–400 V (50/60 Hz) | (1.0%+6) |

**Uso en Wanomi:** el UT522 es un instrumento **manual de comisionado**, no un sensor inline. Sirve como (a) referencia de qué es "tierra sana" en un sitio (típicamente buscar baja Ω) y (b) dato de comisionado que el técnico de campo carga al instalar SURGE. Para monitoreo **continuo** de integridad de tierra, SURGE necesitaría otro principio de medición — queda como pregunta abierta de diseño, no resuelta por la biblioteca.

---

## 3 · Térmica de gabinete — termostatos (refina la pata AA)

| Equipo | Manual | Capacidad | Modalidad Wanomi |
|---|---|---|---|
| **TIC-17RGT** | TIC-17RGT.pdf | Setpoint de temp (gabinete Tx + Power); salida relé al setpoint. Sin bus. | **Sense puro** (Wanomi sensa temp independiente) |
| **TLZ11** | TLZ11.pdf | Setpoint de temp; **una salida de alarma a display + bornera de gabinete** (alarma AA preconfig. según specs Claro). Sin bus. | **Connect por contacto seco** (leer la alarma) **+ Sense** (temp real) |

### Refinamiento a DEC-INTEGRATION-1 (AA)
La decisión dice "AA = Westric Modbus o termostato manual → Sense puro". Con la evidencia, la pata AA tiene **tres modalidades**, no una:
1. **MCX (Westric)** → Connect por **Modbus** (RS-485 esclavo).
2. **TLZ11** → Connect por **contacto seco** (la bornera de alarma) + Sense para la temperatura real.
3. **TIC-17RGT** (u otros sin salida) → **Sense puro**.

Esto es coherente con la definición de Connect del glosario ("lee equipo existente por software Modbus/SNMP/**contacto seco**"). No contradice la decisión: amplía el menú de integración por tipo de sitio.

---

## 4 · Síntesis — pata Sense + modalidades de captura

| Dominio | Vía preferida | Vía alternativa | `source` |
|---|---|---|---|
| Energía DC (rectificador) | Connect Modbus/SNMP | Sense (shunt físico) si no hay bus | connect / physical |
| Batería litio | Connect (BMS/CSU) | Sense (tensión/temp física) | connect / physical |
| Spread de celda (salud batería) | soft sensor | — | inferred |
| AA / clima gabinete | Connect (MCX Modbus / TLZ11 contacto seco) | Sense puro (temp) | connect / physical |
| Puesta a tierra (SURGE) | Sense (comisionado) | — | physical |
| Combustible genset | Sense (ultrasónico) — ver render img.3 | — | physical |

---

## Conclusión para Bloque 3
La pata Sense queda con un mapa claro de **qué se mide físico vs. qué se lee del equipo**, por dominio. Dos refuerzos concretos:
1. El framework Connect necesita una **tercera modalidad** además de Modbus y SNMP: **contacto seco** (ya en el glosario, ahora con caso real TLZ11). El dual-engine pasa a **triple-modalidad: Modbus + SNMP + contacto seco/digital I/O**.
2. Hay un **gotcha de ingestión** (coma decimal) que debe estar en el diseño del pipeline desde el día 1, no descubrirse en piloto.

Pendiente no resoluble con la biblioteca: principio de medición para **monitoreo continuo de tierra** en SURGE, y datos crudos de **combustible** y **vibración** (los CSV presentes son solo de batería).
