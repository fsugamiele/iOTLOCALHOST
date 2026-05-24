# Revisión ERC + diseño — WN-SITE-CORE

> **wanomi · Área 3 — Hardware · feature/telco-support**
> Entrada de la sesión #11. Revisión del esquemático **Rev A (2026-05-23)** contra el BOM y la guía de layout, como paso previo a la captura en KiCad.
> Objetivo: cerrar hallazgos *antes* de rutear, porque tres de ellos probablemente modifiquen el esquemático.
>
> Convención de severidad:
> - **[BLOQUEANTE]** — resolver antes de pasar a layout; puede cambiar el esquemático.
> - **[VALIDAR]** — confirmar contra datasheet o contra el sitio del piloto.
> - **[MENOR]** — limpieza o anotación; no frena el ruteo.
> - **[OK]** — verificado, sin acción.

---

## 1. Veredicto

El esquemático está completo y bien zonificado, y el **pinout del ESP32-S3 es correcto** (ver §2). Pero hay **3 hallazgos bloqueantes** que afectan funciones centrales del CORE — entre ellas la sonda de combustible, que es el ítem forense prioritario (CR00058). Recomiendo resolverlos en una Rev B del esquemático antes de capturar/rutear. El resto son validaciones de datasheet/sitio y limpieza menor.

| Severidad | Cantidad | Ítems |
|---|---|---|
| BLOQUEANTE | 3 | H-1 alimentación de lazo 4-20 mA · H-2 coordinación de protección −48 V · H-3 front-end de entradas digitales |
| VALIDAR | 4 | H-4 tasa efectiva del ADS1115 · H-5 VIH del WS2812 a 5 V · H-6 ventana de hold-up · H-7 terminación RS-485 |
| MENOR | 2 | H-8 rótulo R4 duplicado · H-9 footprints: IC vs módulo |
| OK | 5 | pinout · direcciones I²C · ADS1115 evita ADC2/WiFi · 3 cruces de aislación · UART0 libre |

---

## 2. Auditoría de pinout — ESP32-S3-WROOM-1 N16R8  · [OK]

28 pines asignados, verificados programáticamente. **Sin conflictos.**

- **Strapping (IO0/3/45/46):** sólo se usa IO0 como BOOT (con pull-up R2 + SW1, correcto). IO3, IO45 e IO46 quedan libres → no hay riesgo de forzar un modo de arranque equivocado.
- **Flash/PSRAM octal (IO26–37):** N16R8 consume internamente IO26–32 (flash) e IO33–37 (PSRAM octal). El diseño **no usa ninguno** de ese rango. Correcto.
- **Pines inexistentes (IO22–25):** no se usan (en el S3 no existen).
- **USB nativo:** D−/D+ en IO19/IO20 → son exactamente los pines de USB-Serial/JTAG del S3. Correcto para prog/debug por J2.
- **UART0 (IO43/44):** libre → queda la consola serie disponible para debug además del USB. Buen margen.
- **Sin pines duplicados.**

El bus SPI (IO11/12/13) lo comparten W5500 (CS=IO10) y SX1276 LoRa (CS=IO14, DNP). Correcto, dos CS independientes.

---

## 3. Hallazgos bloqueantes

### H-1 · Alimentación del lazo 4-20 mA del combustible — falta en el árbol de potencia · [BLOQUEANTE]

La hoja 4 muestra el front-end de combustible alimentado por **`+V_LOOP`**, pero el árbol de alimentación (hoja 1) sólo genera **+5 V** y **+3V3**. No hay fuente para `+V_LOOP`.

Una sonda hidrostática 4-20 mA de 2 hilos (BOM ítem 42, sumergible) es **loop-powered** y típicamente necesita **≥ 12 V** de tensión de lazo (caída del transmisor + caída en Rsense de 150 Ω + margen). Con +5 V el lazo no arranca: la sonda no entrega corriente válida.

Como combustible es la variable forense de mayor valor del kit, esto es bloqueante.

