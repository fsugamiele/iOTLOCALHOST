**wanomi**

Documento técnico para fabricación de PCB

**WN-SITE-GEN**

*Controlador de monitoreo de grupo electrógeno*

Destinatario: **EJ Devices --- Desarrollos Electrónicos**

Contacto: info@ejdevices.com.ar · +54 11 5102-8347

Buenos Aires, Argentina \| Versión 1.0 \| 2026

**Contenido del documento**

Este documento contiene la especificación completa para que EJ Devices
fabrique las PCBs del dispositivo. Está organizado en 8 secciones:

-   1\. Statement of Work (SoW) --- alcance, cantidades, entregables,
    timeline

-   2\. Especificación funcional --- qué hace la placa

-   3\. BOM ingenieril --- lista de componentes con part numbers
    Mouser/Digi-Key

-   4\. Netlist textual --- todas las conexiones IC pin a IC pin

-   5\. Especificación de PCB --- capas, materiales, reglas de ruteo

-   6\. Layout de zonas --- diagrama de bloques con zonas funcionales

-   7\. Especificación mecánica --- dimensiones, montaje, conectores en
    panel

-   8\. Testing y entrega --- criterios de aceptación, MOQ, formatos de
    archivo

> **ℹ** *Toda la información en este documento es confidencial. EJ
> Devices puede usarla para la cotización y la fabricación, pero no
> puede transferirla a terceros sin autorización escrita de Wanomi.*

**1. Statement of Work (SoW)**

**1.1 Alcance del trabajo**

Wanomi solicita a EJ Devices el diseño y fabricación de la PCB del
dispositivo **WN-SITE-GEN** según las especificaciones de este
documento. El alcance incluye:

-   Diseño esquemático en KiCad o Altium a partir del netlist provisto
    en la sección 4.

-   Layout de PCB respetando las zonas funcionales y reglas de ruteo de
    las secciones 5 y 6.

-   Generación de archivos de fabricación (Gerbers, drill, pick & place,
    BOM ensamble).

-   Fabricación de PCBs y ensamble (componentes provistos por Wanomi en
    consigna o adquiridos por EJ Devices según convenio comercial).

-   Testing 100 % flying probe + test funcional en banco antes de la
    entrega.

-   Entrega de archivos fuente (KiCad/Altium) a Wanomi para evolución y
    producción futura.

**1.2 Cantidades y fases**

El proyecto se ejecuta en dos fases para minimizar riesgo y costo:

  ----------------------------------------------------------------------------
  **Fase**         **Cantidad**   **Propósito**                  **Timing
                                                                 objetivo**
  ---------------- -------------- ------------------------------ -------------
  Fase A ---       5 unidades     Validación en bench y en site  4-6 semanas
  Prototipo                       real con cell owners de Claro  desde cierre
                                                                 de spec

  Fase B ---       25 unidades    Despliegue en piloto Claro (10 6-8 semanas
  Pre-producción                  sites)                         desde
                                                                 aprobación
                                                                 Fase A

  Fase C ---       50-100         Solo si el piloto Claro escala A definir
  Producción       unidades                                      según
  (condicional)                                                  resultados
  ----------------------------------------------------------------------------

**1.3 Entregables esperados de EJ Devices**

Para cada fase, EJ Devices entrega a Wanomi:

-   PCBs físicas ensambladas y testeadas (cantidad según fase).

-   Archivos Gerber RS-274X (top, bottom, masks, silkscreens, drill).

-   Archivo de drill Excellon con coordenadas y diámetros.

-   Archivo Pick & Place (CSV) con designators, coordenadas X/Y,
    rotación, package.

-   BOM consolidado de fabricación (CSV con part numbers reales
    utilizados, inclusive sustitutos).

-   Drawings mecánicos (PDF y DXF) con dimensiones, agujeros,
    tolerancias.

-   Reporte de testing: log de flying probe + resultados del test
    funcional firmados por el técnico.

-   Archivos fuente del diseño (KiCad .kicad_sch, .kicad_pcb, libraries;
    o Altium .SchDoc, .PcbDoc).

-   PDF impreso del esquemático y del layout (top + bottom + assembly).

**1.4 Criterios de aceptación**

Wanomi acepta el lote cuando todas las unidades cumplen:

-   100 % de las unidades pasan flying probe (continuidad y
    aislamiento).

-   100 % de las unidades pasan el test funcional acordado en sección 8.

-   Inspección visual: sin tombstone, sin solder bridges, sin
    componentes torcidos \> 10°.

