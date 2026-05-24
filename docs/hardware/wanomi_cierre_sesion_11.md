# Cierre sesión #11 — WN-SITE-CORE (Área 3 · Hardware)

> **wanomi · feature/telco-support · 2026-05-24**
> Handoff para aplicar en el repo (este chat no tiene el repo montado). Contiene el bloque para `docs/wanomi.md` y el nuevo estado para `docs/STATUS.md`.
> Guardar en `docs/hardware/` (igual que `cierre_sesion_10.md`).

---

## 1. Qué se hizo en la #11 (Área 3 · CAD)

1. **Revisión ERC + diseño** del esquemático Rev A → pinout ESP32-S3 verificado limpio; 3 bloqueantes + 4 a validar + 2 menores. (`wanomi_revision_ERC_WN-SITE-CORE.md`)
2. **Rev B cerrada** resolviendo los bloqueantes (`wanomi_revB_cambios_WN-SITE-CORE.md`, BOM Rev B, diagrama hoja 1).
3. **Kit de layout** para la etapa humana en KiCad: reglas DRC, orden de trabajo/floorplan y script de export.

**Límite real del paso CAD:** la captura del esquemático y el ruteo de 4 capas son trabajo interactivo en KiCad (humano / estudio de layout). No se generan Gerbers reales en este chat — generarlos sin una placa ruteada sería un entregable falso. El kit deja esa etapa lista para ejecutarse rápido y pasar DRC a la primera.

---

## 2. Bloque para `docs/wanomi.md` (append)

```
## Sesión #11 — 2026-05-24 · Área 3 (CAD del WN-SITE-CORE)

Revisión ERC del esquemático Rev A y cierre de Rev B. Pinout ESP32-S3
verificado sin conflictos (strapping/PSRAM/duplicados). Kit de layout
entregado para la etapa de ruteo humana en KiCad.

DEC-HW-10 — Alimentación del lazo 4-20 mA: agregado boost +5V→24V (U14).
  El front-end de combustible referenciaba +V_LOOP inexistente; con +5V el
  sender de 2 hilos no arranca. El +24V alimenta lazo y wetting de entradas.
DEC-HW-11 — Protección de entrada −48V de dos etapas: GDT a PE (energía) +
  TVS SMBJ64A (clamp). El SMBJ58A tenía stand-off insuficiente (ecualización
  ~57.6V) y clamp 93.6V > 75V del DC-DC.
DEC-HW-12 — Front-end de entradas digitales: wetting definido desde +24V con
  R por canal ~4k7 (≥3-5 mA, CTR confiable del TLP281); IN3 (presencia AC) pasa
  a canal dedicado, preferentemente vía AC-fail del rectificador (no 220VAC en placa).
DEC-HW-13 — WS2812: Schottky en VDD (~4.3V) para VIH compatible con DIN 3V3.

RISK-HW-5 (abierto) — Coordinación de clamp: con SMBJ64A el clamp queda ~103V,
  por encima de los 75V continuos del DC-DC. Confirmar rating transitorio del
  URB4805YMD; si <100V/ms, módulo telecom surge-rated o limitador serie.

BOM: placa $86.55 → $89.00; kit $139.55 → $142.00. Pinout sin cambios.
Validaciones arrastradas (no frenan layout): H-4 ADS1115 vs RMS, H-6 hold-up, H-7 term. RS-485.

Abierto al cierre #11: captura + ruteo 4 capas + Gerbers en KiCad (tarea humana,
Área 3). Kit listo: reglas DRC, orden de layout/floorplan, script de export.
```

---

## 3. Nuevo estado para `docs/STATUS.md`

```
# STATUS — WN-SITE-CORE (feature/telco-support)
Última sesión: #11 · 2026-05-24

## Dónde estamos
- Diseño WN-SITE-CORE: esquemático en Rev B (post-ERC). Monitoreo-only (Connect+Sense).
- BOM Rev B cerrado ($89 placa / $142 kit). Guía de layout + reglas DRC + orden de layout listos.
- Pinout ESP32-S3 verificado limpio.

## Próximos pasos (abiertos)
1. [Área 3 · humano en KiCad] Capturar esquemático Rev B → ERC → layout 4 capas
   → DRC → Gerbers. Usar el kit de layout (orden_layout, .kicad_dru, export_gerbers.sh).
   Esta es la tarea que NO puede cerrarse en chat: requiere ruteo interactivo.
2. [Área 3] Resolver RISK-HW-5 (rating transitorio del DC-DC vs clamp TVS) antes de fabricar.
3. [Área 1] Survey telemetría Tier 1 (CR00143, CR00070, CH00042, CR00061) → RISK-HW-1/2/3.
4. [Área 2] Sim-3 paso 4 — botones de escenarios en DevicePanel.vue (estacionado desde #9).

## Decisiones / riesgos
- Nuevas: DEC-HW-10..13. Riesgo abierto: RISK-HW-5.
- Validaciones de placa arrastradas: H-4, H-6, H-7 (ver wanomi.md #11).

## Pendientes operativos del repo
- #10: hacer `git push` de los +2 commits; mover `docs/cierre_sesion_10.md` → `docs/hardware/`.
- #11: agregar a docs/hardware/ los entregables de la #11 (lista abajo) y este cierre.
```

---

## 4. Entregables de la #11 (a `docs/hardware/`)

- `wanomi_revision_ERC_WN-SITE-CORE.md`
- `wanomi_revB_cambios_WN-SITE-CORE.md`
- `wanomi_BOM_WN-SITE-CORE.xlsx` (Rev B)
- `wanomi_hoja1_alimentacion_revB.svg`
- `wanomi_orden_layout_WN-SITE-CORE.md`
- `wanomi_reglas_DRC_WN-SITE-CORE.kicad_dru`
- `wanomi_export_gerbers.sh`
- `cierre_sesion_11.md` (este archivo)

---

*wanomi · WN-SITE-CORE · cierre sesión #11 · para `docs/hardware/`*
