# Registros GEF consolidado — firmware-ready

**Sesión #14 · Bloque 3 (opción 3) · Área 2 + Área 3**
Cierra el dominio mecánico del motor vía Connect. Fuentes: aportes de Franco (mapas InteliGen + Cummins) + manual InteliATS (rar) + informe de marcas.

> **Esto resuelve mi corrección anterior:** el dominio mecánico (°C, presión de aceite, RPM, combustible, horas) **SÍ es Connect-able** — sale del controlador de **motor** (InteliGen / Cummins), no del de transferencia (InteliATS). Sense del motor deja de ser obligatorio donde hay InteliGen o Cummins.

---

## 0 · Reconciliación crítica de esquemas de direccionamiento ⚠

Tenemos **tres mapas ComAp/Cummins con dos convenciones distintas**. El firmware debe identificar el controlador y aplicar el mapa correcto (el "Paso 1 — detectar tipo" del aporte):

| Controlador | Rol | Direccionamiento | Da mecánico |
|---|---|---|---|
| ComAp **InteliATS NT** (mapeado en A6) | Transferencia (ATS) | **comm-object** (Gen V=8192, Breaker=8455) | No |
| ComAp **InteliGen NT** (este aporte) | Motor/genset (AMF) | **PLC 40001-range**, offset = reg−40001, FC 0x03 | **Sí** |
| **Cummins PowerCommand** (este aporte) | Motor+ATS integrado | **PLC 40001-range**, Genset 0 = 40001+ | **Sí** |

**Implicación de alcance:** el informe de marcas dice que el genset dominante es **Himoinsa, que monta ComAp InteliGen**. Entonces el **InteliGen es probablemente el target primario del MVP**, no el InteliATS — y el InteliGen da eléctrico + mecánico + estado en una sola conexión. El InteliATS aplica solo a sitios con controlador de transferencia separado.

---

## 1 · ComAp InteliGen NT — Modbus RTU

**Transporte:** RS485 2 hilos, **57600 bps** def (9600/19200/38400/57600), 8N1, slave 1–32, term. 120 Ω. Aislamiento galvánico ≥2.5 kV obligatorio (EJ Devices). FC 0x03, offset = reg−40001.

### Motor — batch 40051-40057 (addr 0x0032, qty 7, una transacción)
| Reg | Variable | Tipo | Escala | Unidad |
|---|---|---|---|---|
| 40051 | Battery Volts | U16 | ×0.1 | V |
| 40054 | Oil Pressure | U16 | ×0.1 | Bar |
| 40055 | Engine Temperature | U16 | ×1 | °C |
| 40056 | **Fuel Level** | U16 | ×1 | % |
| 40052/53/57 | Mode / D+ / IOM Status | U16 | — | — |

### Estado — batch 40163-40165 (addr 0x00A2)
- **40163 Engine State** U16: 0=OFF, 2=Ready, 3=Prestart, 4=Cranking, 6=Starting, **7=Running, 8=Loaded**, 9=Stopping, 10=Stopped, 11=Shutdown. Secuencia OK = 2→3→4→6→7→8; falla = p.ej. 4→…→10.
- 40164 GCB State / 40165 MCB State: 0=Open, 1=Closed, 2=Tripped.

### Eléctrico 40001-40010 · Red 40020-40023 · Contadores 40070-40072
- Gen V L1/L2/L3-N (40001-03 ×1 V), Gen A (40004-06 ×1 A), Gen Freq (40007 ×0.1 Hz), kW/kVA/PF (40008/09/10).
- Mains V L1/L2/L3-N (40020-22 ×1 V), Mains Freq (40023 ×0.1 Hz).
- Run Hours 32-bit (40070 high / 40071 low), Start Attempts (40072).

---

## 2 · Cummins PowerCommand — Modbus RTU

**Transporte:** RS485, **9600 bps** def (hasta 38400; PCC 3.3 a veces 38400), slave 1–247. Genset 0 = 40001–40099 (offset +100/genset adicional; sitios Claro = 1 GEF).

### Estado/falla 40011-40013
- 40011 Operating State: 0=Stopped, 1=Start Pending, 2=Warm-up, **3=Running**, 4=Cooldown Rated, 5=Cooldown Idle.
- **40012 Fault Code** (>0 = falla activa) · **40013 Fault Type**: 0=Normal,1=Warning,2=Derate,3=Shutdown+Cool,4=Shutdown.

### Motor — batch 40035-40045 (addr 0x0022, qty 11)
| Reg | Variable | Tipo | Escala | Nota |
|---|---|---|---|---|
| 40035 | Battery Voltage | U16 | ×0.1 Vdc | |
| 40036 | Oil Pressure | U16 | ×0.1 kPa | |
| 40037 | Oil Temperature | S16 | ×0.1 °F | **convertir: °C=(°F−32)×5/9** |
| 40038 | Coolant Temperature | S16 | ×0.1 °C | directo |
| 40041 | Fuel Rate | U16 | ×1 GPH | |
| 40042 | Engine RPM | U16 | ×1 | |
| 40043 | Number of Starts | U16 | ×1 | |
| 40044/45 | Runtime | U32 | high/low (/10 = s) | |

