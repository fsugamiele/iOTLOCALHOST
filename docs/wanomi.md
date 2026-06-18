# wanomi.md — Bitácora del Proyecto

> Archivo maestro de seguimiento. Se consulta al inicio de cada sesión y se actualiza al cierre.

---

## Estructura operativa — Las 4 Áreas

| # | Área | Rol de Claude |
|---|---|---|
| 1 | Estudio de Escenarios | Asesor de industrias, comercios, telco — nuevas tecnologías, IA en embebidos |
| 2 | Desarrollo de Software | Ing. software — Vue.js, Nuxt, MQTT, MongoDB, Node, Docker |
| 3 | Hardware | Ing. electrónico — microcontroladores, sensores, PCBs, electricidad industrial |
| 4 | Marketing y Branding | Arquitecto marketing — prototipado visual, brochures, branding, redes |

---

## Estado General del Proyecto

**Última actualización:** 2026-05-05 (Sesión #5 cerrada)

### Productos vigentes (línea comercial)
- WN-S1 Sense / WN-C1 Cold / WN-SW1E Switch Energy / WN-AIR / WN-IR / WN-F1 Field / WN-H1 Hub

### Productos en pipeline — Línea Telco (piloto Claro)
- 🔧 WN-SITE-SEC — anti-robo e intrusión (BOM ✅, docs taller ✅, arquitectura site ✅, doc fabricación PCB ✅)
- 🔧 WN-SITE-GEN — monitoreo predictivo grupo electrógeno (BOM ✅, docs taller ✅, arquitectura site ✅, doc fabricación PCB ✅)
- 🔧 WN-H1-TELCO — hub endurecido DIN (docs taller ✅, arquitectura site ✅, doc fabricación PCB ✅)
- 🆕 WN-FENCE — sub-nodo inalámbrico para cerco (especificado en sesión #3, doc fabricación PCB ✅)

### Estado por dispositivo

| Dispositivo | BOM | Doc taller | Arquitectura | Doc PCB EJ Devices | PCB fabricada | Firmware | Test bench |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| WN-SITE-SEC | ✅ | ✅ | ✅ | ✅ | 📋 | 📋 | 📋 |
| WN-SITE-GEN | ✅ | ✅ | ✅ | ✅ | 📋 | 📋 | 📋 |
| WN-H1-TELCO | ✅ | ✅ | ✅ | ✅ | 📋 | 📋 | 📋 |
| WN-FENCE | ✅ | 📋 | ✅ | ✅ | 📋 | 📋 | 📋 |

✅ = completado · 📋 = pendiente

---

## Proyectos Activos

### 🟢 Convocatoria Claro SA — Modernización de sites de telecomunicaciones

**Estado:** En marcha — documentación de fabricación PCB lista para enviar a EJ Devices, próximo paso: cotización + fabricación

**Acceso confirmado:**
- ✅ Contacto con cell owners de Claro
- ✅ Acceso a sitios reales vía cell owners
- ✅ Posible préstamo de ComAp para pruebas de bench

**Proveedor de fabricación seleccionado:** EJ Devices — Desarrollos Electrónicos (Buenos Aires, Argentina)

---

## Log de Sesiones

### Sesión #16 — 2026-06-01 ✅ CERRADA
**Foco:** Área 2 — Software · Paso B: drivers Connect (simulador ATS + Cummins)

#### ENV-1 — Normalización de entorno ✅
- Detectado: stack de producción completo corría en máquina dev
- Fix: bajado prod stack, levantado solo `docker-compose.yml` (Mongo + EMQX)
- Node corre fuera de Docker con `npm run start`
- Creado `docs/ENV.md` con topología y regla operativa

#### EMQX crash loop — resuelto ✅
- Causa raíz: `start.sh` watchdog mataba EMQX a los ~40s con volúmenes limpios
  (HTTP management no bindeaba a tiempo)
- Fix: `command: /opt/emqx/bin/emqx foreground` en `docker-compose.yml`
- Fix adicional: `WEBHOOKS_HOST=localhost` en `app/.env` (webhooks apuntaban a
  hostname Docker `node` inexistente en dev)
- Fix adicional: `127.0.0.1 mongo` en `/etc/hosts` del host

#### Limpieza de MongoDB ✅
- Borrados: data (22.268), notifications (3.130), devices (14), sites (3),
  templates (8), saverrules (11), rules (5), users legacy (2)
- Conservados: emqxauthrules (21), emqxsaverrules (1), users dev (2)

#### Paso B.1 — Extensión del simulador ✅
**Archivos modificados (4 commits):**
- `app/api/models/device.js` — campos `deviceType` + `driverConfig` (DEC-REF-15)
- `app/api/models/data.js` — `value: Mixed` para variables categóricas
- `tools/device_simulator/lib/sensor-engine.js` — `initialAtsState()`,
  `initialCumminsState()`, `evolve()` extendido, 2 escenarios InteliATS
- `tools/device_simulator/lib/device.js` — `SharedSiteState` + `_initialState(role)`
- `tools/device_simulator/seed.js` — templates ATS/CUMMINS, `MVP_SITE=CR00061`,
  `deviceType` + `driverConfig` en payload
- `tools/device_simulator/sites_real.json` — CR00061 Arrocera Repeater agregado
- `docker-compose.yml` — EMQX foreground fix

**Decisiones técnicas:**
- `deviceType` como campo interno en `_state` (no publicado) para discriminar en
  `evolve()` sin pasar parámetro extra
- `SharedSiteState` = objeto plano por site; ATS escribe `gen_running`,
  Cummins lo lee — coherencia inter-equipo sin pub/sub (DEC-REF-11)
- `value: Mixed` en data.js necesario para vars categóricas — gap no contemplado
  en DEC-REF-16, resuelto en esta sesión

**Validación pipeline:**
- CR00061: SEC + GEN + ATS (7/7 vars) + CUMMINS (11/11 vars) → Mongo ✅
- `transfer_state: "AUTO"` y `gen_status: "STOPPED"` guardados como strings ✅
- EMQX: 0 reinicios post-fix, estable ✅

#### Pendiente (Paso B siguiente)
- B.2: Modelo de datos `driverConfig` completo en schema (Modbus RTU params)
- B.3: RulePack semilla cross-equipo (cascada energética)
- B.4: NotificationRouter
- B.5: `pages/sites/` mínimo

---

### Sesión #17 — 2026-06-01 ✅ CERRADA (parcial — reunión de diseño)
**Foco:** Área 2 — Software · Reunión de diseño de la capa de inteligencia del Hub
**Formato:** reunión Área 2 (Backend senior, Ing. software senior, Integración OSS/BSS, Frontend) + Franco decisor

#### Naturaleza de la sesión
Sesión de DISEÑO, no de implementación. No se tocó código. Se debatieron y
cerraron las decisiones arquitectónicas de la capa de inteligencia del Hub
antes de implementar. Pendiente de implementación: el motor, los packs, la
NotificationRouter y la tabla de fallas.

#### Hallazgo que disparó la reunión
El motor de reglas actual (EMQX) es estructuralmente 1 device → 1 variable →
1 actuador. EMQX 4.x no soporta JOIN entre topics, por lo tanto NO puede
hacer reglas cross-equipo. La cascada energética (DEC-REF-11) requiere
correlacionar variables de >1 equipo. Conclusión: el motor cross-equipo NO
vive en EMQX — es un motor nuevo en el edge (Hub), como ya anticipaba el
blueprint (refactor_implementacion_software.md, DEC-SENSOR-2).

#### Los 4 tipos de regla (marco conceptual acordado)
- **Tipo D (umbral directo):** un valor, un límite fijo definido por nosotros.
- **Tipo C (auto-calibrada):** lee el setpoint del propio equipo por Modbus y
  alarma contra ese valor real. Fallback a D si el setpoint no se puede leer.
- **Tipo S (stateful/ventana):** mira evolución temporal (ej. 3 arranques
  fallidos en 2 min). Ventana acotada ~1h máx por diseño.
- **Cross-equipo:** correlaciona >1 equipo del site (ej. cascada: red cae en
  ATS → Cummins debe arrancar → si no arranca en 30s = site down). Valor
  diferencial no-copiable.

#### Decisiones registradas

**DEC-REF-18 — Motor de reglas edge**
- Proceso Node SEPARADO (se copia tal cual al Hub Orange Pi). No es módulo del
  backend. "Producto, no demo" (DEC-STRAT-2).
- Evalúa sobre el stream MQTT local DIRECTO, en paralelo al saver-webhook. NO
  lee de Mongo para evaluar (desacople sano: si el saver falla, el motor sigue
  detectando).
- Estado del site COMPLETO en memoria (~37 KB para CR00061: 37 variables).
- Al arrancar, hidrata estado con `reconstruct` desde Mongo local (~250ms,
  ~150 lecturas indexadas). Recupera "última sesión sana" → sin ventana ciega
  ni falsas alarmas al NOC tras reinicio.
- Las saver rules PERMANECEN en EMQX (DEC-REF-17 intacto). EMQX deja de ser
  cerebro de detección; vuelve a ser broker + persistencia.
- Schema RuleDefinition: campo discriminador `type` (D/C/S/cross), `severity`,
  `recommendation` (el "qué hacer" de DEC-DASH-1, texto humano listo para la
  vista), `source_filter`, `on_missing_ref`, `reset_behavior`. Expresión
  cross-equipo ESTRUCTURADA (árbol JSON), NUNCA string evaluable (seguridad).

**DEC-REF-19 — Gestión de reglas centralizada (managed self-hosted, DEC-GTM-1)**
- Catálogo versionado en el NOC = fuente de verdad única.
- Una regla NO es código, es un DATO (RuleDefinition en Mongo). Agregar regla =
  insertar registro, sin reinstalar ni reiniciar el Hub.
- Bajada por PULL: el Hub pregunta al centro cuando tiene señal (robusto ante
  conectividad celular intermitente del BG95-M3). Reconciliación de versión =
  mismo patrón idempotente que reconcileSaverRules() (DEC-REF-17).
- Subida: SOLO eventos resumidos, nunca telemetría cruda (DEC-ARCH-2 intacto).
  Reglas bajan curadas, telemetría sube resumida — flujos opuestos.

**DEC-REF-20 — Salvaguardas del sync**
- Anillos `canary → production` con promoción manual. Mecanismo listo desde
  ahora; valor real en Tier 2 (hoy con 1 sitio, ese sitio ES el canary).
- Validación obligatoria en el Hub antes de aplicar: regla inaplicable
  (equipo ausente) → se ignora con log; regla malformada → se rechaza y se
  REPORTA al NOC como evento.
- Rollback por versión vía reconcile. El Hub CONSERVA la versión anterior
  inactiva (rollback instantáneo sin depender del enlace celular). Todo
  rollback auditado en el forensic chain (Fase 4B).

#### Cambio de método — catálogo de reglas
Se DESCARTA "fabricar ~40 reglas para llegar al número". Se adopta método
falla-primero (instrucción de Franco): para cada equipo del site, listar
fallas posibles → daño operativo si no se detecta → ¿el equipo expone el dato
para detectarla? → tipo de regla. El número de reglas es CONSECUENCIA del
análisis, no cuota. El "~40" del blueprint es estimación de magnitud, no meta.
Cada regla se justifica por su columna "daño operativo" (lo que se vende a Claro).

Decode de bitmaps NFPA: UNA regla de decode por bitmap (no una por bit). 4
reglas de decode (42100/01/02/10), no 64 reglas infladas.

#### Capa 2 — Predicción (aclaración, DEC-PRED-1 / DEC-INTEL-1)
- Detección (D/C/S/cross) = día 1, sin historia, ~80% del valor inmediato.
- Predicción = tendencia sobre el histórico local del sitio (regresión, NO ML).
  Madura con el tiempo (necesita semanas de baseline). NO se promete ML en el
  pitch (sería mentir).
- Mecanismo: soft sensor (DEC-SENSOR-2) lee histórico de Mongo local, calcula
  deriva, GENERA una variable `inferred` (ej. battery_health_projection). Una
  regla D normal vigila esa variable. La predicción REUSA el motor de reglas —
  no es un motor separado.

#### Pendiente para próxima sesión (Área 2)
- Bloque 3 — NotificationRouter: schema severidad→canales, dónde vive el texto
  de recomendación, formato del evento MQTT al NOC.
- Tabla de fallas→reglas de CR00061: partir de tabla físico-vs-soft (sesión #9)
  + informe de alarmas equipamiento Claro. Entregable concreto que reemplaza
  la cuota de 40 reglas.
- Implementación del motor edge (DEC-REF-18) — recién después de cerrar la tabla.

---

### Sesión #18 — 2026-06-01 ✅ CERRADA (reunión de diseño, continuación #17)
**Foco:** Área 2 — NotificationRouter + modelo de eventos + catálogo de fallas CR00061
**Formato:** reunión Área 2 + Vibración/Confiabilidad (Área 3) + Franco decisor

#### Naturaleza
Sesión de DISEÑO, no de implementación. Cierra los bloques pendientes de la
reunión iniciada en #17 (NotificationRouter) y produce el entregable: catálogo
de fallas→reglas de CR00061 por método falla-primero.

#### DEC-REF-21 — NotificationRouter
- TRES niveles de severidad (no dos), alineados al parser de alarmas Claro:
  `info` (evento programado) / `warning` (anómalo pero operativo) / `critical`
  (el equipo se detiene / site cayendo).
- Ruteo por consecuencia operativa: info→dashboard; warning→dashboard+NOC+
  **Telegram SIEMPRE** (es el "llegar antes" de DEC-GTM-2, NO opcional);
  critical→los tres canales con tono interruptor.
- `recommendation` (el "qué hacer") vive en la RuleDefinition (DEC-REF-18),
  heredado de la columna "Acción sugerida" del informe de alarmas Claro.
- El router FORMATEA por canal: Telegram=texto humano; NOC=evento estructurado
  (código+interpretación+severidad); dashboard=objeto completo.
- Evento NOC va a MQTT central `wanomi/noc/{siteId}/event`; el bridge a NetCool
  de Claro queda en standby (bloqueado esperando protocolo/IP/credenciales de
  Claro) sin bloquear el router.
- DEDUPLICACIÓN por correlación de causa raíz, DECLARADA EN DATOS: cada regla
  puede nombrar su evento padre; el router agrupa consecuencias bajo el evento
  padre en ventana de correlación. Mecanismo GENERAL (no parche de cascada).
  La cascada energética = `ac_outage_event` (soft sensor ya en tabla sesión #9)  es el evento padre; mains/transfer/gen/load son sus consecuencias.

#### DEC-REF-22 — Modelo de eventos unificado
- Toda Alarm/Event se persiste como historial CON su valor numérico disparador.
- Flag `forensic` derivado del `source` de la variable (DEC-SENSOR-3):
  physical+categoría legal → entra a la cadena HMAC (DEC-FORENSIC-2 respetado);
  todo lo demás → forensic:false, solo historial. En CR00061 (Connect puro),
  casi todo es forensic:false hasta instalar Sense — la cadena HMAC se "activa"
  de verdad con el hardware Sense (sonda combustible, etc.).
- PREDICCIÓN (DEC-REF-18) usa TELEMETRÍA CRUDA (Forma A): regresión sobre la
  curva completa = más acertada (ve la degradación antes de cruzar umbral). La
  Orange Pi la procesa holgadamente (regresión sobre ~43k puntos/mes en ms,
  corriendo 1×/hora, no por muestra). DESCARTADA la Forma B (predecir desde
  eventos) por menor acierto — los eventos son para forense/trazabilidad/
  reportes, no para predecir.
- Reusa `forensic_dispatcher.js` + cadena HMAC + hook alarm-webhook (Fase 4C.2,
  YA implementado).
- Retención 30-90 días (~18 MB en CR00061). Cooldown de DEC-REF-21 extendido a
  persistencia: mismo cruce dentro de cooldown no se re-registra (anti-tormenta).

#### Corrección de proceso (instrucción de Franco)
Se DESCARTA fabricar reglas para llegar a una cuota (~40). Método correcto:
falla→daño operativo→¿dato disponible?→tipo de regla. El número es CONSECUENCIA.
Distinción clave revelada: (1) alarma del controlador (lo que el equipo ya grita
— no diferencial) vs (2) inferencia de salud (combinar variables para deducir
estado de un subsistema que el controlador NO reporta — el valor no-copiable).
El catálogo prioriza (2).

#### ENTREGABLE — Catálogo de inferencias de salud CR00061 (43 inferencias)
Método falla-primero por subsistema. Convención de confianza:
🟢 Directo (alta confianza, día 1) · 🟡 Inferido (confianza media, afina con
histórico) · 🔵 Hipótesis (a validar en piloto, NO se promete a Claro) ·
🔴 Necesita Sense (mapa de ruta, futuro hardware).

Subsistemas:
- A · Generación de energía (A1-A7): presión aceite, no toma carga, sobrecarga,
  desequilibrio fases, calidad energía, governor/AVR(🔵), vibración(🔴 Sense).
- B · Motor/combustible/inyección (B1-B6): aire en combustible(🟢 alarma 73),
  pérdida rendimiento(🔵), combustión pobre(🔵), filtro tapándose(🔵), estado
  bomba inyectora(🔴), identificar inyector(🔴). NOTA: bomba/inyectores NO se
  diagnostican directo por Modbus — se detecta síntoma, no causa. No sobrevender.
- C · Lubricación/fluidos (C1-C6): temp refrigerante, pérdida gradual presión
  aceite, pérdida refrigeración, aceite degradado (soft sensor run_hours+temp),
  nivel refrigerante(🔴), calidad aceite(🔴).
- D · Horas/mantenimiento (D1-D4) ★ mejor relación valor/confiabilidad:
  SERVICE 250h próximo(🟢), service vencido(🟢), horas anómalas, arranques
  excesivos. Aritmética pura sobre contadores confiables.
- E · Arranque + CARGADOR DE FLOTE (E1-E6): batería degradada(🟡), arranque
  fallido, gen lucha por arrancar, **E4 cargador no recupera batería(🟡)**,
  **E5 cargador caído(🟡)**, **E6 tensión flote rectificador(🟢, futuro Eltek)**.
  [Cargador de flote agregado por Franco — falla silenciosa de alto impacto:
  batería de arranque muere sin aviso → gen no arranca en el corte.]
- F · Red/ATS (F1-F4): tensión red, frecuencia, transfer inconsistente, gen
  RUNNING sin tensión.
- G · Combustible (G1-G4): bajo(<15%)⚠️, crítico⚠️, autonomía proyectada,
  nivel forense(🔴 Sense). ⚠️ G1/G2/G3 dependen del sender de fábrica que MIENTE
  (CR00058: clavado 24% con tanque vacío, tabla sesión #9). Baja confianza hasta
  validar contra sonda física. Valor forense real necesita Sense.
- H · Cascada cross-equipo (H1-H4): corte+gen no arranca 30s(crítica), cascada
  completa(evento padre), transferencia sin generación, site down.
- I · Salud del monitoreo (I1-I5): pérdida comunicación, decode bitmaps
  42100/01/02/10.

Distribución por confianza: 🟢 ~22 · 🟡 ~10 · 🔵 5 · 🔴 8. El número ~40 del
blueprint apareció SOLO como consecuencia del análisis, no como cuota.
Las 🟢+🟡 son el producto Connect real hoy; las 🔵 son "el sistema aprende"
(sin sobrevender); las 🔴 son argumento de upsell a Sense (limitación → roadmap
comercial).

#### Pendiente para próxima sesión
- Implementación del motor edge (DEC-REF-18) + los packs de reglas del catálogo.
- NotificationRouter (DEC-REF-21).
- Validar DevicePanel con ATS/CUMMINS en /dashboard (B.4.5, gap detectado).

---

### Sesión #5 — 2026-05-05 ✅ CERRADA
**Foco:** Plataforma Wanomi — backend Fase 4B + 4C.1 + 4C.2 (soporte Telco)

**Sub-fases completadas:**

#### Fase 4A — Refactor preparatorio ✅
- `tasmota_bridge.js` movido a `routes/bridges/tasmota.js`
- Modularización ESP8266 diferida (no necesaria para Telco)

#### Fase 4B — Modelos Mongoose ✅
- `app/api/models/site.js` — agrupa devices por site físico (siteCode, nombre, lat/lng, tipo BTS/shelter/repeater, cellOwner, devices: [String])
- `app/api/models/forensic_event.js` — eventos inmutables con HMAC-SHA256 en cadena por site. Pre-validate calcula hash, pre-save rechaza modificaciones. `verifyChain()` estático para auditoría.

#### Fase 4C.1 — CRUD de sites + extensión de devices ✅
- `app/api/routes/sites.js` — GET/POST/PUT/DELETE /site + POST/DELETE /site/devices (bind/unbind)
- `app/api/models/device.js` extendido con `siteId`, `iccid`, `imei`, `apn`
- Validación funcional completa con scripts curl (4/4 checks)

#### Fase 4C.2 — Dispatcher forense + endpoints + export PDF ✅
- `app/api/services/forensic_dispatcher.js` — queue serializado por site (Promise chain), VARIABLE_MAP hardcoded para piloto Claro, guard fail-fast con `process.exit(1)` si `FORENSIC_HMAC_SECRET` falta, es placeholder o < 32 chars
- Hook en `alarm-webhook`: `dispatchForensicEvent(incomingAlarm)` non-blocking
- `app/api/routes/forensic.js` — GET /forensic-events, GET /forensic-events/verify, GET /forensic-events/export (PDF streaming con pdfkit)
- PDF export: portada + stats + banner verde/rojo (chain integrity) + tabla de eventos + Anexo A (hashes completos) + Anexo B (payloads completos) + fingerprint SHA-256
- `FORENSIC_HMAC_SECRET` agregado a `app/.env` (secret real) y `installer.txt` (placeholder)
- pdfkit 0.13.0 agregado a `package.json`

**Decisiones técnicas tomadas en esta sesión:**

| # | Decisión |
|---|---|
| DEC-21 | siteId como String (= siteCode), no ObjectId — evita populate y simplifica queries cross-collection |
| DEC-22 | Cadena forense por site (no global) — permite verificación independiente por site para peritos |
| DEC-23 | HMAC-SHA256 sobre `siteId|deviceId|eventKind|severity|JSON(payload)|timestamp|prevHash` — incluye todos los campos operativos relevantes |
| DEC-24 | Queue serializado in-memory (Promise chain por siteId) — elimina race condition en prevHash sin overhead de lock distribuido; documentado como single-instance only |
| DEC-25 | VARIABLE_MAP hardcoded para piloto Claro — migrar a campo en emqx_alarm_rule si el sistema escala a multi-cliente |
| DEC-26 | Guard fail-fast con `process.exit(1)` — un secret malo mata el proceso en startup; Docker restart loop hace la misconfiguration visible al operador |
| DEC-27 | PDF export streaming via `doc.pipe(res)` — never bufferiza el PDF completo en memoria |
| DEC-28 | Fingerprint del PDF = SHA-256 de hashes concatenados (no del PDF) — verificable independientemente del viewer PDF |

### Sesión #1 — 2026-04-23 ✅ CERRADA
**Foco:** Estrategia, investigación y propuesta Claro SA
**Entregables:** `wanomi_claro_tecnico.docx` + `wanomi_claro_pitch.pptx`

### Sesión #2 — 2026-04-24 ✅ CERRADA
**Foco:** Paquete de prototipado para taller
**Entregables:** 3 docx de taller (SEC, GEN, H1-TELCO) + 9 PNG (protoboards, carcasas, cableado)

### Sesión #3 — 2026-04-26 ✅ CERRADA
**Foco:** Arquitectura de instalación en site real (informe 5 especialistas)
**Entregables:** `arquitectura_site.png` + `wanomi_informe_instalacion_site.docx` (10 decisiones)

---

### Sesión #4 — 2026-04-28 ✅ CERRADA
**Foco:** Documentos de fabricación PCB para EJ Devices (Área 3)

**Trigger:** El cliente confirmó proveedor de fabricación: **EJ Devices — Desarrollos Electrónicos**. Solicita documentos detallados de fabricación PCB para cada uno de los 4 dispositivos.

**Decisiones técnicas tomadas en esta sesión:**

| # | Decisión |
|---|---|
| DEC-11 | Estructura de los docs EJ Devices: 8 secciones (SoW, espec funcional, BOM ingenieril, netlist textual, spec PCB, layout zonas, mecánico, testing/entrega) |
| DEC-12 | Plan de fabricación en 3 fases: A=5 unidades (prototipo) · B=25 unidades (pre-producción) · C=50-100 (producción condicional al éxito del piloto) |
| DEC-13 | PCBs 2 capas FR-4 Tg≥135°C, 1.6 mm, HASL sin Pb, mascara verde (estándar) |
| DEC-14 | WN-SITE-GEN: aislamiento RS485 ≥2.5kV con ADuM1201 + slot mecánico de 2mm — NO usar opto-acopladores genéricos |
| DEC-15 | WN-H1-TELCO: switch ETH industrial KSZ8794CNX (-40/+85°C), no consumer |
| DEC-16 | WN-FENCE: ESP32-WROOM-32E (no S3) por menor consumo deep sleep + LDO low-Iq MCP1700 + conformal coating obligatorio |
| DEC-17 | WN-FENCE: presupuesto de consumo promedio < 100µA para autonomía solar de 3-4 días |
| DEC-18 | Testing 100% flying probe + funcional con jig provisto por Wanomi a EJ Devices |
| DEC-19 | Entrega: archivos KiCad/Altium fuente quedan en propiedad de Wanomi para evolución futura |
| DEC-20 | Empaque: bolsa antiestática individual + caja con burbuja + etiqueta ESD |

**Entregables generados:**

#### Diagramas de bloques de PCB (4 PNG)
| Archivo | Dimensiones | Notas |
|---|---|---|
| `pcb_sec.png` | 100×70 mm · 2 capas | ZONA POTENCIA + MCU + I²C + RF + conectores |
| `pcb_gen.png` | 95×70 mm · 2 capas | AISLAMIENTO RS485 galvánico ADuM1201 ≥2.5kV con slot 2mm |
| `pcb_h1.png` | 200×150 mm · 2 capas | Placa expansión OPi Zero 3 + UPS + BG95 + switch ETH |
| `pcb_fence.png` | 60×40 mm · 2 capas | Ultra low power, MCP1700, conformal coating |

#### Documentos para EJ Devices (4 DOCX)
| Archivo | Páginas | Contenido |
|---|---|---|
| `WN-SITE-SEC_fabricacion_PCB_EJDevices.docx` | ~15 | SoW + espec + BOM + netlist + spec PCB + diagrama + mecánico + testing |
| `WN-SITE-GEN_fabricacion_PCB_EJDevices.docx` | ~12 | Idem + tabla MODBUS + aislamiento RS485 + ADC con TL431 |
| `WN-H1-TELCO_fabricacion_PCB_EJDevices.docx` | ~10 | Idem + UPS + supercaps + switch ETH industrial |
| `WN-FENCE_fabricacion_PCB_EJDevices.docx` | ~8 | Idem + budget de consumo + conformal coating |

---

## Próximos pasos concretos

### Hardware / Fabricación
1. **Enviar los 4 documentos a EJ Devices** vía email a info@ejdevices.com.ar para cotización
2. **Componentes críticos a comprar / dejar en consigna** (lead time 3-4 sem):
   - Quectel BG95-M3 (×7 mínimo: 5 SEC + 2 H1)
   - Mean Well SD-15B-5, SD-15C-5, SD-25B-5
   - ADuM1201BRZ (×30: 5 GEN + 25 H1 RS485 externo)
   - KSZ8794CNX, KSZ8081RNAIA (Microchip)
   - BQ24295 (UPS controller)
   - ESP32-S3-WROOM-1-N16R8 + ESP32-WROOM-32E-N4
3. **Componentes inmediatos en MercadoLibre AR**: ADXL345, MPU-6050, QMC5883L, DS18B20, SCT-013, JSN-SR04T, OPi Zero 3, terminal blocks Phoenix Contact
4. **Coordinar reunión técnica con EJ Devices** para revisar specs y acordar timeline + condiciones comerciales
5. **Wanomi debe preparar:**
   - Jig de testing funcional para que EJ Devices use durante QC
   - Firmware de test (distinto al firmware de producción) para flashear durante el test funcional
   - SIM de prueba M2M (Claro o cualquier operador) para validación BG95
6. **Firmware ESP32-S3 (Fase 4E):** Iniciar firmware PlatformIO + adaptaciones de plataforma mientras EJ Devices fabrica

### Software — Próximo paso: Fase 4C.3 — NOC Bridge
7. **Fase 4C.3 — `routes/bridges/noc.js`** — dispatcher SNMP traps + syslog RFC 5424 TLS + webhook REST al NetCool de Claro
   - **⛔ BLOQUEANTE:** requiere confirmación de Claro sobre:
     - Protocolo elegido: SNMPv3 / syslog TLS / REST webhook (o combinación)
     - IP del receptor NetCool (o endpoint REST)
     - Credenciales SNMPv3: engineID, authProto (SHA/MD5), privProto (AES/DES), community
     - PEN propio en IANA: ¿Wanomi necesita OID privado para los traps? (trámite IANA ~2 semanas)
   - Sin esta info, el bridge no puede implementarse — diseño queda en standby

---

## Decisiones Registradas (acumuladas — 20 decisiones)

| Fecha | Decisión | Estado |
|---|---|---|
| 2026-04-23 | Equipo completo (4 leads + especialistas) | ✅ |
| 2026-04-23 | Alcance Claro: 2 dolores (robo + GE) + roadmap | ✅ |
| 2026-04-23 | MCU ESP8266 → ESP32-S3 para línea telco | ✅ |
| 2026-04-23 | MODBUS solo-lectura hacia DSE/ComAp | ✅ |
| 2026-04-23 | Self-hosted como diferencial vs Huawei/Vertiv | ✅ |
| 2026-04-23 | SIM M2M Claro como backhaul redundante | ✅ |
| 2026-04-24 | Prototipo en protoboard para muestra rápida | ✅ |
| 2026-04-24 | Enclosure PETG impreso prototipos, ABS/IP54 producción | ✅ |
| 2026-04-26 | 1 controlador por kit, no por sensor | ✅ |
| 2026-04-26 | Sensor↔ctrl cableado (excepto cerco y BLE tags) | ✅ |
| 2026-04-26 | ESP-NOW para WN-FENCE (sin AP) | ✅ |
| 2026-04-26 | Crear WN-FENCE sub-nodo solar | ✅ |
| 2026-04-28 | Estructura 8 secciones para docs EJ Devices | ✅ |
| 2026-04-28 | 3 fases de fabricación: 5 + 25 + 50-100 unidades | ✅ |
| 2026-04-28 | PCB 2 capas FR-4 Tg≥135°C HASL sin Pb | ✅ |
| 2026-04-28 | Aislamiento RS485 ≥2.5kV con ADuM1201 (no opto genérico) | ✅ |
| 2026-04-28 | Switch ETH industrial KSZ8794CNX | ✅ |
| 2026-04-28 | WN-FENCE: ESP32-WROOM-32E + MCP1700 + conformal coating | ✅ |
| 2026-04-28 | WN-FENCE: presupuesto consumo < 100µA promedio | ✅ |
| 2026-04-28 | Testing 100% flying probe + funcional con jig de Wanomi | ✅ |
| 2026-05-05 | siteId como String (= siteCode), no ObjectId | ✅ |
| 2026-05-05 | Cadena forense por site, no global | ✅ |
| 2026-05-05 | HMAC-SHA256 sobre 7 campos concatenados con `\|` | ✅ |
| 2026-05-05 | Queue Promise serializado in-memory por siteId (single-instance) | ✅ |
| 2026-05-05 | VARIABLE_MAP hardcoded para piloto Claro (migrar si escala) | ✅ |
| 2026-05-05 | Guard fail-fast `process.exit(1)` si HMAC secret inválido | ✅ |
| 2026-05-05 | PDF export streaming via `doc.pipe(res)` | ✅ |
| 2026-05-05 | Fingerprint PDF = SHA-256 de hashes concatenados (no del PDF) | ✅ |
| 2026-05-09 | DEC-29 | Demo a Claro: simulador publica MQTT real (no fake en frontend). Honestidad end-to-end. | ✅ |
| 2026-05-09 | DEC-30 | Fidelidad media: cada sensor controlable individualmente, sin física continua | ✅ |
| 2026-05-09 | DEC-31 | Comandos al simulador via MQTT control topic `simulator/{dId}/control`, NO HTTP | ✅ |
| 2026-05-09 | DEC-32 | `SIMULATOR_MODE=true` requerido para activar control channel (defensa en profundidad) | ✅ |
| 2026-05-09 | DEC-33 | Proceso Node en host (no Docker), un proceso N devices | ✅ |
| 2026-05-09 | DEC-34 | Camino X: simulador llama `/api/getdevicecredentials` igual que ESP32 real | ✅ |
| 2026-05-09 | DEC-35 | Datos confidenciales Claro en `sites_real.json` gitignored, repo solo tiene `.example.json` | ✅ |
| 2026-05-09 | DEC-36 | DOS templates (SEC + GEN) y DOS devices por site = 6 devices totales | ✅ |
| 2026-05-09 | DEC-37 | Escenarios pre-grabados declarativos en `SCENARIOS` object (5 escenarios iniciales) | ✅ |
| 2026-05-09 | DEC-38 | `validateState` con `process.exit(1)` en orphans (no continúa con state inconsistente) | ✅ |
| 2026-05-09 | DEC-39 | `device.password` plain en MongoDB es deuda de seguridad — OK piloto, revisar antes de enterprise | ⚠️ deuda |
| 2026-05-09 | DEC-40 | Sistema online/offline real no existe — `DEVICE_ONLINE/OFFLINE` solo manual desde panel | ⚠️ gap |
| 2026-05-09 | DEC-41 | Para evitar deriva LLM: código aprobado va en `docs/CodigoCorregido/` y se COPIA, no se RECREA | ✅ proceso |

---

## Sesión #5 — 2026-05-09 — Sim-1 (simulador WN-SITE-SEC/GEN)

### Contexto

Arranque del simulador como demo comercial para Claro (no solo testing interno). El meeting con Claro es en 2-3 semanas y el plan de 17 días arrancó con esta sub-fase. Datos reales de 3 sites del piloto Claro Corrientes extraídos de KMZ provistos por el cliente: CR00015 (Empedrado), CR00073 (Palmar de San Luis), CR00203 (Corrientes Capital).

### Decisiones nuevas

Ver tabla de Decisiones Registradas: DEC-29 a DEC-41.

### Lección aprendida — Deriva entre código aprobado y código escrito

Durante la sesión hubo un episodio donde Claude Code, al implementar el código, simplificó significativamente el diseño aprobado: faltaron 5 escenarios, faltó `applyCommand`, faltó `SIMULATOR_MODE`, faltaron variables específicas del template, y los datos de sites se hardcodearon con valores genéricos inventados en lugar de leer `sites_real.json`. Los tests funcionales detectaron problemas superficiales (`templateName` faltante, body wrapping incorrecto) pero no los desvíos estructurales.

**Causa raíz:** entre el código aprobado en el chat y la implementación, el LLM "interpreta" en lugar de copiar. Mientras más contexto previo hay, más alta es la probabilidad de deriva.

**Solución implementada (DEC-41):** el código aprobado se guarda como archivos en `docs/CodigoCorregido/` y Claude Code los copia tal cual al destino. Cero re-creación desde el contexto. Esto se aplicó en la reescritura limpia de Sim-1 y los 13 tests pasaron al primer intento.

### Archivos modificados

- `.gitignore` — `tools/device_simulator/devices_state.json` agregado (sites_real.json y site_images/ ya estaban del scaffold)
- `tools/device_simulator/lib/api.js` (NUEVO 126 líneas) — HTTP client nativo, sin deps. Maneja body vacío de getdevicecredentials.
- `tools/device_simulator/lib/sensor-engine.js` (NUEVO 123 líneas) — `initialSecState()`, `initialGenState()`, `evolve()`, `SCENARIOS` con 5 entradas
- `tools/device_simulator/lib/device.js` (NUEVO 214 líneas) — clase `SimulatedDevice` con `connect()`, `applyCommand()`, `_runScenario()`, `disconnect()`, defensa en profundidad con `SIMULATOR_MODE`
- `tools/device_simulator/seed.js` (NUEVO 217 líneas) — provisiona templates+sites+devices, idempotente, valida state contra backend
- `tools/device_simulator/run.js` (NUEVO 110 líneas) — entry point, bootstrappea N devices con `Promise.all`, shutdown limpio
- `tools/device_simulator/package.json` (NUEVO) — solo dep `mqtt ^4.2.5`
- `tools/device_simulator/README.md` — sección `## Limitaciones` agregada (single instance, password rotation, single-instance backend)

### Datos confidenciales de Claro (NUNCA commiteados)

- `tools/device_simulator/sites_real.json` — 3 sites con coordenadas, direcciones y SAP IDs reales
- `tools/device_simulator/devices_state.json` — 6 pares de credenciales `{dId, password}` que dan acceso al broker MQTT
- `tools/device_simulator/site_images/` — capturas satelitales de Google Earth (pendientes para Sim-3)

### Variables de los templates

**WN-SITE-SEC v1** (7 booleanos):
`door_main`, `door_cabinet`, `pir_motion`, `ground_loop` (1=normal), `fence_vib`, `tower_vib`, `battery_tag` (1=presente)

**WN-SITE-GEN v1** (8 mixtas):
`fuel_level` (float), `genset_running` (bool), `genset_temp` (float), `genset_vib` (float), `genset_amps` (float), `genset_temp_alarm` (bool), `genset_door` (bool), `mains_voltage` (float)

**Importante:** los nombres deben matchear exactamente el `VARIABLE_MAP` del `forensic_dispatcher` para que se generen ForensicEvents correctamente al disparar eventos de demo.

### Escenarios pre-grabados (`SCENARIOS` en sensor-engine.js)

| Nombre | Duración | Para qué |
|---|---|---|
| `intrusion` | 60s | Robo nocturno: cerco → puerta → PIR → cabinet → torre, con cleanup automático |
| `fuel_siphon` | 12s | Sabotaje de combustible: 85% → 28% sin motor encendido |
| `maintenance` | 125s | Mantenimiento legítimo: técnico abre, trabaja, cierra |
| `genset_failure` | 65s | Corte de luz → arranque GE → sobre-temp → para |
| `ground_loop_cut` | 5min | Loop de tierra cortado, restaurado a los 5 min |

### Estado del backend después de Sim-1

- 2 templates: `WN-SITE-SEC v1`, `WN-SITE-GEN v1`
- 3 sites: CR00015, CR00073, CR00203 con coordenadas reales
- 6 devices: 1 SEC + 1 GEN por site, todos bindeados al site correcto
- `EmqxAuthRule` para cada device con username (= dId) y MQTT password sha256
- Usuario de pruebas: `telco-test@wanomi.test` (existía de sesiones previas)

### Validación funcional (13/13 pasos pasaron)

1. Sintaxis de los 5 archivos JS — `node --check` OK x 5
2. Carga de módulos — `require()` OK, 7 vars SEC + 8 vars GEN + 5 escenarios confirmados
3. `npm install` — mqtt ^4.2.5 instalado
4. Usuario telco-test@wanomi.test existe en MongoDB
5. Cleanup pre-state — DBs limpias
6. `node seed.js` — 2 templates + 3 sites + 6 devices creados
7. `cat devices_state.json` — estructura correcta `{ siteCode: { SEC: {...}, GEN: {...} } }`
8. Idempotencia confirmada — segunda corrida: 0 created, 6 skipped
9. `node run.js` — bootstrap de 6 devices, conectan al broker, publican 7+8 variables
10. Verificación MQTT — datos llegando en `{userId}/{dId}/{var}/sdata` con `{value, save:1}`
11. Floats con drift correcto: genset_temp ~42.15, mains_voltage ~219.46, genset_vib ~0.019
12. Booleanos con convenciones correctas: ground_loop=1, battery_tag=1
13. Shutdown limpio con SIGINT/SIGTERM — `All devices disconnected.`

### Commit

`467cb62 feat(simulator): WN-SITE-SEC/GEN simulator with MQTT bootstrap and command channel`

9 archivos commiteados, 1332 insertions(+), 1 deletion(-).

### Próximo paso

**Sim-2** (1 día): endpoints `/api/simulator/*` en backend (`/trigger`, `/scenario`, `/devices`) que reciben comandos del panel Vue y los publican al control topic MQTT del simulador correspondiente. Requiere acceso a `global.mqttClient` y validación de que `SIMULATOR_MODE` activo. Sin SIMULATOR_MODE el endpoint debe responder 503 "simulator control disabled".

---

## Sesión #6 — 2026-05-10 — Sim-2 (API endpoints + ACL fix)

### Contexto

Continuación del plan macro de 17 días para la demo a Claro. Sim-1 cerrado con el simulador funcional publicando MQTT real (commits 1224110, 467cb62, 727ec09). Sim-2 implementa los endpoints REST que permiten al panel Vue (Sim-3) controlar el simulador desde una interfaz humana.

### Decisiones nuevas

| Fecha | ID | Decisión | Estado |
|---|---|---|---|
| 2026-05-10 | DEC-42 | DEROGA DEC-41. Volver al método tradicional (diseño → aprobación en chat → implementación con inspección en vivo). DEC-41 fue reacción a un caso aislado en Sim-1. Sin más evidencia, mantener el proceso que funcionó para DEC-01 a DEC-28. | ✅ |
| 2026-05-10 | DEC-43 | Convención del proyecto para routes: `import` para modelos Mongoose (que exportan `export default`), `require()` para módulos CJS (express, middlewares). Funciona porque Nuxt 2 transpila los serverMiddleware con Babel. | ✅ |
| 2026-05-10 | DEC-44 | El ACL de los devices con `firmwareType='wanomi-sim'` se extiende para incluir `simulator/{dId}/control` en la lista de subscribe. Sin esto, EMQX rechaza el subscribe con QoS 128 silenciosamente y el simulador no puede recibir comandos. Implementado en `getDeviceMqttCredentials` (webhooks.js). | ✅ |
| 2026-05-10 | DEC-45 | El endpoint `GET /api/simulator/state/:dId` fue eliminado. Los devices simulados no persisten datos a MongoDB por diseño (el simulador demuestra escenarios en vivo, no historiales). El panel Vue (Sim-3) lee estado via MQTT WebSocket subscription, patrón estándar del proyecto. | ✅ |

### Endpoints implementados (5)

| Método | Path | Función |
|---|---|---|
| GET | `/api/simulator/devices` | Lista devices simulados del usuario logueado |
| GET | `/api/simulator/scenarios` | Lista de escenarios pre-grabados disponibles |
| POST | `/api/simulator/trigger` | Pulso transitorio de un sensor con auto-reset |
| POST | `/api/simulator/set` | Set permanente de valor de un sensor |
| POST | `/api/simulator/scenario` | Ejecutar escenario pre-grabado |

### Defensa en profundidad — 3 niveles

1. **`ENABLE_SIMULATOR_API` env flag** — chequeada por handler. Si está OFF, retorna 404 (no revela existencia del endpoint).
2. **JWT obligatorio** — middleware `checkAuth` en todos los endpoints.
3. **`SIMULATOR_MODE=true` en el simulador** — sin esto, los comandos publicados al control topic caen al vacío. Independiente del backend.

### Validación de inputs

- `dId` con regex `/^[a-zA-Z0-9]{8}$/`
- `sensor` debe existir en widgets del template
- `value` validado según `variableType` (bool: 0|1|true|false; float: número finito)
- `name` de escenario en whitelist de 5 valores
- `duration_ms` número finito no negativo
- Template y device validados con filtro `userId` (defensa en profundidad)

### Lección aprendida — bug latente de Sim-1 cazado por Sim-2

Durante el testing E2E del Grupo D apareció un bug que existía desde Sim-1 pero no era observable: el simulador no procesaba comandos del control topic. Diagnóstico iterativo determinó que **el ACL de los devices del simulador no incluía `simulator/{dId}/control`** en la lista de subscribe. EMQX aceptaba la suscripción con QoS 128 (failure) silenciosamente, y `mqtt.js` no consideraba eso un error en el callback de subscribe.

**Por qué se nos escapó en Sim-1:** los 13 tests funcionales de Sim-1 solo verificaban publicación (el simulador → broker), no subscripción (broker → simulador). El control channel solo se valida cuando hay un cliente publicando al tópico, y eso recién pasó en Sim-2.

**Fix:** modificación quirúrgica en `getDeviceMqttCredentials` (webhooks.js) — agregar la línea condicional por `firmwareType === 'wanomi-sim'`. Total ~10 líneas, 3 puntos de cambio. Commit dedicado anterior al commit de Sim-2 para bisect-friendly (`03bf272`).

### Archivos modificados

- `app/api/routes/simulator.js` (NUEVO, 264 líneas) — los 5 endpoints
- `app/api/routes/webhooks.js` (MODIFICADO, +12 -3) — ACL extiende para wanomi-sim
- `app/api/index.js` (MODIFICADO, +1) — registro de la nueva ruta
- `app/.env` (MODIFICADO, no commiteado — gitignored) — `ENABLE_SIMULATOR_API=true`

### Estado del backend después de Sim-2

- 5 endpoints expuestos en `/api/simulator/*`
- Defensa en profundidad funcional (verificada en Grupos A-D de tests)
- Backend independiente del simulador (no se cuelga si el simulador no corre)
- Validación estricta de inputs en todos los handlers
- Comandos publicados al broker con QoS 1 + callback (entrega confirmada)

### Validación funcional (Grupos A-D)

- **Grupo A** (defensa en profundidad): 7/7 tests OK
- **Grupo B** (validación inputs): 11/11 tests OK
- **Grupo C** (backend resiliencia): 6/6 tests OK
- **Grupo D** (E2E con simulador): 7/7 tests OK (después del fix de ACL)

### Commits

```
0d38a3b  feat(simulator-api): /api/simulator/* endpoints for device control
03bf272  fix(webhooks): include simulator/{dId}/control in ACL for wanomi-sim devices
b898d9a  fix(simulator): use firmwareType=wanomi-sim to distinguish from real firmware
```

### Próximo paso

**Sim-3** (2-3 días): panel Vue `/demo/simulator` con UI de control:
- Lista de devices simulados (de `GET /api/simulator/devices`)
- Por cada device: toggles para sensores bool + sliders para floats
- Botones de escenarios pre-grabados
- Visualización en tiempo real del estado via MQTT WebSocket subscription
- Capturas satelitales de los 3 sites de Corrientes (tarea pendiente, no bloqueante)

---

## Sesión #7 — 2026-05-14 — Sim-1.2 (re-template SEC/GEN v2 alineado con pitch de Claro)

### Contexto

Durante la planificación de Sim-3 (panel Vue) revisamos el pitch de Claro (wanomi_claro_pitch_2.pptx). Detectamos un mismatch importante entre las variables del simulador v1 y la documentación técnica del producto (slides 7 y 8 del pitch). Sim-1.2 alinea los templates y escenarios del simulador con el pitch antes de construir el panel Vue, para evitar maquillar inconsistencias en la UI.

### Decisiones nuevas

| Fecha | ID | Decisión | Estado |
|---|---|---|---|
| 2026-05-14 | DEC-46 | Sim-1.2 es prerequisito de Sim-3. Re-templatear el simulador antes de construir el panel Vue. Razón: el pitch a Claro lista sensores específicos (4 puertas, magnetómetro de cobre, BLE beacons tracking, vibracional FFT, etc.) que no coinciden con el simulador v1. Maquillar en el frontend sería mostrar inconsistencia técnica al cliente. | ✅ |
| 2026-05-14 | DEC-47 | Variables en código: inglés. UI (variableFullName, descripciones): español. Patrón estándar de la industria — código mantenible + producto localizado. | ✅ |
| 2026-05-14 | DEC-48 | Templates v2 introducen dos nuevos tipos de variable usados en widgets: `categorical` (string con enum, como vibration_signature) y `int` (counter, como battery_beacons_count). El modelo Template del backend NO se modifica — el schema es flexible y acepta cualquier string en variableType. La validación se hace en el simulador y en el frontend. | ✅ |
| 2026-05-14 | DEC-49 | Estructura de escenarios v2: objeto con metadata (description, duration_ms, steps, noCleanup?, isMaintenanceEvent?) en lugar de array plano. Permite cleanup automático post-duration_ms y flags semánticos para el sistema de alarmas (a implementar en Sim-3.5). | ✅ |
| 2026-05-14 | DEC-50 | `evolve()` recibe deviceState completo (no solo variable+value). Permite drift contextual: fuel_level solo consume si genset_running=1, alternator_voltage solo tiene tensión si motor corriendo, mains_voltage solo deriva si red está OK (no zero). Aumenta realismo sin agregar complejidad arquitectónica. | ✅ |
| 2026-05-14 | DEC-51 | El handler `_runScenario` valida que TODAS las variables del escenario existan en el device antes de empezar. Si alguna falta (ej. disparar fuel_siphon en device SEC), aborta con warning. Defensa en profundidad — error temprano y visible vs. error silencioso. | ✅ |
| 2026-05-14 | DEC-52 | Escenarios encimados en el MISMO device: el nuevo cancela los timers del anterior. Estado limpio para la demo (re-disparar sin pelear con estado residual). Encimados entre devices DISTINTOS coexisten (correcto, decidido en Sim-3 planning). | ✅ |
| 2026-05-14 | DEC-53 | Whitelist de escenarios en simulator.js (backend) hardcodeada por seguridad — los endpoints solo aceptan scenarios cuyos nombres están en la lista. Debe mantenerse sincronizada con el simulador. Esta sincronización se hace manualmente; un test futuro podría validar consistencia automáticamente. | ✅ |

### Templates v2

**WN-SITE-SEC v2** — 10 sensores (antes 7):

| Variable | Tipo | Display |
|---|---|---|
| door_shelter | bool | Puerta shelter |
| door_front | bool | Puerta frente |
| door_rear | bool | Puerta trasera |
| door_battery_cabinet | bool | Gabinete de baterías |
| pir_motion | bool | Movimiento interior (PIR) |
| fence_vibration | bool | Vibración cerco (corte/golpe) |
| copper_field_anomaly | bool | Movimiento de cobre |
| ground_continuity | bool | Continuidad de tierra (1=íntegra) |
| battery_beacons_count | int | BLE beacons baterías presentes |
| shelter_temp | float | Temperatura shelter (°C) |

**WN-SITE-GEN v2** — 9 sensores (antes 8):

| Variable | Tipo | Display |
|---|---|---|
| fuel_level | float | Nivel combustible (%) |
| genset_running | bool | Motor en marcha |
| exhaust_temp | float | Temperatura escape (°C) |
| vibration_signature | categorical | Firma vibracional (FFT) |
| crank_current | float | Corriente arranque (A) |
| alternator_voltage | float | Tensión alternador (V) |
| battery_voltage | float | Tensión batería arranque (V) |
| crank_attempts_failed | int | Intentos fallidos consecutivos |
| mains_voltage | float | Tensión red eléctrica (V) |

### Escenarios refinados — 7 ahora

| Escenario | Duración | Cleanup | Flag especial |
|---|---|---|---|
| intrusion | 60s | sí | — |
| copper_theft | 75s | sí | NUEVO en v2 |
| fuel_siphon | 15s | **noCleanup** | fuel_level persiste en 30% |
| genset_no_start | 45s | sí | NUEVO |
| genset_vibration_anomaly | 30s | sí | NUEVO — usa string categorical |
| battery_degraded | 20s | sí | NUEVO |
| maintenance | 90s | sí | isMaintenanceEvent (para alarmas) |

### Validación E2E (Grupo G)

| Test | Verificación | Resultado |
|---|---|---|
| G.1 pre-flight | 6 ACL con simulator/control, 7 scenarios en API | ✅ |
| G.2.1 intrusion | 8 steps, cleanup completo | ✅ |
| G.2.2 copper_theft | 4 steps, cleanup completo | ✅ |
| G.2.3 maintenance | flag [MAINTENANCE] en log | ✅ |
| G.2.4 fuel_siphon en SEC | guard abort con warning | ✅ |
| G.3.1 fuel_siphon | noCleanup respetado, fuel queda en 30 | ✅ |
| G.3.2 genset_no_start | 3 intentos crank, multi-var simultáneos | ✅ |
| G.3.3 genset_vibration_anomaly | string categorical con comillas | ✅ |
| G.3.4 battery_degraded | 1 intento + degradación visible | ✅ |

### Bug latente cazado en G.1

Pre-flight de validación E2E reveló que `simulator.js` (backend) tenía whitelist hardcodeada con los 5 escenarios v1. Sin esa actualización, `POST /api/simulator/scenario` con cualquier nombre nuevo (`copper_theft`, `genset_no_start`, etc.) hubiera retornado 400 "scenario not in whitelist" — invisible para el simulador pero bloqueante para la API. Es el tipo de inconsistencia que solo aparece en pruebas E2E cruzando capas.

### Lección de proceso

Sin el deep-dive en el pitch de Claro (slide 7 y 8 del .pptx), hubiéramos construido Sim-3 sobre templates v1 y descubierto la inconsistencia técnica recién durante un Q&A del cliente. Pedir y revisar materiales de venta antes de codear infraestructura demo es un hábito que conviene mantener.

### Archivos modificados

- `tools/device_simulator/seed.js` (templates v1 → v2)
- `tools/device_simulator/lib/sensor-engine.js` (estados, evolve contextual, 7 escenarios v2)
- `tools/device_simulator/lib/device.js` (_runScenario reescrito + helper _cancelActiveTimers)
- `app/api/routes/simulator.js` (whitelist actualizada a 7 escenarios)
- `tools/device_simulator/devices_state.json` (regenerado — gitignored)

### Commits

```
aa02744  feat(simulator): re-template SEC/GEN to match Claro pitch (v2)
```

### Próximo paso

**Sim-3 (panel oculto):** ya re-planificado en sesión #6 como versión simplificada (1-2 días). Panel `/demo/simulator` con lista de devices + toggles + botones de escenarios. Sin pulido visual, solo para que el operador controle la demo desde una segunda pantalla.

---

## Sesión #8 — 2026-05-18/19 — Reset documental + seguridad + Sim-3 paso 3

### Pivot estratégico
Tras debate del equipo (Asesor telco, Ex-técnico, Ing electrónico industrial,
Ing software senior, Backend Mongo/EMQX, Seguridad física, Marketing,
Confiabilidad industrial), se decidió que la demo a Claro debe comunicar
las 4 patas del valor de Wanomi (DEC-PHIL-3), no solo "cards cambiando de
color en un panel":

1. Disuasión local (sirena, estrobo, audio en sitio)
2. Notificación inteligente (Telegram con foto+ubicación)
3. Acción física automática (lock, válvula, apagado)
4. Trazabilidad forense (cronología inmutable con HMAC)

### Incidentes de seguridad
- **DEC-incident-1** (2026-05-18): Token Telegram bot @Wanomi_bot expuesto
  en chat al pegar mensaje de BotFather. Revocado y rotado el mismo día.
- **DEC-incident-2** (2026-05-18): PAT GitHub expuesto en chat durante setup
  del push inicial. Token viejo revocado. PAT nuevo (Fine-grained, scope
  solo iOTLOCALHOST, 90 días) generado y guardado en password manager.
- Protocolo resultante documentado en `SECRETS.md` (DEC-PROC-1).

### Auditoría del repo (28 commits en feature/telco-support)
Antes de proponer trabajo nuevo se auditó el estado real del código (DEC-PROC-2).
Hallazgos clave:
- **Fase 4 backend ya completo**: Site, ForensicEvent, HMAC chain, PDF export,
  forensic dispatcher, webhooks integration — todo implementado.
- **Fase 4 frontend inexistente**: no hay pages/sites/, no hay forensic UI.
- **Sim-3 paso 3 en progreso**: 3 archivos Vue sin commitear con reactividad
  MQTT validada E2E.

### Bugs resueltos
- **Vue 2 reactivity en DevicePanel**: cards no actualizaban al recibir MQTT.
  Causa: keys de `liveValues` no pre-inicializadas → Vue 2 no configura
  getters/setters. Fix: pre-inicializar todas las keys con `null` en `created()`.
- **Vue 2 SPA + template strings inline**: `template: "..."` no funciona en
  runtime SPA (no hay compilador). Fix: mover todo render a SFC `<template>`.

### Decisiones técnicas tomadas (DEC-HW-1..4, DEC-DATA-1..5, DEC-SW-1..6, DEC-PHIL-1..3, DEC-PROC-1..2)
Ver `docs/wanomi_modelo_conceptual.md` sección "Decisiones acumuladas".

### Commits de esta sesión

```
7ebdb5a  chore: tighten .gitignore for stale artifacts and snapshots
3c4eb56  docs: add project documentation structure
d79916f  feat(simulator-api): enrich GET /simulator/devices with templateWidgets
b582a7a  feat(simulator): add demo simulator panel (Sim-3 step 3)
87cf308  chore: track app/README.md, test.html and util/ scripts
```

### Archivos creados/modificados

- `SECRETS.md` — protocolo de manejo de secrets
- `docs/STATUS.md` — estado del proyecto (punto de entrada para nueva sesión)
- `docs/INVENTARIO_AUTO.md` — inventario regenerable del repo
- `docs/wanomi_modelo_conceptual.md` — modelo conceptual v0.2 con auditoría
- `scripts/inventario.sh` — generador de INVENTARIO_AUTO.md
- `.gitignore` — reforzado (node_modules, snapshots, Zone.Identifier, artefactos)
- `app/api/routes/simulator.js` — GET /simulator/devices enriquecido con templateWidgets
- `app/pages/demo/simulator.vue` — panel simulador master-detail
- `app/components/Simulator/DeviceList.vue` — lista agrupada por site
- `app/components/Simulator/DevicePanel.vue` — widgets en vivo con MQTT (631 líneas)

### Próximo paso

**Sim-3 paso 4**: agregar grilla de botones de escenarios al `DevicePanel.vue`.
Filtrado SEC vs GEN, estado activo + countdown, disable durante escenario activo.
Estimado: 1 día. Luego cierre de Sim-3 con commit y arranque de planificación Sim-3.5.

---

## Sesión #8 (cont.) — Debate libre de equipo + decisiones estratégicas

**Fecha**: 2026-05-19
**Formato**: debate libre de las 4 áreas (15 especialistas) + 2 rondas
**Resultado**: marco estratégico definido + 9 decisiones técnicas

### MARCO ESTRATÉGICO DEFINIDO POR FRANCO

Las 3 tensiones transversales quedan resueltas:

- **DEC-STRAT-1 — Marco Enterprise**: Wanomi 2.0 se diseña para el mercado
  enterprise (telco/infraestructura crítica). El segmento consumer
  (comercio/hogar del Doc Ejecutivo original) NO es el foco de este ciclo.
- **DEC-STRAT-2 — Demo como herramienta interna viva**: se diseña el
  PRODUCTO, no la demo. La demo/simulador es herramienta interna de prueba
  del sistema, que se enriquece progresivamente con nuevos sensores y
  escenarios simulados. No es un artefacto descartable.
- **DEC-STRAT-3 — Realidad primero**: todas las decisiones se toman en base
  a la realidad técnica. Si algo no se adapta, se discute entre todas las
  áreas y especialistas antes de avanzar.

### DECISIONES TÉCNICAS (consensos del debate)

- **DEC-PRED-1 — Predictivo Nivel 2 para Claro**: el alcance realista es
  "preventivo basado en condición" (tendencias, baselines, proyección de
  degradación), NO machine learning. Ejemplos concretos construibles:
  degradación de batería de arranque por regresión de voltaje en reposo,
  consumo anómalo de combustible vs promedio móvil, pérdida de eficiencia
  de AC por temperatura de shelter en subida sostenida. Nivel 3 (ML,
  detección multivariable, FFT clasificada) es roadmap futuro, NO se
  promete en el pitch.

- **DEC-ARCH-1 — Arquitectura edge distribuida confirmada**: cada site
  tiene su propio Hub (Orange Pi) con su propio MongoDB local. El dato
  denso de sensores vive local en el site. NO existe una base central con
  todos los sites (esto invalida la preocupación previa de escalabilidad de
  288M docs — era un modelo mental equivocado del Backend senior, corregido
  por Franco). Beneficio adicional: soberanía del dato (argumento de venta
  fuerte para telco — el dato nunca sale del site del cliente).

- **DEC-ARCH-2 — Capa de agregación NOC**: el NOC no se conecta a 200 Mongos.
  Cada Hub publica al NOC solo eventos, estados y alarmas (vía MQTT a broker
  central), no el dato crudo de cada sensor. Patrón: dato denso en el edge,
  dato resumido en el centro. Esta capa de agregación es lo que ahora hay
  que diseñar (reemplaza la falsa preocupación de escalabilidad de Mongo).

- **DEC-SENSOR-1 — Estrategia híbrida físico + soft sensor**: se aplican
  soft sensors (virtual sensing) para reducir cantidad de sensores físicos
  y puntos de falla. Variables críticas y forenses → sensor físico.
  Variables inferibles → soft sensor derivado de las mediciones ancla.
  Ejemplos de inferencia: carga del generador desde corriente×tensión,
  vida útil de aceite desde horas+temperatura+ciclos, nivel de combustible
  por integración de consumo (con recalibración periódica contra medición
  física).

- **DEC-SENSOR-2 — Soft sensors corren en el Hub local**: cada Hub recibe
  datos físicos por MQTT, ejecuta los modelos de inferencia localmente
  (tiene CPU de sobra), y genera variables virtuales tratadas igual que las
  físicas en dashboard y reglas.

- **DEC-SENSOR-3 — Flag de procedencia obligatorio**: cada variable lleva
  source: physical | inferred. Se distingue en el dashboard (iconito) y
  ESPECIALMENTE en el log forense. Honestidad arquitectónica no negociable.

- **DEC-FORENSIC-2 — Variables forenses requieren medición física**: un
  dato medido tiene valor probatorio; un dato inferido es estimación. Para
  la pata forense (reclamos legales por robo de cobre/combustible), las
  variables que sostienen evidencia DEBEN ser físicas. (Trampa señalada por
  Confiabilidad industrial, aceptada por el equipo.)

- **DEC-HMAC-1 — Checkpoints HMAC firmados cada N eventos**: cada Hub tiene
  su cadena forense local; al sincronizar con el NOC envía checkpoints
  firmados para que el NOC verifique integridad sin validar la cadena
  entera de cada site. Resuelve la impracticabilidad de validar cadenas
  largas (>100k eventos).

- **DEC-STACK-1 — No migrar Vue 2 / Nuxt 2 ahora**: están en EOL pero
  funcionan y no hay bug bloqueante. Migración = reescritura del frontend,
  riesgo de regresión alto, semanas que no hay antes de Claro. Se documenta
  como deuda técnica con plan post-Claro. El backend (Node/Express/Mongo/
  EMQX) NO está en EOL. CONDICIÓN: todo código frontend nuevo se escribe de
  forma migrable (lógica separada de la vista, sin trucos solo-Vue2).

- **DEC-DASH-1 — Dos dashboards**: (a) "operador" = mapa con sites
  coloreados por estado + lista priorizada de alarmas + drill-down + cards
  cambiando de color según estado (mezcla de widgets del simulador demo y
  de la plataforma existente). Es la pantalla principal del NOC. (b) "admin"
  = doble select sitio+plantilla, para configuración y debugging interno.
  Las reglas no solo notifican: ACCIONAN otros dispositivos según necesidad.

- **DEC-DASH-2 — Tres superficies, una verdad**: la misma información se ve
  en tres lugares según el actor: (1) cellowner — acceso remoto al panel de
  sus sites, con alarma + recomendación de acción; (2) técnico de
  mantenimiento — display físico conectado al Hub local en el shelter,
  funciona sin conexión celular; (3) NOC — dashboard centralizado con visión
  global. Hub local alimenta display en sitio + sube resumen al NOC.

### LOS TRES ACTORES (modelo de "día en la vida")

El diseño del producto se ancla en tres actores reales:

1. **Cellowner** (dueño de zona, 15-30 sites): no vive mirando pantallas.
   Wanomi lo molesta solo cuando importa, y le dice QUÉ HACER, no solo qué
   pasó. Ej.: "generador CR00073 falla en ~40hs por degradación de batería,
   programá reemplazo".
2. **Técnico de mantenimiento**: llega físicamente al shelter, mira el
   display local del Hub, ve estado y alarmas sin depender de señal.
3. **NOC**: visión global, ve el card ponerse rojo en el dashboard central.

### DESACUERDOS PRODUCTIVOS REGISTRADOS

- Vibración propuso soft sensors agresivamente; Confiabilidad los frenó con
  3 trampas (deriva sin ancla física, necesidad de datos de entrenamiento,
  valor forense de lo medido vs inferido). Síntesis: estrategia híbrida.
- Ing software senior planteó urgencia de migrar stack; Frontend y Backend
  lo frenaron. Síntesis: deuda documentada, no urgencia.
- Backend senior admitió públicamente error de modelo mental (base central
  vs edge distribuida). Corregido por Franco.

### DEPENDENCIA CRÍTICA PARA PRÓXIMA SESIÓN

El diagrama eléctrico + BOM del WN-SEC y sensores (pedido a Ing.
electrónico) DEPENDE de cerrar primero la tabla de sensores físicos vs soft
sensors. No se puede dibujar el circuito hasta definir qué sensores físicos
quedan. PRIMER ENTREGABLE TÉCNICO de sesión #9: tabla física-vs-virtual.

### ENTREGABLES PENDIENTES (no urgentes para demo)

- **Doc 4 — Plan de Comercialización post-Claro** (Arquitecto B2B): modelo
  de negocio enterprise, pricing enterprise, roadmap de cuentas (Claro →
  Movistar → Telecom → torreras), SLA, defensibilidad, proyección del canal.
  Para la conversación POST-demo.
- **Pitch deck** (Copywriter): primeras 5 slides sin jerga técnica
  (problema en pesos → "llegar antes" → 3 actores → soberanía del dato),
  profundidad técnica de slide 6 en adelante.
- **Variante enterprise del branding** (Diseñador gráfico): Obsidiana base,
  verde enfriado hacia teal/cian técnico, ámbar/rojo solo para alarmas.

### PRÓXIMO PASO

Sesión #9: definir tabla sensores físicos vs soft sensors (habilita BOM +
diagrama eléctrico). En paralelo, retomar Sim-3 paso 4 (botones de
escenarios) sigue pendiente del lado de implementación.

---

## Sesión #9 — Qué censar: sensores prioritarios para infraestructura Claro NEA

**Fecha:** 2026-05-22
**Área de trabajo:** 1 (Escenarios) + 3 (Hardware), con input de 2 (Software) y 4 (Marketing)
**Insumos:** investigación profunda 4 áreas (web) + análisis Sytex 59 reportes + análisis Sytex 177 reportes (71 sites, 4 provincias, 9.164 L diésel)

### Decisión central
Se pasa de "cómo censar" (resuelto) a **"qué censar"**, anclado en el dolor operativo real y medido de Claro en sitios de torre del NEA. La identidad del producto cambia de "kits de sensores + Hub" a **"capa de datos estandarizada y soberana que detecta y notifica sobre el equipo existente, y mide físicamente los puntos ciegos críticos"**.

---

### Modelo de producto: un Hub, dos modos

| Capa | Qué hace | Sitios objetivo |
|---|---|---|
| **Hub Wanomi** (común) | Ingesta, estandarización a schema canónico, reglas de detección en el edge, buffer offline (30–90 días), dashboard NOC, notificación | Todos |
| **Modo Connect** (software) | Lee equipo existente (Modbus/SNMP/contacto seco/IP) y estandariza. Cero fierro nuevo. Time-to-data ~días | Sites equipados (genset inteligente, rectificador, ATS, CRAC) |
| **Modo Sense** (hardware) | Sensores físicos en puntos ciegos | Sites obsoletos + blind spots de sites equipados |

Un sitio puede ser Connect, Sense o híbrido. El dashboard no distingue origen salvo por el flag `source`. Topics canónicos: `wanomi/{site_id}/{equipo}/{variable}`.

**Inteligencia en dos capas (honestas):**
- **Capa 1 — Detección (día 1):** reglas + cruce de señales, sin baseline. ~80% del valor inmediato.
- **Capa 2 — Predicción (progresiva):** tendencias/deriva sobre baseline propio de cada sitio. Madura con el tiempo. No se vende como promesa day-1.

---

### Tabla físico-vs-soft — CONGELADA sesión #9

Convención de `source`:
- `physical` — sensor propio Wanomi; dato independiente con valor forense.
- `inferred` — soft sensor calculado en el Hub a partir de anclas físicas.
- `connect` — leído del equipo existente (modo Connect, sin fierro nuevo).
- `connect/physical` — híbrido: connect si el equipo expone el dato, físico si no.

#### WN-SITE-CORE — núcleo (energía + combustible + seguridad integrada)

| Variable | source | Origen / sensor | Detección día 1 | Justificación |
|---|---|---|---|---|
| `fuel_level_pct` | physical | Sonda hidrostática (capacitiva opcional) | Nivel < umbral; 0% inminente | Sender de fábrica miente (CR00058: clavado 24%, tanque vacío). Evidencia forense |
| `genset_running` | physical | Acelerómetro chasis GEF (ADXL345/LIS3DH) | Marcha real vs reportada | Ancla anti-puenteo / anti-telemetría falsa |
| `Vrms L1/L2/L3` | physical | PZEM-004T ×3 (o ATM90E36) | Caída de fase, ausencia total, intermitencia | Causa raíz de cascada (CH00070: pueblo sin energía) |
| `Irms L1/L2/L3` | physical | CT del PZEM | Confirmación de carga en operación GEF | Distingue GEF cargado vs en vacío |
| `freq_hz` | physical | PZEM / ATM90E36 | Frecuencia fuera de rango (CR00143: 49,5 Hz) | Calidad de energía rural |
| `ats_position` | connect/physical | Contacto seco ATS → GPIO | Transferió / no transferió, latencia | Sites sin contacto accesible → relé seco |
| `genset_params` (RPM, T°, P aceite, V batería arranque) | connect | Modbus al controlador GEF (Cummins PowerCommand / ComAp / DSE) | Alarma activa, arranque fallido | Dato que el GEF ya expone, hoy ignorado |
| `door_open` | physical | Reed switch por gabinete crítico | Apertura no autorizada (MI00188) | SEC integrado, costo marginal |
| `cabinet_tamper` | physical | Acelerómetro en gabinete TX | Forzado/golpe (puerta forzada por abajo) | El reed solo no cubre el modus operandi real |
| `engine_running_est` | inferred | De corriente del alternador | Redundancia a `genset_running` | Cruce de señales |
| `fuel_rate_lph` | inferred | Δ`fuel_level`/Δt | Consumo anómalo | Base del estimador de autonomía |
| `autonomy_hours` | inferred | `fuel_level` ÷ `fuel_rate` proyectado | Aviso antes del 20% | El número que evita el site down |
| `ac_outage_event` | inferred | `Vrms` 3φ + `genset_running` | Inicio de cascada | Dispara coordinación con cooperativa eléctrica |
| `cascade_risk` | inferred | `ac_outage` + `autonomy` | Riesgo de site down en X horas | Prioriza el truck roll |
| `theft_score` | inferred (a validar) | Δ`fuel` sin marcha / inconsistente con carga | Sifoneo | HIPÓTESIS — se valida en piloto, no se promete a Claro |
| `intrusion_score` | inferred | `door_open` + `cabinet_tamper` + horario | Intrusión real vs falsa | Reduce ruido de alarmas al NOC |

#### WN-SITE-ENV+ (add-on #1 — prioridad subió: HVAC = 12% en muestra 177, vs 6% en 59)

| Variable | source | Origen / sensor | Detección día 1 | Justificación |
|---|---|---|---|---|
| `temp_battery_room` | physical | SHT31 | T° > 25 °C | Arrhenius: +8 °C ≈ ½ vida de batería VRLA |
| `temp/humidity_cabinet` | physical | SHT31 ×N | Condensación (CR00215: termostato 30/30) | 21 incidentes HVAC en 177 |
| `airflow_diff_pressure` | physical | SDP810 / MPXV7002DP | Filtro tapado / ventilador caído | Confirma flujo real, no que el AC "prende" |
| `water_floor` | physical | Sonda resistiva | Filtración por lluvia | Clima NEA |
| `hvac_health` | inferred | duty cycle + ∆T alcanzado | AC corre pero no enfría | Salud del compresor |
| `battery_life_consumed` | inferred | Arrhenius sobre histórico de T° | Vida útil quemada | ROI silencioso |
| `cooling_telemetry` | connect | Modbus/BACnet si el CRAC es inteligente | Set-point, estado | Sites equipados |

#### WN-SITE-SURGE (add-on #2 — valor forense/seguro, NO preventivo)

| Variable | source | Origen / sensor | Detección día 1 | Justificación |
|---|---|---|---|---|
| `lightning_event` | physical | AS3935 | Tormenta en aproximación (1–40 km) | 17 casos; CR00104 cascada >USD 20k |
| `tower_accel` | physical | Acelerómetro | Confirma evento físico real | Triangula con AS3935 (evita falso positivo EM) |
| `spd_counter` | connect/physical | Contacto del SPD/pararrayos | Continuidad de protección | Donde el SPD tenga interfaz |
| `lightning_damage_likelihood` | inferred | AS3935 + accel + transient AC | Correlación daño-evento | Valor de reclamo a seguro, no prevención |

> **Nota de alcance:** Loros / fauna (CH00145, 3 cortes de fibra) y fallas de módulo RF (EQ-003, 14 casos) quedan FUERA de alcance — son ingeniería de red, no infraestructura física.

---

### Registro de decisiones (DEC)

**DEC-PRODUCT-1** — Arquitectura de producto: un Hub común, dos modos **Connect** (software, lee equipo existente) y **Sense** (hardware, puntos ciegos). Híbrido por sitio. Reemplaza el modelo "5 kits independientes".

**DEC-PRODUCT-2** — Fusión de WN-SITE-GEN + WN-SITE-PWR en **WN-SITE-CORE** (un nodo, dos grupos de sensores, regla de cascada unificada). WN-SITE-SEC deja de ser kit y pasa a **feature integrada del CORE** (reed + acelerómetro, costo marginal). SURGE y ENV+ son add-ons modulares.

**DEC-SENSOR-1** — Nivel de combustible: **sensor físico independiente del controlador del GEF**, tecnología **hidrostática por defecto** (retrofit sin perforar tanque), capacitiva opcional donde el tanque lo permita. Justificación dura: 2 casos documentados de sender de fábrica trabado (CR00058). `source: physical`, valor forense.

**DEC-SENSOR-2** — Marcha del GEF: **acelerómetro físico en chasis** como ancla anti-puenteo (Powerx documenta puenteo de red al genset apagado). Corriente del alternador como redundancia inferida.

**DEC-INTEL-1** — Inteligencia en dos capas: **detección (día 1, reglas, sin baseline)** se vende como capacidad inmediata; **predicción (progresiva, baseline por sitio)** se presenta como capacidad que madura, nunca como promesa day-1.

**DEC-GTM-1** — Modelo comercial **managed self-hosted**: el Hub vive en el sitio (dato soberano, jurisdicción AR, resiliente a backhaul intermitente), Wanomi opera y mantiene el Hub bajo contrato. Desactiva la objeción del NOC centralizado.

**DEC-GTM-2** — Pitch anclado en data propia de Claro: truck rolls evitables + site downs por tanque vacío + cascada de energía. **El robo de combustible NO es el claim principal** (sin caso medido en AR) — es capacidad latente.

**DEC-SCOPE-1** — MVP de Connect integra primero la **pata energía: genset + ATS + rectificador** (≈60% del dolor). ENV+/HVAC se adelanta hacia fase 1-2 por su peso en la muestra 177 (12%). Aire "tonto", batería fina y cámara-AI: fase 2.

**DEC-INTEGRATION-1** — Connect es un **framework multi-driver**, no un adapter único. El parque de Claro NEA es heterogéneo (sin marca unificada por equipo). Drivers priorizados por frecuencia:
- **GEF:** Cummins PowerCommand + ComAp + DSE.
- **ATS:** ComAp InteliATS² (entre otros) — reúsa el dialecto Modbus ComAp del driver de GEF, reúso casi total.
- **Rectificadores:** ZTE / FTN / Realtek — SNMP con MIB propietario. **Driver más costoso de Connect.**
- **AA:** Westric vía controladora (Modbus/serie); termostato manual → **Sense puro** (SHT31 + clamp para inferir duty cycle).

**DEC-SCOPE-2** — El mapa de telemetría por sitio (qué va Connect / qué va Sense) **no es planificable desde escritorio**: se releva en el **survey de instalación de cada sitio del piloto**. Los formularios de preventivos no referencian marca de equipo por sitio.

---

### Riesgos abiertos (RISK)

**RISK-INTEGRATION-1** — El adapter Modbus de Connect debe soportar **Cummins PowerCommand como ciudadano de primera** (confirmado en informe 177, §5.1), no solo ComAp/DSE. Mapas de registro distintos.

**RISK-INTEGRATION-2** — La lectura de rectificadores **no es universal**: depende de que el puerto de gestión esté cableado y vivo, cosa rara en sitios rurales. Política: **Connect donde el puerto de gestión existe y responde; Sense (clamp DC + V de string) donde no.** No prometer lectura universal de rectificador a Claro.

**RISK-DATA-1** — La hipótesis de robo de diésel en gensets telco AR **no tiene caso medido** en 59 ni 177 reportes. `theft_score` se valida con datos del piloto; no se promete a Claro.

**RISK-METHOD-1** — El informe de 177 (generado por Kimi.ai) tiene cifras financieras contradictorias (ROI 0,2 meses; ahorros USD 179.200 en TL;DR vs USD 41.174 en §10.3). Se usan sus **hechos de campo** (validados), se **descartan sus proyecciones financieras**.

---

### Pendientes para próxima sesión

- **D-H — CERRADO (forma realista):** No se cierra como "marca X en todos los sitios" sino como **matriz de drivers priorizada (DEC-INTEGRATION-1) + relevamiento por sitio en el survey del piloto (DEC-SCOPE-2)**. Parque confirmado: GEF Cummins PowerCommand; ATS ComAp InteliATS²; rectificadores ZTE/FTN/Realtek; AA Westric o termostato manual. Sin unificación de marca → el modelo Connect/Sense queda validado de raíz.
- Sites Tier 1 candidatos a piloto (de informe 177): CR00143 Paso de la Patria (9 incidentes, todos los modos), CR00070 Ituzaingó (1.410 L), CH00042 Basail, CR00061 Arrocera (2 rayos/3 días), CH00R02 Lote 5.
- 4 sites SIN GEF de respaldo (CH00076 La Eduvigis, CH00070 Lapachito, MI00131) — vulnerabilidad estructural + gancho comercial de urgencia.
- **Siguiente entregable natural:** BOM + diagrama eléctrico del WN-SITE-CORE (Área 3).
- **Sim-3 paso 4** (botones de escenarios en `DevicePanel.vue`) — estacionado desde inicio #9.

---

## Sesión #10 — 2026-05-23 · Área 3 (Hardware) · WN-SITE-CORE

### Contexto
Diseño del WN-SITE-CORE: núcleo de sitio para telco (piloto Claro Corrientes).
Decisión de arranque: **monitoreo-only** en primera instancia, para no interferir con los
procedimientos de O&M de Claro. El núcleo integra energía + combustible + seguridad + clima,
en modo Connect (lee equipo existente por Modbus) + Sense (sensores físicos en puntos ciegos).

### Entregables COMPLETOS (orden de ingeniería respetado)
1. **Mapa de I/O congelado** — pinout ESP32-S3-WROOM-1 N16R8, sin conflictos.
2. **BOM** `wanomi_BOM_WN-SITE-CORE.xlsx` — placa poblada $86,55 / kit completo $139,55 USD.
3. **Diagrama de conexionado normalizado** `wanomi_plano_WN-SITE-CORE.pdf/.svg` — borneras + campo.
4. **Esquemático multi-hoja (5 hojas)** `wanomi_esquematico_WN-SITE-CORE.pdf` — todos los componentes + nets.
5. **Guía de layout (PCB 4 capas)** `wanomi_guia_layout_WN-SITE-CORE.pdf/.docx`.

Paquete = lo necesario para que el diseñador de PCB capture en KiCad, rutee y genere Gerbers.

### Decisiones (nuevas)
| ID | Decisión | Notas |
|---|---|---|
| DEC-HW-2 | WN-SITE-CORE = monitoreo-only (Connect+Sense); no actúa sobre genset | No interfiere O&M de Claro |
| DEC-HW-3 | Alimentación: −48 VDC de planta primario, DC-DC aislado wide-input (18-75V) + supercap hold-up | No 220 VAC (es lo que falla) ni batería de arranque del genset |
| DEC-HW-4 | MCU = ESP32-S3 (no ESP8266); Ethernet por W5500 (SPI) | El S3 no tiene MAC Ethernet nativa |
| DEC-HW-5 | Clamps + combustible vía ADS1115 (16-bit I²C), no ADC del chip | Exactitud para variables forenses (DEC-FORENSIC-2) + evita conflicto ADC2/WiFi |
| DEC-HW-6 | RTC DS3231 con backup en el CORE | Timestamp forense confiable sin red/NTP (corte = el evento a capturar) |
| DEC-HW-7 | PCB de 4 capas (no 2) | Barrera de aislación −48 V/campo + EMC de torre + impedancia Ethernet |
| DEC-HW-8 | Aislación: DC-DC aislado + ADM2483 (RS-485) + opto en toda entrada de campo | Solo 3 cruces de barrera; buena señal de diseño |
| DEC-HW-9 | Salidas (sirena/estrobo/lock) y LoRa = footprint reservado (DNP) | Pata de acción física y expansión a esclavos, fuera de scope ahora |

### RISK / pendientes a confirmar en el survey del piloto
| ID | Riesgo / pendiente | Mitigación |
|---|---|---|
| RISK-HW-1 | Bus Modbus del genset: si el NOC de Claro ya es máster, no se puede 2º máster en el mismo RS-485 | Verificar por sitio; alternativa: sniffing pasivo o contactos secos por X5 |
| RISK-HW-2 | Rango/conexión de la sonda hidrostática 4-20 mA según modelo del primer sitio | Validar en relevamiento; define R10 y V_LOOP |
| RISK-HW-3 | Rectificador y ATS por sitio (D-H abierto desde #9): protocolo y si exponen Modbus | Survey Tier 1 |
| RISK-HW-4 | SDP810 (presión diferencial A/C) es el ítem más caro de la placa ($22) | Evaluar poblarlo por sitio |

### Lecciones aprendidas
- **Esquemático ≠ Gerbers.** Fabricar la PCB requiere layout + DRC en CAD; el esquemático + BOM +
  conexionado + guía de layout son el *paquete de diseño*, no archivos de fabricación.
- El proveedor pide **diagrama normalizado** (borneras, simbología IEC): no alcanza con BOM + esquemas.
- **ESP32-S3 ≠ ESP32 clásico**: el S3 no tiene MAC Ethernet nativa → W5500 por SPI.
- **ESP32-S3 N16R8**: GPIO35/36/37 los usa la PSRAM octal (no disponibles); 0/3/45/46 son strapping.
- Para un núcleo enterprise el costo correcto es mayor: CORE ~$220-280 PVP, no el rango de catálogo
  comercial ($45-105). El sensor físico de combustible (forense) es el ítem de campo más caro y el más valioso.

---

## Sesión #11 — 2026-05-24 · Área 3 (CAD del WN-SITE-CORE)

Revisión ERC del esquemático Rev A y cierre de Rev B. Pinout ESP32-S3
verificado sin conflictos (strapping/PSRAM/duplicados). Kit de layout
entregado para la etapa de ruteo humana en KiCad.

DEC-HW-10 — Alimentación del lazo 4-20 mA: agregado boost +5V→24V (U14).
  El front-end de combustible referenciaba +V_LOOP inexistente; con +5V el
  sender de 2 hilos no arranca. El +24V alimenta lazo y wetting de entradas.
DEC-HW-11 — Protección de entrada −48V de dos etapas: GDT a PE (energía) +
  TVS SMBJ64A (clamp). El SMBJ58A tenía stand-off insuficiente (ecualización
  ~57.6V) y clamp 93.6V > 75V del DC-DC.
DEC-HW-12 — Front-end de entradas digitales: wetting definido desde +24V con
  R por canal ~4k7 (≥3-5 mA, CTR confiable del TLP281); IN3 (presencia AC) pasa
  a canal dedicado, preferentemente vía AC-fail del rectificador (no 220VAC en placa).
DEC-HW-13 — WS2812: Schottky en VDD (~4.3V) para VIH compatible con DIN 3V3.

RISK-HW-5 (abierto) — Coordinación de clamp: con SMBJ64A el clamp queda ~103V,
  por encima de los 75V continuos del DC-DC. Confirmar rating transitorio del
  URB4805YMD; si <100V/ms, módulo telecom surge-rated o limitador serie.

BOM: placa $86.55 → $89.00; kit $139.55 → $142.00. Pinout sin cambios.
Validaciones arrastradas (no frenan layout): H-4 ADS1115 vs RMS, H-6 hold-up, H-7 term. RS-485.

Abierto al cierre #11: captura + ruteo 4 capas + Gerbers en KiCad (tarea humana,
Área 3). Kit listo: reglas DRC, orden de layout/floorplan, script de export.

---

## Sesión #12 — 2026-05-27 · Área 3 (cierre WN-SITE-CORE)

Decisiones de hardware DEC-HW-18..25. Revisión mecánica de Gerbers v1. Backlog de mejoras futuras registrado.

DEC-HW-18 — TVS1 de entrada SMBJ64A → SMCJ64A-T7 (1500W, SMC). Clamp ~103V @Ipp=14.6A;
  el GDT de 1ª etapa desvía el grueso del transitorio.
DEC-HW-19 — Rectificador/Power Plant consultado por Modbus TCP vía W5500 en paralelo al
  uplink MQTT; un solo RJ45 concentra ambos protocolos.
DEC-HW-20 — Pinzas CT reposicionadas: CT1 en acometida comercial + CT2 cross-check forense
  de salida GEF. Los valores eléctricos del GEF/Power Plant se leen por Modbus (no redundados con CT).
DEC-HW-21 — Combustible: front-end 4-20 mA con sensor de nivel industrial; se descarta HC-SR04.
DEC-HW-22 — U1 = Traco THN 10-4811WIR (railway EN50155/61373, IEC/EN/UL 62368-1, aislación
  3kV, entrada 4:1 18-75V, 5V/2A 10W, package 1"×1"). Reemplaza al TEN 10-4811 (EOL / sólo
  60950-1 / sin rating de surge).
DEC-HW-23 — AS3935 detector de rayo: footprint DNP reservado. SPI compartido; CS=GPIO43,
  IRQ=GPIO44 (libera consola UART0; debug por USB-C). Poblar sólo si el piloto valida demanda.
DEC-HW-24 — R485T 120Ω poblado por defecto (BOM + Pick&Place); des-poblar por variante de sitio.
DEC-HW-25 — Energización en piloto: fuente externa AC/DC o batería (24V o 48V, rango 18-75V
  de U1). Respetar polaridad: TVS SMCJ64A unidireccional orientado para −48V negativo-a-masa.
  Piloto usa fuente externa → sin cambio de placa.

Revisión mecánica Gerbers v1 (sólo colocación; esquemático + ERC 0/0/0 + DEC-HW-1..25 intactos):
- ESP32-S3 (U3) cuelga ~4.5mm del borde → reubicar, antena al borde, keepout 4 capas.
- USB-C (JUSB1) apunta hacia adentro → rotar a borde al ras.
- Agujeros de montaje ausentes → agregar 4× M3 (3.2mm) en esquinas con keepout.
Acción: revisión en Flux → re-pour + re-ruteo → DRC → Gerbers v2.

Backlog de mejoras futuras (NO en piloto):
- MEJORA-HW-1: diodo OR Schottky desde USB-C 5V al riel +5V (commissioning sin −48V).
- MEJORA-HW-2: entrada polaridad universal (puente / ideal-diode).
- MEJORA-HW-3: variante 9-36V (THN 10-xx05WIR, mismo footprint) para sites 12-24V.
- MEJORA-HW-4: front-end PoE PD + magnética en RJ45 (alimentación por cable de red).

Estado al cierre: esquemático Rev B, ERC 0/0/0, diseño CONGELADO. DEC-HW-1..25 cerradas.
Gerbers v1 exportados; revisión mecánica pendiente (v2) antes de enviar a JLCPCB.


## Sesión #13 — 2026-05-28 · Cierre Área 1 (Survey Tier 1 v2.0) + apertura Wanomi 3.0 Refactor

### Contexto

Sesión multi-tema. Tres bloques de trabajo encadenados:

1. **Cierre de Área 1** — paquete metodológico completo de Survey Tier 1 para el piloto Claro NEA, incorporando los tres documentos técnicos producidos en paralelo (informe de marcas de equipamiento Claro AR, estudio de conectividad del Hub, paquete de diseño WN-SITE-CORE Rev B).
2. **Paréntesis operativo** — diagnóstico del simulador WN-SEC/WN-GEN: los widgets no muestran datos. Diagnóstico realizado, no bloqueante. Pendiente de retomar (ver §C).
3. **Decisión estratégica** — formalización de **Wanomi 3.0 Refactor** como nuevo ciclo de producto, con documentación nueva en paralelo al `docs/` legacy.

### A · Cierre Área 1 — Survey Tier 1 v2.0 entregado

Paquete de 5 archivos producido en `docs/survey/`:

| Archivo | Líneas | Función |
|---|---|---|
| `README.md` | 89 | Índice + stack esperado del parque NEA + perfiles por sitio con marcas confirmadas |
| `protocolo_survey.md` | 331 | Objetivos, RISKs con criterios de cierre, logística, gear list, plantilla cell owner, 7 DEC-SURVEY-* |
| `checklist_campo.md` | 349 | Recorrido físico imprimible, sub-procedimientos por marca (ComAp/Cummins/Eltek), medición LTE B28 |
| `formulario_captura.md` | 395 | Schema estructurado por sitio paralelo al modelo Site del backend, sección Hub Wanomi nueva |
| `hipotesis_connect_sense.md` | 385 | Matriz Connect/Sense por cada uno de los 5 sites Tier 1 + estimaciones cruzadas pre-survey |

**Estado:** listo para revisión con el equipo de Área 1 (Asesor profesional telco + Ex-técnico telco + Confiabilidad industrial + Seguridad física). No avanza a ejecución hasta esa revisión.

### B · Decisiones del paquete Survey (DEC-SURVEY-1..7)

| ID | Decisión |
|---|---|
| DEC-SURVEY-1 | Survey NO incluye trabajo en altura ni apertura de equipos energizados |
| DEC-SURVEY-2 | Mediciones Modbus son lectura pasiva (sniffing) por default; activa solo con autorización del cell owner |
| DEC-SURVEY-3 | Foto-documentación obligatoria de paneles frontales y traseros; sin foto el campo queda "sin verificar" |
| DEC-SURVEY-4 | Captura por sitio = 1 archivo MD/JSON estructurado paralelo al modelo Site del backend |
| DEC-SURVEY-5 | RISK-DATA-1 (theft_score) NO se cierra en este survey — requiere meses de operación |
| DEC-SURVEY-6 | RISK-HW-4 (SDP810) **cerrado por diseño** en CORE Rev B. Survey solo determina ubicación del punto de toma |
| DEC-SURVEY-7 | Cobertura LTE Cat M1 B28 (RSRP en lugar del Hub) es **variable de viabilidad de primera clase** del sitio |

### C · Paréntesis simulador — diagnóstico realizado, retomada postergada

Síntoma reportado: simulador corre, widgets vacíos. Diagnóstico aplicado en orden de costo (indicador MQTT navbar → user logueado → consola browser → log simulador → Mongo).

**Hallazgo:** el seed se corrió contra `fsugamiele@gmail.com` (userId `69d135a2a7831f0014bd9074`) y no contra el `telco-test@wanomi.test` documentado en sesión #5 (DEC-36). Los 6 devices del simulador efectivamente están bind al user correcto del browser. **El userId mismatch — hipótesis inicial — no era el problema.** Las causas posibles que quedan abiertas (orden de probabilidad):

1. Templates con widgets bind a `dId`s del seed viejo (que ya no existen).
2. Pipeline EMQX → saver-webhook → MongoDB roto en algún paso (verificable con `db.data.find({...}).sort({time:-1}).limit(5)`).
3. Frontend recibe los mensajes MQTT pero no encuentra widget que matchee el par `dId+variable`.

**Decisión operativa:** pausar el simulador. No es bloqueante para Wanomi 3.0 Refactor; se retoma cuando se priorice por demo o por integración con la nueva arquitectura. Backlog: `BACKLOG-SIM-1`.

### D · Apertura formal — Wanomi 3.0 Refactor

Tras consolidar las decisiones estratégicas de las sesiones #8 a #12 (marco enterprise, Connect/Sense, edge distribuida, capa de agregación NOC, sensor híbrido físico+soft, dos dashboards, tres actores, framework multi-driver, sitio CORE+add-ons), Franco formaliza el inicio del ciclo **Wanomi 3.0**.

**Definición:** Wanomi 3.0 NO es una iteración menor del producto existente. Es la materialización formal del producto enterprise diseñado en sesiones #8-#12, con documentación nueva en paralelo al `docs/` legacy. Las sesiones anteriores a #8 (Sim-1, Sim-2, demo Claro original, modelo "5 kits independientes") son **histórico** y no son base de diseño para 3.0.

#### Decisiones nuevas (DEC-REF)

| ID | Decisión |
|---|---|
| DEC-REF-1 | Wanomi 3.0 hereda como bases inalterables las decisiones estratégicas de las sesiones #8 a #12 (DEC-STRAT-1..3, DEC-PRED-1, DEC-ARCH-1..2, DEC-SENSOR-1..2, DEC-FORENSIC-2, DEC-HMAC-1, DEC-STACK-1, DEC-DASH-1..2, DEC-PRODUCT-1..2, DEC-INTEL-1, DEC-GTM-1..2, DEC-SCOPE-1..2, DEC-INTEGRATION-1, DEC-HW-1..25) |
| DEC-REF-2 | Documentación del refactor vive en `docsRefactor/` (raíz del repo), con subcarpetas por área. `docs/` legacy queda como histórico inmutable |
| DEC-REF-3 | Archivo maestro `docsRefactor/WanomiRefactor.md` consolida pilares + decisiones del refactor (DEC-REF-*) + roadmap de fases |
| DEC-REF-4 | Las sesiones anteriores a #8 NO son base de diseño para 3.0. Sus decisiones quedan como referencia histórica solamente |
| DEC-REF-5 | Próxima sesión = **reunión multi-área** (las 4 áreas, 15 roles) para validar bases del refactor y definir orden de ataque |

#### Estructura nueva de documentación

```
IotLocalhost/
├── docs/                    ← LEGACY, inmutable (no se borra, no se modifica)
│   ├── wanomi.md             ← histórico completo
│   ├── STATUS.md             ← estado del repo legacy (rama feature/telco-support)
│   └── survey/               ← paquete Survey Tier 1 v2.0
│
└── docsRefactor/            ← NUEVO — Wanomi 3.0
    ├── WanomiRefactor.md     ← documento maestro
    ├── Hardware/             ← Área 3 — WN-SITE-CORE, add-ons, sub-nodos
    ├── Software/             ← Área 2 — backend, frontend, firmware
    ├── Estrategia/           ← Área 1 — escenarios, sites, integración Connect
    └── Marketing/            ← Área 4 — pitch, branding, brochures
```

### E · Próximos pasos

1. **Reunión multi-área de arranque** (próxima sesión #14): validar bases del refactor, priorizar áreas de ataque, definir entregable mínimo por área para la primera iteración. Agenda en `docsRefactor/agenda_reunion_inicial.md`.
2. **Revisión Survey Tier 1** con Área 1 (en paralelo, fuera del refactor): aprobación o ajustes del paquete antes de coordinar visitas con cell owners.
3. **Continuar Área 3** (independiente del refactor en su núcleo, pero alineado): revisión mecánica Gerbers v2 → fab JLCPCB.
4. **Retomar simulador** (postergado): solo si la demo lo demanda o si hace falta para validar 3.0.

### Lección registrada

El simulador estaba bind al user correcto desde el principio. La hipótesis "userId mismatch" se sostuvo dos turnos antes de caer con un query a Mongo. **Aprendizaje:** validar contra datos crudos antes de proponer fix. El indicador "MQTT verde + auth refresh exitoso en log" debió hacer caer la hipótesis credencial-corrupta en el turno 1.

---

### Sesión #14 — 2026-05-30 — Reunión multi-área de arranque Wanomi 3.0 Refactor

**Objetivo:** ejecutar la agenda de 5 bloques de arranque del refactor.

**Resultado:** MVP de Wanomi 3.0 definido + 10 DEC-REF nuevas (6 a 15) + biblioteca de campo caracterizada.

**Desarrollo:**
- **Bloque 1 (validación):** 0 decisiones heredadas tumbadas. Refuerzo de DEC-ARCH-2 con evidencia del simulador (commit 660d841). 5 entradas a backlog.
- **Desvío documental (camino A):** se procesó la biblioteca de campo `cinetik.rar` (80+ archivos). Resultado: parque Connect caracterizado con evidencia dura.
  - Familias de protocolo: **Modbus** (Eltek SmartPack S/II TCP, Vertiv SC200 TCP, ComAp RTU, MCX/Westric) + **SNMP** (Vertiv NCU, ZTE ZXDU CSU, Delta PSC3) + **contacto seco** (TLZ11).
  - **5 familias de controlador GEF** identificadas (no 3): Cummins PCC, ComAp, DSE, + PowerWizard 2.1, + SDMO NEXYS/TELYS.
  - **ComAp InteliATS NT** mapeado 100% a nivel registro (valores vivos + setpoints).
  - Aporte de Franco: mapas Modbus de **ComAp InteliGen NT** y **Cummins PowerCommand** → dominio mecánico (°C/aceite/RPM/combustible) confirmado **Connect-able**.
  - Datos crudos `Record2024_*.csv` = logs BMS litio. Gotcha: coma decimal (locale AR) en ingestión.
  - Flags de seguridad: credenciales SNMP por defecto + archivos de credenciales en el rar (excluidos, no abiertos).
- **Bloque 3 (MVP):** Connect-first sobre ComAp InteliGen + Eltek, CORE fuera de ruta crítica. Catálogo de **~40 reglas de detección día 1**. Refactor reutiliza widget/template + capa Site/Driver/RulePacks/NotificationRouter. Simulador como banco de pruebas.
- **Bloque 4 (compromisos):** entregable iter 1 por área con responsable, fecha (relativa a T0) y dependencias. Ruta crítica: Marketing(pitch)→Estrategia(sitio)→instalación.

**Decisiones:** DEC-REF-6 a DEC-REF-15 (ver `docsRefactor/WanomiRefactor.md` §5).

**Renders recibidos:** prototipos Hub/CORE/sensores (Gemini) para Marketing. Corrección obligatoria: pantallas 220 V AC → −48 VDC telco.

**Entregables generados (en outputs, a integrar al repo):** índice biblioteca, mapeo Modbus, matriz Connect, esqueleto SNMP, pata Sense, mapa GEF, registros consolidado GEF, catálogo detección, blueprint implementación, actualización WanomiRefactor.

---

### Sesión #15 — 2026-05-31 — Revisión de iteración 1 del refactor + cierre de BACKLOG-SIM-1

**Objetivo:** revisar avance de iter 1 y destrabar lo bloqueado. Se trabajó el GATE (Estrategia) y el Bloque 2 (Software).

**Resultado:** R-MVP-1 mitigado con evidencia de campo · MVP migrado a dos drivers (DEC-REF-16) · BACKLOG-SIM-1 cerrado con causa raíz probada y fix de raíz aplicado (DEC-REF-17) · pipeline e2e verde verificada.

**Desarrollo:**

- **GATE / Estrategia — R-MVP-1 mitigado.** Franco aportó el formulario de PM del sitio **CR00061 "Arrocera Repeater"** (Corrientes NEA, −28.88 / −56.40). Evidencia de placa:
  - **Grupo electrógeno:** Cummins Power Generation, controlador **PowerCommand HMI211** (Modbus RTU / RS485). Estado vivo: batería 12.6 V, motor frío (64 °F), aceite 0 PSI (standby), **2969.1 hrs** acumuladas. Grupo sano y viable para piloto.
  - **ATS:** controlador **ComAp InteliATS PWR** (Modbus RTU / RS485) — estado de transferencia, red/grupo disponible, ATS cerrado red/grupo, bloqueo de transferencia.
  - **Rectificador / planta DC:** no identificado en las fotos (sin placa visible). **Pendiente de confirmar en survey.**
  - **Hallazgo clave:** el ComAp del sitio es un **InteliATS** (controlador de ATS), **no un InteliGen** (controlador de grupo) como asumía DEC-REF-12. El dominio mecánico llega vía Cummins PowerCommand. La cascada de energía completa requiere **ambos** controladores → justifica dos drivers.
  - CR00061 queda registrado como **evidencia de viabilidad del parque** (ComAp + Cummins confirmado en campo), **no como sitio piloto cerrado**. La selección de sitio se mantiene abierta hasta tener más candidatos (DEC-REF-16).

- **Decisión de drivers (DEC-REF-16).** Se evaluaron 3 opciones (un driver Cummins / un driver InteliATS / dos drivers). Franco eligió **dos drivers día 1**, coherente con DEC-GTM-2 (pitch anclado en la cascada de energía, que cruza ambos controladores) y DEC-REF-11 (reglas cross-equipo, que por definición leen de >1 equipo). Costo incremental acotado: ambos mapas ya caracterizados en #14 (InteliATS NT 100%, PowerCommand aportado por Franco) y la capa Driver genérica ya prevista en DEC-REF-15.

- **Riesgos nuevos registrados:**
  - **R-MVP-2** (topología bus Modbus RTU): el InteliATS está en el shelter y el Cummins en el grupo afuera, a varios metros → probablemente no comparten un bus RS485 corto. O bus largo bien terminado, o el Hub necesita dos puertos Modbus RTU (segmentos separados). Se resuelve en survey, no de escritorio. Coincide con R3 del roadmap técnico (múltiples controladores en RS485, scan 1-32).
  - **DOC-GAP (PowerCommand Modbus):** confirmar que el PCC del sitio expone puerto Modbus RTU activo y no requiere módulo de comunicación adicional. Sin eso, el driver Cummins no tiene de dónde leer.

- **Bloque 2 / Software — diagnóstico de estado real.** Diagnóstico read-only contra el repo (vía Claude Code). Hallazgo honesto: la implementación de iter 1 **no había arrancado**. No existen drivers Modbus, ni `modbus-serial`, ni `Equipment`/`driverConfig` (schema sigue `Device` legacy), ni RulePacks, ni NotificationRouter, ni `pages/sites/`. El simulador existe pero emite **solo variables legacy SEC/GEN**, cero registros ComAp/Cummins. El stack estaba caído.

- **BACKLOG-SIM-1 — causa raíz probada (H2).** Tras levantar el stack se confirmó: los 6 devices del simulador (userId `69d135a2a7831f0014bd9074`) se sembraron **sin saver rule** en EMQX ni doc en `saverrules`. Causa: race condition entre el seed y `global.saverResource`, que se setea recién tras `EMQX_RESOURCES_DELAY` (30 s). Sin saver rule, EMQX no reenvía los topics al webhook → cero inserts en `data` → frontend vacío. H1 (templates con dId viejo) descartada por código; H3 (frontend no renderiza) queda como verificación manual de UI pendiente.
  - **Fix inmediato:** creación de las 6 saver rules faltantes (EMQX + doc Mongo), device por device, idempotente. Pipeline verificada con el **simulador real** (`run.js`, 6/6 devices): **84 inserts en 90 s**. Pipeline e2e legacy → **CORRE-OK**.

- **Fix de raíz (DEC-REF-17).** Se endureció el mecanismo de creación de saver rules: `waitForSaverResource` (poll activo, reemplaza el delay fijo), guard ruidoso en `createSaverRule()`, y `reconcileSaverRules()` al arranque (idempotente). Verificación post-aplicación: reconcile resolvió **7 ok, 4 fixed, 0 err**; los **4 devices legacy huérfanos** (`2090`, `tMQrX4Lr`, `JQYfpRp5`, `Skkq3vj7`) — que tenían `saverrules.status=true` pero rule EMQX `enabled=false` — fueron reparados por PUT 200 (sin recrear, sin duplicar). Conteo final: exactamente **10 saver rules, todas `enabled=true`, sin duplicados**, `payload_tmpl` idéntico carácter por carácter entre rules reparadas y sanas. Confirmado que EMQX 4.2.3 acepta `PUT /api/v4/rules/{id}`.

**Decisiones:** DEC-REF-16, DEC-REF-17 (ver `docsRefactor/WanomiRefactor.md` §5).

**Escrituras de código:** `app/api/routes/emqxapi.js` (bloques A-E: waitForSaverResource, initEmqxResources, reconcileSaverRules con manejo enabled=false + retorno {ok,fixed,errors}, reconcileRules con log N/M/K) · `app/api/routes/devices.js` (guard en createSaverRule).

---

### Sesión #19 — 2026-06-03 ✅ CERRADA (implementación — motor edge v1)
**Foco:** Área 2 — implementación del motor de reglas edge (DEC-REF-18)

#### Entregables
8 archivos nuevos creados y validados E2E:
- `app/api/models/rule_definition.js` — ConditionSchema + RuleDefinitionSchema (subdoc embebido)
- `app/api/models/rule_pack.js` — RulePack model, colección 'rulepacks'
- `seeds/cummins_pcc_v1.js` — seed A1, D1, D2, G2 (upsert idempotente)
- `edge-engine/index.js` — entry point: Mongo + reconstruct + suscripción MQTT
- `edge-engine/siteState.js` — loadPacks(): índice + hidratación reconstruct
- `edge-engine/ruleEngine.js` — processMessage() + fireAlarm() + cooldown en RAM
- `edge-engine/notificationRouter.js` — stub DEC-REF-21 (log estructurado)
- `edge-engine/evaluators/typeD.js` — evaluateD(): 6 operadores, null-safe

#### Validación E2E
- A1 oil_pressure_psi=10 → CRITICAL ✅
- G2 fuel_level_pct=8 → CRITICAL ✅ (caveat CR00058 propagado en recommendation)
- D1 hours_to_next_service_250=15 → WARNING ✅
- A1 oil_pressure_psi=40 → silencio ✅ (no cruza umbral)
- Cooldown por regla → correcto ✅ (no re-dispara dentro de la ventana)

#### Fixes en el camino
- Schemas RO inline en siteState.js — los models de app/api usan import (Babel/Nuxt), no son require-ables desde proceso Node separado
- Topic real del broker: `+/+/+/sdata` con userId en parts[0], dId en parts[1]
- deviceType en DB corregido: 'CUMMINS' → 'cummins-pcc' (naming canónico, DEC-INTEGRATION-1)
- QoS 0 + disconnect rápido = race condition en tests manuales (simulador permanente no tiene este issue)

#### Deuda registrada
- **BACKLOG-EDGE-1:** `source_filter` no evaluado en v1 — campo `_source` ausente en el stream por variable individual. Implementar cuando el driver Modbus publique con `_source` en el estado del device.

#### Pendiente sesión #20
- NotificationRouter real: Telegram + evento MQTT al NOC (DEC-REF-21)
- Evaluadores tipo C y S

---

### Sesión #20 — 2026-06-03 ✅ CERRADA (implementación — NotificationRouter real)
**Foco:** Área 2 — NotificationRouter real (DEC-REF-21) + schema Notification extendido (DEC-REF-23)

#### Decisión nueva
**DEC-REF-23 — Schema Notification extendido:** campos motor edge agregados
(`ruleId`, `inferenceId`, `label`, `severity`, `recommendation`, `siteId`,
`reason`, `source`). Campos EMQX (`emqxRuleId`, `condition`, `variableFullName`)
mantenidos opcionales para compatibilidad. Motor edge nunca mapea semántica
incorrecta a campos legacy. Campo `source: 'emqx' | 'edge-engine'` permite
discriminar origen. Decisión motivada por DEC-STRAT-2 (producto, no demo):
el shim de compatibilidad propuesto inicialmente fue descartado.

#### Archivos modificados
- `app/api/models/notifications.js` — schema extendido (DEC-REF-23)
- `edge-engine/siteState.js` — reconstruct agrega `_userId` y `_deviceName`
- `edge-engine/ruleEngine.js` — fireAlarm enriquece alarm con userId y deviceName
- `edge-engine/notificationRouter.js` — implementación real (4 canales)
- `edge-engine/index.js` — notificationRouter.init() en handler connect

#### Validación E2E
Notificación guardada en Mongo con todos los campos correctos:
- source: 'edge-engine' ✅
- ruleId: 'cummins-A1-oil-pressure' ✅
- userId: '6a1ddc27442190ad13f1da4a' ✅
- deviceName: 'CR00061-CUMMINS' ✅
- siteId: 'CR00061' ✅
- readed: false ✅
- emqxRuleId / condition / variableFullName: '' ✅ (campos legacy vacíos)
- Telegram: OFF — activar cargando TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID_DEFAULT en .env

#### Pendiente sesión #21
- Activar Telegram: cargar credenciales de SECRETS.md al .env
- Evaluador tipo C (auto-calibrado vs setpoint Modbus)
- Evaluador tipo S (stateful/ventana temporal)

---

### Sesión #21 — 2026-06-03 ✅ CERRADA (Telegram E2E + variableLabel)
**Foco:** Área 2 — activación canal Telegram + nombre legible de variable en alarmas

#### Entregables
- Canal Telegram validado end-to-end con credenciales reales (chat de Franco, chat_id 8528874867, bot @Wanomi_bot)
- Bug Markdown resuelto: `parse_mode='Markdown'` rompía snake_case (`oil_pressure_psi` → cursiva sin guiones). Solución: texto plano.
- `variableLabel` (nombre legible, DEC-47) agregado a RuleDefinition + las 4 reglas Cummins + propagado a los 4 canales del NotificationRouter
- `variableFullName` poblado correctamente en Mongo (fix de duplicado que lo pisaba con '')

#### Setup de entorno
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID_DEFAULT` cargados en `app/.env`
- chat_id correcto obtenido vía getUpdates tras /start al bot

#### Aprendizaje de validación
- El error HTTP de Telegram en tests previos era timing: SIGTERM cerraba el proceso antes de que el socket HTTPS completara el round-trip. En producción (motor permanente) no ocurre. Para validación manual: esperar ~8s antes del kill.

#### Commits
- 7a2d97c — variableLabel legible + fix Markdown Telegram (4 archivos)

#### Pendiente sesión #22
- Evaluador tipo C (auto-calibrado vs setpoint Modbus, fallback a D) — requiere conversación de diseño previa
- Evaluador tipo S (stateful/ventana temporal)

### Sesión #22 — 2026-06-04 ✅ CERRADA (implementación — evaluador tipo C)
**Foco:** Área 2 — evaluador tipo C auto-calibrado contra setpoint Modbus, fallback a tipo D, validación E2E con 5 casos

#### Entregables
- `edge-engine/evaluators/typeC.js` — evaluador completo, retorna `{ fired, mode, thresholdUsed }`
  - Modo `calibrated`: setpoint disponible en siteState → compara valor observado contra setpoint real del equipo
  - Modo `fallback`: sin setpoint + `fallbackToD=true` → compara contra `condition.value` (umbral de respaldo)
  - Modo `no-ref`: sin setpoint + sin fallback → `on_missing_ref` decide (alarm | ignore)
- `edge-engine/ruleEngine.js` extendido: `case 'C'` separado, `fireAlarm()` acepta `mode` + `thresholdUsed`
- `edge-engine/notificationRouter.js`: schema NotificationRO + `saveToMongo()` con campos `mode`/`thresholdUsed`
- `app/api/models/rule_definition.js`: campo `setpointSource.variable` (String) — nombre de la key en siteState
- Arnés de validación E2E (5 casos, dId real Z5tKK1rN) en `seeds/_dev/` — TODOS PASS ✅

#### Decisiones registradas
- DEC-REF-24: Estándar de comunicación de alarmas v1 — formato jerárquico con contexto numérico explícito
- DEC-REF-25: Driver normaliza, evaluador compara — separación de responsabilidades

#### Incidente de seguridad
- TELEGRAM_BOT_TOKEN real expuesto en commit 3c4eb56 (SECRETS.md). Decisión: NO rotar (repo privado, sin push). SECRETS.md removido del tracking (git rm --cached + .gitignore). Documentado en SECRETS.md §Incidente #22.

#### Errores de validación resueltos
- `canary: true` en pack de prueba → `loadPacks()` filtra `{ canary: false }` → motor invisible al pack. Fix: `canary: false`
- `DID = 'CR00061-CUMMINS'` era el nombre, no el dId → `siteState.has()` devuelve false. Fix: `DID = 'Z5tKK1rN'`

#### Commits
- 13b551f — chore(security): untrack SECRETS.md, revert to placeholders (#22)
- 49d63d4 — feat(rules): setpointSource.variable en RuleDefinition (#22)
- 52e8177 — feat(edge-engine): evaluador tipo C auto-calibrado con fallback (#22)

#### Pendiente sesión #23
- 2b: evento INFO cuando setpoint no está disponible (cooldown keyed `${ruleId}:no-setpoint`)
- Aplicar formato DEC-REF-24 en NotificationRouter (Telegram/NOC/dashboard)
- BACKLOG-EDGE-2: escalada temporal del fallback (INFO→ATENCIÓN tras N minutos)
- BACKLOG-EDGE-3: limpiar shim legacy en `app/api/models/notifications.js`
- Fix DeprecationWarnings de Mongoose en el log del motor
- Evaluadores tipo S y cross

### Sesión #23 — 2026-06-08 ✅ CERRADA (implementación — DEC-REF-24 en router + sub-paso 2b)
**Foco:** Área 2 — aplicar formato de alarmas DEC-REF-24 en los cuatro canales del NotificationRouter + evento INFO de configuración cuando el setpoint no está disponible

#### Entregables
- Campo `unit` agregado a `RuleDefinition` (schema) + seed Cummins completo con unidades reales (kPa, h, %)
- DEC-REF-24 aplicado en los cuatro canales del router:
  - **Telegram**: plantilla jerárquica completa con línea de umbral según `mode` (fijo/calibrado/respaldo); fix del bug de líneas duplicadas heredado de #21
  - **NOC event**: agregados `mode`, `thresholdUsed`, `unit` al JSON estructurado
  - **Dashboard MQTT**: reemplazado el texto legacy incomprensible por formato compacto `[SEVERITY] label | site | value unit | umbral: X`
  - **Mongo**: campo `unit` persistido (schema inline + saveToMongo)
- `fireAlarm()` propaga `unit` desde la RuleDefinition; `thresholdUsed` ahora se propaga para tipo D (`rule.condition?.value`)
- **Sub-paso 2b**: evento INFO de configuración separado en `ruleEngine.js` case 'C' — cuando `mode='fallback'|'no-ref'`, emite un segundo mensaje (severity `info`, reason `setpoint-unavailable`) con cooldown propio `${ruleId}:no-setpoint`, independiente del operativo. Acción apunta a configuración del controlador, NO al enlace Modbus (DEC-REF-24).

#### Validación E2E
- A1 oil_pressure=10 (tipo D) → CRITICAL ✅; Mongo: `unit:"kPa"`, `mode:"direct"`, `thresholdUsed:15` ✅; Telegram renderizó plantilla completa con `Umbral: 15 kPa (fijo)` ✅
- C3 coolant_temp=100 sin setpoint (tipo C, fallback) → DOS mensajes separados ✅:
  - OPERATIVO: `{severity:"warning", mode:"fallback", reason:"threshold-fallback", thresholdUsed:90}`
  - INFO 2b: `{severity:"info", mode:"fallback", reason:"setpoint-unavailable", thresholdUsed:90}`
- Confirmado: nunca mezclados (DEC-REF-24 cumplido)

#### Decisiones de diseño (v1, registradas)
- **Site name = `_siteId`** ("CR00061") suficiente para v1; perfeccionable con nombre legible en BD cuando haya más sites
- Línea de umbral mostrada en TODOS los modos: `direct`→(fijo), `calibrated`→(calibrado), `fallback`→(respaldo — setpoint no disponible), `no-ref`→omitida
- Cooldown del INFO 2b vive en `ruleEngine.js` (el router emite, no decide) — opción D acordada

#### Aprendizajes / deuda
- **Re-seed obligatorio tras cambio de seed**: las reglas en Mongo NO se actualizan al editar el archivo seed. Hay que re-correr `node seeds/cummins_pcc_v1.js`. El campo `unit` apareció vacío en la primera validación por esto.
- **Path roto en arneses `seeds/_dev/`**: tres archivos (`_validate_typeC_seed.js`, `_validate_typeC_check.js`, `_validate_setpointSource.js`) tenían `require('../app/...')` cuando el correcto es `require('../../app/...')` — consistente con una reubicación a `_dev/` posterior a #22. Corregido en disco local. **NO commiteado** (`seeds/_dev/` gitignoreado). Si se vuelven a tocar, el path correcto es `../../`.
- DeprecationWarnings de Mongoose persisten en el log (no bloqueantes) — pendiente de #22, sigue abierto.

#### Commits (4)
- 28a6844 — feat(rules): add unit field to RuleDefinition + cummins seed (#23)
- fb57e57 — feat(edge-engine): apply DEC-REF-24 alarm format to all notification channels (#23)
- 7f3bcce — fix(edge-engine): propagate thresholdUsed for type D rules (#23)
- 5034fca — feat(edge-engine): emit INFO event when setpoint unavailable, sub-step 2b (#23)

#### Estado de seguridad — RISK-SEC-1 actualizado
- Corrección de supuesto: el commit `3c4eb56` con el token Telegram YA ESTÁ EN
  ORIGIN (pusheado). La condición de aceptación de riesgo de #22 ("repo privado,
  sin push") ya no se cumple en sentido estricto.
- **Decisión de Franco (#23):** rotación de credenciales DIFERIDA deliberadamente
  durante la fase de desarrollo. Token de bot de pruebas (@Wanomi_bot) en repo
  privado. Riesgo aceptado y acotado a desarrollo.
- **GATILLO OBLIGATORIO — pasaje a producción:** rotar TODAS las credenciales
  como parte del despliegue productivo, NO solo el token Telegram:
  - TELEGRAM_BOT_TOKEN (BotFather /revoke)
  - MONGODB credenciales (iotixmongo/iotixpassmongodev)
  - MQTT credenciales (superiotix/iotixsuperuser)
  - FORENSIC_HMAC_SECRET
  El historial git con secretos de desarrollo deja de ser relevante una vez que
  producción usa credenciales nuevas y distintas.
- 5 commits de #23 sin pushear (28a6844→ff33467). Los 13 previos ya en origin.

#### Pendiente sesión #24
- BACKLOG-EDGE-2: escalada temporal del fallback (INFO → ATENCIÓN tras N minutos)
- BACKLOG-EDGE-3: limpiar shim legacy en `app/api/models/notifications.js`; agregar `mode`/`thresholdUsed`/`unit` a las páginas de lectura del dashboard
- Fix DeprecationWarnings de Mongoose
- Evaluadores tipo S (stateful/ventana) y cross-equipo (requiere reunión multi-especialista — familia H del catálogo CR00061)

### Sesión #24 — 2026-06-14 ✅ CERRADA (implementación — BACKLOG-EDGE-2: escalada temporal del fallback)
**Foco:** Área 2 — escalada temporal del INFO de configuración (fallback) a transición warning tras N minutos sin setpoint

#### Entregables
- Campo `escalateAfterMinutes` en `RuleDefinition` (opt-in, default `null`)
- Escalada temporal en `ruleEngine.js` case 'C': cuando una regla persiste en `fallback`/`no-ref` ≥ `escalateAfterMinutes`, el INFO escala a una transición `warning` (reason `setpoint-unavailable-escalated`), UNA sola vez por episodio (marca idempotente `${ruleId}:no-setpoint:escalated`)
- Inicio de episodio registrado en `${ruleId}:no-setpoint:start` (medición en tiempo-de-eventos)
- Reset en silencio al recuperar el setpoint (`mode='calibrated'`): borra las tres keys del episodio
- Arnés E2E en `seeds/_dev/` (4 archivos, gitignoreado): seed + publish + check (con poll de reintentos) + `.sh`

#### Decisiones de diseño (debatidas por el equipo, registradas)
- **D1 — disparo reactivo (Opción A):** la escalada se evalúa en el próximo mensaje entrante, NO con un `setInterval`. Preserva la arquitectura event-driven del motor (DEC-REF-18). El episodio se mide en **tiempo-de-eventos**, no wall-clock. Condición de Confiabilidad: el "equipo enmudece del todo" (silencio total del stream) queda FUERA de alcance → BACKLOG-EDGE-4.
- **D3 — bypass inmediato de la transición:** la escalada INFO→warning se emite al instante (no espera el cooldown del INFO), porque una transición de estado es información nueva, no repetición. Marca idempotente impide re-emisión y re-bypass.
- **reason diferenciado:** INFO conserva `setpoint-unavailable`; la escalada usa `setpoint-unavailable-escalated`. Permite al NOC filtrar/priorizar y a Confiabilidad medir tasa de escalada como KPI (decisión del equipo, debate #24).
- **Parámetros calibrables en producción:** `escalateAfterMinutes` y cooldowns son afinables con datos reales; el mecanismo queda cerrado.

#### Contrato de eventos (tres eventos distinguibles por campo estructurado)
| Evento | severity | reason |
|---|---|---|
| Operativo fallback | `warning` | `threshold-fallback` |
| INFO configuración (2b) | `info` | `setpoint-unavailable` |
| Escalada temporal (EDGE-2) | `warning` | `setpoint-unavailable-escalated` |

#### Validación E2E (CR00061 / Z5tKK1rN, motor real, 3 casos — TODOS OK ✅)
- **E1 escalada idempotente:** INFO a t+0.2s + escalada a t+9s ("sigue no disponible tras 0.1 min"); mensaje posterior NO re-escaló → exactamente 1 escalada ✅
- **E2 reset:** la recuperación del setpoint cerró el episodio antes de escalar → 0 escaladas ✅
- **E3 no-regresión:** `escalateAfterMinutes=null` → INFO sí, 0 escaladas (comportamiento #23 intacto) ✅

#### Hallazgo de proceso (registrado honestamente)
Durante el diseño del refuerzo de E2, el equipo debatió un "segundo episodio" (parpadeo setpoint cae/vuelve/cae) que resultó **arquitectónicamente imposible**: el handler de `index.js` hace `deviceState[variable] = value` y NUNCA borra keys; el simulador (`device.js`) tiene guarda explícita que prohíbe publicar `null`. La ausencia real de setpoint = la key nunca se pobló (sitio sin configurar), no un parpadeo. El reset codificado cubre el caso real único: "ausente desde arranque → configurado → calibrated". Lección: auditar el código real ANTES de proponer (DEC-PROC-2) — la propuesta inicial de `setpoint=null` contradecía la guarda del simulador.

#### Commit (1, sin push)
- d83ed7e — feat(edge-engine): escalada temporal de fallback INFO→warning (BACKLOG-EDGE-2)
- 7 commits sin pushear (6 de #23 + este). Branch `feature/telco-support` ahead by 7.

#### Observaciones no bloqueantes
- `[notifRouter] Telegram request error:` (vacío) en el log del motor — esperado en entorno de validación (token de pruebas sin red al API). Los otros 3 canales OK.
- NODE_PATH debe propagarse al `.sh` cuando los scripts usan `require('mqtt')` sin path absoluto (descubierto en la 1ª corrida del arnés).
- Motores huérfanos en `pgrep -f edge-engine` (residuos de arranques previos) — nota de higiene: chequear antes de arrancar para evitar dos motores compitiendo por el stream.
- DeprecationWarnings de Mongoose persisten (arrastrado desde #22, no bloqueante).

#### Pendiente sesión #25
- **BACKLOG-EDGE-4 (heartbeat/staleness — detección de silencio):** REQUIERE reunión multi-especialista de diseño antes de tocar código. Origen: corolario de alcance de DEC-REF-26. El motor es reactivo (DEC-REF-18) — detecta lo que LLEGA, no lo que DEJA de llegar; un equipo que enmudece no dispara ninguna evaluación. Introducir detección de silencio exige un reloj/barrido (`setInterval`) que el motor deliberadamente no tiene → toca los cimientos, es un tipo de detección nuevo. **Los 4 casos a distinguir (del debate #24):** (1) enlace celular caído (BG95-M3 sin señal — ~9/10 "perdí contacto"; dueño: técnico de enlace); (2) mantenimiento autorizado (equipo apagado a propósito — NO debe alarmar); (3) sitio sin energía (silencio masivo simultáneo); (4) equipo realmente colgado (el caso que SÍ queremos — mudo mientras el resto del site habla). Riesgo: un detector mal calibrado grita "caído" cuando era el módem o un mantenimiento → ruido → el cellowner ignora la alarma → se pierde credibilidad (DEC-GTM-2). Distinguir los 4 casos es ~la mitad del valor.
- BACKLOG-EDGE-3: limpiar shim legacy en `app/api/models/notifications.js`; agregar `mode`/`thresholdUsed`/`unit` a las páginas de lectura del dashboard
- Fix DeprecationWarnings de Mongoose
- Evaluador tipo S (stateful/ventana)
- Evaluador cross-equipo (familia H del catálogo CR00061) — requiere reunión multi-especialista

### Sesión #25 — 2026-06-14 ✅ CERRADA (implementación — BACKLOG-EDGE-3 backend + housekeeping)
**Foco:** Área 2 — persistencia de mode/thresholdUsed/unit en notifications + limpieza de shim legacy + housekeeping (DeprecationWarnings, pack huérfano)

#### Entregables
- **Schema `notifications.js`**: agregados `mode`/`thresholdUsed`/`unit` (el motor ya los construía desde #22-#23 pero Mongoose los descartaba en silencio por no estar declarados). Los 3 campos legacy EMQX (`emqxRuleId`/`condition`/`variableFullName`) pasados de `required:[true]` a opcionales.
- **Shim legacy eliminado**: las líneas dummy `emqxRuleId:''` y `condition:''` en `saveToMongo()` (notificationRouter.js) ya no son necesarias y se quitaron. `variableFullName: alarm.variableLabel || ''` se mantiene (reuso legible, DEC-REF-23, NO es shim).
- **DeprecationWarnings de Mongoose silenciados** en las DOS conexiones: backend (`app/api/index.js:91`, faltaba `useFindAndModify:false`) y motor edge (`edge-engine/index.js:19`, conectaba sin opciones). Arrastrado desde #22, cerrado.
- **Pack huérfano `__validate_typeC_pack__`** (residuo de #22) borrado de Mongo.

#### Validación E2E (CR00061 / Z5tKK1rN, motor real — TODOS OK ✅)
- Alarma `cummins-A1-oil-pressure` (tipo D, oil_pressure_psi=5) → CRITICAL. Documento en Mongo: `mode:"direct"`, `thresholdUsed:15`, `unit:"kPa"` persistidos ✅; `emqxRuleId`/`condition` ausentes del documento (shim limpio) ✅; `variableFullName:"Presión de aceite"` poblado (DEC-REF-23 intacto) ✅.
- Motor rearrancado tras el fix de warnings → log sin una sola DeprecationWarning (`grep -ci deprecat` = 0) ✅.

#### Hallazgo de alcance — EDGE-3 era dos mitades de tamaño distinto
El backlog decía "agregar mode/thresholdUsed/unit a las páginas de lectura del dashboard", asumiendo que esas páginas existían. **No existen.** Auditoría de las 3 vistas del frontend (`alarms.vue`, `rules.vue`, `dashboard.vue`):
- Las tres son CONFIGURACIÓN de reglas legacy EMQX (formulario sensor+condición+actuador, `POST /rule` / `/alarm-rule`), NO lectura de eventos disparados.
- Ninguna consume la colección `notifications`. **El feed de alarmas disparadas no existe en ninguna parte de la UI.**
- `dashboard.vue` = vista admin de DEC-DASH-1 (grilla de widgets de un device seleccionado), sin mapa, sin feed, por device no por site.

Confirmado contra docs: `pages/sites/` (con feed de alarmas) está especificado en `refactor_implementacion_software.md §6` y es el **punto 6 del MVP** (`WanomiRefactor.md §4`), reconocido como faltante en la auditoría de #19 ("Fase 4 frontend inexistente"). Es un track de diseño propio, no un sub-paso de EDGE-3. → BACKLOG-UI-1.

**Conclusión:** EDGE-3 backend (3A+3B) cerrado. La "mitad frontend" nunca fue parte de EDGE-3; es BACKLOG-UI-1.

#### Backlog nuevo registrado
- **BACKLOG-UI-1** — construir `pages/sites/` (MVP punto 6, DEC-DASH-1 operador): lista (mapa Leaflet + pins por estado) + detalle de site (compone `DevicePanel`/`DeviceList` del simulador + feed de alarmas + estado vivo). El feed consume `notifications` y muestra `mode`/`thresholdUsed`/`unit` (habilitado por #25). Frontend migrable (DEC-STACK-1). Reutiliza componentes de Sim-3. REQUIERE reunión de diseño de Área 2 (Frontend Vue al frente) antes de código.
- **BACKLOG-DATA-1** — inconsistencia de unidad en `cummins-A1-oil-pressure`: la variable se llama `oil_pressure_psi` pero la unidad persistida es `kPa` (umbral 15). **Pregunta abierta** (no asumir el fix): ¿qué unidad entrega realmente el driver/simulador en esa key? Si entrega kPa → renombrar la variable; si entrega psi → corregir unidad+umbral de la regla. Arrancar por recon del driver, NO por asumir.
- **BACKLOG-RULE-1** — el pack productivo `cummins-pcc-v1` es 100% tipo D (4 reglas). Las features tipo C de #22-#24 (auto-calibrado, INFO 2b config, escalada temporal EDGE-2/DEC-REF-26) están implementadas y validadas por harness pero NO cableadas a ninguna regla viva del pack. Deuda de producto: el motor sabe más de lo que el pack le pide.

#### Aprendizajes operativos
- **Reglas embebidas**: las reglas viven como subdocumentos en `db.rulepacks.rules[]` (schema `rule_pack.js: rules:[RuleDefinitionSchema]`), NO en una colección `ruledefinitions` propia. Toda query de reglas va por `rulepacks` + `$unwind`.
- **`pkill -f <patrón>` se autodestruye**: si el patrón coincide con la línea de comando del propio shell (eval con la cadena buscada), el pkill mata su propia shell (exit 144/SIGTERM). Para futuros kills: usar PID directo (`kill <pid>`) o filtrar el resultado de pgrep. Mismo gotcha que el self-match de `pgrep -f`, pero letal.
- **Dos conexiones Mongo separadas**: el backend (`app/api/index.js`) y el motor edge (`edge-engine/index.js`) tienen conexiones independientes. Los warnings del log del motor NO se arreglan tocando el backend.
- **Re-seed**: confirmado de nuevo — las reglas en Mongo no se actualizan al editar el seed; hay que re-correr `node seeds/cummins_pcc_v1.js` (con NODE_PATH propagado para resolver `dotenv`).

#### Commits (3, sin push)
- 6544280 — refactor(notifications): drop required on legacy EMQX fields, remove shim dummies
- ef7702a — feat(notifications): persist mode/thresholdUsed/unit from edge engine
- feda1d7 — chore(mongoose): silence deprecation warnings on both connections
- **12 commits sin pushear** en feature/telco-support (9 previos + 3 de #25).

#### Estado de seguridad — RISK-SEC-1 sin cambios
- Rotación de credenciales sigue DIFERIDA a producción (decisión #23). Sin push esta sesión. El gatillo obligatorio de rotación al pasar a producción sigue vigente (TELEGRAM_BOT_TOKEN, MongoDB, MQTT, FORENSIC_HMAC_SECRET).

#### Estado del entorno al cierre
- Motor edge corriendo (PID 16365) con pack único `cummins-pcc-v1`, sin warnings. Si vas a cerrar el entorno, bajalo con `kill 16365` (NO `pkill -f`).
- Pendiente #26 (Franco prioriza al abrir): BACKLOG-UI-1 (requiere diseño) · BACKLOG-EDGE-4 heartbeat (requiere diseño) · BACKLOG-DATA-1 · BACKLOG-RULE-1 · tipo S (requiere diseño) · cross-equipo familia H (requiere diseño).

### Sesión #26 — 2026-06-17 ✅ CERRADA
**Foco:** Área 2 — Software · BACKLOG-UI-1 (`pages/sites/`, punto 6 del MVP)
**Formato:** reunión de diseño Área 2 (Frontend Vue al frente, Backend, OSS/BSS) + implementación backend + inicio frontend + Franco decisor

#### Naturaleza
Reunión de diseño de UI-1 auditada bullet a bullet contra el blueprint §6 y el
código real (DEC-PROC-2), seguida de implementación backend (3 endpoints, E2E)
e inicio de frontend (mapa Leaflet). Cierre de DEC-REF-27 (estado del pin).

#### Lo construido y validado (E2E contra motor real, 4 commits, sin push)
- **ea3ea26** — `GET /notifications?siteId=X`: feed por site (helper dedicado
  `getNotificationsBySite`, no toca el badge unread). E2E: 21 notifs reales de
  CR00061, campos #25 completos.
- **9290a95** — `GET /site/:siteCode/full`: site + devices con templates
  compuestos. Filtra SOLO por `siteId`, nunca por firmwareType (funciona con
  simulador `wanomi-sim` hoy y hardware `wanomi`/`telco` mañana). E2E: 4 devices
  (SEC/GEN/ATS/CUMMINS) con `templateWidgets`, shape que DevicePanel consume.
- **1f61a57** — `GET /sites/status`: status de pin server-side, agregación única
  escalable a N sites (DEC-ARCH-2). E2E: alarma MQTT real → CR00061 critical,
  otros 3 ok.
- **bd1ff55** — `pages/sites/index.vue`: mapa Leaflet crudo (sin vue2-leaflet,
  DEC-STACK-1), pins coloreados por DEC-REF-27, `L.divIcon` (esquiva bug Webpack
  4). leaflet ^1.9.4 dep nueva. Validado visualmente contra el mapa NEA en vivo.
- **17 commits sin pushear** en feature/telco-support (13 previos + 4 de #26).

#### DEC-REF-27 — Estado del pin del mapa (ver registro en WanomiRefactor.md §5)
Status server-side, peor severidad vigente en ventana 15 min, INFO no pinta
(opción A). Auto-resolución por silencio. Celeste para INFO abierto a validar
con Claro post-MVP.

#### Hallazgo que frenó el cierre completo de UI-1 — real-time del pin
El pin solo se actualiza al recargar la página (defecto detectado por Franco al
validar). Recon: el cliente MQTT del browser (`layouts/default.vue`) NO emite
las alarmas (`notif`) al bus de Nuxt — solo toast + re-fetch del badge; solo
`sdata`/`actdata` van al bus. El Canal 2 del router (`wanomi/noc/{siteId}/event`,
JSON con siteId+severity) tiene el dato correcto, confirmado en vivo, pero el
browser no tiene ACL sobre ese topic. Abrirla es decisión de seguridad/tenancy.
→ Real-time diferido a BACKLOG-UI-2, dependiente de BACKLOG-ARCH-1.
Franco eligió enfoque opción 3 (aislamiento por namespace `{userId}/...`,
sin tocar ACLs, aislamiento entre clientes por estructura).

#### Backlogs nuevos / actualizados
- **BACKLOG-UI-2 (nuevo)** — pin/feed en vivo (real-time sin reload). Dependiente
  de ARCH-1. Enfoque elegido: opción 3 (namespace por usuario).
- **BACKLOG-ARCH-1 (nuevo)** — Tenancy + provisioning + distribución de reglas en
  mundo NOC/cellowner/site. Jerarquía decidida conceptualmente (DEC-DASH-2) pero
  SIN modelo de datos (`cellOwner` es string, todo cuelga de `userId` plano).
  Distribución de RulePacks: mecanismo YA decidido (DEC-REF-19/20: pull Hub→NOC,
  regla=dato, idempotente, canary→production, rollback) pero NO implementado (hoy
  seed manual). Falta decidir: cellowner usuario vs atributo; topología de topics;
  modelo de propiedad sites/devices/alarmas; sub-catálogos de packs por cellowner;
  ACLs. Requiere reunión multi-especialista con seguridad + OSS/BSS.
- **BACKLOG-DATA-1 (actualizado)** — inconsistencia oil pressure ahora TRIPLE:
  template (`oil_pressure`, label psi) vs regla/notif (`oil_pressure_psi`, unit
  kPa). Tres fuentes a reconciliar. Recon del driver primero.
- **BACKLOG (housekeeping)** — `cooldownSec` (operativo, `fireAlarm`) vs
  `cooldownMinutes` (INFO 2b): dos cooldowns con propósitos distintos. Documentar
  o unificar. (NO es zombie — se corrigió esa conclusión intermedia.)

#### Aprendizajes operativos
- `cooldownSec` NO es zombie: aplicado en `fireAlarm()` (default 300s). El motor
  re-emite cada cooldown mientras la condición persiste → habilita la
  auto-resolución por silencio de DEC-REF-27.
- Las alarmas NO están en el bus de Nuxt: el handler de `default.vue` trata
  `notif` distinto de `sdata`/`actdata`. Por eso el real-time necesita decisión
  de arquitectura, no un parche.
- Endpoints nuevos, no extender los existentes con consumidores: el feed por site
  y el status van en helpers/handlers dedicados (badge-unread vs feed, lista vs
  status divergen a futuro — DEC-DASH-2).
- `import` para modelos, nunca `require` (lección #21), reutilizado sin incidente.
- Backend Nuxt no recarga serverMiddleware en hot: cambios en rutas Express
  requieren restart del backend para tomarlos.

#### Estado de seguridad — RISK-SEC-1
Sin cambios de política (rotación diferida a producción). AGREGAR al checklist de
rotación: credencial dev `fsugamielecinetiksrl@gmail.com` (apareció en chat esta
sesión). Checklist: TELEGRAM_BOT_TOKEN, MongoDB, MQTT, FORENSIC_HMAC_SECRET, +
esta cuenta.

#### Estado del entorno al cierre
- Backend Express :3001 + Nuxt :3000 (mismo proceso npm run dev) corriendo.
- Motor edge corriendo PID 29973. Si se baja: `kill 29973` directo, NUNCA
  `pkill -f` (self-match letal, lección #25).
- Se agregó `127.0.0.1 mongo` a /etc/hosts (fix dev #16, ausente en este entorno).

#### Pendiente para próxima sesión (Área 2)
- BACKLOG-UI-1 restante: `pages/sites/_siteCode.vue` (detalle: compone
  DevicePanel por equipo desde `/site/:siteCode/full` + feed desde
  `/notifications?siteId` + estado vivo por MQTT). Ajustes a DeviceList:
  SITE_LABELS desde modelo Site, roleLabel extendido CUMMINS/ATS.
- BACKLOG-ARCH-1 (estructural, su propia sesión con seguridad + OSS/BSS).

### Sesión #27 — 2026-06-17 ✅ CERRADA (reunión de diseño)
**Foco:** BACKLOG-ARCH-1 — Modelo de tenancy NOC/cellowner/site + topología + distribución de reglas
**Formato:** reunión multi-especialista (Backend senior, Integración OSS/BSS, Seguridad, Ing. software senior, Asesor profesional telco Área 1) + Franco decisor

#### Naturaleza
Sesión de DISEÑO puro, no implementación. No se tocó código. Define el modelo
de tenancy del producto enterprise multi-cliente, su topología de topics y cómo
se distribuyen los RulePacks. Disparada por el hallazgo de #26 (real-time del pin
depende de cómo esté modelada la propiedad de alarmas — la jerarquía estaba
decidida conceptualmente, DEC-DASH-2, pero sin modelo de datos).

#### Recon previo (DEC-PROC-2)
- User = name/email/password. CERO rol/tenant/admin. Greenfield para tenancy.
- Todo cuelga de `userId: String` plano. Aislamiento a nivel dato, no rol.
- `cellOwner` = string libre en Site (única huella de tenancy).
- ACL `{userId}/#` YA existe (lazy en `getWebUserMqttCredentials`) — cimiento del
  namespace por usuario parcialmente puesto.
- DEC-REF-19/20 (distribución packs) decidido, NO implementado (seed manual).

#### Decisiones (DEC-REF-28 a 31, ver registro en WanomiRefactor.md §5)
- **DEC-REF-28** — jerarquía 4 niveles Operator→Zone→Site→Equipment. Modelo
  completo, implementación colapsada a 1-1-1 (Claro/NEA/CR00061).
- **DEC-REF-29** — autorización por grants {rol, alcance}. Cubre cellowner /
  gerente multi-zona / NOC / Wanomi-superadmin con un mecanismo. Elegido sobre
  role simple por el caso del gerente de zona (Franco: supervisa N zonas).
- **DEC-REF-30** — topología híbrida. Telemetría intra-site queda en `{userId}/...`
  (local, DEC-ARCH-2); eventos/alarmas + distribución de packs usan la capa
  jerárquica `{operator}/{zone}/{site}/event`. Aislamiento estructural por rama.
- **DEC-REF-31** — distribución de packs por el árbol. Catálogo a nivel Operator +
  overrides por Zone; Hub pulea según su rama. Implementa DEC-REF-19/20 sobre el
  árbol de DEC-REF-28.

#### Razonamiento clave registrado
- **Modelo completo, implementación colapsada** ("cimientos de edificio, amoblar un
  departamento"): contemplar la jerarquía evita reescribir cuando llegue el 2º
  operador; no construir gestión multi-tenant que con 1 cliente no se ejercita.
- **Híbrido coherente con DEC-ARCH-2, no atajo**: el crudo es local → no necesita
  jerarquía; solo lo que cruza el site (eventos suben, packs bajan) usa el árbol.
- **Grants sobre role simple**: el gerente multi-zona rompe la etiqueta fija desde
  día 1; reescribir permisos es superficie de fuga entre tenants.

#### Hallazgo de la sesión — acceso a históricos (pregunta de Franco)
La topología híbrida no impide ver históricos, pero los destapa como pieza a
contemplar. El histórico crudo vive en el edge (DEC-ARCH-2); el acceso es por
CONSULTA (no suscripción en vivo), gobernada por los mismos grants. Toca 3 capas:
arquitectura de datos (cómo se trae del edge), backend (aplica grants server-side
— NO delegable al frontend, o hay fuga), frontend (vista de históricos). ARCH-1
garantiza que el modelo de grants contemple el acceso histórico; mecanismo de
datos y vista → backlogs hijos.

#### Backlogs hijos de ARCH-1 (dependen de este cimiento)
- **BACKLOG-ARCH-2** — implementación del pull de packs (DEC-REF-19/20) sobre el árbol.
- **BACKLOG-ARCH-3** — acceso a datos históricos: mecanismo de traída desde el edge
  (pull/resúmenes/híbrido) + endpoint con filtrado por grants.
- **BACKLOG-UI-3** — vista de históricos (selector de rango, tendencias, eventos pasados).
- **BACKLOG-TENANT-1** — UI de gestión multi-tenant + flujo de alta/invitación de usuarios.
- **BACKLOG-UI-2** (de #26) — pin/feed en vivo: ahora DESBLOQUEADO en diseño (la
  topología de DEC-REF-30 define cómo el pin recibe alarmas: suscripción a la rama
  jerárquica del usuario). Implementación pendiente.

#### Estado
- Sesión de diseño — sin commits de código. Solo docs (DEC-REF-28..31 + esta entrada).
- Entorno de #26 puede seguir corriendo o bajarse (motor PID 29973, `kill` directo).

#### Pendiente para próxima sesión
- Franco prioriza: implementar el modelo de tenancy (schemas Operator/Zone/User+grants,
  migración cellOwner→zoneId) — primer paso de ARCH-1 que toca código.
- O retomar BACKLOG-UI-1 restante (`_siteCode.vue`) si se prefiere cerrar UI antes
  de abrir el frente de tenancy.

### Sesión #28 — 2026-06-18 ✅ CERRADA (implementación)
**Foco:** BACKLOG-ARCH-1 — Implementación del modelo de tenancy (DEC-REF-28..31)
**Formato:** implementación con reuniones de diseño puntuales (Backend senior, Seguridad, Ing. software senior, Integración OSS/BSS, Frontend Vue) + Franco decisor

#### Naturaleza
Implementación de las decisiones de diseño de #27. Construye el árbol de tenancy
en modelo Y datos, migra el campo legacy `cellOwner` a la relación con el árbol.
Greenfield primero (modelos nuevos), migración de lo viejo al final. Seis
sub-pasos atómicos, un commit por sub-paso.

#### Sub-pasos completados
- **28.1** (`136dc8f`) — modelos Operator + Zone. Códigos string legibles
  (operatorCode/zoneCode) como identidad técnica inmutable; displayName mutable.
  Zone unique compuesto {operatorCode, zoneCode}. Greenfield, cero consumidores.
- **28.2** (`286e5c4`) — User + grants[]. Shape objeto {role enum, scope
  {operatorCode, zoneCode, siteCode}}, default []. Solo MODELA grants; lectura
  por DB y autorización diferidas a 28.x.
- **28.3** (`1e62333`) — seed MVP. Operator claro (Claro Argentina), Zone
  claro/nea (NEA), grant superadmin a la cuenta institucional admin@wanomi.com
  (NO la personal — separación de roles). Idempotente, URI explícita (evita
  fallback a base /wanomi equivocada), @babel/register para importar modelos ESM.
- **28.4a** (`1bba1f0`) — Site backfill. operatorCode/zoneCode OPCIONALES +
  seed migrate_cellowner.js. 4 sites Claro backfilleados a claro/nea. cellOwner
  conservado (red de seguridad). Campos opcionales primero para no invalidar datos.
- **28.4b** (`36d4f8f`) — migrar consumidores. forensic.js resuelve operador del
  árbol (Operator.displayName por operatorCode) con fallback a cellOwner — un PDF
  forense nunca debe salir vacío. sites.js whitelist + validación migradas.
  Validado E2E: PDF de CR00061 muestra "Operador: Claro Argentina".
- **28.4c** (`6b36026`) — endurecer schema. operatorCode/zoneCode → required
  (4/4 sites verificados válidos). cellOwner deprecado SUAVE (opcional, conservado
  como dato auditable + fallback PDF), con condición de salida explícita
  (BACKLOG-TENANT-2). POST simplificado. Cierra la migración.

#### Hallazgos clave (para sub-pasos siguientes)
- **Para 28.x (autorización por grants — el próximo, el más delicado):**
  - El grant superadmin quedó como `{role:"superadmin"}` SIN campo `scope`
    (Mongo omite el objeto vacío). La autorización debe reconocer superadmin por
    `role` e IGNORAR scope — NO asumir que scope existe (leer scope.X sobre un
    superadmin daría error de undefined).
  - Usuario SIN campo `grants` = sin permisos (tratar ausente como []). Mongoose
    no materializa el default [] en documentos preexistentes.
  - **El aislamiento por `userId` está vigente:** la cuenta Wanomi NO ve CR00061
    (es de la cuenta personal) — el endpoint forense filtra Site.findOne({userId,
    siteCode}). Confirmado en vivo durante el E2E del PDF (Wanomi → "site not
    found"; cuenta personal → OK).
  - **Trabajo concreto de 28.x:** además de leer grants de DB, hay que cambiar el
    filtro de los endpoints que hoy usan {userId} plano (forensic.js, sites.js,
    notifications, etc.) para que el superadmin los atraviese — el filtro pasa de
    {userId} a {userId OR alcance-del-grant}. Necesita datos multi-grant
    (superadmin + un cellowner acotado) para validar el aislamiento real.
- **Para 28.4 (resuelto, registrado):** `cellOwner: "Claro"` era el OPERADOR, no
  la zona (nombre engañoso). zoneCode (nea) es dato NUEVO aportado, no migrado.
  El backfill asumió "todos los sites Claro = NEA" — válido MVP litoral; revisar
  si entran sites de otras zonas.

#### Backlogs nuevos
- **BACKLOG-TENANT-2** — borrado definitivo de cellOwner (schema + Mongo $unset)
  cuando la integridad referencial haga el fallback del PDF código muerto.
- **BACKLOG-PDF-1** — humanizar el userId del exportador en el PDF forense (hoy
  muestra el ObjectId crudo "Operador (userId): 6a1ddc27...").
- **Integridad referencial en creación de sites** — diferida; obligatoria cuando
  haya UI de alta (validar operatorCode/zoneCode contra Operators/Zones para no
  crear sites huérfanos).

#### Método consolidado
- Seeds con modelos ESM (export default) bajo node directo: requieren
  `@babel/register` + `@babel/preset-env` (NO @nuxt/babel-preset-app — falla por
  polyfills core-js) + `NODE_PATH=<app>/node_modules` (resuelve dotenv/modelos).
  Patrón establecido esta sesión, reusable para todo seed futuro.
- Verificación de schema sin levantar backend: cargar el modelo bajo
  @babel/register e inspeccionar schema.paths / validateSync sobre datos reales.

#### Seguridad — RISK-SEC-1 (rotación diferida a producción)
AGREGAR al checklist de rotación dos cuentas que aparecieron en chat esta sesión:
- admin@wanomi.com (cuenta institucional Wanomi, superadmin)
- fsugamielecinetiksrl@gmail.com (cuenta personal, dueña de CR00061)
Patrón limpio de manejo de password en E2E (logrado en 28.4b): leerlo de archivo
temp (/tmp/.fr_pw) y borrarlo, NO inline en el comando.

#### Estado
- 6 commits, branch feature/telco-support. ARCH-1: base de tenancy COMPLETA
  (modelo + datos + migración). Falta solo 28.x (autorización por grants).
- Backend reiniciado durante la sesión (PID 97190, :3001 + :3000). Modelos ESM,
  kill directo nunca pkill -f.

#### Pendiente para próxima sesión
- **28.x — autorización por grants frescos de DB** (el sub-paso más delicado de
  ARCH-1): quitar grants del JWT, leerlos de DB, cambiar el filtro de los endpoints
  de {userId} plano a {userId OR alcance-del-grant} para dar visión global al
  superadmin Wanomi. Toca login (users.js) + el patrón de autorización de todos los
  endpoints que filtran por userId. Necesita datos multi-grant para validar. Cierra ARCH-1.
- Alternativa: BACKLOG-UI-1 restante (`_siteCode.vue`, vista detalle) si se
  prefiere cerrar UI antes de la autorización.
- Housekeeping menor: DeprecationWarnings de Mongoose no silenciados en seeds
  (sí en backend/motor edge desde #25).

### Sesión #29 — 2026-06-18 ✅ CERRADA (implementación — BACKLOG-ARCH-1 / sub-paso 28.x)
**Foco:** Área 2 — autorización por grants frescos de DB. Cierra ARCH-1.
**Formato:** implementación con reuniones de diseño puntuales (equipo Área 2 + Asesor Telco) + Franco decisor.

#### Naturaleza
Último sub-paso de ARCH-1, el más delicado (toca login y autenticación). Lleva el árbol de tenancy de "modelado" a "efectivo": el grant ahora controla quién ve qué. Tres sub-pasos de sustancia, reordenados respecto al plan de Claude Code (seed ANTES del helper, para validar el aislamiento con datos reales en vez de hacia adelante).

#### Sub-pasos completados
- **28.x.1** (`f994036`) — grants fuera del JWT. El token firmaba el doc Mongoose completo, congelando permisos 30 días. Ahora `/login` firma solo identidad `{_id, email}`; `checkAuth` lee grants frescos de DB cada request (`findById.select('grants').lean()`); nuevo `GET /me` devuelve identidad + grants (base de la Opción B / DEC-REF-32). Casos: user inexistente→401, error DB→500 (distinguidos), grants ausente→[]. `require().default` (sin precedente de import ESM en middlewares). E2E 7 casos.
- **28.x.2** (`0425840`) — seed `cellowner-nea@wanomi.test`, grant `{role:"cellowner", scope:{operatorCode:"claro", zoneCode:"nea"}}`. Necesario para validar aislamiento (el superadmin que ve todo no lo ejercita). Pre-flight aborta si falta Operator/Zone; idempotente en dos niveles. E2E 4 casos: `/me` devolvió el primer grant CON scope (revalida 28.x.1).
- **28.x.3** (`6f1515d`, docs `72742bd`) — helper `scopeFilterFor`/`buildReadFilter` + 7 reads migrados. Filtro pasa de `{userId}` a `{userId OR alcance-del-grant}`. Helper puro y centralizado (DEC-REF-33). E2E 7 casos, aislamiento en AMBAS direcciones: cellowner-nea ve los 4 sites Claro/NEA que NO son suyos; outsider sin grant ve 0 (no los de Claro); gate niega con 404; forensic `$in` sirve el evento al autorizado; `/sites/status` cross-verificado contra Mongo directo.

#### Decisiones registradas
- **DEC-REF-32** (`cc200ed`) — frontend obtiene grants vía `GET /me`, no del JWT ni del response del login (Opción B). Consumo diferido a BACKLOG-TENANT-1.
- **DEC-REF-33** (`72742bd`) — autorización en el gate del Site; derivados confían en el gate (punto único centralizado en `buildReadFilter`). Elegido sobre defensa en profundidad (premature hardening). Gatillo de revisión: si un refactor afloja/duplica el gate, vuelve a la mesa.

#### Hallazgos clave
- **El join Site→derivadas es por siteCode STRING:** `notifications.siteId` y `forensicevents.siteId` guardan el siteCode (string), no un ObjectId. El nombre `siteId` es engañoso. Simplifica el `$in` (sin mapear ObjectIds). Verificado en vivo.
- **Composición `$or:[{userId}, scope]` — el grant SUMA, no reemplaza:** el dueño sigue viendo lo suyo vía userId; el grant agrega visibilidad. Superadmin (`{}`) descarta el userId (ve todo). Sin grant (`null`) → solo `{userId}`.
- **Tokens de E2E firmados directo** (`jwt.sign` con JWT_SECRET) sin passwords — válido porque el test valida reads, no el flujo de login (cubierto en 28.x.1/2).

#### Seguridad — RISK-SEC-1 (rotación diferida a producción)
AGREGAR al checklist: `cellowner-nea@wanomi.test` / `cellownerNEA-dev-2026` (password de dev, en `origin` desde `0425840`). Coherente con la decisión vigente (credenciales de dev en repo, rotar en pasaje a producción).

#### Backlog nuevo
- **BACKLOG-PERF-1** — índices faltantes: `notifications.siteId` y `sites.operatorCode`/`zoneCode` → COLLSCAN. Irrelevante con 4 sites/24 notifs; pesa al entrar el 2º operador o crecer notifs.

#### Estado
- ARCH-1 **COMPLETO**: árbol de tenancy modelado, datos migrados, Y autorización efectiva. 28.x.4 (writes) nunca fue del MVP → BACKLOG-TENANT-3.
- 5 commits de #29 (`cc200ed`→`6f1515d`), pusheados a `origin/feature/telco-support`.
- Backend levantado durante la sesión; build de Nuxt necesario para E2E (lección reconfirmada).

#### Próximo foco (decidido con el equipo)
- **#30 → BACKLOG-ARCH-3** (acceso a históricos con filtrado por grants). Razón: capitalizar el helper de scope mientras está fresco. NOTA DE ALCANCE: ARCH-3 son DOS piezas — (a) mecanismo de traída desde el edge (DEC-ARCH-2: el crudo vive en el edge, NO en Mongo central) = diseño nuevo sin resolver; (b) endpoint con filtrado por grants = reusa `buildReadFilter` directo. El recon de #30 NO debe asumir que es solo "agregar un filtro a una query existente".
- Candidatos diferidos: BACKLOG-UI-2 (pin/feed en vivo — arrastra construir la rama de eventos de DEC-REF-30 primero), BACKLOG-ARCH-2 (pull de RulePacks).
