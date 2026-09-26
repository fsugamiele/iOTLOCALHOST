# Diseño — Packs de alarmas preconfiguradas (motor de reglas Wanomi 3.0)

**Estado:** diseño pre-implementación (para firma). No es implementación ni decisión de corpus todavía.
**Fuentes:** `docsRefactor/_biblioteca_campo/` — 8 documentos curados (que destilan ~40 manuales
del bundle Cinetik) + muestreo directo de datasheets/manuales (InteliLite MRS16, grupos Wilson/DSE
y Monte Ralo/John Deere, Eltek Smartpack S, Vertiv NCU, batería litio ZX, Westric SW-302).
**Método (reglas duras):** procedencia citada por dato (DEC-PROC-3); no se inventan umbrales
donde no hay evidencia (DEC-PRED-1); detección = capacidad de día 1, predicción solo donde el
equipo ya emite pre-aviso o hay tendencia medible (DEC-INTEL-1).

> **Qué corrige este diseño.** Los packs previos eran de *detección con recomendación genérica*
> ("revisar", "despachar técnico"). Este rediseño los vuelve packs de **anticipación** (avisan
> antes del corte) con **recomendación precisa** (acción de campo tomada del manual del equipo).

---

## 1 · Los 3 mecanismos de anticipación (que ya traen los equipos)

No hace falta ML: los controladores **ya emiten la señal temprana**. Wanomi la capta.

1. **Nivel de PRE-AVISO antes del disparo.** Todos los controladores usan el modelo de 2 niveles
   (advertencia/warning → disparo/trip → parada/shutdown) con TimeDelay + histéresis:
   - **Cummins NFPA 110** (reg. 40016) tiene bits de pre-alarma: `Pre-High Eng Temp` (b6) antes de
     `High Engine Temp` (b5); `Pre-Low Oil` (b4) antes de `Low Oil Pressure` (b3); `Charger Fail` (b9).
     Fuente: `registros_consolidado_gef.md §2`.
   - **John Deere/SDMO (J1939):** FMI `15/16` = "moderadamente alto", `17/18` = "moderadamente bajo"
     → aparecen antes del FMI `00/01` extremo. Fuente: `catalogo_spn_fmi_j1939.md`.
   - **Eltek / Vertiv:** monitores `MinorHigh` (aviso) antes de `MajorHigh` (crítico), con TimeDelay.
     Fuente: `controladora eltek flatpack.pdf` p.30-31 · `CONTROLADORA VERTIV.pdf` p.88.
   > **Detectar el pre-aviso = anticipar la parada.** Cada regla crítica lleva su regla de
   > pre-aviso emparejada (§4).
2. **Códigos J1939 SPN/FMI del motor** (los lee ComAp/InteliLite/DSE en texto plano). Cada código
   trae su acción de fábrica → recomendación precisa por lookup (§5 + `catalogo_spn_fmi_j1939.md`).
3. **Tendencia (soft sensor de pendiente).** El valor *moviéndose* hacia el límite antes de cruzarlo:
   presión de aceite cayendo, temp subiendo, batería DC hacia el LVD (40 V), consumo acelerándose.
   Tipo **M** (madura con el piloto, DEC-PRED-1).

---

## 2 · Tabla maestra por modo de falla — causa → señal temprana → acción precisa

