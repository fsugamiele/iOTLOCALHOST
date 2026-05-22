# Wanomi — Estado del proyecto

**Última actualización**: 2026-05-22 (cierre sesión #9)
**Branch activa**: feature/telco-support
**HEAD**: 9ed5ceb (1 commit adelante de origin — pendiente push)
**Para nueva sesión**: leer este archivo + `docs/INVENTARIO_AUTO.md`

---

## Resumen ejecutivo

Wanomi es una plataforma IoT self-hosted self-orquestada para automatización
operativa reactiva. Cliente objetivo de la demo: **Claro Corrientes** (telco),
con piloto en 3 sites (CR00015 Empedrado, CR00073 Palmar de San Luis,
CR00203 Capital).

**Estado general**: Fase 4 (telco/forensic) backend completo y pusheado.
Sim-3 paso 3 (panel UI simulador) commiteado. Sim-3 paso 4 (botones de
escenarios) pendiente — 1 día estimado. Demo a Claro estimada en 2-3 semanas.

**Total commits en feature/telco-support**: 33

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

### Fase 4 — Telco / Forensic (commits e5877e5 → 0e735c2)
- ✅ Modelo Site (BTS/shelter/repeater, coordenadas)
- ✅ CRUD de sites en `app/api/routes/sites.js`
- ✅ Modelo ForensicEvent con HMAC chain y inmutabilidad
- ✅ Forensic dispatcher + integración con webhooks
- ✅ Endpoints forensic en `app/api/routes/forensic.js`
- ✅ HMAC hardening
- ✅ PDF export con pdfkit

### Sim-1 → Sim-3 paso 0 (commits 1224110 → afdb857)
- ✅ Simulador WN-SITE-SEC/GEN con 6 devices (2 templates × 3 sites)
- ✅ Templates v2 alineados con pitch Claro
- ✅ 7 escenarios reactivos
- ✅ API endpoints `/api/simulator/*`
- ✅ Reset endpoint con cancelación de timers

### Sim-3 paso 3 — Panel UI (commits d79916f, b582a7a — pusheados en sesión #8)
- ✅ `pages/demo/simulator.vue` — master-detail layout
- ✅ `components/Simulator/DeviceList.vue` — agrupación por site
- ✅ `components/Simulator/DevicePanel.vue` — sensores en vivo con MQTT
- ✅ Backend enrichment: `GET /simulator/devices` incluye `templateWidgets`
- ✅ Reactividad MQTT validada con bug fix (Vue 2 reactivity + SFC templates)

### Sesión #8 — Reset documental + seguridad (commits 7ebdb5a, 3c4eb56, 87cf308)
- ✅ `docs/STATUS.md` como punto de entrada
- ✅ `docs/INVENTARIO_AUTO.md` regenerable via script
- ✅ `docs/wanomi_modelo_conceptual.md` v0.2 aprobado
- ✅ `scripts/inventario.sh` generador de inventario
- ✅ `SECRETS.md` protocolo post-incidentes
- ✅ `.gitignore` reforzado (node_modules, snapshots, Zone.Identifier)
- ✅ Limpieza de basura (4 archivos eliminados, CodigoCorregido movido)
- ✅ Token Telegram rotado y bot creado (@Wanomi_bot)
- ✅ PAT GitHub rotado tras exposición

---

## Estado — Sesión #9 cerrada (2026-05-22)

Primer entregable #9 COMPLETO: tabla físico-vs-soft congelada + modelo de producto
Connect/Sense (un Hub, dos modos) + 11 entradas DEC + 4 RISK registradas en wanomi.md.
Identidad de producto redefinida: capa de datos estandarizada y soberana + fierro en
puntos ciegos. D-H cerrado en forma realista (matriz de drivers + survey por sitio).

### Próximos pasos

1. BOM + diagrama eléctrico del WN-SITE-CORE (Área 3) — siguiente entregable natural.
2. Sim-3 paso 4 — botones de escenarios en DevicePanel.vue (estacionado desde inicio #9).
3. Survey de telemetría por sitio en el piloto (Tier 1: CR00143, CR00070, CH00042, CR00061).

---

## Decisiones recientes (sesión #8)

| ID | Decisión | Notas |
|---|---|---|
| DEC-STRAT-1 | Enterprise market focus; consumer fuera de scope este ciclo | Debate equipo 2026-05-19 |
| DEC-STRAT-2 | Demo = herramienta interna viva; diseñar el producto | Debate equipo 2026-05-19 |
| DEC-STRAT-3 | Realidad primero; decisiones cross-área | Debate equipo 2026-05-19 |
| DEC-PRED-1 | Predictivo Nivel 2 (condición) para Claro; ML es roadmap futuro | No prometer ML en el pitch |
| DEC-ARCH-1 | Edge distribuida confirmada: Hub+Mongo por site; NO base central | Corrige error previo de Backend senior |
| DEC-ARCH-2 | NOC recibe eventos/alarmas/estados, no dato crudo | Patrón: dato denso en edge |
| DEC-SENSOR-1 | Estrategia híbrida: físico + soft sensor inferido | Síntesis Vibración vs Confiabilidad |
| DEC-SENSOR-2 | Soft sensors corren en el Hub local | Hub tiene CPU de sobra |
| DEC-SENSOR-3 | Flag `source: physical\|inferred` obligatorio en toda variable | Honestidad arquitectónica |
| DEC-FORENSIC-2 | Variables forenses requieren medición física (no inferida) | Valor probatorio |
| DEC-HMAC-1 | Checkpoints HMAC firmados cada N eventos por Hub | Verificación sin validar cadena entera |
| DEC-STACK-1 | No migrar Vue 2 / Nuxt 2 ahora; deuda documentada; código nuevo migrable | Post-Claro |
| DEC-DASH-1 | Dos dashboards: operador (mapa + alarmas) + admin (debug/config) | |
| DEC-DASH-2 | Tres superficies, una verdad: cellowner / técnico on-site / NOC | |
| DEC-PROC-2 | Auditoría de código existente antes de proponer features | Aprendida tras "redescubrir" Fase 4 |
| DEC-PROC-1 | Protocolo de manejo de secrets (ver SECRETS.md) | Post-incidentes Telegram + PAT |
| DEC-PHIL-3 | Las 4 patas del valor: disuasión + notif + acción + forense | Pivot estratégico |
| DEC-SW-6 | Forensic chain como capacidad de primera clase | Backend ya existe en Fase 4 |
| DEC-SW-5 | Demo a Claro se hace en /dashboard nativo | No en panel /demo/simulator |
| DEC-SW-4 | Panel /demo/simulator es herramienta interna del operador | Para trigger de escenarios |
| DEC-SW-1 | Motor de reglas se amplía: AND/OR + ventanas + modo contextual | Pendiente Sim-3.5 |
| DEC-DATA-4 | Plantilla amplía con `samplingType` por widget | event/telemetry/aggregated |
| DEC-DATA-1 | Cada sensor es device independiente | No concentrado en 1 device |
| DEC-HW-1 | Modelo maestro-esclavo de hardware | ESP-NOW + LoRa + RS485 |

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
- **Commits separados por concern** — bisect-friendly, una intención por commit.

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
| `app/components/` | Componentes Vue (Widgets, Simulator, Layout, Cards) |
| `tools/device_simulator/` | Simulador WN-SEC/WN-GEN |
| `ESP8266/` | Firmware Wanomi original (PlatformIO) |
| `docs/` | Documentación (STATUS, INVENTARIO_AUTO, wanomi.md, modelo conceptual) |
| `scripts/` | Scripts de utilidad (inventario.sh) |
