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

---

## Decisiones e histórico

Decisiones completas (DEC-* incl. DEC-HW-1..9) y lecciones aprendidas: ver `docs/wanomi.md`.

---

## Para retomar en una nueva sesión

**Hacé esto antes de proponer trabajo:**

1. `./scripts/inventario.sh` → regenera `docs/INVENTARIO_AUTO.md`
2. Leé `docs/STATUS.md` (este archivo) — qué hay, qué falta
3. Leé `docs/INVENTARIO_AUTO.md` — lo que realmente está en el código
4. Leé `docs/wanomi_modelo_conceptual.md` — el modelo conceptual aprobado
5. Si necesitás detalle de una sesión específica, `docs/wanomi.md`
6. Decidí qué hacer en base a la realidad, no a la memoria

## Estructura del repo (atajos)

| Ubicación | Qué hay |
|---|---|
| `app/` | Backend Express + Frontend Nuxt 2 (todo Node.js) |
| `app/api/models/` | Modelos Mongoose (User, Device, Template, Site, ForensicEvent, etc.) |
| `app/api/routes/` | Express routes (auth, devices, templates, sites, forensic, simulator, rules, alarms) |
| `app/pages/` | Páginas Nuxt (dashboard, devices, templates, alarms, rules, demo/simulator) |
| `app/components/` | Componentes Vue (Widgets, Simulator, Layout, Cards) |
| `tools/device_simulator/` | Simulador WN-SEC/WN-GEN |
| `ESP8266/` | Firmware Wanomi original (PlatformIO) |
| `docs/` | Documentación (STATUS, INVENTARIO_AUTO, wanomi.md, modelo conceptual) |
| `scripts/` | Scripts de utilidad (inventario.sh) |
