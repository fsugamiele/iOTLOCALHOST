**wanomi**

Documento técnico para fabricación de PCB

**WN-SITE-SEC**

*Controlador de seguridad y anti-intrusión*

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
dispositivo **WN-SITE-SEC** según las especificaciones de este
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

El WN-SITE-SEC es el controlador de seguridad de un site de
telecomunicaciones. Recibe entradas de sensores (reed switches, PIR,
magnetómetro, optoacoplador de tierra, tags BLE) y publica eventos al
hub WN-H1-TELCO vía Ethernet con MQTT/TLS.

**2.1 Funciones implementadas en la placa**

-   Detección de apertura de 2 puertas (shelter + gabinete) vía reed
    switches normalmente abiertos.

-   Detección de presencia infrarroja (PIR HC-SR501 o equivalente).

-   Detección de movimiento de cobre/cables vía magnetómetro QMC5883L
    (I²C).

-   Detección de pérdida de continuidad de tierra vía optoacoplador
    PC817 con loop de corriente.

-   Detección de vibración de impacto en torre/estructura vía MPU-6050
    (I²C, eje Z + magnitud XY).

-   Detección de movimiento del cerco vía ADXL345 con interrupción
    wake-on-motion.

-   Escaneo BLE pasivo de tags iBeacon adheridos a baterías VRLA (4 tags
    por site típico).

-   Conectividad LTE-M/NB-IoT failover via Quectel BG95-M3 (SIM M2M
    Claro).

-   Conectividad primaria Ethernet 10/100 Mbps via PHY interno o módulo
    externo.

-   Control de LED RGB de estado (verde=OK, ámbar=advertencia,
    rojo=alarma) y buzzer activo.

-   Watchdog hardware externo con reset automático ante hang del
    firmware.

**2.2 Interfaces externas**

  ----------------------------------------------------------------------------------------
  **Designator**   **Tipo**         **Función**           **Pinout**       **Notas**
  ---------------- ---------------- --------------------- ---------------- ---------------
  J1               Terminal block   Reed switch puerta    GPIO4 + GND      Entrada con
                   2-pin 3.5 mm     principal                              pullup interno
                                                                           habilitado

  J2               Terminal block   Reed switch gabinete  GPIO5 + GND      Idem
                   2-pin 3.5 mm                                            

  J3               Header JST-XH    PIR HC-SR501          +5V / GPIO6 /    Hembra en PCB,
                   3-pin                                  GND              macho en cable

  J4               Terminal block   Loop continuidad      IN+ / IN-        Aislado por
                   2-pin 3.5 mm     tierra (entrada del                    optoacoplador
                                    PC817)                                 

  J5               Header JST-XH    Buzzer + LED RGB      +5V / GPIO17 /   Para buzzer en
                   4-pin            externo (cableable)   GPIO14-15-16 /   panel del
                                                          GND              enclosure

  J6               Conector DC      Entrada DC -48 V (vía +5V / GND        Salida del Mean
                   5.5/2.1 mm       Mean Well externo)                     Well SD-15B-5

  J7               RJ45 magjack     Ethernet 10/100       Estándar         Con LEDs
                                                          1000BASE-T       link/activity
                                                          pinout           integrados

  J8               u.FL hembra      Antena LTE-M externa  RF               Pigtail u.FL →
                                                                           SMA al panel

  J9               u.FL hembra      Antena GNSS externa   RF               Idem

  SW1              Pulsador SMD 6×6 Botón factory reset   GPIO0 + GND      Accesible con
                   mm                                                      punzón en
                                                                           orificio del
                                                                           enclosure

  TP1-TP10         Test points      Debug y QC            5V, 3V3, GND×2,  Pads de 1.5 mm
                                                          RX0, TX0, SDA,   accesibles
                                                          SCL, GPIO0, EN   desde el top
  ----------------------------------------------------------------------------------------

**2.3 Consumo de energía**

-   Modo idle (esperando eventos): \~ 0.6 W @ 5 V (120 mA).

-   Modo activo (transmisión LTE-M): \~ 3.5 W @ 5 V (700 mA pico de 5
    segundos).

-   Reserva de diseño: el LDO debe soportar 1 A continuo sin throttling
    térmico.

**3. BOM ingenieril (componentes principales)**