| # | Modo de falla | Causa raíz (fuente) | Señal temprana (anticipación) | Recomendación precisa | Motor |
|---|---|---|---|---|---|
| F1 | Sitio se apaga al caer la red | GEF no arranca (batería/combustible/arranque) | `Charger Fail` NFPA b9 · batería <24 V en reposo días antes | "Batería de arranque degradándose: reemplazar antes del próximo corte; el GEF puede no levantar." | D/S |
| F2 | Parada por baja presión de aceite (LOP) | Nivel bajo / bomba / filtro | `Pre-Low Oil` b4 · SPN 100 FMI 18 · presión cayendo bajo 2.5 Bar | "Comprobar el nivel de aceite y fugas; no operar bajo carga hasta corregir." | D + S |
| F3 | Shutdown térmico del motor | Refrigerante bajo / radiador / carga | `Pre-High Eng Temp` b6 · SPN 110 FMI 15/16 · SPN 111 (nivel refrig.) | "Revisar nivel de refrigerante, limpieza de radiador y termostato; reducir carga." | D + cross |
| F4 | Falla del motor por combustible | Filtro/líneas obstruidas · agua en combustible | SPN 1347 FMI 07 · SPN 97 FMI 16 · SPN 107 (filtro aire) | "Comprobar/cambiar filtro y líneas de combustible; vaciar separador de agua." | D (lookup SPN) |
| F5 | Tanque vacío → sitio caído | Run prolongado sin retorno de red | Autonomía = nivel × consumo < N horas | "Autonomía < 6 h: despachar recarga ya; a este consumo el tanque se agota ≈HH:MM." | M |
| F6 | Falla de transferencia ATS | Red cae, grupo corre, ATS no transfiere | Gen V ok + Mains=0 + breaker sin cerrar en Transfer Delay | "ATS no transfirió: sitio en riesgo aunque el grupo corra — despacho urgente al ATS." | S/cross |
| F7 | Colapso de planta DC (autonomía) | Batería hacia LVD (40 V) — rectificadores no reponen | Pack V cayendo hacia 40 V · SOC↓ · "Baja tensión de entrada" (Vertiv) | "Planta DC hacia desconexión (LVD 40 V): verificar AC de entrada y estado de rectificadores." | C + M |
| F8 | Rectificador en falla / N+1 comprometido | Convertidor/EEPROM defectuoso · cierre térmico | "Alimentación limitada por temperatura" (warning Vertiv) antes del cierre | "Rectificador N en falla o limitando por temp: revisar carga/ventilación; verificar redundancia N+1." | D (alarma SNMP) |
| F9 | Degradación de batería DC | Desbalanceo de celdas | `cell_voltage_spread` creciente · `cell_temp_spread` | "Celda desbalanceada (spread creciente): programar reemplazo del módulo antes de perder autonomía." | M |
| F10 | Robo de combustible / batería | Sifoneo · hurto | `Total Fuel` cae sin consumo · alarma "Robo de Baterías" del BMS | "Caída no explicada por consumo: posible sifoneo/hurto — inspección física del sitio." | S / D |
| F11 | Falla de AA → riesgo térmico de sala | Compresor/equipo de punta cae | E1/E2 abre (contacto seco) antes de que suba la temp de sala | "AA de punta en falla: el de reserva tomó la carga — despachar service de clima antes del alza térmica." | D (contacto seco) |

---

## 3 · Telemetría y umbrales por equipo (con procedencia)

### A) Grupo — controlador ComAp (InteliGen NT / InteliLite MRS16) · Cummins PCC
Fuente: `registros_consolidado_gef.md §1,§2,§4` + datasheet InteliLite MRS16.

| Variable | Warning | Crítico | Fuente | Tipo |
|---|---|---|---|---|
| Presión de aceite | <2.0 Bar | <1.0 Bar | registros §4 | D |
| Temperatura motor | >95 °C | >105 °C | registros §4 | D |
| Combustible (InteliGen nativo; Cummins = Sense) | <25 % | <10 % | registros §3,§4 | D |
| Batería de arranque | <22 o >30 V | <20 o >32 V | registros §4 | C (vs setpoint) |
| Fallo de arranque | — | Engine State 4→10 / NFPA b8 | registros §1,§2 | S |
| Sobrevelocidad | — | NFPA b2 / SPN 190 | registros §2 | D |
| Horas de marcha (mant.) | 250 h aceite / 500 h filtro | — | registros §4 | S |

### B) ATS — ComAp InteliATS NT (cascada de energía)
Fuente: `catalogo_deteccion_comap.md` (37 reglas) + `mapeo_modbus_drivers.md §2` (setpoints 82xx).
Reglas núcleo: pérdida/retorno de red, transferencia, **falla de transferencia**, flapping,
sub/sobretensión y frecuencia (tipo **C**, auto-calibradas vs los setpoints del propio ComAp).

