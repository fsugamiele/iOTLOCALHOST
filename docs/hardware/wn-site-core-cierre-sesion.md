# WN-SITE-CORE — Cierre de sesión #12 (2026-05-27)

Registro de decisiones de hardware, revisión mecánica pre-fabricación, gates abiertos y backlog de mejoras futuras.

---

## Decisiones de hardware — DEC-HW-18..25

### DEC-HW-18 — TVS1 de entrada: SMCJ64A-T7 (reemplaza SMBJ64A)

- **Componente:** SMCJ64A-T7 (Vishay / Do-214AB SMC)
- **Parámetros clave:** 1500W, V_BR = 71.1V mín, clamp ~103V @ Ipp = 14.6A
- **Motivo:** SMBJ64A (600W, SMA) insuficiente en energía; el SMC es el package estándar de 1500W. El GDT de 1ª etapa desvía el grueso del transitorio; el TVS absorbe el remanente.
- **Nota de polaridad:** dispositivo unidireccional, orientado para −48V negativo-a-masa.

### DEC-HW-19 — Rectificador/Power Plant: Modbus TCP vía W5500

- El controlador del rectificador / Power Plant se consulta por **Modbus TCP** usando el W5500 ya presente (uplink MQTT), mediante un segundo socket.
- Un solo conector RJ45 concentra MQTT (telemetría a NOC) y Modbus TCP (lectura del rectificador).
- No se agrega hardware extra ni segundo conector de red.

### DEC-HW-20 — Reposicionamiento de pinzas CT

- **CT1:** acometida comercial (medición de consumo real del site).
- **CT2:** salida del GEF (cross-check forense — detecta anomalías y robo de energía).
- Los parámetros eléctricos internos del GEF/Power Plant (tensión bus DC, corriente de carga, etc.) se obtienen por Modbus (DEC-HW-19); las pinzas CT no los redundan.

### DEC-HW-21 — Sensor de combustible: 4-20 mA

- Se descarta el HC-SR04 (ultrasónico) por incompatibilidad con entornos industriales de combustible (vapores, temperatura, montaje en tanque).
- **Front-end elegido:** lazo 4-20 mA con sensor de nivel industrial (flotador magnético o presión hidrostática según site).
- El front-end ADS1115 ya previsto en el diseño maneja el lazo 4-20 mA directamente.

### DEC-HW-22 — DC-DC U1: Traco THN 10-4811WIR

| Parámetro | Valor |
|---|---|
| Fabricante / P/N | Traco Power — THN 10-4811WIR |
| Normativas | EN50155 / EN61373 (railway), IEC/EN/UL 62368-1 |
| Aislación | 3 kV DC |
| Entrada (rango 4:1) | 18 – 75 V DC |
| Salida | 5 V / 2 A (10 W) |
| Package | 1"×1" (SIP) |
| Reemplaza | TEN 10-4811 (EOL, sólo IEC 60950-1, sin rating de surge) |

El THN 10-4811WIR tiene certificaciones railway y de seguridad vigentes, y rating de surge superior al TEN EOL.

### DEC-HW-23 — AS3935 detector de rayo: footprint DNP

- Footprint reservado en esquemático, marcado **DNP** (Do Not Populate) en BOM.
- Interfaz SPI compartida; pines asignados: CS = GPIO43, IRQ = GPIO44.
- La asignación a GPIO43/44 libera la consola UART0 de interferencia; debug disponible por USB-C.
- Poblar sólo si el piloto de campo valida demanda del feature.

### DEC-HW-24 — Resistencia de terminación RS-485: R485T poblada por defecto

- R485T (120 Ω) va **poblada por defecto** en BOM y Pick&Place.
- Des-poblar sólo en variantes de instalación donde el WN-SITE-CORE no sea el extremo del bus RS-485 (midpoint node).
- Documenta la excepción en el checklist de commissioning del site.

### DEC-HW-25 — Energización en el piloto: fuente externa

- Para sites sin −48V disponible (banco de pruebas, comisionamiento, instalaciones iniciales), se usa **fuente externa** AC/DC o batería de 24V o 48V dentro del rango de entrada 18-75V de U1 (THN 10-4811WIR).
- La entrada pasa por la protección existente (GDT + SMCJ64A); no se requiere cambio de placa.
- **Respetar polaridad:** el TVS SMCJ64A es unidireccional, orientado para −48V negativo-a-masa. Conectar positivo al polo más negativo del bus (convención telecom).
- El piloto Claro arranca con fuente externa → sin cambio de esquemático.

---

## Revisión mecánica de PCB — Gerbers v1 → v2

> El esquemático Rev B, ERC 0/0/0 y todas las decisiones DEC-HW-1..25 quedan intactos. Esta revisión es exclusivamente de colocación/mecánica.

### Problemas detectados en Gerbers v1 / vista 3D

