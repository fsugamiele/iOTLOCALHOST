# Wanomi 3.0 — Refactorización

**Documento maestro del refactor.**
Versión 0.1 · 2026-05-28 · Fecha de apertura: sesión #13

---

## 1 · Identidad de Wanomi 3.0

### Qué es

Wanomi 3.0 es la materialización formal del producto enterprise consolidado en las sesiones #8 a #12: una **capa de datos estandarizada y soberana** que opera sobre la infraestructura de torres de telecomunicaciones, detecta y notifica sobre el equipo existente (modo **Connect**), y mide físicamente los puntos ciegos críticos (modo **Sense**). Diseñado para el mercado **enterprise** (telco, infraestructura crítica), con piloto inicial en Claro NEA Argentina.

### Qué NO es

- **No es Wanomi 1.x / 2.x**: las arquitecturas "5 kits independientes", "modelo consumer", "demo descartable" y similares de sesiones previas a #8 quedan archivadas.
- **No es una iteración menor del código existente**: aunque hereda buena parte del stack actual (Node.js, Express, Mongoose, EMQX), las decisiones de arquitectura distribuida (DEC-ARCH-1) y de producto (DEC-PRODUCT-1) imponen una reestructuración que excede una refactorización superficial.
- **No es ML / predicción avanzada day-1**: el alcance honesto es detección Capa 1 (día 1) + predicción Capa 2 (progresiva, madura con baseline propio por sitio). ML auténtico es roadmap, no promesa.

### Pilares no negociables

1. **Marco enterprise** (DEC-STRAT-1): cero deriva hacia consumer durante este ciclo.
2. **Realidad primero** (DEC-STRAT-3): toda decisión se valida contra realidad técnica antes de avanzar.
3. **Edge distribuida** (DEC-ARCH-1): un MongoDB local por Hub, soberanía del dato como argumento de venta.
4. **Capa de agregación NOC** (DEC-ARCH-2): broker MQTT central recibe solo eventos, no telemetría cruda.
5. **Honestidad arquitectónica** (DEC-SENSOR-3, DEC-FORENSIC-2): flag `source: physical | inferred | connect` obligatorio en cada variable. Variables forenses requieren medición física.
6. **Connect+Sense como un único Hub** (DEC-PRODUCT-1): un sitio puede ser Connect, Sense o híbrido. No hay kits separados.

---

## 2 · Decisiones estratégicas heredadas (sesiones #8 a #12)

Estas decisiones son base inalterable de Wanomi 3.0 (DEC-REF-1). Cualquier propuesta de modificación requiere debate explícito en sesión multi-área.

### Estrategia y producto

| ID | Decisión |
|---|---|
| DEC-STRAT-1 | Foco enterprise (telco / infraestructura crítica). Consumer fuera de alcance |
| DEC-STRAT-2 | Demo = herramienta interna viva. Se diseña el producto, no la demo |
| DEC-STRAT-3 | Realidad primero. Toda decisión validada contra realidad técnica |
| DEC-PRODUCT-1 | Un Hub común, dos modos (Connect software + Sense hardware). Híbrido por sitio |
| DEC-PRODUCT-2 | WN-SITE-CORE = fusión GEN+PWR. SEC integrado como feature del CORE. SURGE y ENV+ como add-ons |
| DEC-SCOPE-1 | MVP de Connect = pata energía (genset+ATS+rectificador). ENV+ adelantado a fase 1-2. AA tonto / batería fina / cámara-AI = fase 2 |
| DEC-SCOPE-2 | Mapa Connect/Sense por sitio NO planificable desde escritorio. Se releva en survey |

### Arquitectura

| ID | Decisión |
|---|---|
| DEC-ARCH-1 | Edge distribuida confirmada. Un MongoDB local por Hub. Sin base central de telemetría cruda |
| DEC-ARCH-2 | NOC recibe eventos, estados y alarmas (vía MQTT central). NO recibe telemetría cruda |
| DEC-STACK-1 | NO migrar Vue 2 / Nuxt 2 ahora. Deuda documentada. Código nuevo escrito migrable (lógica separada de vista) |
| DEC-DASH-1 | Dos dashboards: operador (mapa + alarmas + drill-down) + admin (doble select sitio+plantilla) |
| DEC-DASH-2 | Tres superficies, una verdad: cellowner / técnico campo (display Hub local) / NOC |

### Sensores e inteligencia

| ID | Decisión |
|---|---|
| DEC-SENSOR-1 | Estrategia híbrida físico + soft sensor. Variables forenses → físico. Inferibles → soft |
| DEC-SENSOR-2 | Soft sensors corren en el Hub local |
| DEC-SENSOR-3 | Flag `source: physical | inferred | connect` obligatorio por variable |
| DEC-INTEL-1 | Detección día 1 (reglas, sin baseline) = capacidad inmediata. Predicción = capacidad que madura |
| DEC-PRED-1 | Predictivo Nivel 2 (preventivo basado en condición). ML auténtico = roadmap |
| DEC-FORENSIC-2 | Variables forenses requieren medición física |
| DEC-HMAC-1 | Checkpoints HMAC firmados cada N eventos por Hub; NOC verifica integridad sin revisar la cadena entera |