-   Marcado correcto: serial impreso o etiqueta con QR + fecha de lote.

-   Empaque ESD: bolsa antiestática individual + caja con burbuja.

**1.5 Convenio comercial sugerido**

Esta sección queda abierta para negociación entre Wanomi y EJ Devices.
Sugerencia inicial:

-   Wanomi paga 50 % al inicio (cubre componentes y NRE de
    diseño/herramientas).

-   Wanomi paga 50 % a la entrega y aprobación del lote.

-   Penalidad por componente faltante: el costo de stock cubre EJ
    Devices (incentivo a buena planificación).

-   Garantía: 6 meses de defectos de fabricación. Defectos por diseño se
    documentan separadamente.

**2. Especificación funcional**

El WN-SITE-GEN es el controlador de monitoreo predictivo del grupo
electrógeno (GE). Lee el controlador del GE (DSE7320/ComAp InteliLite)
por MODBUS RTU sobre RS485 con aislamiento galvánico, y agrega medición
de temperatura, nivel de combustible, vibración, corriente de arranque y
reed de tapa.

**2.1 Funciones implementadas**

-   MODBUS RTU master (solo lectura) hacia DSE7320 o ComAp InteliLite
    vía RS485 aislado galvánicamente.

-   Lectura de temperatura de refrigerante con sonda DS18B20 1-Wire
    (montada en mangito de la línea de refrigeración).

-   Medición de nivel de combustible con sensor ultrasónico JSN-SR04T
    (montado en tapa del tanque).

-   Análisis de vibración con MPU-6050 (montado en bloque del motor con
    soporte magnético) --- FFT on-edge.

-   Medición de corriente del motor de arranque con CT clamp SCT-013-030
    (no invasivo).

-   Medición de tensión de batería de arranque con divisor resistivo a
    ADC.

-   Detección de apertura de tapa del tanque (anti-sifoneo) con reed
    switch.

-   Pulsador físico para calibración de baseline vibracional in-situ.

-   LED RGB de estado y conectividad Ethernet al hub WN-H1-TELCO.

**2.2 Interfaces externas**

  ---------------------------------------------------------------------------------------------------------
  **Designator**   **Tipo**          **Función**            **Pinout**
  ---------------- ----------------- ---------------------- -----------------------------------------------
  TB1              Terminal block    Entrada/salida de      A/B/GND/CT+/CT-/Reed/Reed/Wire/+5/GND/Ult/Ult
                   6×2-pin 5.08 mm   todas las señales al   
                                     GE                     

  J1               Header JST-XH     MPU-6050 externo       +3V3/SDA/SCL/GND
                   4-pin                                    

  J2               Conector DC       Entrada DC -48 V (vía  +5V/GND
                   5.5/2.1 mm        Mean Well externo)     

  J3               RJ45 magjack      Ethernet 10/100        Estándar 1000BASE-T

  SW1              Pulsador 6×6 mm   Calibración baseline   GPIO0 + GND
                   panel                                    

  LED1             LED RGB SMD 5050  Estado                 GPIO14/15/16

  TP1-TP12         Test points       Debug                  5V, 3V3, GND×2, RX, TX, RS485_A, RS485_B, ADC1,
                                                            ADC2, GPIO0, EN
  ---------------------------------------------------------------------------------------------------------

**2.3 Mapa MODBUS RTU del DSE7320**

El firmware del WN-SITE-GEN actúa como MODBUS master y lee los
siguientes registros del DSE7320 (función 0x04 --- Read Input
Registers):

  ---------------------------------------------------------------------------
  **Register**   **Nombre**                **Unidad**   **Frecuencia
                                                        lectura**
  -------------- ------------------------- ------------ ---------------------
  0x0405         Battery voltage           V × 10       1 Hz

  0x0706         Engine RPM                rpm          1 Hz cuando arranca,
                                                        0.1 Hz idle

  0x0402         Oil pressure              kPa          1 Hz

  0x0403         Coolant temp              °C           1 Hz

  0x040D         Fuel level                \%           0.1 Hz

  0x0700         Frecuencia generador      Hz × 10      1 Hz cuando arranca

  0x0404         Tensión alternador carga  V × 10       1 Hz

  0x0304         Horas de operación        h            0.01 Hz

  0x0305         Contador de arranques     cuentas      0.01 Hz

  0x0003         Estado del controlador    bitmap       1 Hz

  0x0302         Alarmas activas           bitmap       1 Hz
  ---------------------------------------------------------------------------