### C) Rectificador / Planta DC — Eltek Smartpack S · Vertiv NCU · ZTE
Fuente: `mapeo_modbus_drivers.md §1`, Eltek p.30-31, Vertiv p.88/202, manual litio p.59.
- Tensión de bus DC → **regla C (auto-calibrada)** contra los setpoints de la planta (no hardcodear).
- **LVD = 40 V** (banco litio, manual instaladores p.59) → umbral de referencia para autonomía DC.
- Alarmas por rectificador vía **SNMP** (Vertiv expone tabla de alarmas activas + severidad, p.202).
- Corriente de carga, fusibles (batería/carga), temperatura → D/C.

### D) Batería litio — BMS ZX/ZTE
Fuente: `pata_sense_caracterizacion.md §1` + manual litio.

| Variable | Propuesta umbral | Fuente | Tipo |
|---|---|---|---|
| SOC | <30 % / <15 % | esquema CSV | D |
| Tensión de pack | vs LVD 40 V | manual p.59 | C |
| cell_voltage_spread (max−min) | *creciente* (propuesta, validar) | pata_sense §1 | M |
| cell_temp_spread | celda caliente aislada | pata_sense §1 | M |
| Alarma robo de baterías | booleano | manual p.59 | D |

> ⚠ Ingestión: CSV de campo usan **coma decimal** (locale AR) — el parser no puede hacer split ingenuo.

### E) AA / clima — Westric SW-302 · MCX · TLZ11
Fuente: `matriz_drivers_connect.md`, `pata_sense_caracterizacion.md §3`, Westric p.12-13.
- Westric SW-302 expone por **contacto seco**: falla equipo E1/E2, alarma alta temperatura (F) con demora.
- MCX = Modbus esclavo (temp/humedad/válvula). TLZ11 = contacto seco + Sense de temp.

---

## 4 · Packs preconfigurados (mapeados a fichas + reglas con pre-aviso emparejado)

Cada pack = un `deviceType` (ficha) con reglas **de disparo + su pre-aviso**. Tipos del motor
actual: **D** (umbral), **C** (auto-calibrada vs setpoint), **S** (ventana), **cross** (combinación),
**M** (soft sensor, madura).

### Pack "Grupo ComAp / InteliLite"
| Regla | Tipo | Disparo | Pre-aviso emparejado |
|---|---|---|---|
| Presión de aceite baja | D+S | <1.0 Bar (crít) | <2.0 Bar (aviso) / pendiente cayendo |
| Temperatura de motor | D+cross | >105 °C | >95 °C · temp↑ con carga baja |
| Combustible bajo | D | <10 % | <25 % |
| Batería de arranque | C | <20/>32 V | <22/>30 V · Charger Fail |
| Fallo de arranque | S | State 4→10 | reintentos de arranque subiendo |
| Sobrevelocidad | D | NFPA b2 / SPN 190 | SPN 190 FMI 16 |
| Mantenimiento preventivo | S | 250 h / 500 h | — |
| Códigos de motor (J1939) | D lookup | SPN/FMI activo | FMI 15/16/17/18 (moderado) |

### Pack "Grupo Cummins"
Igual núcleo mecánico (temp, aceite, batería) + **Fault Code/Type** (40012/13) + **fuel por Sense**.

### Pack "Cascada de energía (ATS)"
Pérdida de red · **falla de transferencia** (S/cross) · grupo corriendo sin carga (cross) ·
flapping de red (S) · sub/sobretensión-frecuencia (C).

### Pack "Planta DC (Eltek/Vertiv)"
Tensión de bus DC (C vs setpoint) · autonomía DC hacia LVD 40 V (M) · rectificador en falla /
limitando por temp (D vía SNMP) · fusibles (D).

### Pack "Batería litio"
SOC (D) · tensión de pack vs LVD (C) · spread de celda V/T (M) · robo de baterías (D).

### Pack "Clima / AA"
Falla de equipo de punta (D contacto seco) · alta temperatura de sala (D con demora) ·
temp de sala vs setpoint (C/Sense).

---

## 5 · Recomendación precisa por *lookup* (nueva capacidad de diseño)