**Acción:** definir el origen de `+V_LOOP`. Opciones:
1. Boost dedicado +5 V → ~24 V para el lazo (lo más robusto y compatible con la mayoría de senders).
2. Confirmar con el sender del primer sitio su tensión mínima de lazo; si existe un modelo de bajo voltaje compatible con el rail disponible, documentarlo.

Esto destraba además parte de RISK-HW-2 (sonda de combustible) desde el lado HW.

### H-2 · Coordinación de la protección de entrada −48 V · [BLOQUEANTE]

Dos números no cierran con el **TVS1 SMBJ58A**:

1. **Stand-off vs tensión de planta:** V_RWM del SMBJ58A ≈ 58 V. Una planta −48 V flota a ~54 V y en **ecualización** sube a ~57–58 V; con temperatura alta de shelter el stand-off efectivo del TVS baja. Queda **demasiado al límite** → fuga/conducción y calentamiento del TVS en operación normal de ecualización.
2. **Clamp vs máximo del DC-DC:** V_clamp del SMBJ58A a corriente de surge ≈ 93 V (el propio BOM lo anota). El DC-DC (URB4805YMD) tiene entrada **18–75 V**. Si su máximo absoluto/transitorio es 75 V, un clamp de 93 V **lo deja desprotegido** en surge.

**Acción:**
- Subir el stand-off del TVS a **60–64 V** (p.ej. SMBJ60A/64A) según el rango real del rectificador del sitio (relevar en el survey).
- Verificar el **rating transitorio de entrada** del DC-DC en el datasheet de Mornsun. Si sólo tolera 75 V, agregar coordinación de dos etapas (GDT/MOV aguas arriba para energía + TVS aguas abajo para clamp por debajo del límite del módulo), o elegir un DC-DC con tolerancia transitoria ≥ 100 V.

### H-3 · Front-end de las 8 entradas digitales — wetting indefinido y canales heterogéneos · [BLOQUEANTE]

Los 8 canales (hoja 5) se dibujan **idénticos** (TVS → R 4k7 → LED opto TLP281 → pull-up 10k a 3V3), pero las fuentes de campo **no** son homogéneas:

- **IN1 puerta (reed NC), IN5/IN6 genset run/fault:** contactos secos. Un contacto seco no tiene tensión propia → el front-end necesita una **tensión de wetting** que la placa provea para encender el LED del opto al cerrar. No está definida.
- **IN3 "presencia red AC":** sensar presencia de **220 VAC** con un opto DC y una sola R serie no es correcto — necesita front-end apropiado (rectificación/acople AC + impedancia adecuada + opto adecuado para sensado de línea).
- **IN2 PIR, IN4 humo:** muchos PIR y detectores de humo entregan salida **activa/colector abierto**, no contacto seco puro → revisar polaridad y configuración de pull por canal.

Además, con R serie de **4k7** y wetting de 3V3/5 V, la corriente de LED del opto cae a ~0,4–0,8 mA, **por debajo** de lo que el TLP281 necesita para una CTR confiable → conmutación marginal.

**Acción:**
- Definir tensión de wetting y dimensionar la R serie para **≥ 3–5 mA** de corriente de LED por canal.
- Front-end dedicado para **IN3 (presencia AC)**.
- Confirmar por canal si la fuente es contacto seco / colector abierto / activa, y ajustar pull-up/down.
- Si los tipos de entrada difieren mucho, considerar agrupar canales por tipo (zócalos de configuración por jumper o variantes de stuffing).

---

## 4. Hallazgos a validar

### H-4 · Tasa efectiva del ADS1115 vs RMS de corriente · [VALIDAR]
El ADS1115 da **16 bits** (resolución forense, DEC-FORENSIC-2 cumplido) pero su throughput máximo es **860 SPS** y es **multiplexado**: con CT1+CT2+combustible compartiendo el ADC, la tasa por canal de CT baja a unos pocos cientos de SPS → **pocas muestras por ciclo de 50 Hz**. Alcanza para *presencia / nivel grueso de corriente*; **no** para RMS verdadera, factor de potencia ni armónicos. Coherente con el alcance "detección día 1", pero si en algún momento se requiere RMS/energía forense, hay que reconsiderar el front-end (IC de medición dedicado). Documentar el límite explícitamente para no prometer lo que el HW no da.