### Comercial / GTM

| ID | Decisión |
|---|---|
| DEC-GTM-1 | Modelo "managed self-hosted". Hub en sitio, Wanomi opera y mantiene bajo contrato |
| DEC-GTM-2 | Pitch anclado en data propia de Claro: truck rolls evitables + site downs por tanque vacío + cascada de energía. Robo de combustible = capacidad latente, no claim principal |

### Integración

| ID | Decisión |
|---|---|
| DEC-INTEGRATION-1 | Connect = framework multi-driver. Drivers priorizados: GEF (Cummins PCC + ComAp + DSE), ATS (ComAp InteliATS²), Rectificadores (Eltek SmartPack S Modbus TCP — refinado en survey v2.0), AA (Westric Modbus o termostato manual → Sense puro) |

### Hardware (sesiones #10-#12)

| ID | Decisión |
|---|---|
| DEC-HW-1..25 | Diseño del WN-SITE-CORE Rev B. Esquemático congelado, ERC 0/0/0, BOM placa $89 / kit $142 USD. Detalle en `docs/wanomi.md` sesiones #10-#12 |

---

## 3 · Mapa de tracks por área

Cada área de Wanomi tiene su propia carpeta en `docsRefactor/`. La estructura inicial de tracks por área es:

### Área 1 · Estrategia (`docsRefactor/Estrategia/`)

- Escenarios de aplicación enterprise (telco, infraestructura crítica).
- Survey Tier 1 (paquete v2.0 ya producido en `docs/survey/` — referencia, no se mueve).
- Cuentas pos-Claro: Movistar, Telecom, torreras independientes.
- Vertical-out: ¿cuándo y cómo se sale de telco hacia otras infraestructuras críticas?
- Definición y refinamiento del cliente ideal de Wanomi 3.0.

### Área 2 · Software (`docsRefactor/Software/`)

- Backend: refactor del modelo de datos para soportar Connect+Sense (ya hay Site, ForensicEvent, HMAC chain — base sólida).
- Frontend: pages/sites/ + dashboards (operador + admin) + display local del Hub.
- Capa de agregación NOC: broker central + parsers por driver Connect.
- Drivers Connect: ComAp (familia IG-NT/IS-NT/IL-NT/IC-NT) + Cummins PCC 2.x/3.x + Eltek SmartPack S Modbus TCP.
- Firmware ESP32-S3 del WN-SITE-CORE (lectura sensores + Modbus RTU + reporte al Hub).
- Firmware Hub (Orange Pi Zero 3 + BG95-M3 + KSZ8794CNX): Mongo local, soft sensors, sync al NOC.
- Plan de migración Vue 2 → Vue 3 (deuda DEC-STACK-1) — post-piloto.

### Área 3 · Hardware (`docsRefactor/Hardware/`)

- WN-SITE-CORE Rev B → Gerbers v2 → fab → prototipo (track legacy ya en curso, hereda 3.0).
- Add-ons modulares: SURGE (AS3935 + acelerómetro), ENV+ (SDP810 ya integrado en CORE, sensores adicionales separables).
- Sub-nodos opcionales: WN-FENCE (ADXL345), WN-COPPER (QMC5883L magnetómetro), WN-DOOR (reed switch), WN-BLE-TRACK (escaneo iBeacons).
- Hub Wanomi: arquitectura ya definida en `conectividad_recomendada_hub.pdf`. Falta especificar enclosure + integración mecánica.
- Variantes de instalación por tipo de sitio (urbano / rural / SURGE).

### Área 4 · Marketing (`docsRefactor/Marketing/`)

- Pitch deck Wanomi 3.0 (5 slides sin jerga + profundidad técnica desde slide 6).
- Branding enterprise: paleta obsidiana + verde técnico (teal/cian) + ámbar/rojo solo para alarmas.
- Brochure técnico para cellowners.
- Plan de comercialización post-Claro (Arquitecto B2B).
- Materiales para conversaciones con torreras y operadores secundarios.

---

## 4 · Roadmap inicial (fases lógicas)

Este roadmap es una propuesta de orden lógico. **Se valida y refina en la reunión multi-área de la sesión #14.**

### Fase 0 — Arranque (sesión #14)
- Reunión multi-área para validar bases y priorizar áreas de ataque.
- Cada área produce un documento de alcance (1-3 pp.) en su subcarpeta: qué heredo, qué cambia, qué entrego en la iteración 1.
- Definición del MVP de Wanomi 3.0 (qué entra, qué queda fuera).