Lista detallada de componentes con part numbers exactos. EJ Devices
puede sustituir por equivalentes funcionales documentando el cambio en
el BOM final.

**3.1 Microcontrolador y memoria**

  -----------------------------------------------------------------------------------------------------------------
  **Designator**   **Componente**           **Part Number**          **Fabricante**   **Footprint**   **Notas**
  ---------------- ------------------------ ------------------------ ---------------- --------------- -------------
  U1               ESP32-S3-WROOM-1-N16R8   ESP32-S3-WROOM-1-N16R8   Espressif        Custom 41-pad   16 MB flash,
                                                                                      QFN             8 MB PSRAM,
                                                                                                      antena PCB
                                                                                                      integrada

  U2               TUSB320LAIRWBR           TUSB320LAIRWBR           Texas            WQFN-12         Controlador
                                                                     Instruments                      USB-C para
                                                                                                      pasiva debug
  -----------------------------------------------------------------------------------------------------------------

**3.2 Alimentación y protección**

  -------------------------------------------------------------------------------------
  **Designator**   **Componente**   **Part Number**   **Fabricante**   **Función**
  ---------------- ---------------- ----------------- ---------------- ----------------
  VR1              AP2112K-3.3      AP2112K-3.3TRG1   Diodes Inc.      LDO 3.3V/600mA
                                                                       (alimenta
                                                                       sensores y MCU)

  F1               Polifuse 0.5A    MF-MSMF050-2      Bourns           Protección
                                                                       sobrecorriente
                                                                       entrada 5V

  MOV1             Varistor 14V     V14E14P           Littelfuse       Protección
                                                                       transitorio
                                                                       entrada

  TVS1             TVS 5.5V SMB     SMBJ5.0CA         Littelfuse       Supresión
                                                                       transitorio
                                                                       rápido

  Q1               P-MOSFET BSS84   BSS84LT1G         ON Semi          Protección
                                                                       polaridad
                                                                       inversa

  L1               Ferrita 1206     BLM31KN471SN1L    Murata           Filtrado EMI
                                                                       línea 5V

  C_BULK           Cap. 100µF/25V   EEEFK1E101GP      Panasonic        Bulk en entrada
                                                                       DC
  -------------------------------------------------------------------------------------

**3.3 Sensores I²C en placa**

  ------------------------------------------------------------------------------------
  **Designator**   **Componente**      **Part Number**  **Fabricante**   **Dirección
                                                                         I²C**
  ---------------- ------------------- ---------------- ---------------- -------------
  U3               ADXL345             ADXL345BCCZ-RL   Analog Devices   0x53 / 0x1D
                   acelerómetro                                          (SDO config)

  U4               MPU-6050 IMU 6 ejes MPU-6050         TDK InvenSense   0x68 / 0x69

  U5               QMC5883L            QMC5883L         QST Corp.        0x0D
                   magnetómetro                                          
  ------------------------------------------------------------------------------------

**3.4 Conectividad**

  ------------------------------------------------------------------------------------------
  **Designator**   **Componente**   **Part Number**        **Fabricante**   **Función**
  ---------------- ---------------- ---------------------- ---------------- ----------------
  U6               Quectel BG95-M3  BG95M3LATEA-128-SGNS   Quectel          LTE-M + NB-IoT +
                                                                            GNSS

  U7               KSZ8081 PHY      KSZ8081RNAIA-TR        Microchip        Ethernet PHY
                   10/100                                                   (RMII al
                                                                            ESP32-S3)

  J7               RJ45 magjack     TRJ-1101AENL           TE Connectivity  Magnético
                                                                            integrado + LEDs
                                                                            link/act

  SIM1             SIM holder nano  SF72S007-1             Hirose           Push-push,
                                                                            contactos
                                                                            dorados
  ------------------------------------------------------------------------------------------

**3.5 Interfaces a sensores externos**

  --------------------------------------------------------------------------------
  **Designator**   **Componente**         **Part Number**    **Función**
  ---------------- ---------------------- ------------------ ---------------------
  J1, J2           Terminal block 2-pin   1727010            Phoenix Contact MPT
                   3.5 mm                                    0.5/2-2.54

  J3               Header JST-XH 3-pin    B3B-XH-A(LF)(SN)   JST

  J4               Terminal block 2-pin   1727010            Idem J1
                   3.5 mm                                    

  J5               Header JST-XH 4-pin    B4B-XH-A(LF)(SN)   JST

  J6               Conector DC 5.5/2.1    PJ-002A            CUI Inc.
  --------------------------------------------------------------------------------

