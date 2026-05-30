# Biblioteca de Campo — Índice curado para Wanomi 3.0

**Fuente:** `cinetik.rar` (283 MB, 80+ archivos) · subido sesión #14
**Curación:** subconjunto relevante a Wanomi 3.0 (≈40 de 80+ archivos). El resto queda fuera por no aportar al refactor.
**Destino sugerido en repo:** `docsRefactor/_biblioteca_campo/` (versionar solo los archivos marcados ★ y ◆; el rar completo NO se versiona).

> ⚠ **Exclusión de seguridad obligatoria.** Antes de cualquier redistribución, sacar del bundle: `llaves.xlsx`, `Usuario_y_Contraseña_ZTE.pdf`, `Cinetik.json`, `Newtonsoft.Json.xml`, `MaintenanceTool.exe.Config`. Si contienen credenciales vivas de equipos en producción, rotarlas. **No fueron abiertos.**

Leyenda de prioridad: ★ crítico (driver MVP) · ◆ alto (driver fase 1-2 / Sense) · ○ referencia.

---

## 1 · Rectificación / Power Plant — driver Connect "Rectificadores"

Cubre DEC-INTEGRATION-1 (Eltek SmartPack S Modbus TCP) y el parque de rectificación del `informe_marcas_claro`.

| Prio | Archivo | Equipo | Protocolo confirmado |
|---|---|---|---|
| ★ | controladora eltek flatpack.pdf | **Eltek Smartpack S** (User's Guide, PN 242100.410) | **Modbus TCP** + SNMP v3 (Ethernet); Modbus RTU serie (pending) |
| ★ | SMART PACK 2.pdf | Eltek Smartpack II | Modbus TCP + SNMP v3 |
| ◆ | Instalacion y comisionamiento de power ELTEK con SMARTPACK II.pdf | Eltek SmartPack II (comisionado) | — |
| ◆ | Configuring to Eltek power plant input output.docx | Eltek (mapa I/O) | — |
| ◆ | Configurar GE - Eltek.Rev02.pdf | Eltek + GE (integración) | — |
| ○ | Parametrizacion ELTEK para VRLA.pdf | Eltek (params batería) | — |
| ○ | ELTEK NUEVO MMBU.pdf | Eltek MMBU | — |
| ◆ | CONTROLADORA VERTIV.pdf / sc200.pdf / manual-...-sc200.pdf | **Vertiv/Emerson SC200** | a verificar (SC200 soporta Modbus/SNMP) |
| ◆ | CONTROLADORA DELTA.pdf / 320654327-Consideraciones-Power-Plant-Delta.pdf | Delta power plant | a verificar |
| ◆ | csu501b / sj-...csu501b... / ZXDU CSU518B & 513B | **ZTE ZXDU CSU** (supervisión) | a verificar |
| ○ | controladora mcx.pdf | MCX | — |
| ○ | CONTROLADOR-COMAP-PWR.pdf | ComAp PWR (rectif.) | Modbus (familia NT) |
| ○ | CONFIGURACIÓN DOBLE LVD POWERS.pdf | LVD config | — |

---

## 2 · Grupos electrógenos + ATS — driver Connect "GEF/ATS"

Cubre DEC-INTEGRATION-1 (GEF Cummins PCC + ComAp + DSE; ATS ComAp InteliATS²).

| Prio | Archivo | Equipo | Protocolo confirmado |
|---|---|---|---|
| ★ | GE- ComAp ATS.pdf | **ComAp InteliATS NT PWR** v2.0 (92 pp.) | **Modbus** (register-oriented), RS232/RS485, 9600-57600 bps |
| ★ | 25225695-manual-transferencia-cummins.pdf | Cummins / PowerCommand (transferencia, 119 pp.) | Modbus (PCC) — a mapear |
| ◆ | Westric SW302.pdf / 76-1023-05 - SW-302-Secuenciador.pdf | **Westric SW-302** (secuenciador AA) | a verificar — DEC-INTEGRATION-1 |
| ○ | manual grupo monte ralo.pdf / manual grupo wilson.pdf | Gensets físicos (sitios reales) | — |
| ○ | Instructivo Arranque Eficiente GE v1.pdf | Procedimiento O&M | — |

---

## 3 · Aire acondicionado — Sense puro (DEC-SCOPE-1 fase 2)

| Prio | Archivo | Equipo |
|---|---|---|
| ◆ | 76-2007-07 - AM-300-500-620-700.pdf | AA telecom AM-300/500/620/700 |
| ◆ | 76-2037-16 ... AM-003-005 ... R-410A | AA mochila c/economizador |
| ○ | InstructivosAA.pdf | Instructivos AA |

---

## 4 · Instrumentación física — diseño de sensores Sense / SURGE

| Prio | Archivo | Uso en Wanomi |
|---|---|---|
| ◆ | toaz...telurimetro UNI-T UT522... | Medición de puesta a tierra → referencia para SURGE (rayos) |
| ○ | TIC-17RGT.pdf / TLZ11.pdf | Termostatos (referencia Sense térmico) |

---

## 5 · Datos crudos — calibración de soft sensors / baselines (DEC-SENSOR-1)

| Prio | Archivo | Valor |
|---|---|---|
| ★ | Record2024_0802_1347_Per30s.csv | Telemetría real, período 30 s |
| ★ | Record2024_0802_1422_Per5s.csv | Telemetría real, período 5 s |
| ★ | Record2024_0905_1254_Per5s.csv | Telemetría real, período 5 s |

> Son muestras de logging real de campo. Sirven para validar el muestreo de los soft sensors y construir baselines iniciales antes de tener datos propios por sitio.

---

## 6 · Gateway IoT de referencia — benchmark del Hub (Área 3 / Área 2)

| Prio | Archivo | Uso |
|---|---|---|
| ◆ | CloudLi User Manual_IOT Gateway.pdf | Benchmark de gateway IoT comercial vs. el Hub Wanomi |
| ○ | Configuracion IoT.pdf (×3, duplicados) | Config gateway |

---

## 7 · Gabinetes / enclosure — diseñador industrial (bloqueo Hardware #1)

| Prio | Archivo | Uso |
|---|---|---|
| ◆ | Gab. Telepartes.pdf / Telepartes Modelo viejo.pdf | Referencia mecánica de gabinetes telco AR |
| ◆ | Z31Y Gabinete Nilko.pdf | Referencia gabinete Nilko |

---

## 8 · Baterías litio telecom — contexto de backup

| Prio | Archivo |
|---|---|
| ○ | ZXDC48 FB150C1 (×3: install / product desc / datasheet) · ZTE litio |
| ○ | MANUAL INSTALADORES_BB LITIO (×2) |
| ○ | Documento Configuracion Baterías Litio ZX.docx · Instructivo ZTE litio-1.pdf |

> `NEW- Lithium battey Maintenance Tool.zip` contiene software ejecutable — **no abrir** salvo necesidad puntual y en entorno aislado.

---

## 9 · Contexto telco / formación — referencia (no driver)

Serie de capacitación de red móvil Claro y material RAN. Útil como contexto de dominio para Área 1, no como insumo de driver:
`DIA 1A`…`DIA 3D` (red móvil, comunicaciones, FLEXI/AirScale, SRAN, RETs, troubleshooting) · `nokia-enb-alarms-list.docx` · `Workshop_SW_EF_2021 - Alarmas.pdf` · `Wavence_config_WebCT` · `Planilla Red de gestion IP de Radioenlaces` · `familia 6120H` · `Resumen_SRv6` · `4G_guia_comisionado_LTE.pptx` · `Introducción a la telefonía celular.docx` · `Instructivo Paso a paso (Comtech)` · `INSTALACIONBB_v5.pdf` · `PROCEDIMIENTO DE CARGA DE INSUMOS.pdf`.

---

## 10 · Fuera de alcance Wanomi 3.0

`20250925_Ventas_AR_Mercado_Libre...xlsx` · `626577526-FXCB-to-ARCA-Swap.pptx` · `0981-0172-01-Issue-Spanish.pdf` (sin clasificar) · `WhatsApp Image 2025-02-22.jpeg` · `Instructivo Configuración EATON.pptx` (UPS Eaton — revisar si aplica a alimentación del Hub).

---

## Impacto en la sesión #14

Esta biblioteca **resuelve parcialmente** dos bloqueos registrados:
- **Software · bloqueo #2** ("sin manuales Modbus oficiales, los parsers son inferencia") → Eltek SmartPack S y ComAp InteliATS NT pasan de inferencia a documentación dura. Ver `mapeo_modbus_drivers.md`.
- **Estrategia · dependencia** (manuales Modbus para validar en lab) → cubierta para Eltek + ComAp.

Sigue abierto: equipos físicos de prueba en lab (la doc no reemplaza el equipo) y manuales Modbus de **Cummins PCC** (el manual presente es de transferencia, falta verificar el mapa de registros PCC).
