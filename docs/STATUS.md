# Wanomi — Estado del proyecto

**Última actualización**: 2026-05-19
**Branch activa**: feature/telco-support
**Para nueva sesión**: leer este archivo + `docs/INVENTARIO_AUTO.md`

---

## Resumen ejecutivo

Wanomi es una plataforma IoT self-hosted self-orquestada para automatización
operativa reactiva. Cliente objetivo de la demo: **Claro Corrientes** (telco),
con piloto en 3 sites (CR00015 Empedrado, CR00073 Palmar de San Luis,
CR00203 Capital).

**Estado general**: Fase 4 (telco/forensic) backend completo. Sim-3 (panel
simulador) en progreso. Demo a Claro estimada en 2-3 semanas.

---

## Las 4 patas del valor — estado actual

| Pata | Estado | Trabajo restante |
|---|---|---|
| 🔴 Disuasión local (sirena + estrobo + audio) | No implementado | Crear devices virtuales en simulador + widgets |
| 🔴 Notificación inteligente (Telegram) | Bot creado, sin integración | Endpoint + dispatcher + UI config |
| 🔴 Acción física automática (lock + etc.) | No implementado | Crear devices virtuales + actdata flow |
| 🟡 Trazabilidad forense (HMAC chain + PDF) | Backend completo | Frontend (cronología visual + botón PDF) |

---

## Trabajo completado

### Fase 4 (commits e5877e5 → 0e735c2)
- ✅ Modelo Site (con BTS/shelter/repeater, coordenadas, etc.)
- ✅ CRUD de sites en `app/api/routes/sites.js`
- ✅ Modelo ForensicEvent con HMAC chain e inmutabilidad
- ✅ Forensic dispatcher + integración con webhooks
- ✅ Endpoints forensic en `app/api/routes/forensic.js`
- ✅ HMAC hardening
- ✅ PDF export con pdfkit

### Sim-1 → Sim-3 paso 0 (commits 1224110 → afdb857)
- ✅ Simulador WN-SITE-SEC/GEN con 6 devices (2 templates × 3 sites)
- ✅ Templates v2 alineados con pitch Claro
- ✅ 7 escenarios reactivos (intrusion, copper_theft, maintenance,
   fuel_siphon, genset_no_start, genset_vibration_anomaly, battery_degraded)
- ✅ API endpoints `/api/simulator/*` (devices, scenarios, trigger, set, reset)
- ✅ Reset endpoint que cancela timers + restaura initial state

### Sim-3 paso 3 (sin commit todavía)
- 🟡 `pages/demo/simulator.vue` — master-detail layout
- 🟡 `components/Simulator/DeviceList.vue` — agrupación por site
- 🟡 `components/Simulator/DevicePanel.vue` — sensores en vivo con MQTT
- 🟡 Reactividad MQTT validada con bug fix (Vue 2 reactivity + SFC templates)

---

## Próximos pasos (en orden)

### 1. Cerrar Sim-3 paso 4 (botones de escenarios) — 1 día
- Agregar grilla de botones de escenarios al DevicePanel
- Estado del escenario activo + countdown
- Test funcional con cada uno de los 7 escenarios
- Commit final de Sim-3 completo

### 2. Sim-3.5 — 13-16 días (post-cierre de Sim-3)
Plan detallado pendiente. Sub-fases:
- Ampliar modelo Template con `samplingType` + `samplingParams`
- Refactor simulator a devices multi-sensor por SEC/GEN
- Motor de reglas ampliado (AND/OR + ventanas temporales)
- Devices actuadores virtuales (sirena, cámara, lock, audio)
- Telegram bot integration
- Frontend dashboard con doble select (sitio + plantilla)
- Frontend forensic chain (cronología visual + PDF export)
- Pulido + ensayo + bitácora

### 3. Pulido pre-demo Claro
Estimado tras Sim-3.5: ~3-5 días.

---

## Decisiones recientes (últimas 10)

| ID | Decisión | Sesión |
|---|---|---|
| DEC-PROC-2 | Auditoría de código existente antes de proponer features | #8 (2026-05-18) |
| DEC-PROC-1 | Protocolo de manejo de secrets (ver SECRETS.md) | #8 (2026-05-18) |
| DEC-PHIL-3 | Las 4 patas del valor: disuasión + notif + acción + forense | #8 (2026-05-18) |
| DEC-SW-6 | Forensic chain como capacidad de primera clase | #8 (2026-05-18) |
| DEC-SW-5 | Demo a Claro se hace en /dashboard nativo (no en panel /demo/simulator) | #8 (2026-05-18) |
| DEC-SW-4 | Panel /demo/simulator es herramienta interna del operador | #8 (2026-05-18) |
| DEC-SW-1 | Motor de reglas se amplía: AND/OR + ventanas temporales + modo contextual | #8 (2026-05-18) |
| DEC-DATA-4 | Plantilla amplía con `samplingType` por widget (event/telemetry/aggregated) | #8 (2026-05-18) |
| DEC-DATA-1 | Cada sensor es device independiente (no concentrado en 1 device) | #8 (2026-05-18) |
| DEC-HW-1 | Modelo maestro-esclavo de hardware | #8 (2026-05-18) |

Detalles completos en `docs/wanomi.md`.

---

## Lecciones aprendidas (últimas)

- **Vue 2 SPA**: nunca usar `template: "..."` strings inline. Todo render en SFC `.vue`.
- **Vue 2 reactividad**: pre-inicializar keys con `null` antes del `$set`.
- **Logs estratégicos** > console interactiva cuando no se puede ejecutar console.
- **Logs en texto** > screenshots para diagnóstico colaborativo.
- **Activar "Preserve log"** en DevTools desde el inicio.
- **Secrets NUNCA en chat**, ver SECRETS.md.
- **Auditoría del repo > memoria del context** — la realidad está en el código,
  no en el context window.

---

## Para retomar en una nueva sesión

**Hacé esto antes de proponer trabajo:**

1. `./scripts/inventario.sh` → regenera `docs/INVENTARIO_AUTO.md`
2. Leé `docs/STATUS.md` (este archivo) — qué hay, qué falta
3. Leé `docs/INVENTARIO_AUTO.md` — lo que realmente está en el código
4. Leé `docs/wanomi_modelo_conceptual.md` — el modelo conceptual aprobado
5. Si necesitás detalle de una sesión específica, `docs/wanomi.md`
6. Decidí qué hacer en base a la realidad, no a la memoria

---

## Estructura del repo (atajos)

| Ubicación | Qué hay |
|---|---|
| `app/` | Backend Express + Frontend Nuxt 2 (todo Node.js) |
| `app/api/models/` | Modelos Mongoose (User, Device, Template, Site, ForensicEvent, etc.) |
| `app/api/routes/` | Express routes (auth, devices, templates, sites, forensic, simulator, rules, alarms) |
| `app/pages/` | Páginas Nuxt (dashboard, devices, templates, alarms, rules, demo/simulator) |
| `app/components/` | Componentes Vue (Widgets, Simulator, Layout, Cards, etc.) |
| `tools/device_simulator/` | Simulador WN-SEC/WN-GEN |
| `ESP8266/` | Firmware Wanomi original (PlatformIO) |
| `docs/` | Documentación (STATUS, INVENTARIO_AUTO, wanomi.md, modelo conceptual) |
| `scripts/` | Scripts de utilidad (inventario.sh) |