Hoy la recomendación es un texto fijo por regla. Propuesta: para fallas del motor, la recomendación
sale de un **diccionario código → acción** (`catalogo_spn_fmi_j1939.md` para SPN/FMI, bitmap NFPA para
Cummins). El motor:
1. Lee el **código activo** del controlador (SPN/FMI o bit NFPA).
2. Busca la acción de fábrica en el diccionario.
3. La muestra como recomendación de la alarma (precisa, no genérica).

Esto no reemplaza el editor de reglas — lo **enriquece**: la regla "código de motor activo" trae su
recomendación dinámica del catálogo. Es implementación futura (requiere que el driver exponga SPN/FMI
y un mapa de lookup en el edge-engine).

---

## 6 · Soft sensors / combinaciones (prevención · predicción)

| Soft sensor | Combina | Previene/predice | Motor |
|---|---|---|---|
| Autonomía de combustible | fuel_level × consumo (ficha `AutonomySchema`) | "sitio caído por tanque vacío" | M |
| Cascada de energía (evento único) | pérdida red + grupo corriendo + ATS | leer la cadena como 1 evento, no alarmas sueltas | cross |
| Sifoneo de combustible | Total Fuel vs kWh generados | robo / fuga | S |
| Caída de batería en el crank | batería colapsa al arrancar | batería degradada aunque en reposo lea OK | S |
| Spread de celda (litio) | max−min cell V/T | degradación antes de la falla | M |
| Grupo corriendo sin tomar carga | Gen V ok + kW≈0 | breaker no cerró | cross |
| Autonomía DC | pendiente de descarga → tiempo a LVD | corte de planta | M |

---

## 7 · Vacíos honestos (no resueltos por la biblioteca local)
- **Registros Modbus de Cummins PCC** (el manual local es de transferencia).
- **OIDs privados SNMP** de Vertiv/ZTE/Delta (faltan las MIB de fabricante).
- **Umbrales de spread de celda y de bus DC** → se resuelven con reglas **C** (auto-calibradas), no inventando cortes.
- Todo requiere **validación contra equipo físico en lab** antes de sembrar en producción.
- Documentos de MEGA aún no incorporados (sin acceso desde este entorno; pendiente copiarlos al repo).

## 8 · Cobertura de equipos

| Clase | Causa→acción | Anticipación | Estado |
|---|---|---|---|
| Grupo ComAp/InteliLite | ✓ NFPA+J1939 | pre-alarmas ✓ | completo |
| Grupo Cummins | ✓ NFPA bitmap | pre-bits ✓ | registros PCC pendientes |
| Grupo SDMO/John Deere | ✓ SPN/FMI (catálogo) | FMI moderado ✓ | completo |
| Grupo DSE (Wilson) | ✓ 3 niveles | ✓ | completo |
| ATS ComAp | ✓ cascada | ✓ | setpoints ✓ |
| Rectificador Eltek | ✓ 2 niveles | ✓ | registros doc 350020.073 pendiente |
| Rectificador Vertiv NCU | ✓ tabla + SNMP | ✓ warning | OIDs privados pendientes |
| Rectificador ZTE/Delta | — | — | MIB pendiente |
| Batería litio | ✓ LVD 40V + robo | ✓ spread/tendencia | esquema ✓ |
| AA Westric SW-302 | ✓ contacto seco | ✓ falla equipo | completo |

---

## Referencias
- `catalogo_spn_fmi_j1939.md` — diccionario código motor → acción (este mismo directorio).
- `docsRefactor/_biblioteca_campo/` — `registros_consolidado_gef.md`, `catalogo_deteccion_comap.md`,
  `mapeo_modbus_drivers.md`, `matriz_drivers_connect.md`, `gef_controladores_mapa.md`,
  `drivers_snmp_skeleton.md`, `pata_sense_caracterizacion.md`, `_biblioteca_campo_INDICE.md`.
- Datasheets/manuales muestreados: InteliLite MRS16, grupos Wilson (DSE) y Monte Ralo (John Deere),
  Eltek Smartpack S, Vertiv NCU, batería litio ZX, Westric SW-302.
