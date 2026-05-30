# STATUS — IotLocalhost / Wanomi
Última sesión: #14 · 2026-05-30

> A partir de la sesión #13 el proyecto se divide en dos tracks paralelos:
> **Wanomi 3.0 Refactor** (nuevo ciclo, documentación en `docsRefactor/`) y
> **operaciones legacy** (cierre de tareas pendientes del ciclo previo en `docs/`).

---

## Dónde estamos

### Wanomi 3.0 Refactor (nuevo track)
- **Sesión #14 ejecutada** (2026-05-30). Reunión multi-área completada.
- MVP definido: Connect-first sobre ComAp InteliGen + Eltek, 1 sitio Tier 1, ~60 días.
- 10 nuevas DEC-REF registradas (DEC-REF-6..15) en `docsRefactor/WanomiRefactor.md`.
- Biblioteca de campo Cinetik caracterizada: 5 familias GEF, Modbus+SNMP+contacto seco.
- Documentos de alcance iter 1 generados por área en `docsRefactor/<Área>/iteracion_1_alcance.md`.
- Próxima sesión #15 = revisión iter 1 (disparador: sitio ComAp confirmado o T0+3).

### Tracks legacy aún abiertos
- **WN-SITE-CORE Rev B**: esquemático congelado, ERC 0/0/0, DEC-HW-1..25 registradas. Gerbers v1 exportados. Revisión mecánica pendiente para Gerbers v2.
- **Survey Tier 1 v2.0**: paquete metodológico completo en `docs/survey/`. Listo para revisión con equipo de Área 1.
- **Simulador WN-SEC/WN-GEN**: pausado por sesión #13. Diagnóstico realizado, retomada postergada (`BACKLOG-SIM-1`).

---

## Próximos pasos

### Ruta crítica inmediata (post-sesión #14)

1. **[GATE] Estrategia:** pre-filtrado de escritorio de candidatos Tier 1 (T0+1) → survey → sitio ComAp confirmado (T0+3).
2. **[PARALELO] Software:** extender simulador con registros ComAp → pipeline e2e + reglas + notificaciones.
3. **[PARALELO] Hardware:** integrar Hub + enclosure provisorio.
4. **[TEMPRANO] Marketing:** pitch draft + corrección de renders.

**Bloqueos a resolver (DOC-GAP-1):** conseguir tablas de registro Cummins PCC / DSE / PowerWizard / NEXYS-TELYS + Eltek `350020.073` + MIBs SNMP (Vertiv/ZTE/Delta). Verificar escalas contra fuente primaria antes de flashear.

**Riesgos vivos:**
- **R-MVP-1:** sin sitio ComAp en los 5 candidatos → plan B (driver otra familia). Mitigación: pre-filtrado T0+1.
- **RISK-OPS-1:** upgrade de schema en N Mongos distribuidos (Fase 2-3).
- **SECURITY:** rotar credenciales SNMP por defecto en equipos de campo.

**Backlog del refactor:** BACKLOG-REF-1..6, GOTCHA-1 (coma decimal), BACKLOG-SIM-1 (retomar simulador como banco de pruebas — ahora con propósito nuevo).

### Cierres legacy en paralelo

- **[Área 3 · Flux]** Revisión mecánica Gerbers v1 → DRC limpio → Gerbers v2 → JLCPCB.
- **[Área 3 + Área 1]** Cerrar RISK-HW-5 antes del despliegue en campo.
- **[Área 1]** Revisión Survey Tier 1 v2.0 con equipo de Área 1 → coordinación con cell owners.

---

## Decisiones / riesgos

### Wanomi 3.0
- DEC-REF-1..15 registradas. DEC-REF-6..15 en sesión #14 (ver `docsRefactor/WanomiRefactor.md` §5).

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