### Eléctrico 40018-40031 · Utility 40118-40120 (PCC 3.x) · Totales
- Freq (40018), PF (40019 ×0.00005), kVA/kW/kVAR (40020-22), V L-L (40023-25), V L-N (40026-28), Current (40029-31 ×0.1 A).
- Utility V L1/L2/L3-N (40118-20) — solo PCC 3.x.
- Total kWh (40046/47), **Total Fuel** (40072/73 ×0.1 gal, 32-bit) → permite detectar **sifoneo** (caída no explicada por consumo).

### NFPA 110 bitmap — registro 40016 (una lectura, 8 fallas) ★
bit15 Common Alarm · 14 Supplying Load · **13 Genset Running** · 12 Not In Auto · 11 High Batt V · **10 Low Batt V** · 9 Charger Fail · **8 Fail to Start (CRÍTICO)** · 7 Low Coolant Temp · 6 Pre-High Eng Temp · **5 High Engine Temp (CRÍTICO)** · 4 Pre-Low Oil · **3 Low Oil Pressure (CRÍTICO)** · **2 Overspeed (CRÍTICO)** · 1 Low Coolant Level · **0 Low Fuel Level**.

---

## 3 · Combustible: dónde es Connect y dónde es Sense

| Controlador | Fuel Level nativo | Modalidad |
|---|---|---|
| ComAp InteliGen | **Sí** (40056, %) | **Connect** |
| Cummins PowerCommand | **No nativo** | **Sense** (ultrasónico — el render imagen 3) |

Esto ata el sensor de combustible del render a una necesidad real: **sitios Cummins**. En sitios InteliGen, el combustible se lee del bus.

---

## 4 · Expansión del catálogo de detección — dominio mecánico

El mecánico Connect agrega una categoría entera a las 37 reglas previas. Umbrales del aporte:

| Regla | Registro | Warning | Crítico |
|---|---|---|---|
| Combustible bajo | Fuel Level / NFPA b0 | <25% | <10% |
| Presión de aceite | Oil Pressure / NFPA b3 | <2.0 Bar | <1.0 Bar |
| Temperatura motor | Engine Temp / NFPA b5 | >95 °C | >105 °C |
| Batería de arranque | Battery Volts / NFPA b10-11 | <22 o >30 V | <20 o >32 V |
| Fallo de arranque | Engine State 4→10 / NFPA b8 | — | crítico |
| Sobrevelocidad | NFPA b2 | — | crítico |
| Falla activa (Cummins) | Fault Code/Type 40012-13 | Warning/Derate | Shutdown |
| Sifoneo de combustible | Total Fuel vs consumo | desvío | — |
| Mantenimiento preventivo | Run Hours (250 h aceite / 500 h filtro) | umbral | — |

> La detección mecánica es **día 1, sin baseline** (DEC-INTEL-1): son umbrales contra registros directos. La amplitud de detección sube de ~26 a ~40+ reglas de día 1.

---

## 5 · Registros de COMANDO (escritura) — FUERA del MVP ⚠ seguridad

Ambos controladores exponen escritura: ComAp 46359-46364 (Start/Stop/Fault Reset, con User/Password), Cummins 40300-40302 (Start/Stop, Fault Reset, **E-Stop**).

**Decisión de seguridad para el MVP: read-only estricto.** Escribir a un controlador de grupo (arranque/parada remota) es riesgo operativo y de responsabilidad alto, excede DEC-SURVEY-2 (lecturas pasivas por default) y no aporta al pitch de monitoreo. Las capacidades de control quedan documentadas pero **deshabilitadas en firmware** para el piloto. Reabrir solo con decisión explícita y bajo contrato.

---

## 6 · Pendiente real tras este aporte

1. **Verificación contra fuente primaria** antes de lab: confirmar escalas y signed/unsigned de cada registro contra los PDFs oficiales (links abajo). Crítico para Cummins (Oil Temp en °F, PF ×0.00005, temps signed).
2. **Equipo físico en lab** para validar lecturas vivas (sigue siendo el único insumo que la doc no reemplaza).
3. **Eltek SmartPack S**: mapa de registros Modbus TCP aún parcial (doc 350020.073) — es el rectificador, complementa pero es otro target.

---

## Fuentes oficiales (para verificación primaria del firmware)
- ComAp IGS-NT Communication Guide: comap.cz/files/prods/2842/IGS-NT_Communication_Guide.pdf
- ComAp IL-NT/IA-NT/IC-NT Communication Guide r1: comap.cz/files/prods/2300/IL-NT-IA-NT-IC-NT_Communication_Guide_r1.pdf
- ComAp BaseBox Communication Guide: comap.cz/files/prods/2840/BaseBox_Communication_Guide.pdf
- Cummins PowerCommand ModLon II Gateway (ModBus Data Points, May 2011): kohlercareconnect.com/ModBus_Data_Points_List_May_2011.pdf
- Cummins Modbus Register Mapping: ccontrols.com/support/dp/modbus2300.pdf
- Cummins EMCP 4.3 SPN/FMI Fault Codes: docs.cummins.com/manuals/2007/CGRM0181.1.pdf

> Nota: estos links no se verificaron en vivo en esta sesión (red restringida). El firmware debe descargarlos y validar antes de flashear.