**3.6 Optoacoplador y discretos**

  -----------------------------------------------------------------------------
  **Designator**   **Componente**           **Part Number**  **Fabricante**
  ---------------- ------------------------ ---------------- ------------------
  U8               Optoacoplador PC817      PC817X4NSZ0F     Sharp

  Q2               Transistor NPN 2N2222    P2N2222AG        ON Semi (driver
                                                             buzzer)

  LED1             LED RGB cátodo común SMD OSTAA5131A       OptoSupply (en
                   5050                                      panel via cable)

  BZ1              Buzzer activo 5V         CMI-1295-0585T   CUI Devices

  SW1              Pulsador 6×6 mm SMD      B3SN-3112P       Omron
  -----------------------------------------------------------------------------

**3.7 Watchdog**

  ------------------------------------------------------------------------------
  **Designator**   **Componente**           **Part Number**  **Función**
  ---------------- ------------------------ ---------------- -------------------
  U9               Watchdog timer 7.5s      STWD100YNX       STMicro · timeout
                                                             7.5 s, retrigger
                                                             por GPIO21

  ------------------------------------------------------------------------------

> **ℹ** *Componentes pasivos (resistencias, capacitores, ferritas
> adicionales) se especifican en el esquemático completo a generar por
> EJ Devices según las recomendaciones del datasheet de cada IC.*

**4. Netlist textual (conexiones IC pin a IC pin)**

Esta es la lista de conexiones lógicas. Cada línea es un net con todos
los pines conectados a él. El formato es: NET_NAME : IC.pin, IC.pin,
\...

**4.1 Power nets**

> NET +5V : J6.1, F1.1, MOV1.1, TVS1.1, Q1.S, U1.VBUS, U6.VCC, BZ1.+ NET
> +5V_FILT : Q1.D, L1.1 NET +5V_SW : L1.2, VR1.IN, U6.VCC_BG95,
> U7.VDDIO33 (via filt) NET +3V3 : VR1.OUT, U1.VDD3P3, U3.VDD, U4.VDD,
> U5.VDD, U7.VDDA33, U8.A1 NET GND : todos los GND/VSS/VEE de cada IC y
> conectores. PLANO SÓLIDO BOTTOM.

**4.2 ESP32-S3 ↔ I²C bus (sensores en placa)**

> NET I2C_SDA : U1.GPIO8, U3.SDA, U4.SDA, U5.SDA NET I2C_SCL : U1.GPIO9,
> U3.SCL, U4.SCL, U5.SCL Pull-ups: 4.7kΩ desde I2C_SDA y I2C_SCL hacia
> +3V3, ubicados cerca del ESP32-S3.

**4.3 ESP32-S3 ↔ entradas digitales (sensores externos)**

> NET REED1_IN : U1.GPIO4, J1.1 \# Reed shelter NET REED2_IN : U1.GPIO5,
> J2.1 \# Reed gabinete NET PIR_IN : U1.GPIO6, J3.2 \# PIR HC-SR501 OUT
> NET GND_LOOP_IN : U1.GPIO7, U8.C1 \# Salida optoacoplador NET J1.2 :
> GND NET J2.2 : GND NET J3.1 : +5V \# Alim. del PIR NET J3.3 : GND NET
> J4.1 : U8.A1 \# Ánodo PC817 (vía R 1kΩ) NET J4.2 : U8.A2 \# Cátodo
> PC817 Pull-ups internos del ESP32-S3 habilitados por firmware en
> GPIO4, 5, 6, 7.

**4.4 ESP32-S3 ↔ salidas digitales (LED, buzzer)**

> NET LED_R : U1.GPIO14, R(220Ω) → J5.3 NET LED_G : U1.GPIO15, R(220Ω) →
> J5.4 NET LED_B : U1.GPIO16, R(220Ω) → J5.5 \# nota: J5 tiene 5 pines
> NET BUZZ_DRV : U1.GPIO17, R(1kΩ) → Q2.B NET J5.1 : +5V \# Alim LED RGB
> ánodo común NET J5.2 : GND NET Q2.C : BZ1.+ NET Q2.E : GND

