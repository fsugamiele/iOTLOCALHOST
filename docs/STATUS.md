# STATUS — IotLocalhost / Wanomi
Última sesión: #13 · 2026-05-28

> A partir de la sesión #13 el proyecto se divide en dos tracks paralelos:
> **Wanomi 3.0 Refactor** (nuevo ciclo, documentación en `docsRefactor/`) y
> **operaciones legacy** (cierre de tareas pendientes del ciclo previo en `docs/`).

---

## Dónde estamos

### Wanomi 3.0 Refactor (nuevo track)
- **Apertura formal** en sesión #13. Decisiones de partida registradas como DEC-REF-1..5.
- Bases inalteradas heredadas: sesiones #8 a #12 (ver `docsRefactor/WanomiRefactor.md` §2).
- Estructura de carpetas `docsRefactor/` creada con subcarpetas por área (Hardware / Software / Estrategia / Marketing).
- Próxima sesión #14 = reunión multi-área de arranque.

### Tracks legacy aún abiertos
- **WN-SITE-CORE Rev B**: esquemático congelado, ERC 0/0/0, DEC-HW-1..25 registradas. Gerbers v1 exportados. Revisión mecánica pendiente para Gerbers v2.
- **Survey Tier 1 v2.0**: paquete metodológico completo en `docs/survey/`. Listo para revisión con equipo de Área 1.
- **Simulador WN-SEC/WN-GEN**: pausado por sesión #13. Diagnóstico realizado, retomada postergada (`BACKLOG-SIM-1`).

---

## Próximos pasos

### Bloque A — Wanomi 3.0 Refactor (prioritario)

1. **[#14, multi-área]** Reunión de arranque del refactor: validar bases, priorizar áreas, definir entregable mínimo de la primera iteración. Agenda en `docsRefactor/agenda_reunion_inicial.md`.
2. **[Por área]** Cada área produce en su subcarpeta de `docsRefactor/` el primer documento de alcance (1-3 páginas): qué heredo, qué cambia, qué entrego en la iteración 1.

### Bloque B — Cierres legacy en paralelo

3. **[Área 1]** Revisión del paquete Survey Tier 1 v2.0 con el equipo de Área 1 → ajustes → coordinación con cell owners para visitas.
4. **[Área 3 · Flux]** Revisión mecánica Gerbers v1 → DRC limpio → Gerbers v2.
5. **[Fab]** Enviar Gerbers v2 (no v1) a JLCPCB.
6. **[Área 3 + Área 1]** Cerrar RISK-HW-5 antes del despliegue en campo.
7. **[Área 2]** Validar dying-gasp (AIN3) y mapas Modbus en banco (ComAp + Cummins).
8. **[Backlog]** Sim-3 paso 4 + retomada del simulador (no bloqueante).

### Pendientes operativos del repo
- `#10`: `git push` de los +2 commits pendientes; mover `docs/cierre_sesion_10.md` → `docs/hardware/`.
- `#13`: subir `docsRefactor/` al repo + commit del cierre de sesión #13 en `docs/wanomi.md` y `docs/STATUS.md`.

---

## Decisiones / riesgos

### Wanomi 3.0
- DEC-REF-1..5 registradas en `docs/wanomi.md` §sesión #13 (mismo contenido replicado en `docsRefactor/WanomiRefactor.md`).

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