| Componente | Problema | Corrección |
|---|---|---|
| **ESP32-S3 (U3)** | Módulo cuelga ~4.5mm fuera del borde PCB (extremo de antena sin soporte mecánico) | Reubicar módulo completo sobre la placa; antena orientada al borde con keepout de cobre en las 4 capas (F.Cu, In1.Cu, In2.Cu, B.Cu) |
| **USB-C (JUSB1)** | Conector apunta hacia el interior de la placa (rotación incorrecta) | Rotar 180° y posicionar al borde, conector al ras para acceso externo |
| **Agujeros de montaje** | Ausentes (los 2 NPTH son postes mecánicos del RJ45, no montaje de PCB) | Agregar 4× M3 (taladro 3.2 mm) en las 4 esquinas con keepout apropiado, respetando la barrera de aislación de −48V |

### Secuencia de trabajo en Flux para v2

1. Reubicar U3 (ESP32-S3): mover dentro de la placa, antena al borde, definir keepout en 4 capas.
2. Rotar/reubicar JUSB1 (USB-C) al borde.
3. Agregar 4 agujeros de montaje M3 en esquinas.
4. Re-pour de planos de cobre afectados.
5. Re-rutear las pistas cortadas por los movimientos.
6. **Una DRC completa** — debe terminar sin errores.
7. Re-exportar **Gerbers v2** (no sobreescribir v1; mantener historial).
8. Informar a JLCPCB: stackup 4 capas con impedancia controlada 100 Ω diferencial en el par Ethernet.

---

## Gates abiertos antes de fabricar / desplegar

| Gate | Descripción | Urgencia |
|---|---|---|
| **DRC v2 limpio** | DRC sin errores + keepout de antena verificado en las 4 capas + stackup informado a JLCPCB | **Mandatorio antes de fabricar** |
| **RISK-HW-5** | Confirmar abs-max/transitorio del THN10WIR vs clamp SMCJ64A (~103V) a la corriente de surge del survey/GR-1089. El endurecimiento real lo da el front-end GDT+TVS. | Gate de campo — diferible para prueba funcional en banco; **NO diferible para despliegue en campo** |
| **Hold-up / dying-gasp** | Validar con firmware la ventana real del supercap (usa AIN3, DEC-HW-16) | Área 2 |
| **Mapas de registros Modbus** | Validar en banco con ComAp + Cummins reales (fase lab informe Claro) | Área 2 |
| **Exactitud CT / 4-20 mA** | Definir clase de exactitud y rangos por tipo de site | Área 1 (survey) |

---

## Backlog de mejoras futuras (NO en el piloto)

### MEJORA-HW-1 — Diodo OR USB-C → riel +5V

Agregar un Schottky (diodo OR) desde los 5V del conector USB-C hacia el riel +5V interno, para poder energizar la placa por USB-C durante commissioning o pruebas de banco sin necesitar la fuente de −48V/24V.

- Cambio de esquemático pequeño (1 diodo Schottky, ~0.3V caída).
- Sin impacto en layout existente más allá del componente nuevo.
- **Diferido**: no bloquea el piloto; útil en producción serie.

### MEJORA-HW-2 — Entrada de polaridad universal

Agregar un puente de diodos o circuito de ideal-diode en la entrada de alimentación para aceptar cualquier polaridad sin daño.

- Caída ~1.0–1.4V, despreciable en un rango de entrada 18-75V.
- Elimina riesgo de daño por inversión de polaridad en campo.
- **Diferido**: el piloto opera con fuente externa con polaridad controlada.

### MEJORA-HW-3 — Variante de entrada 9-36V

Usar THN 10-xx05WIR (mismo footprint 1"×1") para cubrir sites con baterías de 12V o 24V (rangos fuera de la variante 18-75V actual).

- Variante de ensamble: mismo PCB, diferente componente U1.
- Documentar como SKU alternativo en BOM.
- **Diferido**: el piloto Claro opera con rectificadores −48V o fuente 24/48V.

### MEJORA-HW-4 — Front-end PoE PD

Agregar transformador magnético PoE en el RJ45 y circuito PD (Powered Device) para alimentar la placa directamente por el cable Ethernet (PoE 48-57V está dentro del rango del DC-DC).

- Cambio de hardware mayor: requiere nuevo RJ45 con magnéticas, circuito PD (ej. LT4275 o TPS23753).
- Elimina el cable de alimentación dedicado en instalaciones con switch PoE.
- **Futuro**: candidato para revisión hardware v2 post-piloto.

---

## Referencias cruzadas

- Esquemático Rev B completo: `docs/hardware/wanomi_esquematico_WN-SITE-CORE.pdf`
- BOM Rev B: `docs/hardware/wanomi_BOM_WN-SITE-CORE.xlsx`
- Guía de layout: `docs/hardware/wanomi_guia_layout_WN-SITE-CORE.pdf`
- Orden de layout / floorplan: `docs/hardware/wanomi_orden_layout_WN-SITE-CORE.md`
- Reglas DRC: `docs/hardware/wanomi_reglas_DRC_WN-SITE-CORE.kicad_dru`
- Script export Gerbers: `docs/hardware/wanomi_export_gerbers.sh`
- Revisión ERC Rev B: `docs/hardware/wanomi_revision_ERC_WN-SITE-CORE.md`
- Cambios Rev A → Rev B: `docs/hardware/wanomi_revB_cambios_WN-SITE-CORE.md`
- Bitácora maestra: `docs/wanomi.md` (sesión #12)
- Estado del proyecto: `docs/STATUS.md`