**4.5 ESP32-S3 ↔ Quectel BG95-M3 (UART + control)**

> NET BG95_RX : U1.GPIO18, U6.MAIN_TXD \# ESP RX = Quectel TX NET
> BG95_TX : U1.GPIO17_alt2, U6.MAIN_RXD \# ESP TX = Quectel RX NET
> BG95_PWRKEY : U1.GPIO35, U6.PWRKEY \# power on Quectel NET BG95_RESET
> : U1.GPIO36, U6.RESET_N NET BG95_STATUS : U1.GPIO37, U6.STATUS GNSS y
> LTE: pines RF de U6 → trazas 50Ω → conectores u.FL J8 (LTE) y J9
> (GNSS).

**4.6 ESP32-S3 ↔ Ethernet PHY (RMII)**

> NET RMII_TXD0 : U1.GPIO19, U7.RXD0 NET RMII_TXD1 : U1.GPIO20, U7.RXD1
> NET RMII_TXEN : U1.GPIO21, U7.RXEN NET RMII_RXD0 : U1.GPIO25, U7.TXD0
> NET RMII_RXD1 : U1.GPIO26, U7.TXD1 NET RMII_RXER : U1.GPIO27, U7.TXER
> NET RMII_CRS : U1.GPIO22, U7.CRS NET RMII_REFCLK : U1.GPIO0, U7.X1 \#
> 50 MHz oscilador externo Y1 NET MDC : U1.GPIO23, U7.MDC NET MDIO :
> U1.GPIO24, U7.MDIO PHY → Magjack: TX+/-/RX+/- según pinout estándar
> 100BASE-TX.

**4.7 SIM holder**

> NET SIM_VDD : U6.SIM_VDD, SIM1.VCC NET SIM_DATA : U6.SIM_DATA, SIM1.IO
> NET SIM_CLK : U6.SIM_CLK, SIM1.CLK NET SIM_RST : U6.SIM_RST, SIM1.RST
> NET SIM_DET : U6.SIM_DET, SIM1.DET \# Hot-swap detection

**4.8 Watchdog**

> NET WDI : U1.GPIO21_alt2, U9.WDI \# Firmware retrigger NET WDO :
> U9.WDO, U1.EN \# Reset hardware al ESP32

**4.9 USB-C debug**

> NET USB_DP : U1.GPIO20_alt, U2.DP1, USB_C.DP NET USB_DM :
> U1.GPIO19_alt, U2.DN1, USB_C.DN NET USB_VBUS : USB_C.VBUS, J6.1 (vía
> diodo) \# Power solo si DC ext desconectado NET USB_CC1 : USB_C.CC1,
> U2.CC1 NET USB_CC2 : USB_C.CC2, U2.CC2
>
> **ℹ** *El esquemático completo (con todos los componentes pasivos,
> valores R/C, conexiones de filtros, etc.) lo genera EJ Devices a
> partir de este netlist y los datasheets de los ICs principales. Wanomi
> revisa y aprueba el esquemático antes de pasar al layout.*

**5. Especificación de PCB**

**5.1 Características generales**

  -----------------------------------------------------------------------
  **Parámetro**       **Especificación**        **Notas**
  ------------------- ------------------------- -------------------------
  Capas               2 capas (top + bottom)    No requiere multicapa
                                                para densidad

  Material            FR-4 con Tg ≥ 135 °C      Resistencia térmica para
                                                zonas con calor del LDO

  Espesor             1.6 mm ± 10 %             Estándar industrial

  Cobre               1 oz / 35 µm en ambas     Suficiente para
                      capas                     corrientes \< 1 A

  Acabado             HASL sin plomo            ENIG opcional con costo
                                                extra (recomendado para
                                                BG95 y mag jack)

  Máscara de          Verde mate, ambas caras   Color clásico, alto
  soldadura                                     contraste para inspección

  Serigrafía          Blanca, ambas caras       Designators + valores
                                                donde quepa

  Ancho mínimo de     0.2 mm (8 mil)            Reservar 0.3 mm para
  pista                                         señales lógicas

  Espacio mínimo      0.2 mm (8 mil)            

  Diámetro mínimo de  0.6 mm OD / 0.3 mm ID     Vias capilares opcional
  via                                           para BG95 si lo requiere

  Drill mínimo        0.3 mm                    

  Anular ring mínimo  0.15 mm                   

  Dimensiones placa   100 × 70 mm               Ver sección 7 para
                                                detalle mecánico
  -----------------------------------------------------------------------