> **ℹ** *Para ComAp InteliLite IL-NT, los registros varían y se obtienen
> del archivo .cfg exportado desde LiteEdit. El firmware soporta
> perfiles configurables por dispositivo en el hub.*

**3. BOM ingenieril (componentes principales)**

**3.1 Microcontrolador**

  -----------------------------------------------------------------------------------
  **Designator**   **Componente**           **Part Number**          **Fabricante**
  ---------------- ------------------------ ------------------------ ----------------
  U1               ESP32-S3-WROOM-1-N16R8   ESP32-S3-WROOM-1-N16R8   Espressif

  -----------------------------------------------------------------------------------

**3.2 Aislamiento galvánico RS485 (CRÍTICO)**

  ------------------------------------------------------------------------------
  **Designator**   **Componente**         **Part Number**        **Función**
  ---------------- ---------------------- ---------------------- ---------------
  U2               ADuM1201BRZ            ADuM1201BRZ            Analog Devices
                                                                 · isolator
                                                                 digital 2
                                                                 canales 2.5kV

  U3               MAX485ESA              MAX485ESA              Maxim · driver
                                                                 RS485
                                                                 half-duplex

  U4               NMA0505SC              NMA0505SC              Murata · DC-DC
                                                                 aislado 5V→5V
                                                                 1W (alim del
                                                                 lado RS485)

  TVS_RS485_A      SMBJ7.0CA              SMBJ7.0CA              Littelfuse
                                                                 (protección bus
                                                                 A)

  TVS_RS485_B      SMBJ7.0CA              SMBJ7.0CA              Littelfuse
                                                                 (protección bus
                                                                 B)
  ------------------------------------------------------------------------------

**3.3 ADC y referencia (CT clamp + VBat)**

  -----------------------------------------------------------------------------
  **Designator**   **Componente**         **Part Number**        **Función**
  ---------------- ---------------------- ---------------------- --------------
  U5               TL431B referencia      TL431BIDBZR            Texas ·
                   1.65V                                         referencia
                                                                 precisión para
                                                                 ADC

  R_BURDEN         Resistor 62Ω 0.5%      ERA-3AEB620V           Panasonic ·
                                                                 burden CT

  Conexion CT      Jack mono 3.5mm        SJ-3523-SMT            CUI Inc. ·
                                                                 jack para
                                                                 SCT-013
  -----------------------------------------------------------------------------

**3.4 Alimentación y protección**

  ---------------------------------------------------------------------------
  **Designator**   **Componente**       **Part Number**     **Función**
  ---------------- -------------------- ------------------- -----------------
  VR1              AP2112K-3.3          AP2112K-3.3TRG1     Diodes Inc. · LDO
                                                            3.3V/600mA

  F1               Polifuse 0.5A        MF-MSMF050-2        Bourns

  MOV1             V14E14P              V14E14P             Littelfuse

  TVS1             SMBJ5.0CA            SMBJ5.0CA           Littelfuse

  Q1               P-MOSFET BSS84       BSS84LT1G           ON Semi

  L1               Ferrita 1206         BLM31KN471SN1L      Murata
  ---------------------------------------------------------------------------

**3.5 Conectividad**

  -----------------------------------------------------------------------------
  **Designator**   **Componente**         **Part Number**        **Función**
  ---------------- ---------------------- ---------------------- --------------
  U6               KSZ8081 PHY 10/100     KSZ8081RNAIA-TR        Microchip ·
                                                                 Ethernet PHY

  J3               RJ45 magjack           TRJ-1101AENL           TE
                                                                 Connectivity
  -----------------------------------------------------------------------------

**3.6 Sensores externos (no en placa, conectados via TB1)**

Estos componentes NO van en la PCB del WN-SITE-GEN. Se listan aquí para
que EJ Devices conozca los requerimientos eléctricos de las interfaces:

-   DS18B20 waterproof: cable 3 hilos, alim 3.3V, 1-wire en GPIO7.
    Pull-up 4.7 kΩ en placa.

-   JSN-SR04T: cable 4 hilos, alim 5V, TRIG en GPIO5, ECHO en GPIO6 (con
    divisor 5V→3V3).

-   SCT-013-030: 2 hilos jack 3.5mm, salida AC \~33mA RMS @ 30A
    primario, conectado a R_BURDEN 62Ω.

-   Reed switch tapa tanque: 2 hilos, GPIO10 con pull-up interno
    habilitado.

-   MPU-6050 (en bloque motor): cable I²C 4 hilos, conectado a J1.

**4. Netlist textual**

