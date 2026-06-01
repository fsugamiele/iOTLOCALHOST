# STATUS — IotLocalhost / Wanomi
Última sesión: #15 · 2026-05-31

> A partir de la sesión #13 el proyecto se divide en dos tracks paralelos:
> **Wanomi 3.0 Refactor** (nuevo ciclo, documentación en `docsRefactor/`) y
> **operaciones legacy** (cierre de tareas pendientes del ciclo previo en `docs/`).

---

## Dónde estamos

### Estado: BACKLOG-SIM-1 cerrado. Pipeline e2e legacy verde. MVP a dos drivers. Paso B (drivers Connect) no arrancado.

**Logrado en #15:**
- R-MVP-1 mitigado (CR00061 = evidencia de viabilidad; sitio piloto aún abierto).
- DEC-REF-16: MVP a dos drivers día 1 (ComAp InteliATS PWR + Cummins PowerCommand).
- BACKLOG-SIM-1 CERRADO: causa raíz H2 probada + fix de raíz (DEC-REF-17) + 4 huérfanos reparados.
- Pipeline e2e legacy verificada (84 inserts/90 s con simulador real).

### Tracks legacy aún abiertos
- **WN-SITE-CORE Rev B**: esquemático congelado, ERC 0/0/0, DEC-HW-1..25 registradas. Gerbers v1 exportados. Revisión mecánica pendiente para Gerbers v2.
- **Survey Tier 1 v2.0**: paquete metodológico completo en `docs/survey/`. Listo para revisión con equipo de Área 1.
- **Simulador WN-SEC/WN-GEN**: pausado por sesión #13. Diagnóstico realizado, retomada postergada (`BACKLOG-SIM-1`).

---

**Bloqueante a resolver ANTES del Paso B:**
- **ENV-1 (normalización de entorno):** durante la #15 se corrió el container `node` de **producción** (`docker_compose_production.yml`) contra el **Mongo de desarrollo** (`docker-compose.yml`). Entorno híbrido. **Normalizar** a un entorno de dev coherente (o documentar explícitamente la topología) antes de construir los drivers, para no diagnosticar sobre base ambigua.

**Paso B — iter 1 Software (no arrancado), orden propuesto:**
1. Extender el simulador a los dos equipos: variables **InteliATS PWR** (transfer_state, mains/gen V+Hz, gen_status) + **Cummins PowerCommand** (oil_pressure, coolant_temp, rpm, run_hours, battery_voltage, fuel_level, fault_code/bitmaps 42100-42110). Archivos: `tools/device_simulator/lib/sensor-engine.js`, `lib/device.js`, `seed.js`.
2. Modelo de datos: `driverConfig` + `deviceType` en el schema (extender sin romper legacy). Archivo: `app/api/models/device.js`.
3. RulePack semilla **cross-equipo** (cascada InteliATS + PowerCommand) — honra DEC-REF-11.
4. NotificationRouter (dashboard + Telegram + evento MQTT al NOC).
5. `pages/sites/` mínima (lista + detalle de 1 sitio).
6. Drivers Modbus reales (`modbus_comap.js`, `modbus_cummins.js`) — **fast-follow, no MVP**: el simulador reemplaza el fierro en iter 1 (DEC-REF-14).

**Riesgos vivos:**
- **R-MVP-1** (atenuado, no cerrado): GATE de Estrategia sigue abierto — falta confirmar sitio piloto entre ≥2-3 candidatos. CR00061 prueba que el parque objetivo existe.
- **R-MVP-2** (nuevo): topología del bus Modbus RTU (InteliATS en shelter vs Cummins en grupo) → ¿bus largo o dos puertos en el Hub? Se releva en survey.
- **DOC-GAP (PowerCommand):** confirmar que el PCC expone Modbus RTU activo sin módulo extra.
- **DOC-GAP (rectificador):** marca/modelo de la planta DC de CR00061 sin confirmar.
- **RISK-OPS-1** (heredado): upgrade de schema en N Mongos distribuidos (Fase 2-3).
- **SECURITY** (heredado): rotar credenciales SNMP por defecto en equipos de campo.

**Verificaciones pendientes:**
- **H3 (frontend):** confirmar a mano que el dashboard renderiza los datos al seleccionar un device. El backend ya está verde; la UI no se verificó.

**Notas de housekeeping:**
- Credencial de `fsugamiele@gmail.com` expuesta en logs de la #15 → es usuario de prueba, **sin acción requerida**.

**Decisiones / Wanomi 3.0:** DEC-REF-1..17 registradas. DEC-REF-16..17 en sesión #15 (ver `docsRefactor/WanomiRefactor.md` §5).

**Próxima sesión #16:** Paso B — construcción de los dos drivers Connect sobre la pipeline ya verde. Prerrequisito: ENV-1 normalizado.

### Cierres legacy en paralelo

- **[Área 3 · Flux]** Revisión mecánica Gerbers v1 → DRC limpio → Gerbers v2 → JLCPCB.
- **[Área 3 + Área 1]** Cerrar RISK-HW-5 antes del despliegue en campo.
- **[Área 1]** Revisión Survey Tier 1 v2.0 con equipo de Área 1 → coordinación con cell owners.

---

## Decisiones / riesgos

### Legacy
- Cerradas: DEC-HW-1..25, DEC-SURVEY-1..7.
- Riesgo abierto: RISK-HW-5.
- Riesgos cerrados en sesión #13: RISK-HW-4 (cerrado por diseño, DEC-SURVEY-6).
- Riesgos refinados en sesión #13: RISK-HW-3 (Eltek Modbus TCP), RISK-INTEGRATION-1/2.
- Riesgos nuevos del survey: RISK-CONN-1 (LTE B28), RISK-ELTEK-1 (integración Hub↔SmartPack S).
- Backlog de mejoras futuras: MEJORA-HW-1..4 (ver `docs/wanomi.md` #12).

---

## Para retomar en una nueva sesión

**Si vas a trabajar en Wanomi 3.0 Refactor:**
1. Leé `docsRefactor/WanomiRefactor.md` — pilares, decisiones DEC-REF-*, roadmap.
2. Leé la subcarpeta de tu área en `docsRefactor/<Area>/`.
3. NO uses `docs/` legacy como base de diseño — solo como referencia histórica.

**Si vas a trabajar en cierres legacy:**
1. `./scripts/inventario.sh` → regenera `docs/INVENTARIO_AUTO.md`.
2. Leé este `STATUS.md` — sección "Tracks legacy".
3. Leé `docs/INVENTARIO_AUTO.md` — lo que realmente está en el código.
4. Si necesitás detalle de una sesión específica, `docs/wanomi.md`.

---

## Estructura del repo (atajos)

| Ubicación | Qué hay |
|---|---|
| `app/` | Backend Express + Frontend Nuxt 2 (Wanomi 2.x, todo Node.js) |
| `app/api/models/` | Modelos Mongoose (User, Device, Template, Site, ForensicEvent, etc.) |
| `app/api/routes/` | Express routes (auth, devices, templates, sites, forensic, simulator, rules, alarms) |
| `app/pages/` | Páginas Nuxt (dashboard, devices, templates, alarms, rules, demo/simulator) |
| `app/components/` | Componentes Vue (Widgets, Simulator, Layout, Cards) |
| `tools/device_simulator/` | Simulador WN-SEC/WN-GEN |
| `ESP8266/` | Firmware Wanomi original (PlatformIO) |
| **`docs/`** | **Documentación LEGACY (histórico inmutable)** |
| **`docsRefactor/`** | **Documentación NUEVA (Wanomi 3.0)** |
| `scripts/` | Scripts de utilidad (inventario.sh) |