**5.2 Reglas de ruteo críticas**

-   ZONA POTENCIA: aislada del resto del circuito. Pista de potencia
    mínima 1.0 mm para 5V; mínimo 1.5 mm para entrada DC.

-   ZONA MCU (alrededor del ESP32-S3): keepout de 5×10 mm bajo y al lado
    de la antena PCB del ESP32 --- sin cobre, sin via, sin pista en
    NINGUNA capa.

-   ZONA I²C: trazas SDA/SCL paralelas, longitud máxima 80 mm, pull-ups
    4.7 kΩ ubicados cerca del ESP32-S3.

-   RF (BG95 LTE-M, ESP32-S3 BLE): impedancia controlada 50 Ω en pista
    de RF, sin discontinuidades. La u.FL del BG95 al borde derecho con
    longitud máxima 30 mm.

-   GND: plano sólido en bottom layer. Star-ground en el conversor
    DC/DC. No fragmentar el plano de GND con pistas.

-   Decoupling: 100 nF cerámico (X7R, 0603) lo más cerca posible del pin
    VCC de cada IC. 10 µF tantalio o cerámico cerca del LDO 3V3 en
    entrada y salida.

-   Test points: pads de test de Ø 1.5 mm accesibles desde el top.
    Listado mínimo: 3V3, 5V, GND ×2, TX0, RX0, SDA, SCL, GPIO0, EN.

-   Inserción de la antena LTE: u.FL del BG95 al borde derecho con
    longitud máxima 30 mm. La traza RF no debe cruzar zona MCU.

-   Ethernet PHY: separar TX/RX, par diferencial controlado a 100 Ω, no
    cruzar planos divididos.

**5.3 Aprovechamiento del espacio (panelización)**

Para Fase A (5 unidades) y Fase B (25 unidades), EJ Devices puede
panelizar 6-12 unidades por panel de 200×300 mm con vías mouse bites
para depanelización manual. Esto reduce el costo unitario de fabricación
y montaje.

**6. Layout de zonas (diagrama de bloques)**

El siguiente diagrama muestra las zonas funcionales recomendadas y el
ruteo conceptual. EJ Devices puede ajustar el layout exacto siempre que
respete las zonas críticas (potencia aislada, antena en keepout, I²C
cerca del MCU, etc.).

![](media/0d80744094589416f2f7f18d17977e74fcaa1cc8.png){width="6.692913385826771in"
height="4.015748031496063in"}

**7. Especificación mecánica**

**7.1 Dimensiones y tolerancias**

-   Dimensiones nominales: 100 × 70 mm (ancho × alto). Tolerancia ±0.2
    mm.

-   Espesor: 1.6 mm ±10 %.

-   Esquinas: redondeadas R 2 mm para evitar fisuras durante
    manipulación.

**7.2 Agujeros de montaje**

  -------------------------------------------------------------------------------
  **Designator**   **Diámetro**   **Posición (X, Y desde borde      **Tipo**
                                  inferior izq.)**                  
  ---------------- -------------- --------------------------------- -------------
  MH1              3.2 mm (M3     5, 5                              No
                   paso)                                            metalizado,
                                                                    anular
                                                                    keepout 6 mm

  MH2              3.2 mm (M3     95, 5                             Idem
                   paso)                                            

  MH3              3.2 mm (M3     5, 65                             Idem
                   paso)                                            

  MH4              3.2 mm (M3     95, 65                            Idem
                   paso)                                            
  -------------------------------------------------------------------------------

**7.3 Conectores en panel (para integración con enclosure)**

Los siguientes conectores deben ser accesibles desde el borde de la PCB
para que pasen a través de los orificios del enclosure de plástico. EJ
Devices debe ubicarlos en el borde correspondiente:

-   Borde derecho: J7 (RJ45 Ethernet), J6 (Jack DC), J8 (u.FL LTE), J9
    (u.FL GNSS), USB-C debug.

-   Borde izquierdo: J1 (reed1), J2 (reed2), J4 (loop tierra) ---
    terminal blocks.

-   Borde superior: J3 (PIR JST), J5 (LED+buzzer JST).

-   Borde inferior: SIM holder + pulsador SW1.

