# WN-SITE-CORE — Rev A → Rev B · Documento de cambios

> **wanomi · Área 3 — Hardware · feature/telco-support · sesión #11 · 2026-05-24**
> Cierre de **Rev B** del esquemático tras la revisión ERC/diseño (`wanomi_revision_ERC_WN-SITE-CORE.md`).
> Resuelve los 3 bloqueantes (H-1, H-2, H-3) + 2 menores (H-5, H-8). Las validaciones H-4/H-6/H-7 se arrastran como notas; no frenan el layout.
> Acompaña al BOM Rev B (`wanomi_BOM_WN-SITE-CORE.xlsx`) y al diagrama de la hoja 1 revisada (`wanomi_hoja1_alimentacion_revB.svg`).
> **Esta es la base para la captura en KiCad.**

---

## 1. Resumen de cambios

| ID | Hallazgo | Cambio | Hoja | Impacto BOM |
|---|---|---|---|---|
| C-1 | H-1 | Boost **+5 V → +24 V** que alimenta el lazo 4-20 mA (y el wetting de C-3) | 1, 4 | +ítem 46 ($0,90) |
| C-2 | H-2 | Protección −48 V de **dos etapas**: GDT + TVS **SMBJ64A** (era SMBJ58A) | 1 | +ítem 47 ($0,50) · TVS reespec. |
| C-3 | H-3 | Front-end de entradas: **wetting +24 V**, R por canal ≥3-5 mA, **IN3 canal AC dedicado** | 5 | +ítem 49 ($1,00) |
| C-4 | H-5 | **Schottky** en VDD del WS2812 → VIH compatible con DIN 3V3 | 2 | +ítem 48 ($0,05) |
| C-5 | H-8 | Renombrar rótulo duplicado **R4 → R4 (SDA) / R5 (SCL)** | 4 | — (anotación) |

**BOM:** placa poblada **$86,55 → $89,00** (+$2,45) · kit completo **$139,55 → $142,00**. DNP sin cambios ($7,50).

**Hojas tocadas:** 1 (alimentación/protección), 2 (sólo D2 WS2812), 4 (origen del lazo + rótulo), 5 (entradas). **Hoja 3 (comunicaciones) sin cambios.**

**Pinout ESP32-S3: SIN cambios.** Ningún fix consume un GPIO nuevo (el boost es always-on; el wetting y el front-end AC no agregan pines de MCU). La auditoría de pinout de la revisión ERC sigue válida tal cual.

---

## 2. C-1 · Alimentación del lazo 4-20 mA (H-1)

**Problema:** el front-end de combustible usaba `+V_LOOP`, inexistente en el árbol de alimentación (sólo había +5 V y +3V3). Una sonda hidrostática de 2 hilos necesita ~12-24 V de lazo → con +5 V no entrega corriente válida. Combustible es la variable forense prioritaria.

**Solución:** agregar boost **U14 (+5 V → +24 V)** — base MT3608 o boost dedicado, salida ajustada a 24 V, ~30 mA. Genera el rail nuevo **`+24V`** (alimenta el lazo y, en C-3, el wetting). Always-on (sin GPIO de enable).

### Conexiones nuevas — U14 (hoja 1)

| Desde | Hacia | Nota |
|---|---|---|
| +5V | U14 VIN | entrada del boost |
| GND | U14 GND | — |
| U14 SW | inductor + Schottky → VOUT | red del MT3608 (L, D, Cout según datasheet) |
| U14 VOUT | rail **+24V** | ajustar feedback a 24 V; Cout ≥ 22 µF |

### Lazo 4-20 mA revisado (hoja 4)

| Desde | Hacia | Nota |
|---|---|---|
| **+24V** | X4.1 (I+) | alimentación del lazo |
| X4.2 (I−) | nodo `FUEL_S` (tope de R10) | retorno del sender |
| `FUEL_S` | ADS1115 A2 | lectura |
| R10 150 Ω 0.1% (tope = FUEL_S) | GND | Rsense: 4 mA→0,6 V · 20 mA→3,0 V |
| TVS + R serie | en X4 | protección de línea de campo |

> Live-zero: 0 mA = 0 V permite detectar lazo abierto en firmware. Margen alto: 20 mA = 3,0 V dentro del rango del ADS1115 (FSR ±4,096 V); fault 22 mA = 3,3 V protegido por TVS.

---

## 3. C-2 · Protección de entrada −48 V de dos etapas (H-2)

**Problema:** el SMBJ58A tenía stand-off 58 V (V_BR mín 64,4 V, clamp 93,6 V confirmados en datasheet). Stand-off insuficiente frente al flotante de ecualización (~57,6 V) → fuga/calor en operación normal; y clamp 93,6 V > 75 V máx del DC-DC → no lo protege.

**Solución:** cadena coordinada de dos etapas y TVS de mayor stand-off.

### Cadena de protección revisada (hoja 1), en orden desde el borne

```
X1(-48V/0V/PE) → F1(1A) → GDT1(a PE) → FL1(EMI CM+X/Y) → Q1(DMP3098 rev-pol) → TVS1(SMBJ64A) → U1(DC-DC aislado)
```

| Elemento | Cambio | Función |
|---|---|---|
| GDT1 (**nuevo**, ítem 47) | agregar entre línea y PE, junto al borne X1 | 1ª etapa: diverte la energía del surge (rayo/power-cross, entorno torre) |
| FL1 (choke CM) | sin cambio | impedancia serie que ayuda a coordinar GDT↔TVS |
| TVS1 | **SMBJ58A → SMBJ64A** (stand-off 64 V, clamp ~103 V) | 2ª etapa: clampea el residual tras el GDT |

