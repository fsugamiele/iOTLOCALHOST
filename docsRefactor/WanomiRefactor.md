# Wanomi 3.0 — Refactorización

**Documento maestro del refactor.**
Versión 0.4 · 2026-06-01 · Actualizado: sesión #17

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

Orden de ataque de iteración 1 (ruta crítica explícita, definida en sesión #14):

1. **[GATE] Estrategia** — survey express → matriz de controlador por sitio → **1 sitio ComAp confirmado**. Bloquea la convergencia en sitio real. Pre-filtrado de escritorio en T0+1 para detectar riesgo temprano.
2. **[PARALELO] Software** — pipeline e2e contra el simulador (no bloqueado por el survey, gracias a DEC-REF-14).
3. **[PARALELO] Hardware** — Hub funcional + enclosure provisorio.
4. **[TEMPRANO] Marketing** — pitch draft (lo necesita Estrategia para acceder a cellowners) + renders corregidos.

Software y Hardware corren desde T0 sin bloqueo; el simulador reemplaza sitio y lab durante iter 1.

> Detalle de entregables y responsables por área: ver `docsRefactor/<Área>/iteracion_1_alcance.md`.

---

## 4 · Roadmap inicial (fases lógicas)

**MVP de Wanomi 3.0** (mínimo end-to-end, 1 sitio, ~60 días, definido en sesión #14):

**ENTRA:**
1. 1 sitio Tier 1 con **ComAp InteliGen confirmado**.
2. 1 **Hub** (Orange Pi Zero 3 + Modbus RTU/TCP + Mongo local), enclosure provisorio.
3. **Connect**: lectura eléctrica + mecánica + estado (cascada de energía + salud de motor) con `source: connect`.
4. **Motor de reglas** robustecido + RulePacks (~40 reglas día 1, auto-calibradas + cross-equipo).
5. **Notificación**: dashboard + Telegram + evento MQTT al NOC.
6. **`pages/sites/`**: lista + detalle de 1 sitio (mapa + estado vivo + alarmas).
7. **Read-only estricto**.
8. Validación contra **simulador** → instalación en sitio → **30 días** con captura de ≥1 cascada real.
9. **Pitch deck** cerrado con vista en vivo del sitio + renders corregidos.

**FUERA (Fase 1+):** CORE Rev B (track paralelo) · motor SNMP · otras 4 familias GEF · Sense físico (combustible Cummins, vibración) · SURGE/ENV+/sub-nodos · dashboards completos · migración Vue 3 · predictivo más allá de soft sensors · control remoto (escritura).

---

### Fase 0 — Arranque (sesión #14) ✅ COMPLETADA
- Reunión multi-área ejecutada. MVP definido.
- Documentos de alcance iter 1 generados por área (ver `docsRefactor/<Área>/iteracion_1_alcance.md`).
- 10 nuevas DEC-REF registradas (DEC-REF-6..15).

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

> Las duraciones de Fases 1-4 se definen al inicio de cada fase con criterio realista por área. Fase 0 completada en sesión #14.

---

## 5 · Registro de decisiones del refactor (DEC-REF)

| ID | Fecha | Decisión |
|---|---|---|
| DEC-REF-1 | 2026-05-28 | Wanomi 3.0 hereda como bases inalterables las decisiones estratégicas #8-#12 |
| DEC-REF-2 | 2026-05-28 | Documentación del refactor vive en `docsRefactor/`. `docs/` legacy queda inmutable |
| DEC-REF-3 | 2026-05-28 | Archivo maestro `docsRefactor/WanomiRefactor.md` consolida pilares + DEC-REF-* + roadmap |
| DEC-REF-4 | 2026-05-28 | Sesiones anteriores a #8 NO son base de diseño para 3.0. Histórico solamente |
| DEC-REF-5 | 2026-05-28 | Próxima sesión #14 = reunión multi-área de arranque del refactor |
| DEC-REF-6 | 2026-05-30 | **MVP de Wanomi 3.0 = Connect-first** sobre ComAp InteliGen + Eltek SmartPack S en 1 sitio Tier 1. El WN-SITE-CORE Rev B queda **fuera de la ruta crítica** del MVP (sigue su track de fab en paralelo) |
| DEC-REF-7 | 2026-05-30 | El sitio piloto se elige **por controlador** (criterio eliminatorio: ComAp presente), no por conveniencia geográfica. Gate único del MVP |
| DEC-REF-8 | 2026-05-30 | Connect es framework de **triple-modalidad**: Modbus (TCP+RTU) + SNMP + contacto seco / digital I/O. Amplía DEC-INTEGRATION-1 |
| DEC-REF-9 | 2026-05-30 | Alcance GEF ampliado a **5 familias de controlador**: + PowerWizard 2.1 + SDMO NEXYS/TELYS (evidencia de campo: grupos Wilson y Monte Ralo) |
| DEC-REF-10 | 2026-05-30 | Notificación del MVP = **MQTT event al NOC** (pilar DEC-ARCH-2) + **Telegram** (alerta humana) + **dashboard**. NO se construye capa de consumo del NOC en el MVP |
| DEC-REF-11 | 2026-05-30 | Inteligencia del MVP = **amplitud en detección** (~40 reglas día 1, RulePacks auto-calibradas + cross-equipo), NO predictivo amplio. Honra DEC-INTEL-1 / DEC-PRED-1 |
| DEC-REF-12 | 2026-05-30 | Lectura del MVP = ComAp **InteliGen** (eléctrico + mecánico + estado en una conexión) + Eltek SmartPack S. El dominio mecánico (°C/aceite/RPM/combustible) **es Connect-able** vía controlador de motor |
| DEC-REF-13 | 2026-05-30 | **Read-only estricto** en el MVP. Registros de comando (arranque/parada/E-Stop) deshabilitados en firmware por seguridad. Reabrir solo con decisión explícita + contrato |
| DEC-REF-14 | 2026-05-30 | El simulador (DEC-STRAT-2) se extiende como **banco de pruebas**: emite registros ComAp/Cummins simulados para validar driver + reglas + notificaciones sin equipo físico |
| DEC-REF-15 | 2026-05-30 | El refactor **reutiliza** el modelo `variable→widget→template`; lo extiende con capa **Site** (compone templates por equipo), capa **Driver** (Modbus), **RulePacks** por tipo de equipo y **NotificationRouter**. Device se generaliza a Equipment con `driverConfig` |
| DEC-REF-16 | 2026-05-31 | El MVP Connect adopta **dos drivers día 1**: **ComAp InteliATS PWR** (estado/transferencia/cascada) + **Cummins PowerCommand** (mecánico + eléctrico del grupo). Enmienda DEC-REF-12: el dominio mecánico llega vía PowerCommand, **no se asume InteliGen**. Habilita reglas cross-equipo reales (DEC-REF-11). **La selección de sitio piloto queda abierta** hasta tener más candidatos; el sitio no es bloqueante para el track Software (DEC-REF-14, simulador como banco de pruebas). El rectificador se confirma en survey. |
| DEC-REF-17 | 2026-05-31 | `createSaverRule()` endurecido contra la race condition causa de BACKLOG-SIM-1: (a) `waitForSaverResource` con poll activo hasta `is_alive:true` reemplaza el `setTimeout(EMQX_RESOURCES_DELAY)` fijo; (b) guard ruidoso en `createSaverRule()` (retorna `false` + log de error si el resource no está, en vez de fallar en silencio); (c) `reconcileSaverRules()` al arranque que repara rules faltantes o `enabled=false` (PUT con fallback a recreación), idempotente. Verificado: EMQX 4.2.3 acepta `PUT /api/v4/rules/{id}`. Archivos: `app/api/routes/emqxapi.js`, `app/api/routes/devices.js`. |
| DEC-REF-18 | 2026-06-01 | **Motor de reglas edge** — proceso Node SEPARADO (deployable en Hub Orange Pi). Evalúa stream MQTT local directo en paralelo al saver-webhook; estado del site completo en memoria (~37 KB para CR00061). Al arrancar, hidrata desde Mongo local con `reconstruct` (~250 ms, ~150 lecturas indexadas) — sin ventana ciega ni falsas alarmas tras reinicio. Expresiones cross-equipo ESTRUCTURADAS (árbol JSON, nunca eval). EMQX vuelve a ser broker + persistencia; las saver rules (DEC-REF-17) permanecen intactas. |
| DEC-REF-19 | 2026-06-01 | **Gestión de reglas centralizada (managed self-hosted, DEC-GTM-1)** — catálogo versionado en el NOC = fuente de verdad única. Una regla es un DATO (RuleDefinition en Mongo), no código: agregar regla = insertar registro, sin reinstalar Hub. Bajada por PULL (robusto ante conectividad celular intermitente del BG95-M3); reconciliación idempotente igual que `reconcileSaverRules()` (DEC-REF-17). Subida: solo eventos resumidos (DEC-ARCH-2 intacto). |
| DEC-REF-20 | 2026-06-01 | **Salvaguardas del sync** — anillos `canary → production` con promoción manual (mecanismo listo desde ahora; valor real en Tier 2). Validación obligatoria en el Hub antes de aplicar: regla inaplicable → ignorada con log; regla malformada → rechazada y reportada al NOC como evento. Rollback por versión: el Hub conserva la versión anterior inactiva (rollback instantáneo sin enlace celular). Todo rollback auditado en la forensic chain (Fase 4B). |

> Las DEC-REF-* se agregan a este documento y NO se modifican retroactivamente. Cambios de criterio se registran como nuevas DEC-REF.

---

## 6 · Próxima reunión — Sesión #15

**Objetivo:** revisión de iteración 1 — pipeline contra simulador funcionando + sitio confirmado.

**Disparador:** cuando Estrategia confirme sitio ComAp o se cumpla T0+3.

**Entradas esperadas:**
1. **Software:** simulador ComAp emitiendo registros + pipeline e2e básico corriendo.
2. **Estrategia:** pre-filtrado (T0+1) + avance hacia confirmación de sitio.
3. **Hardware:** estado del Hub funcional.
4. **Marketing:** pitch draft avanzado + renders corregidos.

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
