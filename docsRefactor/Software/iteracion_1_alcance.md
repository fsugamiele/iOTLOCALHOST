# Software — Alcance Iteración 1

> ⚠️ **Estado:** documento de diseño pre-implementación (≈#15-#17). El motor de reglas edge fue implementado y validado en #18-#24 (DEC-REF-18 a 26). Para el estado vigente, ver `docs/wanomi.md` (Log de Sesiones) y `docsRefactor/WanomiRefactor.md` §5. Este documento se conserva como contexto histórico de diseño.

**Área:** 2 · Software
**Definido en:** sesión #14 · 2026-05-30

---

## Entregable comprometido

Modelo `Site→Equipment→Variable(source)→Template` + simulador ComAp + template InteliGen + motor de reglas + RulePack semilla (~40 reglas) + notificaciones (dashboard + Telegram) + `pages/sites/` mínima.

## Responsables

Sr. Vue/Node + Backend + Frontend.

## Fecha objetivo

T0+3 a T0+4 semanas.

## Dependencias

**Ninguna bloqueante.** Software usa el simulador (DEC-REF-14) como banco de pruebas desde T0. No depende del sitio físico para la iteración 1.

## Desglose de entregables

1. **Modelo de datos extendido:**
   - `Site` (ya existe — revisar y completar).
   - `Equipment` (generalización de `Device`) con campo `driverConfig` (tipo, protocolo, parámetros de conexión).
   - `Variable` con flag `source: physical | inferred | connect`.
   - `Template` compuesto por `Equipment`.

2. **Simulador ComAp** (extensión de DEC-STRAT-2):
   - Emite registros Modbus InteliGen NT (eléctrico + mecánico + estado) en loop.
   - Configurable: RPM, tensión, temperatura aceite, nivel combustible, estado alarmas.

3. **Driver Modbus ComAp InteliGen:**
   - Conecta al simulador (o al equipo real por TCP/RTU).
   - Mapea registros → variables de plataforma con `source: connect`.

4. **Motor de reglas robustecido + RulePack semilla:**
   - ~40 reglas día 1 (cross-equipo + auto-calibradas por baseline del sitio).
   - Catálogo de detección en `docsRefactor/_biblioteca_campo/catalogo_deteccion_comap.md`.

5. **NotificationRouter:**
   - Dashboard (alarmas en vivo).
   - Telegram (alerta humana).
   - Evento MQTT al NOC (DEC-ARCH-2).

6. **`pages/sites/`:**
   - Lista de sites con estado.
   - Detalle de 1 sitio: mapa + widgets en vivo + cadena de alarmas.

## Restricción

**Read-only estricto (DEC-REF-13).** Registros de comando deshabilitados en driver.

---

## Roadmap del área (post-iter 1)

- **Firmware ESP32-S3 del WN-SITE-CORE:** lectura de sensores físicos (Sense) + Modbus RTU + reporte al Hub vía Ethernet.
- **Firmware Hub:** Orange Pi Zero 3 + BG95-M3 + KSZ8794CNX — Mongo local, soft sensors, sincronización al NOC.
- **Display local del Hub:** dashboard accesible desde el site sin conectividad al NOC (pantalla HDMI local o web LAN).
- **Driver Cummins PCC 2.x/3.x** + DSE + PowerWizard 2.1 + SDMO NEXYS/TELYS (otras 4 familias GEF, post-iter 1).
- **Motor SNMP** (Vertiv NCU, ZTE ZXDU CSU, Delta PSC3): post-iter 1 per DEC-REF-8.
- **Capa de agregación NOC completa:** broker central + parsers por driver Connect + consumo en NetCool.
- **Migración Vue 2 → Vue 3** (deuda DEC-STACK-1) — post-piloto.