**4.1 Power nets**

> NET +5V : J2.1, F1.1, MOV1.1, TVS1.1, Q1.S NET +5V_FILT : Q1.D, L1.1
> NET +5V_SW : L1.2, VR1.IN, U4.VIN_IN \# Alim isolator NET +3V3 :
> VR1.OUT, U1.VDD3P3, U2.VDD1, U6.VDDIO33 NET +5V_ISO : U4.VOUT_OUT,
> U3.VCC \# Lado aislado RS485 NET GND : todos los GND/VSS lado MCU NET
> GND_ISO : U4.GND_OUT, U3.GND, TB1.GND_RS485 \# Lado aislado

**4.2 ESP32-S3 ↔ ADuM1201 ↔ MAX485**

> NET UART_TX_MCU : U1.GPIO17, U2.VIA \# ESP TX → isolator entrada NET
> UART_RX_MCU : U1.GPIO18, U2.VOA \# ESP RX ← isolator salida NET
> RS485_DE_RE : U1.GPIO4, U2.VIB \# Control DE/RE via isolator NET
> UART_TX_ISO : U2.VOB, U3.DI \# Lado aislado: a MAX485 DI NET
> UART_RX_ISO : U2.VIB_alt, U3.RO \# Lado aislado: de MAX485 RO NET
> RS485_DE_RE_ISO : U2.VOB_alt, U3.DE, U3.RE \# tied juntos NET RS485_A
> : U3.A, TVS_A.1, TB1.A \# bus A NET RS485_B : U3.B, TVS_B.1, TB1.B \#
> bus B Resistor terminación 120Ω opcional (jumper SMD entre A y B) para
> si el WN-SITE-GEN es el último nodo del bus.

**4.3 ESP32-S3 ↔ I²C bus interno y externo**

> NET I2C_SDA : U1.GPIO8, J1.2 \# MPU-6050 externo NET I2C_SCL :
> U1.GPIO9, J1.3 Pull-ups 4.7kΩ a +3V3.

**4.4 ESP32-S3 ↔ CT clamp burden**

> NET CT_IN : SJ_3523.tip, R_BURDEN.1, C_OFFSET.1 NET VREF_165 :
> U5.cathode, R_BURDEN.2, C_OFFSET.2, R_OFFSET.1 NET CT_ADC : R_OFFSET.2
> (medio del divisor) → U1.GPIO2 (ADC1_CH1) \# Vref 1.65V centra la
> señal AC del CT en el ADC del ESP32-S3 \# TL431B con divisor preciso
> 1% genera Vref estable temperaturizado

**4.5 ESP32-S3 ↔ divisor VBat (para tensión batería arranque)**

> NET VBAT_IN : TB1.VBat_pin (entrada hasta 18V) NET VBAT_DIV :
> R1(10k).out, R2(2k2).in → U1.GPIO1 (ADC1_CH0) NET R2.out : GND C_FILT
> : 1µF de VBAT_DIV a GND (filtro RC anti-aliasing)

**4.6 Sensores externos via TB1**

> NET DS18B20_DATA : U1.GPIO7, TB1.DS18_data + R_pullup 4.7kΩ a +3V3 NET
> TB1.DS18_VCC : +3V3 NET TB1.DS18_GND : GND NET ULT_TRIG : U1.GPIO5,
> TB1.Ult_trig NET ULT_ECHO_5V : TB1.Ult_echo NET ULT_ECHO_3V3 :
> R_div(divisor 5V→3V3) → U1.GPIO6 NET TB1.Ult_VCC : +5V NET TB1.Ult_GND
> : GND NET REED_TAPA : U1.GPIO10, TB1.Reed_tapa + pull-up interno
> habilitado NET TB1.Reed_GND : GND

**4.7 ESP32-S3 ↔ Ethernet PHY (RMII)**

> Idem WN-SITE-SEC sección 4.6 (mismo PHY KSZ8081 + magjack
> TRJ-1101AENL)

**4.8 LED RGB y SW1**

> NET LED_R : U1.GPIO14, R220.1, LED1.R NET LED_G : U1.GPIO15, R220.1,
> LED1.G NET LED_B : U1.GPIO16, R220.1, LED1.B NET LED1.com : +5V NET
> SW1.1 : U1.GPIO0 NET SW1.2 : GND Pull-up interno habilitado en GPIO0.

**5. Especificación de PCB**