**7.4 Identificación visual**

-   Logo wanomi en serigrafía top, esquina superior izquierda, tamaño
    8×3 mm.

-   Texto \"WN-SITE-SEC v1.0\" debajo del logo, fuente 1 mm.

-   Espacio reservado de 15×8 mm en bottom para etiqueta serial impresa
    por EJ Devices (formato YYWWNNNN: año-semana-secuencial).

**8. Testing y entrega**

**8.1 Test de fabricación (100 % de las unidades)**

-   Flying probe: continuidad y aislamiento sobre todos los nets.
    Reporte automático con el log de la máquina.

-   Inspección AOI (automatic optical inspection) opcional para Fase B y
    C.

**8.2 Test funcional (100 % de las unidades)**

Wanomi provee a EJ Devices el firmware de test (firmware especial,
distinto al firmware de producción). El firmware de test ejecuta una
secuencia automatizada en cada placa:

-   Boot del ESP32-S3: tiempo de boot \< 3 s, no reset por watchdog.

-   Lectura de los 3 sensores I²C: ADXL345, MPU-6050, QMC5883L. Cada uno
    debe responder a su dirección con el WHO_AM_I correcto.

-   Wiggle test de cada GPIO de entrada (J1, J2, J3, J4): cortocircuito
    a GND con jig de prueba, verifica que el GPIO lee LOW; abierto,
    verifica HIGH (con pullup).

-   LED RGB: ciclo R-G-B-blanco verificando con fotosensor del jig.

-   Buzzer: ráfaga 1 s @ 2 kHz, verifica con micrófono del jig (nivel ≥
    80 dB SPL @ 10 cm).

-   Quectel BG95: AT+CGMI debe retornar \"Quectel\". AT+CFUN=1 debe
    completar sin error.

-   Ethernet PHY: link UP cuando se conecta cable a otro switch del jig.
    Ping a IP del jig responde.

-   SIM holder: detección de SIM hot-swap (insertar/extraer SIM de
    prueba).

-   Watchdog: pasar 8 segundos sin retrigger, verificar que el WDO se
    activa y resetea el ESP32.

-   Consumo en idle: medir corriente con multímetro. Debe ser \< 200 mA
    @ 5V.

**8.3 Reporte de testing**

Por cada lote, EJ Devices entrega un PDF con:

-   Encabezado del lote: número, fecha, cantidad, operario.

-   Tabla con número de serie de cada placa + resultado de cada test
    (PASS/FAIL).

-   Si hay FAIL, descripción y acción tomada (rework, descartado, etc.).

-   Firma del técnico responsable.

**8.4 Empaque y entrega**

-   Cada PCB en bolsa antiestática individual con etiqueta de número de
    serie.

-   Caja de cartón con burbuja como relleno. Etiqueta de \"FRAGIL\" y
    \"ESD\".

-   Documentos de entrega: lista de empaque, reporte de testing,
    archivos fuente en USB o link de descarga.

-   Entrega física en oficina de Wanomi en Buenos Aires (acordar con
    cliente). Para Fase C se evalúa entrega directa al cliente final si
    Claro confirma rollout.

**8.5 Archivos a entregar (ZIP/USB)**

La estructura del paquete de archivos a entregar es:

> WN-SITE-SEC_v1.0_lote_YYWW_NNN/ ├── README.txt (descripción del
> paquete) ├── BOM_final.csv (BOM real con sustitutos documentados) ├──
> gerbers/ │ ├── \*.gtl \*.gbl \*.gts \*.gbs │ ├── \*.gto \*.gbo │ └──
> \*.drl (Excellon) ├── pickplace/ │ └── pickplace.csv (designator, X,
> Y, rotation, package) ├── mecanico/ │ ├── PCB_drawing.pdf (drawing con
> cotas) │ └── PCB_outline.dxf (DXF para enclosure designer) ├──
> esquematicos/ │ ├── schematic.pdf (esquemático completo) │ └──
> layout_top_bottom.pdf (assembly drawing) ├── fuentes/ (KiCad o Altium
> project files) └── reporte_testing/ ├── lote_YYWW_NNN_test.pdf └──
> flying_probe_logs/

Fin del documento --- **WN-SITE-SEC**. Para preguntas o aclaraciones,
contactar a Wanomi en info@wanomi.io.