### H-5 · VIH del WS2812 alimentado a +5 V · [VALIDAR]
D2 (WS2812 RGB) se alimenta de **+5 V** con DIN desde un GPIO de **3V3**. El umbral del WS2812 es VIH ≈ 0,7·VDD = **3,5 V > 3,3 V** → fuera de spec (suele "andar" en banco, pero es poco confiable, sobre todo con temperatura). **Acción:** alimentar el LED a ~4,3 V (Schottky en serie desde +5 V), o level-shifter en DIN, o usar variante con VIH compatible a 3V3 (p.ej. SK6812). Trivial, pero conviene fijarlo antes del layout porque cambia el ruteo de ese rincón.

### H-6 · Ventana de hold-up del supercap · [VALIDAR]
El supercap (2×1F en serie → 0,5 F a 5,4 V) sostiene **+5 V**, pero el buck MP2315 deja de regular por debajo de ~4,5 V de entrada. La energía útil es sólo la ventana 5 V → 4,5 V (~1,2 J), no hasta el piso del supercap. A consumo de ESP32-S3 + W5500 en TX, eso da del orden de **~1 s**. **Acción:** confirmar que el "último aviso" (publicar el evento de caída de planta) cierra dentro de esa ventana; si no, agrandar el supercap o alimentar el último-gasp de un rail que tolere menor tensión.

### H-7 · Terminación RS-485 (R3 120 Ω) · [VALIDAR]
R3 120 Ω es correcto **sólo si el CORE es un extremo físico** del bus Modbus. Si el CORE se conecta como derivación intermedia (probable si el NOC de Claro ya está en el bus), R3 debe quedar **DNP**. Decisión por sitio en el survey. Relacionado con RISK-HW-1: nota positiva — el HW ya soporta **sniff pasivo** (no asertar RS485_DE/IO16) como alternativa si no se puede ser 2º máster; eso es decisión de firmware, no de placa.

---

## 5. Hallazgos menores

### H-8 · Rótulo duplicado en hoja 4 · [MENOR]
Los pull-ups I²C aparecen rotulados dos veces como "R4 4k7". Deberían ser **R4 (SDA)** y **R5 (SCL)**. Corregir referencia antes de la captura para que el ERC no marque referencia duplicada.

### H-9 · Footprints: IC bare vs módulo · [MENOR pero decidir antes de capturar]
El BOM sourcea varios componentes como **módulos de AliExpress** (ADS1115, W5500, SHT31). En una PCB custom de 4 capas hay que decidir por componente si se coloca el **IC pelado** (footprint propio, mejor layout/coste a volumen, requiere los pasivos del datasheet) o el **módulo sobre headers** (más rápido, pero ocupa área y complica el CPL de montaje automático). Esto define el símbolo/footprint y el archivo CPL. Recomiendo IC pelado para ADM2483, W5500, ADS1115, DS3231, SHT31 y módulo sólo para el DC-DC y el SX1276 (DNP).

---

## 6. Mapa símbolo → footprint para captura (componentes activos)

Referencia para acelerar la captura. Validar cada footprint contra el encapsulado real del componente comprado.

