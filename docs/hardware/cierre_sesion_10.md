# Cierre Sesión #10 — paquete para el repo

> Sesión de **Área 3 · Hardware**. Entregable: paquete de diseño completo del **WN-SITE-CORE**
> (núcleo de sitio telco, monitoreo-only). No se tocó código de la app; los entregables son
> documentos de ingeniería para commitear bajo `docs/hardware/`.
>
> Cómo usar este archivo:
> - **BLOQUE A** → pegar al final de `docs/wanomi.md`
> - **BLOQUE B** → reemplazar las secciones equivalentes en `docs/STATUS.md`

---

## BLOQUE A — para `docs/wanomi.md`

```markdown
## Sesión #10 — 2026-05-23 · Área 3 (Hardware) · WN-SITE-CORE

### Contexto
Diseño del WN-SITE-CORE: núcleo de sitio para telco (piloto Claro Corrientes).
Decisión de arranque: **monitoreo-only** en primera instancia, para no interferir con los
procedimientos de O&M de Claro. El núcleo integra energía + combustible + seguridad + clima,
en modo Connect (lee equipo existente por Modbus) + Sense (sensores físicos en puntos ciegos).

### Entregables COMPLETOS (orden de ingeniería respetado)
1. **Mapa de I/O congelado** — pinout ESP32-S3-WROOM-1 N16R8, sin conflictos.
2. **BOM** `wanomi_BOM_WN-SITE-CORE.xlsx` — placa poblada $86,55 / kit completo $139,55 USD.
3. **Diagrama de conexionado normalizado** `wanomi_plano_WN-SITE-CORE.pdf/.svg` — borneras + campo.
4. **Esquemático multi-hoja (5 hojas)** `wanomi_esquematico_WN-SITE-CORE.pdf` — todos los componentes + nets.
5. **Guía de layout (PCB 4 capas)** `wanomi_guia_layout_WN-SITE-CORE.pdf/.docx`.

Paquete = lo necesario para que el diseñador de PCB capture en KiCad, rutee y genere Gerbers.

### Decisiones (nuevas)
| ID | Decisión | Notas |
|---|---|---|
| DEC-HW-2 | WN-SITE-CORE = monitoreo-only (Connect+Sense); no actúa sobre genset | No interfiere O&M de Claro |
| DEC-HW-3 | Alimentación: −48 VDC de planta primario, DC-DC aislado wide-input (18-75V) + supercap hold-up | No 220 VAC (es lo que falla) ni batería de arranque del genset |
| DEC-HW-4 | MCU = ESP32-S3 (no ESP8266); Ethernet por W5500 (SPI) | El S3 no tiene MAC Ethernet nativa |
| DEC-HW-5 | Clamps + combustible vía ADS1115 (16-bit I²C), no ADC del chip | Exactitud para variables forenses (DEC-FORENSIC-2) + evita conflicto ADC2/WiFi |
| DEC-HW-6 | RTC DS3231 con backup en el CORE | Timestamp forense confiable sin red/NTP (corte = el evento a capturar) |
| DEC-HW-7 | PCB de 4 capas (no 2) | Barrera de aislación −48 V/campo + EMC de torre + impedancia Ethernet |
| DEC-HW-8 | Aislación: DC-DC aislado + ADM2483 (RS-485) + opto en toda entrada de campo | Solo 3 cruces de barrera; buena señal de diseño |
| DEC-HW-9 | Salidas (sirena/estrobo/lock) y LoRa = footprint reservado (DNP) | Pata de acción física y expansión a esclavos, fuera de scope ahora |

### RISK / pendientes a confirmar en el survey del piloto
| ID | Riesgo / pendiente | Mitigación |
|---|---|---|
| RISK-HW-1 | Bus Modbus del genset: si el NOC de Claro ya es máster, no se puede 2º máster en el mismo RS-485 | Verificar por sitio; alternativa: sniffing pasivo o contactos secos por X5 |
| RISK-HW-2 | Rango/conexión de la sonda hidrostática 4-20 mA según modelo del primer sitio | Validar en relevamiento; define R10 y V_LOOP |
| RISK-HW-3 | Rectificador y ATS por sitio (D-H abierto desde #9): protocolo y si exponen Modbus | Survey Tier 1 |
| RISK-HW-4 | SDP810 (presión diferencial A/C) es el ítem más caro de la placa ($22) | Evaluar poblarlo por sitio |

### Lecciones aprendidas
- **Esquemático ≠ Gerbers.** Fabricar la PCB requiere layout + DRC en CAD; el esquemático + BOM +
  conexionado + guía de layout son el *paquete de diseño*, no archivos de fabricación.
- El proveedor pide **diagrama normalizado** (borneras, simbología IEC): no alcanza con BOM + esquemas.
- **ESP32-S3 ≠ ESP32 clásico**: el S3 no tiene MAC Ethernet nativa → W5500 por SPI.
- **ESP32-S3 N16R8**: GPIO35/36/37 los usa la PSRAM octal (no disponibles); 0/3/45/46 son strapping.
- Para un núcleo enterprise el costo correcto es mayor: CORE ~$220-280 PVP, no el rango de catálogo
  comercial ($45-105). El sensor físico de combustible (forense) es el ítem de campo más caro y el más valioso.
```

