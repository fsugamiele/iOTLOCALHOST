# STATUS — WN-SITE-CORE (feature/telco-support)
Última sesión: #12 · 2026-05-27

## Dónde estamos
- WN-SITE-CORE: esquemático Rev B, ERC 0/0/0, diseño CONGELADO. DEC-HW-1..25 registradas.
- Gerbers v1 exportados; **revisión mecánica pendiente (v2)**: reubicar ESP, rotar/correr USB, 4 montajes M3.
- Arquitectura validada vs informe de equipamiento de Claro (Modbus RTU + TCP).

## Próximos pasos
1. [Área 3 · Flux] Revisión mecánica → DRC limpio → Gerbers v2.
2. [Fab] Enviar **Gerbers v2** (no v1) a JLCPCB para fabricación y prueba funcional del prototipo.
3. [Área 3 + Área 1] Cerrar RISK-HW-5 antes de despliegue en campo.
4. [Área 2] Validar dying-gasp (AIN3) y mapas Modbus en banco (ComAp + Cummins).
5. [Área 1] Survey Tier 1 (CR00143, CH00042, CR00070, CH00R02, CR00061).
6. [Área 2] Sim-3 paso 4 — botones de escenarios en DevicePanel.vue (estacionado desde #9).

## Decisiones / riesgos
- Cerradas: DEC-HW-1..25. Riesgo abierto: RISK-HW-5.
- Backlog de mejoras futuras: MEJORA-HW-1..4 (ver wanomi.md #12 y wn-site-core-cierre-sesion.md).

## Pendientes operativos del repo
- #10: hacer `git push` de los +2 commits; mover `docs/cierre_sesion_10.md` → `docs/hardware/`.
- #11/#12: Gerbers v2 pendientes en Flux (revisión mecánica).

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