| Ref | Componente | Símbolo (lib KiCad) | Footprint sugerido | Nota |
|---|---|---|---|---|
| U3 | ESP32-S3-WROOM-1 N16R8 | `RF_Module:ESP32-S3-WROOM-1` | `RF_Module:ESP32-S2-WROOM` (mismo land pattern) | verificar keep-out de antena |
| U1 | DC-DC URB4805YMD | símbolo propio (módulo) | footprint del datasheet Mornsun (SIP) | módulo |
| U2 | Buck MP2315 | `Regulator_Switching:MP2315` o propio | SOIC-8-EP | IC pelado + inductor/caps |
| U4 | ADM2483BRWZ | `Interface_UART:ADM2483BRWZ` o propio | SOIC-16W (RW) | IC pelado |
| U5 | W5500 | símbolo propio | LQFP-48 (0,5 mm) | IC pelado + 25 MHz + magnetics |
| U7 | SHT31 | `Sensor_Humidity:SHT31-DIS` | DFN-8 | IC pelado |
| U8 | SDP810 | símbolo propio | footprint Sensirion (módulo) | evaluar stuffing por sitio |
| U9 | ADS1115 | `Analog_ADC:ADS1115IDGS` | VSSOP-10 | IC pelado |
| U10 | DS3231 | `Timer_RTC:DS3231M` o propio | SOIC-16W | + CR2032 holder |
| U11/U12 | TLP281-4 | `Isolator:TLP281-4` | SOIC-16 | ×2 |
| U6 | SX1276 LoRa | símbolo propio | módulo (DNP) | footprint reservado |
| J3 | RJ45 MagJack | `Connector:RJ45_Magjack` | según p/n (p.ej. HR911105A) | magnetics integrados |
| D2 | WS2812 RGB | `LED:WS2812B` | LED_SMD 5050 | ver H-5 |
| TVS1 | SMBJ (60–64 A, ver H-2) | `Device:D_TVS` | SMB / DO-214AA | ver H-2 |
| TVS2 | SM712 | `Device:D_TVS_ALT` | SOT-23 | RS-485 |

---

## 7. Net classes propuestas (para ERC y luego DRC)

Definir estas clases en la captura ya deja el DRC de layout casi listo (se enganchan con las reglas de `.kicad_dru` de la guía §3).

| Net class | Nets | Ancho mín. | Clearance | Notas |
|---|---|---|---|---|
| `HV_FIELD` | +48V, 0V, primario DC-DC, A/B de bus RS-485 de campo, FGND | 1,0 mm | **6 mm a todo lo demás** | dominio de campo; no cruza la barrera |
| `PWR_5V` | +5V, +5V_ISO | 0,5 mm | 0,2 mm | ajustar por IPC-2221 |
| `PWR_3V3` | +3V3 | 0,5 mm | 0,2 mm | |
| `ETH_DIFF` | TX±, RX± (W5500↔J3) | par 100 Ω ±10 % | regla de par | sobre GND continuo L2, sin cruzar splits |
| `ANALOG` | CT1_S, CT2_S, FUEL_S, bias | 0,25 mm | 0,2 mm | GND analógico local bajo ADS1115 |
| `default` | resto lógico/SPI/I²C | 0,2 mm | 0,2 mm | |

---

## 8. Checklist de ERC en KiCad (al capturar)

- [ ] Corregir H-8 (R4/R5) para evitar referencia duplicada.
- [ ] Asignar las net classes de §7.
- [ ] Marcar pines no conectados intencionales con flag `no-connect` (p.ej. /RE atado a DE, pines DNP del SX1276).
- [ ] Power flags en +48V, +5V, +5V_ISO, +3V3, FGND, GND, PE (ERC marca "no power driver" si faltan).
- [ ] Verificar que GND lógico y FGND son **nets distintas** (no unirlas por error en el esquemático).
- [ ] Confirmar pull-ups I²C únicos en el bus (no uno por dispositivo).
- [ ] ERC con cero errores antes de pasar a footprints.

---

## 9. Recomendación de secuencia

1. Resolver **H-1, H-2, H-3** → **Rev B del esquemático** (los tres tocan circuitería, no sólo valores).
2. Resolver H-5 y H-8 en la misma Rev B (triviales, evitan re-spin).
3. Capturar en KiCad con §6 y §7 → **ERC**.
4. Layout 4 capas con la guía de layout + las net classes → **DRC** (puedo entregar el `.kicad_dru` que traduce la guía §3 a reglas importables).
5. Gerbers + Excellon + CPL (puedo entregar el script `kicad-cli`).

H-4, H-6 y H-7 se pueden arrastrar como notas a validar en el survey/firmware; no frenan el layout.

---

*wanomi · WN-SITE-CORE · Revisión ERC + diseño · sesión #11 · para `docs/hardware/`*
