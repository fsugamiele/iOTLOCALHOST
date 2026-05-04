**wanomi**

Documento técnico para fabricación de PCB

**WN-FENCE**

*Sub-nodo solar inalámbrico para cerco perimetral*

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
dispositivo **WN-FENCE** según las especificaciones de este documento.
El alcance incluye:

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

El WN-FENCE es un sub-nodo IoT de muy bajo consumo, alimentado solo por
panel solar 1 W + batería Li-Po, montado en el cerco perimetral del
site. Su única función es detectar vibración o impacto en el cerco y
reportar el evento al WN-SITE-SEC vía ESP-NOW (sin AP intermedio).

**2.1 Funciones implementadas**

-   Detección de vibración con ADXL345 acelerómetro I²C (±16 g, 13
    bits).

-   Modo wake-on-motion: ADXL345 mantiene una interrupción activa cuando
    detecta motion sobre umbral configurable.

-   ESP32 en deep sleep esperando interrupción del ADXL.

-   Al despertar: muestrear ADXL durante 200 ms a 1 kHz, calcular RMS,
    transmitir vía ESP-NOW al WN-SITE-SEC del site.

-   Heartbeat ESP-NOW cada 5 minutos para confirmar que el nodo está
    vivo (incluye nivel de batería).

-   Carga solar Li-Po con TP4056 + protección DW01.

-   LDO low-Iq MCP1700 para alimentar al ADXL en estado quiescente con
    consumo \< 2 µA.

**2.2 Arquitectura de muy bajo consumo**

El WN-FENCE debe operar 3-4 días sin sol. Para esto, el consumo promedio
debe ser \< 100 µA:

  -------------------------------------------------------------------------
  **Modo**               **Componente**    **Consumo**      **Duración
                                                            típica**
  ---------------------- ----------------- ---------------- ---------------
  Deep sleep (mayoría    ESP32 deep        15 µA + 40 µA =  99 % del tiempo
  del tiempo)            sleep + ADXL      55 µA            
                         active                             

  Wake on motion         ESP32 boot + WiFi 120 mA × 100 ms  \~ 5-20
                         RF                                 veces/día

  Heartbeat              ESP32 boot +      120 mA × 80 ms   12 veces/hora
                         ESP-NOW TX                         

  Promedio diario        integral 24h      \~ 80 µA         sostenible con
                                                            Li-Po + solar
  -------------------------------------------------------------------------

**2.3 Interfaces**

-   1× Conector JST-PH 2-pin para panel solar (5 V / 1 W).

-   1× Conector JST-PH 2-pin para batería Li-Po 2000 mAh.

-   1× Conector USB-C debug solamente (no se usa en operación normal).

-   1× Pulsador SMD (reset/calibración).

-   1× LED 5050 SMD (parpadea brevemente al despertar).

**3. BOM ingenieril**

**3.1 MCU + sensor**

  ----------------------------------------------------------------------------
  **Designator**   **Componente**      **Part Number**      **Notas**
  ---------------- ------------------- -------------------- ------------------
  U1               ESP32-WROOM-32E     ESP32-WROOM-32E-N4   Variante con flash
                                                            4MB, antena PCB
                                                            integrada

  U2               ADXL345             ADXL345BCCZ-RL       I²C,
                                                            wake-on-motion
  ----------------------------------------------------------------------------

> **ℹ** *Se usa ESP32-WROOM-32E (no ESP32-S3) por menor consumo en deep
> sleep (15 µA vs 28 µA del S3) y porque ESP-NOW funciona perfectamente
> en ESP32 clásico.*

**3.2 Alimentación**

  --------------------------------------------------------------------------------------------
  **Designator**   **Componente**      **Part Number**     **Función**
  ---------------- ------------------- ------------------- -----------------------------------
  VR1              MCP1700-3302        MCP1700T-3302E/TT   Microchip · LDO 3.3V/250mA con
                                                           Iq=1.6 µA

  U_CHG            TP4056              TP4056              NanJing · charger Li-Po 1A

  U_PROT           DW01A + 8205A       DW01A + FS8205A     Protección Li-Po
                                                           sobrecarga/descarga/cortocircuito

  D1               Diodo Schottky      1N5817              Protección reverse panel solar de
                   1N5817                                  noche
  --------------------------------------------------------------------------------------------

**3.3 Pasivos críticos**

-   R_pullup_INT: 100 kΩ entre INT1 del ADXL y GPIO33 del ESP32 (alta
    impedancia para reducir leakage).

-   R_pullups I²C: 10 kΩ (no 4.7 kΩ como en otros dispositivos --- mayor
    valor reduce consumo en standby).

-   C_decoupling: 100 nF cerámico cerca del VCC del ADXL y del ESP32.

**4. Netlist textual**

**4.1 Power**

> NET PV+ : J_solar.1, D1.A NET PV+\_PROT : D1.K, U_CHG.IN+ NET BAT+ :
> U_CHG.BAT+, U_PROT.B+, J_bat.1 NET BAT_PROT : U_PROT.OUT+, VR1.IN,
> U1.VBAT (no via VR para ESP32 directo si bat ≥ 3.0V) NET +3V3 :
> VR1.OUT, U1.VDD33, U2.VDD NET GND : común