---

## BLOQUE B — parche para `docs/STATUS.md`

### Reemplazar el encabezado por:

```markdown
**Última actualización**: 2026-05-23 (cierre sesión #10)
**Branch activa**: feature/telco-support
**Para nueva sesión**: leer este archivo + `docs/INVENTARIO_AUTO.md`
```

### Reemplazar el bloque "## Estado — Sesión #N cerrada" por:

```markdown
## Estado — Sesión #10 cerrada (2026-05-23)

Área 3 (Hardware). Paquete de diseño COMPLETO del **WN-SITE-CORE** (núcleo de sitio,
monitoreo-only Connect+Sense): mapa de I/O → BOM → diagrama de conexionado normalizado →
esquemático multi-hoja (5 hojas) → guía de layout (PCB 4 capas). 9 entradas DEC-HW + 4 RISK-HW
registradas en wanomi.md. Entregables a commitear bajo `docs/hardware/`.

### Próximos pasos

1. **CAD (Área 3)**: captura del esquemático en KiCad + ERC → layout 4 capas + DRC → Gerbers.
   Lo cierra el ingeniero electrónico; usar la guía de layout como referencia.
2. **Survey de telemetría Tier 1** (CR00143, CR00070, CH00042, CR00061): resolver RISK-HW-1/2/3
   (bus Modbus máster, sonda combustible, rectificador/ATS).
3. **Sim-3 paso 4** — botones de escenarios en `DevicePanel.vue` (estacionado desde inicio #9).
```

### Agregar al final de la tabla "## Decisiones recientes":

```markdown
| DEC-HW-2 | WN-SITE-CORE monitoreo-only (Connect+Sense); no actúa sobre genset | No interferir O&M Claro |
| DEC-HW-3 | Alimentación −48 VDC planta primaria; DC-DC aislado wide-input + supercap | No 220 VAC ni batería de crank |
| DEC-HW-4 | ESP32-S3 (no ESP8266); Ethernet por W5500 | El S3 no tiene MAC nativa |
| DEC-HW-5 | Clamps + combustible vía ADS1115 16-bit | Exactitud forense; evita ADC2/WiFi |
| DEC-HW-6 | RTC DS3231 en el CORE | Timestamp forense sin red/NTP |
| DEC-HW-7 | PCB 4 capas | Barrera −48 V + EMC + impedancia Ethernet |
| DEC-HW-8 | Aislación: DC-DC + ADM2483 + opto en entradas de campo | Solo 3 cruces de barrera |
| DEC-HW-9 | Salidas + LoRa como footprint DNP | Acción física y esclavos, fuera de scope |
```

### Agregar a "## Lecciones aprendidas":

```markdown
- **Esquemático ≠ Gerbers**: fabricar la PCB requiere layout + DRC en CAD.
- El proveedor pide diagrama normalizado (borneras/IEC), no alcanza BOM + esquemas.
- ESP32-S3 no tiene MAC Ethernet nativa (≠ ESP32 clásico) → W5500.
- ESP32-S3 N16R8: GPIO35/36/37 ocupados por PSRAM octal; 0/3/45/46 strapping.
```