**5.1 Características generales**

  -----------------------------------------------------------------------
  **Parámetro**             **Especificación**
  ------------------------- ---------------------------------------------
  Capas                     2 capas (top + bottom)

  Material                  FR-4 con Tg ≥ 135 °C

  Espesor                   1.6 mm

  Cobre                     1 oz / 35 µm

  Acabado                   HASL sin plomo

  Aislamiento RS485         ≥ 2.5 kV galvánico

  Separación MCU vs RS485   ≥ 6 mm en pista
  en PCB                    

  Slot mecánico de          2 mm de ancho entre zona MCU y zona RS485
  aislamiento               

  Dimensiones               95 × 70 mm
  -----------------------------------------------------------------------

**5.2 Reglas de ruteo críticas**

-   AISLAMIENTO RS485: slot mecánico de 2 mm de ancho entre zona MCU
    (3.3V) y zona RS485 (referencia GE).

-   ADuM1201: respetar pads del datasheet (creepage ≥ 6 mm). NO usar
    opto-acopladores genéricos.

-   CT clamp burden: pista corta entre el conector y el divisor (≤ 10
    mm). Vref 1.65 V con TL431, no resistor divider.

-   ADC: GPIO1 (VBat) y GPIO2 (CT) lejos de cualquier traza switching
    del DC/DC. Filtrado RC adicional opcional.

-   Bus I²C MPU-6050: par diferencial trenzado simulado (SDA/SCL
    paralelos, longitud igual ±5 %).

-   RS485 A/B: par diferencial 100 Ω, terminación 120 Ω si último nodo
    del bus (jumper SMD).

-   Plano GND: separación física entre GND-MCU y GND-RS485. Conexión
    ÚNICA por capacitor 1 nF/2 kV.

-   Terminal block: pads grandes (footprint 5.08 mm pitch), tolerancia
    mecánica ±0.1 mm.

**6. Layout de zonas (diagrama de bloques)**

El diagrama muestra el aislamiento galvánico RS485 (slot mecánico de 2
mm), zona ADC con referencia TL431, y la separación MCU vs RS485:

![](media/c58cdd334dfba182a21617ad47f2d485636e7c2d.png){width="6.692913385826771in"
height="4.015748031496063in"}

**7. Especificación mecánica**

**7.1 Dimensiones y agujeros**

-   Dimensiones: 95 × 70 mm. Tolerancia ±0.2 mm.

-   4 agujeros M3 (3.2 mm) en esquinas: posiciones (5,5), (90,5),
    (5,65), (90,65) desde borde inferior izquierdo.

-   Slot de aislamiento RS485: 2 mm de ancho, longitud según el layout
    (típicamente 30-40 mm).

**7.2 Conectores en panel**

-   Borde inferior: TB1 (terminal block 6×2 pin para todas las
    conexiones al GE).

-   Borde derecho: J3 (RJ45 Ethernet), J2 (Jack DC), USB-C debug.

-   Borde superior: J1 (JST-XH para MPU-6050 externo).

-   Borde izquierdo: SW1 (botón calibración) + LED RGB visible desde
    panel.

**8. Testing y entrega**

**8.1 Test de fabricación**

-   Flying probe: 100 % continuidad y aislamiento.

-   Test específico de aislamiento galvánico RS485: aplicar 2.5 kV DC
    entre lado MCU y lado RS485 durante 1 min --- sin breakdown.

**8.2 Test funcional**

-   Boot ESP32-S3.

-   Lectura del MPU-6050 externo (jig provisto por Wanomi con MPU
    pre-conectado).

-   Test MODBUS: conectar a un simulador MODBUS slave en el jig. Leer
    registros 0x0405, 0x0706, etc. Verificar valores correctos.

-   Test ADC CT clamp: inyectar señal AC 1V RMS en el jack del CT.
    Verificar lectura ADC dentro del rango esperado.

-   Test ADC VBat: aplicar 12V en TB1.VBat. Verificar lectura ADC =
    12.0V ±0.2V.

-   Test 1-wire DS18B20: jig con DS18B20 conectado. Leer temperatura
    ambiente.

-   Test ultrasónico: jig con JSN-SR04T conectado y reflector a 100 cm.
    Leer 100 cm ±2 cm.

-   Test reed tapa: cortocircuitar TB1.Reed_tapa con GND, verificar
    GPIO10 = LOW.

-   Test LED RGB y pulsador SW1.

-   Test Ethernet (link UP, ping al jig).

-   Consumo en idle: \< 200 mA @ 5V.

Fin del documento --- **WN-SITE-GEN**. Para preguntas o aclaraciones,
contactar a Wanomi en info@wanomi.io.