| Conexión | Nota |
|---|---|
| GDT1 entre +48V y PE (cerca de X1) | y/o línea-línea según relevamiento de surge |
| TVS1 (SMBJ64A) entre Vin+ y Vin− del DC-DC | unidireccional, orientación correcta; después del rev-pol |

> **A confirmar (no frena layout):** con stand-off 64 V el clamp queda en ~103 V, por encima de los 75 V continuos del DC-DC. Verificar el **rating transitorio** del URB4805YMD en su datasheet; si sólo tolera 75 V, elegir un módulo telecom con surge ≥100 V/ms (GR-1089) o agregar elemento serie limitador. El GDT + choke reducen el residual que ve el TVS, ayudando a la coordinación.

---

## 4. C-3 · Front-end de las 8 entradas digitales (H-3)

**Problema:** los 8 canales se dibujaban idénticos, con R 4k7 a un rail no definido (corriente de LED ~0,4-0,8 mA, insuficiente para la CTR del TLP281), sin wetting definido, y con "presencia red AC" (IN3) tratada como un opto DC común.

**Solución:** definir wetting, dimensionar la R, y separar IN3.

### Canal típico revisado (×7: IN1, IN2, IN4, IN5, IN6, IN7, IN8) — hoja 5

| Desde | Hacia | Nota |
|---|---|---|
| **+24V** | R serie ~4k7 → ánodo LED del opto (TLP281) | I_LED ≈ (24−1,2)/4k7 ≈ 4,8 mA → CTR confiable + buen wetting de contacto |
| cátodo LED del opto | X5.x (INx campo) | el contacto cierra INx contra COM |
| X5.COM | retorno de wetting (común de LEDs) | dominio de campo |
| opto colector | pull-up 10k a +3V3 → ESP32 IOx | salida lógica |
| opto emisor | GND | — |
| TVS | en X5.x | clamp de surge de campo |

> El opto mantiene la **aislación señal de campo ↔ MCU** (el lazo del LED y el del fototransistor no comparten cobre). Cumple DEC-HW-8.

### IN3 — presencia red AC (canal dedicado) — hoja 5

- **Preferido:** tomar "AC presente/AC-fail" del **contacto seco del rectificador** o del dato por **Modbus** (el CORE ya lee el rectificador en modo Connect) → IN3 pasa a ser un canal de contacto seco normal, sin meter 220 VAC en la placa.
- **Si se exige sensado directo de 220 VAC:** front-end AC dedicado (ítem 49) — opto apto para línea (LED bidireccional o puente + cap-dropper) con impedancia serie y **creepage para 220 VAC**, ubicado en la zona de campo/HV. **No** un opto DC con una sola R.

### A confirmar por canal (survey)
PIR (IN2) y humo (IN4) suelen tener salida **activa / colector abierto**, no contacto seco puro → confirmar tipo y ajustar el pull por canal con el dispositivo real del sitio.

---

## 5. C-4 · WS2812 a +5 V (H-5) — hoja 2

**Problema:** D2 (WS2812) alimentado a +5 V con DIN desde GPIO 3V3; VIH ≈ 0,7·5 = 3,5 V > 3,3 V → fuera de spec.

**Solución:** Schottky **D3 (BAT54/SS14, ítem 48)** en serie con el VDD del WS2812.

| Desde | Hacia | Nota |
|---|---|---|
| +5V | D3 (ánodo) | — |
| D3 (cátodo) | D2 VDD (~4,3 V) | VIH ≈ 0,7·4,3 = 3,0 V < 3,3 V → en spec |
| IO48 | D2 DIN | sin cambio |
| 100 nF | D2 VDD–GND | desacople |

> Alternativa equivalente: level-shifter en DIN, o variante SK6812. Se elige el Schottky por costo/área.

---

## 6. C-5 · Rótulo R4/R5 (H-8) — hoja 4

Los dos pull-ups I²C aparecían ambos como "R4 4k7". Renombrar a **R4 (SDA)** y **R5 (SCL)** para que el ERC no marque referencia duplicada. Sin efecto eléctrico ni en BOM.

---

## 7. Pendientes a validar (arrastrados — no frenan el layout)

| ID | Tema | Acción |
|---|---|---|
| H-4 | Tasa efectiva del ADS1115 multiplexado vs RMS de corriente a 50 Hz | Documentar el límite: sirve para presencia/nivel, no para RMS/energía forense. Reconsiderar front-end si se exige RMS verdadera. |
| H-6 | Ventana de hold-up del supercap (limitada por Vin_min del buck ~4,5 V → ~1 s) | Confirmar que el "último aviso" cierra en esa ventana. El boost +24 V agrega carga standby despreciable. |
| H-7 | Terminación RS-485 (R3 120 Ω) | Poblar sólo si el CORE es extremo físico del bus; si es derivación, R3 = DNP. Decisión por sitio. |

---

## 8. Estado

**Rev B cerrada.** Esquemático listo para captura. Secuencia siguiente (Área 3 · CAD):

1. Capturar en KiCad usando este documento + el mapa símbolo→footprint y las net classes de la revisión ERC §6/§7.
2. **ERC** (cero errores) con el checklist de la revisión ERC §8.
3. Layout 4 capas con la guía de layout + net classes → **DRC** (disponible el `.kicad_dru` que traduce la guía §3).
4. **Gerbers** + Excellon + CPL (disponible el script `kicad-cli`).

---

*wanomi · WN-SITE-CORE · Rev A → Rev B · sesión #11 · para `docs/hardware/`*