### Fase 1 — Diseño consolidado
- Cada área completa su diseño de iteración 1.
- Integración cruzada: cómo Software consume hardware, cómo Estrategia alimenta Marketing, etc.
- Validación de la arquitectura end-to-end contra Survey Tier 1 (cuando esté disponible).

### Fase 2 — Implementación
- Hardware: Gerbers v2 → fab → prototipo → bench test (ya en curso, track legacy hereda).
- Software: backend Connect+Sense + 3 drivers MVP (ComAp + Cummins + Eltek) + frontend mínimo.
- Firmware: CORE + Hub básico.
- Marketing: pitch + brochure listos.

### Fase 3 — Piloto Claro Tier 1
- Survey Tier 1 ejecutado (5 sites).
- Instalación CORE + Hub en sitios Tier 1.
- 30 días de operación + datos vs. reportes Sytex históricos.
- Reporte ejecutivo + decisión go/no-go para Tier 2.

### Fase 4 — Iteración y escalamiento
- Ajustes derivados del piloto.
- Tier 2 (15 sites adicionales).
- Conversaciones con cuentas post-Claro.

> **Importante:** las duraciones no se asignan en este documento. Se asignan en la reunión #14 con criterio realista por área.

---

## 5 · Registro de decisiones del refactor (DEC-REF)

| ID | Fecha | Decisión |
|---|---|---|
| DEC-REF-1 | 2026-05-28 | Wanomi 3.0 hereda como bases inalterables las decisiones estratégicas #8-#12 |
| DEC-REF-2 | 2026-05-28 | Documentación del refactor vive en `docsRefactor/`. `docs/` legacy queda inmutable |
| DEC-REF-3 | 2026-05-28 | Archivo maestro `docsRefactor/WanomiRefactor.md` consolida pilares + DEC-REF-* + roadmap |
| DEC-REF-4 | 2026-05-28 | Sesiones anteriores a #8 NO son base de diseño para 3.0. Histórico solamente |
| DEC-REF-5 | 2026-05-28 | Próxima sesión #14 = reunión multi-área de arranque del refactor |

> Las DEC-REF-* se agregan a este documento y NO se modifican retroactivamente. Cambios de criterio se registran como nuevas DEC-REF.

---

## 6 · Próxima reunión — Sesión #14

**Objetivo:** validar las bases del refactor + priorizar áreas de ataque + definir entregable mínimo por área para la primera iteración.

**Asistentes:** las 4 áreas, 15 roles (ver `agenda_reunion_inicial.md`).

**Outputs esperados:**
1. Confirmación o ajuste de los pilares §1.
2. Confirmación o ajuste de las decisiones heredadas §2.
3. Orden de prioridad consensuado para las áreas.
4. Entregable comprometido por área para Fase 1.
5. Definición del MVP Wanomi 3.0.

**Agenda detallada:** ver `docsRefactor/agenda_reunion_inicial.md`.

---

## 7 · Convenciones del refactor

- **Lengua:** español (alineado con todo el proyecto).
- **Formato:** Markdown.
- **Versionado:** este documento sube de minor (0.1 → 0.2 → ...) cuando se agregan DEC-REF nuevas, de major (1.0) cuando se cierra una fase del roadmap.
- **Trazabilidad cruzada:** cuando una decisión del refactor cite una decisión heredada, usar el ID original (DEC-STRAT-1, DEC-ARCH-2, etc.) — sin renombrar.
- **Cierre de sesión:** cada sesión que toque `docsRefactor/` registra su entrada en `docs/wanomi.md` (track legacy mantiene el log histórico unificado) Y agrega resumen en este documento §5 si introduce DEC-REF nueva.

---

## 8 · Glosario rápido

| Término | Definición |
|---|---|
| **Connect** | Modo de operación: lee equipo existente por software (Modbus/SNMP/contacto seco). Sin fierro nuevo |
| **Sense** | Modo de operación: sensor físico Wanomi propio para variables que el equipo no expone |
| **Hub** | Unidad física por sitio: Orange Pi Zero 3 + BG95-M3 + switch KSZ8794CNX + UPS supercaps. Edge compute + agregación local |
| **CORE** | WN-SITE-CORE: PCB Wanomi propia con ESP32-S3, sensores físicos integrados, conecta al Hub por RJ45 |
| **Add-on** | Módulo opcional que se conecta al CORE: SURGE (rayos) y ENV+ (clima extendido) |
| **NOC** | Centro de operaciones del cliente (ej. Claro). Recibe eventos agregados, no telemetría cruda |
| **Cellowner** | Dueño de zona del cliente, responsable de 15-30 sites. Usuario principal de las alertas |
| **DEC-*** | Decisión registrada. Inmutable una vez tomada. Cambios = nueva DEC, no edición de la vieja |
| **RISK-*** | Riesgo abierto. Se cierra con evidencia o se documenta su mitigación |