**4.2 ESP32 ↔ ADXL345**

> NET I2C_SDA : U1.GPIO21, U2.SDA NET I2C_SCL : U1.GPIO22, U2.SCL NET
> ADXL_INT1 : U2.INT1, U1.GPIO33 \# con pullup 100kΩ a +3V3 NET ADXL_VDD
> : +3V3 (vía jumper SMD removible para test de consumo)
>
> **ℹ** *GPIO33 es RTC GPIO, lo que permite al ESP32 despertar desde
> deep sleep al detectar nivel HIGH del INT1.*

**4.3 Otros**

> NET LED_DRV : U1.GPIO2, R220.1, LED1.A NET LED1.K : GND NET BTN_IN :
> U1.GPIO0, BTN1.1 NET BTN1.2 : GND

**5. Especificación de PCB**

**5.1 Características generales**

  -----------------------------------------------------------------------
  **Parámetro**             **Especificación**
  ------------------------- ---------------------------------------------
  Capas                     2 capas

  Material                  FR-4 Tg ≥ 135 °C

  Espesor                   1.6 mm

  Cobre                     1 oz (35 µm)

  Acabado                   HASL sin plomo (o ENIG si presupuesto lo
                            permite)

  Conformal coat            Sí (acrílico) --- REQUERIDO para outdoor IP65

  Operación                 outdoor IP65

  Temp. operación           -20 a +70 °C

  Test                      100 % funcional

  Dimensiones               60 × 40 mm
  -----------------------------------------------------------------------

**5.2 Reglas de ruteo críticas**

-   ULTRA LOW POWER: el ADXL345 mantiene wake-on-motion vía INT1 a
    GPIO33 con pullup 100 kΩ. ESP32 en deep sleep.

-   LDO low-Iq: el MCP1700 tiene 1.6 µA quiescent --- crítico para
    autonomía solar.

-   Solar: panel 5 V 1 W con diodo Schottky 1N5817 antes del TP4056
    (evita descarga de noche).

-   Li-Po: protección por DW01 + 8205 dual MOSFET --- sobrecarga,
    sobredescarga, sobrecorriente.

-   Antena ESP32: keepout estricto 5×10 mm. Si va dentro de enclosure
    ASA, validar atenuación.

-   Conformal coating obligatorio: pre-aplicar enmascarado en headers
    JST y USB-C.

-   Test point exclusivo para medir consumo en sleep (jumper SMD
    removible en línea de VCC).

-   Conectores JST-PH 2.0 mm: panel solar y LiPo con polaridad protegida
    (pad MARK indica +).

**6. Layout de zonas (diagrama de bloques)**

Layout compacto: zona alimentación (TP4056 + DW01 + LDO) a la izquierda,
zona MCU + RF (ESP32 + ADXL) a la derecha:

![](media/3ff4fd56ce4aa0442eebb280313560cc9c27784a.png){width="6.692913385826771in"
height="4.015748031496063in"}

**7. Especificación mecánica**

**7.1 Dimensiones**

-   Dimensiones: 60 × 40 mm. Tolerancia ±0.2 mm.

-   4 agujeros M2.5 (2.7 mm) en esquinas para fijar al enclosure ASA
    IP65.

-   Espesor: 1.6 mm.

**7.2 Enclosure**

-   La placa va dentro de un enclosure de ASA UV-resistente impreso 3D
    (provisto por Wanomi, no es responsabilidad de EJ Devices).

-   Conectores externos al enclosure: 1× JST-PH para panel solar (cable
    salida lateral), 1× JST-PH para batería interna.

-   La antena del ESP32 debe orientarse hacia el WN-SITE-SEC del site
    (típicamente hacia el shelter).

**8. Testing y entrega**

**8.1 Test funcional**

-   Boot del ESP32 al alimentar.

-   Lectura del ADXL345: WHO_AM_I = 0xE5.

-   Test ESP-NOW: enviar paquete a un MAC fijo del jig, jig confirma
    recepción.

-   Test wake-on-motion: configurar ADXL con threshold bajo, golpear
    suavemente la PCB, ESP debe despertar y enviar paquete.

-   Test consumo: deep sleep ≤ 65 µA medido con shunt 1 Ω en línea de
    VCC.

-   Test heartbeat: cada 5 min envía paquete con nivel de batería.

-   Test de carga: panel solar 5 V conectado, TP4056 LED rojo encendido
    durante carga.

-   Test de protección Li-Po: descargar batería a \< 2.5 V, DW01 debe
    cortar la salida.

**8.2 Conformal coating (post-test)**

Después del test funcional, las PCBs aprobadas reciben conformal coating
acrílico:

-   Aplicación con spray uniforme, 2 capas con secado de 24 h entre cada
    una.

-   Enmascarado previo: conectores JST, USB-C, pulsador, LED.

-   Verificación visual con luz UV (el coating fluorece) --- sin zonas
    no cubiertas.

Fin del documento --- **WN-FENCE**. Para preguntas o aclaraciones,
contactar a Wanomi en info@wanomi.io.
