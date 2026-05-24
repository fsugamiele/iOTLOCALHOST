# Orden de trabajo de layout — WN-SITE-CORE

> **wanomi · Área 3 — Hardware · feature/telco-support · sesión #11**
> Kit para que el ingeniero de layout (humano, en KiCad) cierre el paso CAD a la primera. Acompaña a la guía de layout (stackup + reglas §3), al `.kicad_dru`, a la Rev B y al script de export.
> El ruteo en sí es trabajo interactivo en KiCad: este documento lo ordena y acota; no lo reemplaza.

---

## 0. Antes de empezar (one-time)

1. **Capturar el esquemático Rev B** en KiCad usando `wanomi_revB_cambios_WN-SITE-CORE.md` (cambios) + la revisión ERC §6 (símbolo→footprint) y §7 (net classes). Cerrar **ERC con cero errores** (checklist en revisión ERC §8).
2. En **Board Setup**:
   - Stackup 4 capas (L1 Sig / L2 GND / L3 PWR / L4 Sig), 1.6 mm, ENIG (guía §1).
   - Net classes con los nombres exactos del `.kicad_dru` (HV_FIELD, PWR_5V, PWR_3V3, ETH_DIFF, ANALOG, default).
   - Differential pair `ETH_DIFF` a **100 Ω** con el calculador del stackup elegido (JLCPCB publica el dieléctrico; ajustar ancho/gap del par).
   - Importar `wanomi_reglas_DRC_WN-SITE-CORE.kicad_dru` en Custom Rules.
3. Definir contorno de placa en Edge.Cuts: **~120 × 90 mm**.

---

## 1. Floorplan (zonificación)

Regla maestra (guía §4): **campo −48 V a la izquierda de la barrera; lógica, sensores y RF al lado seguro; antena en un borde; Ethernet en el borde opuesto al switching del DC-DC.**

```
   IZQUIERDA = CAMPO (-48V)        | BARRERA |        DERECHA = LÓGICA
   ───────────────────────────────|  6 mm   |──────────────────────────────
   X1 -48V  F1  GDT1  FL1  Q1  TVS1|  slot   | U1(sec) +5V  U2->+3V3
   X2 RS485(campo A/B)  ADM2483(fld)| fresado | ADM2483(lóg)  ESP32-S3 ▲antena
   X5 entradas (opto LED side)     |         | optos(salida)  W5500 ─ RJ45 (borde)
   X4 4-20mA  +24V boost(U14)      |         | ADS1115 + front-ends (rincón analóg.)
                                    |         | DS3231  RTC   RGB(D2)
```

| Zona | Componentes | Notas |
|---|---|---|
| **Campo (izq.)** | X1, F1, GDT1, FL1, Q1, TVS1, primario de U1; lado de campo de ADM2483 y de los optos; borneras X2/X4/X5 en el **borde izquierdo** | todo `HV_FIELD` + entradas de campo; masa FGND, isla propia |
| **Barrera** | slot fresado a lo largo, 6 mm, sin cobre en **ninguna** capa | sólo la cruzan U1, ADM2483 y los optos |
| **Lógica núcleo** | ESP32-S3, secundario de U1, U2, +5V/+3V3, supercap SC1, U14 boost, DS3231, D2 (con Schottky D3) | masa GND lógica en estrella desde salida sec. de U1 |
| **RF (borde)** | ESP32-S3 con antena cerámica **sobresaliendo del contorno**; keep-out 5×10 mm sin cobre en las 4 capas | alejado del switching de U1/U2/U14 |
| **Ethernet (borde opuesto al switching)** | W5500 + cristal 25 MHz + RJ45 MagJack en el borde; Bob Smith + TVS a chassis/PE | pares cortos, sobre GND continuo L2 |
| **Analógico (rincón quieto)** | ADS1115, front-ends de clamps (RC cerca de A0/A1), Rsense 4-20 mA cerca de X4 | plano GND analógico local; bias estable |

---

## 2. Orden de ruteo recomendado

1. **Colocación primero** (sin rutear): ubicar U1 sobre la barrera; ESP32-S3 en su borde con la antena afuera; W5500/RJ45 en el borde opuesto; ADS1115 en el rincón analógico; borneras de campo en el borde izquierdo. Confirmar floorplan §1.
2. **Dibujar el keep-out de antena** (Rule Area / Keepout, 5×10 mm, sin cobre/zonas en L1–L4).
3. **Lazo de conmutación de U1, U2 y U14**: cortos y compactos, caps de entrada/salida pegados (guía §3.6). Rutear primero porque condicionan todo.
4. **Pares Ethernet TX±/RX±**: cortos, length-matched, sobre L2 (GND) continuo, sin cruzar splits (guía §3.4).
5. **Bus I²C** (SDA/SCL): pull-ups R4/R5 cerca del MCU; ramal corto a SHT31/SDP810/ADS1115/DS3231.
6. **SPI** (MOSI/SCK/MISO + CS de W5500 y SX1276-DNP).
7. **Analógico**: CT1_S/CT2_S/FUEL_S con su GND analógico local; filtros RC pegados a las entradas del ADS1115.
8. **−48 V / FGND** del lado campo, anchos ≥1.0 mm, respetando los 6 mm de barrera.
9. **Pours**: L2 GND sólido continuo (no fragmentar bajo señales rápidas ni el par Ethernet); L3 islas +3V3/+5V/+24V con stitching caps a GND; FGND como isla separada (no unir a GND salvo el punto estrella único).
10. **Protecciones TVS/GDT**: como primer elemento desde cada conector de campo (guía §3.7).

---

## 3. Antes de Gerbers — checklist DRC (guía §5)

- [ ] DRC con **cero errores críticos** (las reglas del `.kicad_dru` cubren barrera 6 mm, anchos de potencia, clearances Ethernet/analógico/borde).
- [ ] Keep-out de antena confirmado en las 4 capas.
- [ ] Impedancia diferencial Ethernet 100 Ω validada con el stackup.
- [ ] Separación de masas (GND / FGND / analógico) y punto estrella único.
- [ ] Fiduciales (3 por cara) y testpoints: +3V3, GND, UART (IO43/44 libres), I²C, DATA de sensores.
- [ ] Serigrafía con designador + valor; polaridad marcada; zona HV en rojo.

---

## 4. Generar Gerbers

Una vez ruteado y con DRC limpio, correr `wanomi_export_gerbers.sh` (usa `kicad-cli`). Produce: 7 Gerbers RS-274X + Excellon drill + CPL/centroid. El BOM Rev B ya está listo para el ensamble.

---

*wanomi · WN-SITE-CORE · Orden de trabajo de layout · sesión #11 · para `docs/hardware/`*
