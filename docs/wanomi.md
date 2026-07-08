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

### Sesión #30 — 2026-06-19 ✅ CERRADA (implementación — BACKLOG-ARCH-3)
**Foco:** Área 2 — acceso a históricos gobernado por grants. Cierra ARCH-3.
**Formato:** implementación con reuniones de diseño de Área 2 (Backend Senior, Ing. Software Senior, Integración OSS/BSS, Frontend Vue) + panel ampliado consultado para retención de datos + Franco decisor.

#### Naturaleza
Tercer y último backlog hijo de ARCH-1. **Reframe clave de apertura:** el histórico crudo NO está hoy en el edge — el Hub físico aún no existe; vive en la Mongo central, persistido vía saver-webhook. ARCH-3 construye el mecanismo DEFINITIVO de servir históricos por consulta filtrada por grants, con la Mongo central como primera fuente enchufable detrás de una costura limpia — el Hub será un adaptador futuro sin reescritura. Tres sub-pasos atómicos, un commit por sub-paso.

#### Sub-pasos completados
- **30.1** (`4fe7175`) — `resolveScopedDIds(req)` en `scope.js`: traduce grants → set de dIds permitidos, materializado sobre `Device` (que tiene `userId` Y `siteId`), reusando `scopeFilterFor` (DEC-REF-33, single point of authorization). Casos: superadmin → `Device.distinct('dId')`; sin scope → propios; con grant → `$or` de propios y devices de los sites del scope. Validado E2E 5/5 con caso de exclusión cross-tenant (Site+Device efímeros `operatorCode='movistar'/zoneCode='noa'` — cellowner-nea NO ve ese dId). Sin migración de datos, sin índice nuevo.
- **30.2** (`43083fe`) — costura `historyProvider` en `services/`: `query({dId, variable, sinceMs})` sin autorización (vive ARRIBA, DEC-REF-33). Mañana se le cambia la fuente (Hub remoto, pre-agregados, hybrid) sin tocar callers. Gate temporal `hasDataGate(userId, dId, variable)` por `Data.findOne` como andamiaje — refactor INVISIBLE (respuesta byte-idéntica a la previa). Opción B (gate por Data) elegida sobre Opción A (gate por Device) para preservar invisibilidad literal en el caso huérfano. Catch sin tocar, sin reformateos cosméticos.
- **30.3** (`237a8c5`, DEC-REF-34) — swap del gate temporal al definitivo: `resolveScopedDIds` (puro scope de grants, sin componer `userId` del caller — eso reintroduciría el ownership que ARCH-3 vino a sacar). Cambio de conducta DELIBERADO. E2E 12/12 (6 casos × 2 endpoints) con device efímero `EFEM-CLARO-CN15` (Claro/NEA, `userId=Wanomi`): cellowner-nea ve por grant; **personal sin grant NO ve** (separación de roles probada — caso ★).

#### Hallazgos clave
- **Reframe de DEC-ARCH-2:** la decisión restringe lo que cruza al NOC (resumido), NO dice que el histórico viva hoy en el edge. El crudo está en Mongo central vía saver-webhook; el Hub físico es Fase 4 (WN-H1-TELCO). Construir el mecanismo definitivo con la fuente actual como adaptador, NO diseñar un pull-desde-edge contra un Hub inexistente.
- La pregunta "¿el Hub entrega crudo o resumido?" YA estaba resuelta en la doc: dos flujos opuestos — al NOC sube resumido (DEC-ARCH-2 / DEC-REF-19), el cellowner consulta crudo a pedido filtrado por grants (nota de alcance ARCH-1). No era pregunta abierta.
- **Caso huérfano de 30.3 NO es retención:** el dato no se borra, solo no se muestra en el drill-down del aparato borrado. Visibilidad ≠ existencia del dato. Coherente con DEC-REF-33 (grants = fuente única de verdad de visibilidad).
- **El E2E prueba el MECANISMO de separación de roles sobre device efímero**; sobre datos reales NO muerde aún por BACKLOG-TENANT-4 (devices de Claro con `userId=personal`). El día que se ejecute TENANT-4, ARCH-3 discrimina sobre datos reales sin tocar código.

#### Backlogs nuevos
- **BACKLOG-TENANT-4** — devices de Claro con `userId` = cuenta personal de Franco; anula la separación de roles de 28.3 en la práctica. Expuesto por 30.1 caso #2 (personal-sin-grant → mismos dIds que cellowner-nea sobre el dataset real). Fix: migrar `userId` a cuenta de servicio/superadmin, paralelo a la migración de sites de 28.4a (probablemente un solo barrido). Disparador: antes de producción o antes del 2º operador — lo que llegue primero.
- **BACKLOG-DATA-RETENTION** — falta política de retención formalizada (buffer 30–90 días del Hub, histórico para predicción DEC-PRED-1, cadena forense inmutable DEC-HMAC-1 / DEC-FORENSIC-2). Regla dura: el dato forense no se borra jamás. Requiere panel ampliado (Hardware, Asesor Telco, Big Data / Data Analyst, Cellowner). No urgente para el piloto.

#### Estado
- 3 commits de #30 (`4fe7175` → `43083fe` → `237a8c5`). Branch `feature/telco-support` 3 commits adelante de origin. **SIN PUSH** — el gatillo de push sigue requiriendo autorización explícita de Franco.
- DEC-REF-34 registrada en `docsRefactor/WanomiRefactor.md` (después de DEC-REF-33, antes de la nota de alcance ARCH-1).
- ARCH-3 **COMPLETO**: helper de resolución + costura limpia + gate de grants efectivo. Toda la familia ARCH-1 / -3 cerrada.

#### Seguridad — RISK-SEC-1
Sin cambios — rotación de credenciales sigue diferida a producción. El gatillo de rotación al pasar a producción sigue vigente.

#### Pendiente para próxima sesión
Franco prioriza al abrir #31 entre los backlogs disponibles:
- **BACKLOG-ARCH-2** — pull de RulePacks (mecanismo de distribución diferido desde #27).
- **BACKLOG-UI-3** — vista de históricos en el frontend (ahora con backend listo).
- **BACKLOG-UI-2** — pin/feed en vivo (arrastra rama de eventos de DEC-REF-30).
- **BACKLOG-EDGE-4** — heartbeat/staleness (silencio total del stream — corolario de DEC-REF-26).
- **BACKLOG-TENANT-4** — migración de `userId` de devices de Claro (separación de roles efectiva).
- **BACKLOG-DATA-RETENTION** — política formal de retención (requiere panel ampliado).

### Sesión #31 — 2026-06-19 ✅ CERRADA (implementación — BACKLOG-UI-3, frente backend)
**Foco:** Área 2 — migrar la familia device + template + enrichments a grants (alcance A). Cierra el backend que UI-3 necesita.
**Formato:** implementación con reuniones de diseño de Área 2 (Backend Senior, Ing. Software Senior, Integración OSS/BSS) + Franco decisor.

#### Naturaleza
Continuación de ARCH-1: 28.x.3 migró 7 reads a grants pero dejó afuera la familia device/template/enrichments (filtraban por `userId` plano). El cellowner-nea veía sus sites (por grant) pero NO sus devices, ni plantillas, ni reglas. UI-3 (vista de históricos con nombres legibles vía `template.widgets`, DEC-47) exige el backend cerrado primero (cimientos antes de amoblar, DEC-REF-28). Alcance A: migrar device + template + enrichments completos antes de tocar frontend. Tres sub-pasos atómicos, un commit por sub-paso.

#### Sub-pasos completados
- **31.1** (`2c8c40e`) — `GET /device` → `buildReadFilter(req, 'Device')`. Migración mínima (1 import + 1 línea): filtro pasa de `{userId}` plano a `{userId OR scope}`. `scopeFilterFor` ya cubría 'Device' (misma rama que Notification/ForensicEvent, ejercitada en 30.1). E2E 4/4 con exclusión cross-tenant: cellowner-nea ve sus 10 dIds Claro/NEA por GRANT (no ownea ninguno), NO un device efímero claro/noa (★ corte por zona). Enrichments salieron vacíos — esperado, se migran en 31.3.
- **31.2** (`d79237d`) — `GET /template` → grants. Recon reveló que Template NO es migración chica: no tiene `siteId` ni tenencia propia (es un molde compartido). Rama nueva `'Template'` en `scopeFilterFor` que resuelve Site→Device→Template (dos saltos; el scope vive en el Site) y devuelve `{ _id: { $in: tplIds } }` con guarda `ObjectId.isValid`. Hallazgo: `Device.templateId` es string hex, `Template._id` es ObjectId → join requiere conversión. Endpoint standalone (sin gate de Site arriba) por eso necesita rama propia, sin contradecir DEC-REF-33. E2E 4/4: cellowner-nea ve sus 4 templates (por sus devices visibles), NO el efímero claro/noa (★ corte propagado Site→Device→Template). `mongoose` agregado a imports de scope.js.
- **31.3** (`5a86963`) — los 4 enrichments (`getSaverRules/getTemplates/getAlarmRules/getRules` + global.getRules en rules.js) migran de `find({userId})` a filtrar por la lista de devices ya autorizada: `{dId: {$in: dIds}}` (saver/alarm/rules) y `{_id: {$in: tplIds}}` (template). Patrón DEC-REF-33: el gate resuelve los devices visibles una vez; los enrichments confían, no reimplementan scope. Hallazgo del recon: hoy traían TODA la base del caller y repartían en memoria por `dId` — el `userId` era el filtro de seguridad implícito. `getRules` cross-module (global) tiene un solo caller → cambio de firma safe. E2E 4/4 con fixtures positivos (reglas efímeras del userId personal colgadas de un device REAL → cellowner las ve por su DEVICE, no por ownership: template/saverRule/alarmRules/rules POBLADOS, inverso de 31.1) Y negativos (reglas en device claro/noa → NO visibles). Teardown verificado 0 residuos por `countDocuments` (riesgo alto: positivos colgaban de device real).

#### Hallazgos clave
- **Template no tiene tenencia propia:** es un molde compartido por devices de muchos sitios/zonas. Su visibilidad es DERIVADA del device que lo referencia, no propia. Descartado denormalizar `siteId`/`zoneCode` al schema (rompe la naturaleza compartida + dato falso, contra DEC-STRAT-2).
- **`Device.templateId` (string hex) vs `Template._id` (ObjectId):** el join requiere `ObjectId(device.templateId)` con guarda `isValid`. El enrichment actual (`devices.js:59-61`) joinea con `==` flojo que funciona por coerción accidental, no por diseño.
- **Filtro de seguridad implícito en los enrichments:** traían toda la base del `userId` del caller y repartían en memoria. La migración a `{$in: dIds}` además de arreglar la autorización reduce el volumen traído (solo lo de los devices pedidos).
- **Endpoint standalone vs derivado:** Template juega dos roles según el endpoint. En `GET /site/:siteCode/full` es derivado (suelta userId, confía en el gate del Site, DEC-REF-33). En `GET /template` standalone es recurso primario → necesita rama propia de scope. No hay contradicción.

#### Backlog nuevo
- **BACKLOG-API-1** — hardening de los enrichments de `/device` (registrado en WanomiRefactor.md §5b). Dos concerns deferidos de 31.3 por single-concern: (1) normalizar retornos de error de los 4 helpers a `[]` (`false`/`"error"`/`[]` inconsistentes → `.filter()` sobre no-array tira TypeError → 500, latente); (2) fix del `==` flojo en el template join (ObjectId↔string coerción accidental) + `===` en los 3 joins por `dId`.

#### Cleanup cosmético pendiente
- `console.log(templates)` en `templates.js` (dejado intacto por single-concern en 31.2).
- `const userId` huérfano en el handler `GET /device` (sin uso tras 31.3; dejado por no ser del concern).

#### Estado
- Alcance A COMPLETO: device + template + enrichments migrados a grants. El cellowner-nea recibe sus devices Claro/NEA con plantilla legible y reglas pobladas — cimientos de UI-3 listos.
- 3 commits (`2c8c40e` → `d79237d` → `5a86963`), **pusheados** a `origin/feature/telco-support` (`adcfc9d..5a86963`).
- Backend en punto de corte limpio. NO se introdujeron DEC-REF nuevas (todo es aplicación de DEC-REF-33).
- Build de Nuxt necesario para cada E2E (serverMiddleware — lección reconfirmada).

#### Próximo foco
- **#32 → 31.4 (frontend de UI-3):** `historyClient.js` (JS plano, migrable DEC-STACK-1) + `HistoryChart.vue` presentational (Highcharts) + `pages/history.vue` standalone (selectores site→device→variable→preset de rango). Selector de variables desde `template.widgets` filtrado por `variableType` (excluir booleanas), mostrando `variableFullName` + unit.
- **Decisiones aparcadas para abrir en 31.4:** (a) selector template-only vs híbrido (cruzar con `data.distinct` para ofrecer solo variables con historia real — evita gráficos vacíos); (b) destino de BACKLOG-TENANT-5 (repurpose con contenido nuevo o ID nuevo — quedó ambiguo tras la reversión de su contenido original en la apertura de #31).

### Sesión #32 — 2026-06-21 ✅ CERRADA (implementación — BACKLOG-UI-3, frente frontend)
**Foco:** Área 2 — cerrar UI-3 end-to-end conectando los 3 archivos nuevos del frontend al backend gobernado por grants (cerrado en #31). Sub-paso 31.4.
**Formato:** implementación con Área 2 (Frontend Vue al frente + Backend Senior + Ing. Software Senior + Integración OSS/BSS) + decisión de presets con Asesor telco Área 1 + Confiabilidad + Franco decisor.

#### Naturaleza
Cierre del BACKLOG-UI-3 (la vista de históricos para el cellowner). El backend quedó listo en #31 (alcance A: device + template + enrichments por grants). #32 construye los 3 archivos del frontend en orden de pieza más reusable a pieza más integradora: módulo de fetch puro → componente presentational → página con selectores en cadena. Tres sub-pasos atómicos + 1 fix de store + 1 ajuste de presets (decisión de producto).

#### Decisiones abiertas de #31 resueltas
- **Selector de variables: template-only** (no híbrido con `data.distinct`). 3 voces de Área 2 alineadas (Backend Senior, Ing. Software Senior, Integración OSS/BSS): el híbrido obliga a endpoint nuevo + estado en cadena en el cliente para evitar un caso degenerado (variable declarada sin datos). En operación real, los devices Telco mandan lo que la plantilla declara. Coherente con DEC-47 (nombres legibles desde `variableFullName`); el caso degenerado lo cubre el cartel "Sin datos en este rango" del componente chart. **Formalizado como DEC-REF-35** sobre el código ya implementado en 31.4c (fija el invariante para futuras vistas: export, análisis, dashboards alternativos).
- **BACKLOG-TENANT-5 RETIRADO.** Contenido original (diferir enrichments) fue revertido en la apertura de #31 e implementado en 31.3; el ID quedó con historia contradictoria y NO se reutiliza (línea-lápida explícita). Resuelve la ambigüedad de `wanomi.md:2041`. Próximo backlog de tenancy usa **-6** (no -5). Lección consolidada: IDs mencionados en conversación NO se reutilizan aunque nunca se hayan registrado formalmente — el rastro conversacional cuenta como "historia".

#### Sub-pasos completados
- **31.4a** (`013f680`) — `app/services/historyClient.js`: módulo de fetch puro (DEC-STACK-1, migrable Vue 3). `fetchHistory({axios, token, dId, variable, chartTimeAgo})` sin Vue, sin store, sin auth — el caller pasa token explícito. Refleja invisibilidad de DEC-REF-34: dId fuera de scope → `[]` sin throw. Dir nuevo `app/services/` (paralelo a backend `app/api/services/`). E2E 2/2 con login real (β: leer creds de env local, no jwt.sign), TEST_USER_EMAIL/PWD agregados a `.env`.
- **31.4b** (`91425b7`) — `app/components/HistoryChart.vue`: componente presentational, sin fetch, sin auth, sin saber del backend. 4 estados mutuamente excluyentes (loading/error/empty/data). Highcharts (consistencia con `Rtnumberchart.vue`, ya instalado via `nuxt-highcharts`), envuelto en `<client-only>` (SSR safety). Compensación timezone preservada. Decisión (a) sobre unit en eje Y (sin label, unidad embebida en `variableFullName`) — 4/4 voces alineadas; `widget.unit` separado es BACKLOG si aparece necesidad. Validación visual con `pages/test-history.vue` descartable (borrado pre-commit, no afectó `test.vue` tracked).
- **store fix** (`7a22a70`) — `app/store/index.js`: `getDevices` action ahora retorna la promesa del axios → dispatch awaitable. Cambio mínimo (1 palabra). Los 11 callers existentes son fire-and-forget, cero regresión. Pre-requisito de 31.4c para serializar la carga inicial.
- **31.4c** (`5c5d1ad`) — `app/pages/history.vue`: página standalone con selectores en cadena (site → device → variable → rango). `el-select` (Element UI, patrón vivo en `DashboardNavbar.vue` + `templates.vue` — import + registro local por componente, NO global). v-model a primitivos (siteCode, dId, variable slug), objetos derivados por computed. Guard de coherencia en `fetchHistory` (anti-timing de watchers). `mounted()` con `Promise.all([axios /site, dispatch getDevices])` — espera AMBOS antes de habilitar UI, evita "dropdown vacío fantasma". Permisos NO reimplementados en cliente (DEC-REF-33).

#### Decisión de producto — presets de rango
Set decidido con Asesor telco Área 1 + Confiabilidad + Área 2: **1h / 24h / 7d / 30d**. 90d+ NO entra al selector — es uso de análisis (Confiabilidad), va a backlog (BACKLOG-UI-5). Costo técnico nulo: 1 línea en `rangePresets`, sin cambios en historyClient/HistoryChart/backend. Coherente con DEC-STRAT-2 (producto, no demo): los presets están dimensionados al flujo operativo esperado en producción, no a sembrados puntuales del simulador.

#### Hallazgos clave (recon que evitó daños)
- **Llave `device.siteId == site.siteCode`** (string, no ObjectId; nombre engañoso "siteId" guarda siteCode). El recon lo confirmó comparando dos `printjson` reales — no de memoria. Misma llave usada en `scope.js` para Notification/ForensicEvent/Device desde 28.x.3.
- **`el-select` registro por-componente, NO global.** El primer recon vio el USO en `templates.vue` pero no el REGISTRO. El micro-recon vio `DashboardNavbar.vue:109` (`import { Select, Option } from 'element-ui'` + `[Select.name]: Select`) — patrón establecido. El primer intento sin imports renderizó solo `<label>` (silencioso, ningún error de servidor). Lección: recon de USO ≠ recon de REGISTRO.
- **`seed.js` del simulador es bootstrap de tenancy**, NO generador de muestras (`run.js` lo es). Correr `seed.js` con la tenancy de #29-31 ya armada habría chocado con unique constraints o duplicado bindings. Descartado tras el recon. Para datos frescos del gate visual: seed ad-hoc mínimo (`seeds/_dev/_seed_fresh_data.js`, 7 muestras una por hora dentro de 24h, valores variados, idempotente).
- **Build de Nuxt obligatorio** tras cada cambio en `pages/`, `components/`, `services/`, `store/`. El gate visual del preset "30 días" falló inicialmente por bundle stale (compilado 26 min antes del edit). `timestamps de .nuxt/dist vs archivo` es el diagnóstico rápido.
- **`dispatch('getDevices')` no era awaitable** (action sin `return`). Diagnóstico previo al diseño de `mounted()` evitó dropdown-vacío-fantasma sin serializar la carga inicial. 11 callers fire-and-forget verificados antes de tocar el store.

#### Validación
Gate visual real (no inyección de rango como en 31.4a) con fixture honesto: cellowner-nea logueado, `/history`, cadena de 4 selectores funcionando, chart con 7 puntos en preset "24h", reseteo correcto al re-elegir site. Cross-verificado con `chartTimeAgo` viajando entre presets. Sin errores rojos de consola (los del shell scaffolding ya identificados en 31.4b como ruido).

#### Decisión registrada
- **DEC-REF-35** — formaliza el invariante de "selectores de variables salen de `template.widgets`, no de slugs crudos". Registrada sobre código ya implementado (31.4c); las próximas vistas que listen variables al usuario lo heredan sin debate. Bump WanomiRefactor.md 0.9 → 0.10.

#### Backlog nuevo
- **BACKLOG-UI-4** — link de navegación a `/history` en el sidebar. Acceso por URL directa en el MVP; el sidebar/menú principal queda como sub-paso aparte cuando se defina el layout completo del cellowner. (Registrado en WanomiRefactor.md §5c.)
- **BACKLOG-UI-5** — vista de análisis / export de largo plazo (ventanas 90d+, MTBF, degradación multi-mes). Justificación: Confiabilidad (Área 1) — el análisis de largo plazo es uso distinto del histórico operativo, pide export no preset en chart de línea simple. Disparador: cuando exista rol de confiabilidad consumiendo datos. (Registrado en WanomiRefactor.md §5c.)

#### Estado
- BACKLOG-UI-3 **COMPLETO**: backend (alcance A, cerrado en #31) + frontend (alcance B, esta sesión). El cellowner-nea ve sus históricos de Claro/NEA por grant, con nombres legibles, en el preset que elija.
- 4 commits (`013f680` → `91425b7` → `7a22a70` → `5c5d1ad`). Branch 4 commits adelante de origin. **SIN PUSH** — el gatillo sigue requiriendo autorización explícita de Franco.
- DEC-REF-35 nueva (única decisión arquitectural de la sesión); el resto fue aplicación de DEC-47, DEC-REF-33/34, DEC-STACK-1, DEC-STRAT-2. Versión WanomiRefactor.md bumpeada a 0.10.
- 2 archivos descartables en `seeds/_dev/` (gitignored, no commiteables): `_test_historyClient.js` (harness 31.4a) y `_seed_fresh_data.js` (fixture gate visual).

#### Cleanup cosmético pendiente
- `console.log(templates)` en `templates.js` (heredado de #31).
- `const userId` huérfano en handler `GET /device` (heredado de #31).

#### Próximo foco
Franco prioriza al abrir #33 entre los backlogs disponibles:
- **BACKLOG-UI-4** — link sidebar a `/history` (chico, cierra UX del cellowner).
- **BACKLOG-API-1** — hardening enrichments `/device` (TypeError latente + `==` flojo de template join).
- **BACKLOG-ARCH-2** — pull de RulePacks (mecanismo de distribución diferido desde #27).
- **BACKLOG-UI-2** — pin/feed en vivo (arrastra rama de eventos de DEC-REF-30).
- **BACKLOG-EDGE-4** — heartbeat/staleness.
- **BACKLOG-TENANT-4** — migración `userId` de devices de Claro a cuenta de servicio.
- **BACKLOG-DATA-RETENTION** — política formal de retención.

---

## Sesión #33 — Área 2 · BACKLOG-TENANT-4 ejecutada (migración userId Claro → cuenta de servicio)

Objetivo: activar la tenancy construida en #28-32 sobre dato REAL. Hoy los sites y
devices de Claro "pertenecían" a la cuenta personal de Franco — la cerradura puesta,
la puerta abierta. Cerrada.

**Recon (DEC-PROC-2, dato de producción):** el barrido era sites + devices, no devices
solos — 28.4a nunca migró el userId de los sites (solo agregó operatorCode/zoneCode).
No existía cuenta de servicio. Catch 1: auditados TODOS los gates de lectura por userId
→ cero reads user-facing del cellowner cableados a mano; todo pasa por buildReadFilter
/resolveScopedDIds (DEC-REF-33 respetada). Catch 2: emqxauthrules embebe userId en el
topic/ACL y saver-webhook valida cruzado → riesgo de ingesta, NO cosmético → sacado del
alcance, diferido al paso 4 (BACKLOG-TENANT-6).

**Ejecución sobre dato real:** seed operator-claro (sin login, 401 confirmado) →
migrate (4 sites + 10 devices, backup + idempotente + resumible tras corrida parcial) →
ensayo de restore (undo probado: restore = pre-estado exacto, re-migrate = estado final)
→ E2E dos puertas. Resultado: TENANT-4 muerde sobre dato real. Fila de oro: mismo
recurso CR00061, cell 200 / Franco-personal 404 / super 200. Commits 483797e + ce53c6e,
sin push.

**Hallazgo abierto (BACKLOG-TENANT-7):** el E2E visual destapó que el select de
notificaciones del dashboard muestra contenido de Claro a la cuenta personal — un
endpoint sin gatear que se escapó al Catch 1. No es de 33.1; concern aparte, próximo a
reconnear. 33.1 cierra validada; la fuga queda registrada ABIERTA.

**Validación honesta:** tenancy probada sobre el gate de Site en ambas direcciones; el
positivo del path histórico por dId queda diferido al paso 4 (sin ingest hoy). Dashboard
sin widgets en los 3 usuarios = falta de ingest, NO tenancy (admin tampoco ve datos).

Rumbo: 33.1 cierra. Próximo: recon de BACKLOG-TENANT-7 (fuga de notificaciones).

#### Seguridad — RISK-SEC-1 (rotación diferida a producción)
Actualización #33: rotación de credenciales (JWT_SECRET + passwords dev cellowner/franco/admin) confirmada por Franco como DIFERIDA a producción — entorno dev/localhost, tokens solo válidos contra localhost, sin riesgo de credenciales acá. Lección de método incorporada: para E2E con credenciales, firmar JWT directo con JWT_SECRET (no pasar passwords por el shell).

---

## Sesión #34 — Área 2 · BACKLOG-TENANT-7 — fuga de tenancy en derivados (fix de raíz)

Continuación del hallazgo abierto de #33: la cuenta personal, sin grants ni sites/devices
tras TENANT-4, seguía viendo notificaciones y templates de Claro CON contenido.

**Diagnóstico (refutó la hipótesis inicial):** no fue "un endpoint que se escapó al Catch 1".
El endpoint (GET /notifications) SÍ usa buildReadFilter. La causa raíz es la rama
scope===null → {userId} del helper: para un usuario sin grants devuelve ownership, y los
derivados (notifs/templates) quedaron pegados al userId viejo (no migrados en TENANT-4 a
propósito). El ownership, que era inofensivo cuando todo era de la misma cuenta, se volvió
fuga al migrar el dueño de sites/devices pero no de los derivados.

**Decisión de producto antes del fix (Franco):** se eligió Camino B (fix de raíz, no parche
por endpoint) invocando DEC-STRAT-2 — producto, no demo. Recon estructural confirmó que el
"modo B2C standalone" (usuario sin operador con templates propios) existe en el CÓDIGO
(/register vivo, schemas permisivos) pero NO en el producto Wanomi 3.0 (ningún flujo crea
templates fuera de la cadena Site→Device→Template; template = catálogo por tipo de equipo,
DEC-REF-15). El fantasma estructural no bloquea el fix. Paréntesis de producto: se documentó
el flujo de uso real de Wanomi (catálogo de templates por Wanomi → onboarding operador →
survey de equipos por sitio → composición) y se registró BACKLOG-TENANT-8 (dueño de
templates = catálogo Wanomi).

**Fix (DEC-REF-37, commit 00b397a):** centinela DENY para los 3 derivados sin tenencia propia
(Notification, Template, ForensicEvent → 0-match en vez de ownership). Site y Device conservan
{userId}. ForensicEvent incluido por defensa en profundidad (dato forense). resolveScopedDIds
intacto. E2E sobre dato real: fuga cerrada (franco 24→0 notifs, 4→0 templates), legítimo
preservado (cell 18 notifs + 4 templates por grant), sin regresión en site/device.

**Método:** recon estructural antes de diseñar (DEC-PROC-2) — Franco frenó el diseño dos veces
para confirmar estructura ("¿quién es un B2C sin sites? ¿cuándo se crea un template?") antes de
comprometer el fix, evitando re-litigar la decisión de Template ya tomada en #31. Restart de
Express obligatorio (serverMiddleware no hot-reloadea) — verificado que el E2E corrió contra el
código nuevo.

TENANT-7 cerrado de raíz. Pendiente del rumbo: simulador (paso 2-4), frontend pulido (paso 3).

#### Higiene #34b — correcciones de registro

Tres puntos cerrados con recon read-only, sin tocar código ni base:

**1. Corrección del mapa de brecha MVP↔código (auditoría inicial sobrevalorada).**
MVP-4 (motor de reglas + RulePacks ~40) NO es PARCIAL como dije en la auditoría inicial,
sino **NO-EMPEZADO** como código vivo. `tools/device_simulator/lib/sensor-engine.js` es
**motor de GENERACIÓN de muestras** (autónomo, funciones puras: `initialSecState/Gen/
Ats/CumminsState`, `evolve(...)`, `SCENARIOS`), NO motor de EVALUACIÓN de reglas. Las 24
notifications con `source:"edge-engine"` en DB (ruleIds `cummins-A1-oil-pressure`,
`cummins-G2-fuel-critical`, `__test-C3`) son **fixtures de sesiones previas**, NO salida
de un motor corriendo HOY. RulePacks en DB: 1 (`cummins-pcc-v1`, 4 rules vs ~40 target).
Veredicto correcto: motor de evaluación de reglas pendiente de implementación
(probable destino Hub-side, coherente con DEC-ARCH-1).

**2. Estado del simulador post-#33/#34 (mejor de lo temido).**
`run.js` **FUNCIONAL**: el bootstrap de cada device pasa por `POST /api/getdevicecredentials`
(`webhooks.js:39`), que hace `Device.findOne({dId})` y devuelve `topic: device.userId + "/" + dId + "/"`.
Como TENANT-4 puso los 10 devices con `userId=SERVICE`, el simulador automáticamente
publica bajo el namespace correcto sin necesidad de saber quién es SERVICE — el backend
resuelve la identidad fresca por device. La migración fue **transparente al ciclo de
publicación**. Esto implica que **BACKLOG-TENANT-6 (trío de ingesta) revisa a la baja**:
el path de publicación ya resuelve identidad por device en cada bootstrap, menos
acoplado de lo temido. `seed.js` sigue ROTO (re-seedeo desde cero) — registrado en
**BACKLOG-SIM-2** (no bloquea el piloto).

> **CORRECCIÓN (#35, recon sub-paso 2):** el punto 2 de arriba ERA INCORRECTO.
> BACKLOG-TENANT-6 NO está revisado a la baja. La nota de #34b solo verificó un lado del
> path (`getdevicecredentials` resuelve `userId` fresco), pero NO verificó los
> `emqxauthrules`: los 10 devices Claro conservan ACL con `userId=PERSONAL`
> (publish/subscribe a `PERSONAL_ID/dId/...`), mientras `device.userId=SERVICE` y
> `getdevicecredentials` entrega `topic: SERVICE_ID/dId/`. Al publicar, EMQX rechazaría
> por ACL violation (topic entregado ≠ topic permitido). Además, el frontend del
> cellowner se suscribe a su PROPIO `userId`, pero el dato sale por `SERVICE_ID` —
> namespaces que no se cruzan (problema de modelo de suscripción incompatible con
> multi-tenancy, no solo de ACL). Conclusión correcta: BACKLOG-TENANT-6 es BLOQUEANTE
> del dato vivo (sub-paso 2 de `_siteCode.vue`) y se ataca en #35. Evidencia: 0 muestras
> en última hora, última muestra hace ~4 días (pre-TENANT-4), simulador apagado — el gap
> no se manifestó antes porque nada publicó desde la migración.

**3. Asterisco password del simulador — VERIFICADO falso positivo.**
`.env.simulator` (gitignored, dev-only) usa `USER_EMAIL=fsugamiele@gmail.com` con una
password en claro. Hash bcrypt comparado contra `admin@wanomi.com`: **DIFIEREN**
(`$2b$10$...0pYxSFBa` vs `$2b$10$...MIW1A3h.`, salts distintos). Son cuentas distintas
con hashes distintos. La coincidencia visual del 6 dígitos que me llamó la atención no
es evidencia de credencial compartida. **`.env.simulator` con password en claro sigue
cubierto por RISK-SEC-1 (rotación diferida a producción, dev/localhost)** — sin cambios.

**Método #34b**: lección de #33 aplicada — NO se ejecutó login para verificar passwords,
sólo se compararon hashes en DB (read-only). Cero credenciales expuestas en transcript.

---

## Sesión #35 — Área 2 · Auditoría de brecha + vista detalle de site (sub-paso 1) + TENANT-6 (dato vivo)

Sesión larga, tres arcos encadenados. Hilo conductor: DEC-STRAT-2 (producto, no demo).

**1. Auditoría de brecha MVP↔código (camino A, decisión de Franco).** Ante la pregunta
"¿qué falta para cumplir las decisiones estratégicas?", se hizo recon estructurado read-only
de los 9 puntos del MVP (§4) + pilares (§1). Resultado: ~55% software construible (Área 2),
~35% hardware/survey (Áreas 1/3, correctamente diferido), ~10% marketing. Hallazgo: el "flag
source en el dato" que Claude propuso como urgente YA estaba decidido (BACKLOG-EDGE-1: va con
el driver Modbus, no antes) — la auditoría DEVOLVIÓ al rumbo de #32, confirmándolo como
correcto en vez de abrir trabajo nuevo. Lección: auditar antes de proponer; la "urgencia" del
flag source era falsa para el estado actual (dato simulado, no físico forense).

**2. Vista detalle de site — sub-paso 1: la foto (commit 9cde3b4).** Creado `_siteCode.vue`
(ruta /sites/:siteCode): mapa Leaflet con marcador por severidad (STATUS_COLOR, DEC-REF-27) +
card por device con templateName y variables declaradas (placeholder "—"). Manejo de 404/
sin-acceso presentable (DEC-REF-37). Link desde index.vue ya existía. Validado E2E en navegador
(cellowner: foto completa 4 cards; franco: mensaje sin-acceso sin crash). Diseño de 3 sub-pasos
acordado con equipo: foto → estado vivo (componente liviano de valor-vivo, NO widgets pesados;
incluye widget categorical, estado "esperando dato" con ícono atenuado) → feed de alarmas.
Sub-pasos 2 y 3 pendientes.

**Hallazgo de entorno crítico:** el frontend corre en PRODUCCIÓN (`nuxt start` desde
docker_compose_production.yml), NO dev. Todo cambio de página requiere REBUILD
(`docker_nuxt_build.yml up` → `docker restart node`), no solo restart. El restart-solo
alcanzaba para backend/serverMiddleware — por eso no había mordido hasta tocar una página.
Corrige un supuesto que Claude tenía mal. `app/dist/` es artefacto muerto (nuxt generate viejo,
no se sirve) — limpieza diferida.

**3. TENANT-6 — dato vivo del cellowner (DEC-REF-38, commits 7111235/edc7bd1).** El bloqueante
del sub-paso 2. Resultó ser CUATRO piezas, no tres (la 4ta descubierta en el E2E). Decisión de
modelo: ACL MQTT B-narrow α-estricta (la llave exacta) sobre B-broad (descartada por fuga de
tenancy futura) y β (descartada por fuga de CONTROL vía /config) — equivalente broker de
DEC-REF-37. Piezas: (1) ACL device PERSONAL→SERVICE: NO migrada, auto-resuelta por self-heal de
getDeviceMqttCredentials al primer bootstrap (verificado E2E: 0→10 ACL bajo SERVICE); (2) ACL
web-user B-narrow vía helper nuevo resolveScopedDIdsWithOwner + getWebUserMqttCredentials (ambos
paths); (3) frontend default.vue suscribe a namespaces de devices visibles (no a auth_userId),
con await getDevices reemplazando setTimeout mágico + watch de refresh dinámico + re-subscribe
en reconnect (clean:true) + quita namespace propio (decisión de escala de Franco). E2E sobre
dato real: cellowner recibe delta MQTT del namespace SERVICE en consola (piezas 2+3 validadas);
franco sin grants no recibe nada (no-fuga). 4ta pieza (saver rules → persistencia) desglosada
como BACKLOG-TENANT-9 — NO afecta dato vivo, sí históricos.

**Higiene #34b (commits previos + correcciones):** mapa de brecha corregido (MVP-4 motor de
reglas = NO-EMPEZADO como código vivo, no PARCIAL); BACKLOG-SIM-2 (seed simulador roto post
multi-tenant); nota errónea de #34b corregida (TENANT-6 NO estaba "a la baja"); asterisco
password simulador = falso positivo verificado. Registros nuevos: DEC-REF-38, BACKLOG-TENANT-9
(saver rules), BACKLOG-UI-6 (dashboard no renderiza widgets + pista SyntaxError), BACKLOG-SIM-2.

**Método:** recon read-only antes de cada diseño (DEC-PROC-2), reiteradamente atrapó supuestos
falsos (self-heal, 4ta pieza, flag source ya decidido). Franco frenó dos veces pidiendo
explicación sin tecnicismos antes de aprobar decisiones de arquitectura (B-narrow, pieza 3) —
y en una (namespace propio a escala) su pregunta cambió la recomendación del equipo. Simulador
encendido solo para el E2E final, apagado después.

**Pendiente del rumbo:** sub-paso 2 vista de site (componente valor-vivo, cañería ya lista) →
sub-paso 3 (feed alarmas). Backlogs activables: TENANT-9 (persistencia, cuando se necesiten
históricos Claro), UI-6 (dashboard, si bloquea demo).

## Sesión #36 — Área 2 · Vista detalle de site: sub-paso 2 (valor vivo por variable)

Sesión de ejecución con un diagnóstico de campo en el medio. Hilo: DEC-STRAT-2 (producto, no demo).

**1. Sub-paso 2 construido y validado (commit `bc9ceca`).** Componente `LiveValue.vue` (nuevo) +
integración en `_siteCode.vue` — reemplaza el placeholder "—" del sub-paso 1 por el valor vivo
por variable, dentro de las cards existentes. Patrón `$on` clonado de `Rtnumberchart.vue`
(topic `{owner}/{dId}/{variable}`, escucha `topic+"/sdata"`, `$off` en `beforeDestroy`; se
descartó el cuerpo del chart y el `getChartData` de histórico). Tratamiento por tipo:
float/int = número + unidad, bool = Activo/Inactivo genérico, categorical = **verbatim**.
Estado "esperando dato" = spinner atenuado (ver punto 3). Validado E2E sobre dato real
(cellowner, CR00061 y CR00073: floats con decimales acotados, categóricos "AUTO"/"STOPPED"/
"normal", bools, spinner mientras espera). 103 inserciones, 3 borrados, sin Co-Authored-By.

**El recon corrigió varios supuestos de memoria (DEC-PROC-2 atrapó cada uno):**
(a) `app/components/DevicePanel.vue` NO existe — el real es `Simulator/DevicePanel.vue`, sólo
lo usa `pages/demo/simulator.vue`; el "mapa de labels DevicePanel:374-389" del arranque
apuntaba a un componente que la vista de site no consume. (b) `app/serverMiddleware` NO existe
— el equivalente es `app/api/middlewares/scope.js`. (c) El template NO trae `unit` ni
`decimalPlaces` (shape de 4 campos: `variable`/`variableFullName`/`variableType`/
`variableSendFreq`); la unidad va embebida en el paréntesis del `variableFullName` ("Nivel
combustible (%)") y se parsea con la misma convención que `Simulator/DevicePanel.vue:369`.
(d) Los 3 widgets categóricos (`transfer_state`, `gen_status`, `vibration_signature`) NO traen
`states[]`/`labels{}` → el dominio de valores está sin documentar → valor **verbatim**, no se
inventa mapeo (lo correcto producto; el mapeo localizado nace cuando el simulador/driver
confirmen el dominio). (e) `/site/:siteCode/full` (`sites.js:31`) EXCLUYE `userId` a propósito
(DEC-REF-33, "derivados sueltan userId, confían en el gate") → el owner del topic NO sale del
payload sino del store (`$store.state.devices`, vía `getDevices`), evitando tocar el endpoint y
contradecir DEC-REF-33. Guarda: `await dispatch('getDevices')` antes de `loadDetail` en
`mounted` (patrón de pieza 3, #35).

**Corrección de método (Franco frenó dos veces).** (i) Tras el recon, Claude reabrió el diseño
del componente como "decisiones A/B" con debate de equipo — Franco señaló que el diseño YA
estaba cerrado en #35 ("NO re-discutir, ejecutar"); las respuestas del recon eran
CONFIRMACIONES, no decisiones nuevas. La opción "B" (inyectar userId en `/full`) era inventada,
nunca estuvo sobre la mesa. (ii) Franco pidió explicación sin tecnicismos antes de aprobar el
origen del owner (store vs payload). Precedente sostenido: el diseño y los registros previos
mandan sobre la re-elaboración en-sesión.

**2. Diagnóstico "sin variables / consola muda" → causa: simulador APAGADO (no era bug).**
El instinto de Franco ("esto ya lo resolvimos") era correcto: el dato vivo se resolvió en #35;
faltaba reproducir su condición. Diagnóstico read-only en orden de costo (precedente
wanomi.md:1272): stack sano (node/emqx/mongo up, sin restart-loop; ambos compose traen emqx →
**el stack de producción es el correcto**, descarta la hipótesis de "stack equivocado"); `ps`
→ `run.js` NO corriendo. `devices_state.json` tenía los 4 dId correctos de CR00061
(fbXULu7a/Yf86psyC/6z4LN2md/Z5tKK1rN). Simulador relanzado (`.env.simulator` + `run.js`):
10 devices bootstrap OK, `current_conn` 1→11, sin ACL rejection → dato vivo fluyendo. Lección
(wanomi.md:1324) aplicada: Claude había elaborado "no publica bajo SERVICE / ACL perdidas";
el dato lo simplificó a "ni prendido". Layout confirmado: `_siteCode.vue` no declara layout →
usa `default.vue`, que es dueño de TODA la maquinaria MQTT (cliente, handlers,
`setMqttConnected`, `$emit` de deltas) Y monta `DashboardNavbar` → `$store.state.mqttConnected`
está vivo en la página. La alarma de "layout equivocado" de Claude quedó descartada con dato real.

**3. Retoques al componente (mismo commit `bc9ceca`).** (a) Formato por tipo: `int`→entero
(`Math.round`), `float`→2 decimales (`toFixed(2)`) — el template no trae `decimalPlaces`, regla
fija no inventada por variable. (b) Estado de espera: el "—" se reemplazó por spinner
`icon-refresh-01` atenuado (mismo patrón que "Cargando sitio…"). (c) Estado honesto con
`mqttConnected`: si broker conectado + sin valor → spinner (esperando); si broker caído + sin
valor → `icon-simple-remove` atenuado (sin señal, no va a llegar) — reusa el estado del
indicador del navbar con el significado correcto (DEC-REF-24, precisión).

**Pendiente del rumbo:** sub-paso 3 (feed de alarmas). Demora de siembra (las variables tardan
30-60s, su `variableSendFreq`, en poblarse al abrir un site) registrada como **BACKLOG-UI-7**
(siembra del último valor al montar, depende de persistencia TENANT-9). **TENANT-9 sube de
prioridad**: la demo a Claro va a querer cards pobladas al instante, no spinners de un minuto.
Simulador quedó corriendo (PID 6857) — decisión de Franco si se baja.

## Sesión #37 — 2026-06-29 · Área 2 · Diseño alarmas/feed/consola + diseño cross-equipo/cascada + evaluador tipo S

### Naturaleza
Sesión larga: DOS reuniones de diseño (alarmas/feed/consola; cross-equipo/cascada)
+ implementación del evaluador tipo S. Área 2 con voces de especialistas + Área 1
(Asesor Telco, Ex-técnico) + Seguridad/Tenancy + Hardware puntual. Franco decisor.

### Reunión de diseño 1 — alarmas/feed/consola (DEC-REF-39..46)
- Auditoría completa de la capa reglas/alarmas (#17-#34b): qué está decidido,
  implementado, y abierto. Veredicto: motor existe (D/C validados #19-23), tipos
  S/cross NO construidos, 24 notifs eran fixtures, 1 RulePack (4 reglas).
- Decisiones: gobernanza Wanomi-managed (39); predicción/auto-baselining roadmap (40);
  vista de cascada dedicada (41); consola de reglas superadmin central, constructor
  cross v1, construcción en paralelo (42); feed = notifications por siteId gateado +
  mapa de color por variable (43); real-time-lite notif→bus (44); coloreo server-side,
  ACK no apaga color (45); ACK auditable acknowledgedBy+ackAt + write-auth (46).
- Confirmado: sistema de roles/grants YA construido (#27-30), Wanomi=superadmin
  (DEC-REF-29) — la consola se protege con ese rol, sin identidad nueva.

### Implementación — evaluador tipo S (A2)
- Recon dirigido A2: confirmó mislabel de `window` (es de tipo S, no C), estado en
  RAM (`cooldownState`), reconstruct no rehidrata evaluación, plantilla typeC.
- Diseño: estado en RAM pura (`windowState` Map), recorte A2 = conteo-en-ventana
  (timeout de cascada → A3), contrato
  `evaluateS(rule, value, windowState) → { fired, count, windowActual }`.
- Construido: `typeS.js` (purga deslizante, reusa `evaluateD`), cableado en
  `ruleEngine.js` + `index.js`, enum `'window'` en `notificationRouter.js` +
  comentario en `notifications.js`.
- Bug encontrado y corregido en E2E: `mode:'window'` faltaba en el enum del schema.
- Validado E2E REAL con simulador (`genset_no_start`, `crank_attempts_failed`):
  positiva (120s) dispara al 3er evento (14.36s), negativa (5s) NO dispara (purga
  deslizante confirmada). Doc persistido OK. Pack y notifs de prueba limpiados de
  Mongo.
- Commit `f565837` (5 archivos). A2 CERRADO.

### Reunión de diseño 2 — cross-equipo/cascada (DEC-REF-47..50 + BUG-SIM-1)
- Recon dirigido A3: `crossExpr` 100% libre; `siteState` ya da acceso cross (sin
  cambio estructural); temporizador resuelto con patrón typeC (sin reloj);
  `correlationParent` propagado al NOC pero NO persistido; simulador SIN escenario
  coordinado.
- Debate B vs C con equipo completo (incl. Asesor Telco, Ex-técnico, Hardware):
  decidido "B plus" = árbol AND/OR sobre estados + operador de suma entre equipos
  (caso power plant Eltek de Claro). Secuencias y tendencias → roadmap.
- BUG-SIM-1 VERIFICADO read-only: `sharedState` no se comparte entre devices
  (`run.js` no lo pasa) → Cummins simulado roto de fondo. Se arregla en A3.
- Decisiones registradas: DEC-REF-47 (`crossExpr` B plus), 48 (temporizador reactivo
  `graceSec`), 49 (validación con simulador, no scripts), 50 (`correlationParent`
  persistido). Commit `bc5cbea`.

### Estado git al cierre
- Branch `feature/telco-support`, 6 commits pusheados a `origin` al final de la
  sesión (`120bb2c..ffd6a13`), branch sincronizada:
  `bc9ceca` (sub-paso 2 valor vivo, #36) + `d0c9a34` (cierre #36) +
  `85bb848` (DEC-REF-39..46) + `f565837` (tipo S) + `bc5cbea` (DEC-REF-47..50) +
  `ffd6a13` (cierre #37).
- Working tree limpio (solo untracked los 2 archivos de hardware).

### Entorno al cierre
- Simulador PID `4647`, motor edge PID `5477` (con código nuevo del tipo S).
  Si se bajan: `kill <PID>` directo, NUNCA `pkill -f`.
- Mongo limpio: `rulepacks` = solo `cummins-pcc-v1`; sin notifs de prueba.

### Pendiente — A3 (próxima sesión), tres piezas en orden
- **A3.1 — Fix BUG-SIM-1**: agrupar devices por `siteCode`, `sharedState` compartido
  por site, pasarlo a cada device. Resucita coordinación ATS↔Cummins + arregla
  Cummins. VA PRIMERO (sin banco de pruebas sano no se valida nada).
- **A3.2 — Evaluador cross-equipo**: árbol AND/OR (primero) + hoja de suma
  contemplada en diseño + temporizador reactivo (`graceSec`, DEC-REF-48).
- **A3.3 — `correlationParent` persistido** + escenario de cascada real coordinado +
  E2E.
- Después de A3: A4 (RulePack cascada), A5-A8 (backend MVP), Fase B (frontend),
  Carril 2 (consola). Ver secuenciamiento en bitácora de #37.

## Sesión #38 — 2026-06-29/07-01 · Área 2 · A3.1 (banco de pruebas del simulador sano)

### Naturaleza
Sesión de ejecución larga (atravesó cambios de fecha): arranque de A3.1, con hallazgo de
dos bugs adicionales del simulador que estaban enmascarados por BUG-SIM-1. Ciclo típico:
recon read-only dirigido → sala/decisión → diseño con voces del equipo → fix mínimo →
E2E real → commit propio. Franco decisor, Área 2 con voces (Backend Senior, Ing. Software,
Asesor Telco, Hardware puntual).

### A3.1 CERRADO — banco de pruebas del simulador sano
7 commits en `feature/telco-support` (sin push):
- `ce8a895` — `fix(simulator): compartir sharedState por site` (BUG-SIM-1).
- `2e95c37` — `docs: registrar BUG-SIM-4` (cleanup destruye state).
- `4f04af6` — `docs: ampliar BUG-SIM-4` (misma raíz en cleanup + reset).
- `cf5f6c7` — `fix(simulator): restaurar state iterando template` (BUG-SIM-4).
- `2e3b302` — `docs: registrar BUG-SIM-5` (timers congelados post-scenario).
- `5ee28c8` — `fix(simulator): reiniciar ticks al terminar scenario` (BUG-SIM-5).
- `359976d` — `feat(simulator): mains_failure_ats_transfer persistente` (noCleanup:true).

### BUG-SIM-4 cerrado (dos manifestaciones, un fix)
Raíz: la restauración de state iteraba `Object.keys(this._state)` crudo (incluía la
metadata `deviceType`) con un ternario de init que solo cubría SEC/GEN. Sobre ATS/CUMMINS
dejaba las vars en `undefined` (device mudo permanente) y habría publicado `deviceType`
a MQTT en el path `reset`. **Fix de raíz** (ambos sitios, `device.js`): iterar
`this._variables` (lista del template = frontera real-vs-metadata) y usar
`this._initialState(this._role)` (cubre los 4 roles). Validado con doble corrida de
cascada por captura MQTT: `POST_CLN_1` = 6 msgs ATS + 11 CUMMINS (con código viejo = 0),
trigger #2 no aborta, cero warnings "skipping publish of deviceType".

### BUG-SIM-5 cerrado (bug enmascarado por BUG-SIM-4)
`_runScenario` llama `_cancelActiveTimers()` al inicio y mata los `setInterval` de
`startPublishing`. Ninguna rama de fin de scenario los reinicia — el device deja de
publicar periódicamente hasta el próximo `reset` o scenario. En la validación de la
doble corrida (BUG-SIM-4) el ATS quedó silencioso entre `t=73.5s` (cleanup #1) y `t=121s`
(trigger #2) — se interpretó como "OK", era este bug. **Fix**: llamar
`this.startPublishing()` dentro del callback final de AMBAS ramas (cleanup y noCleanup),
tras restaurar/preservar state (replica el patrón del comando `reset`). +2 líneas.
Validado por observación: el ATS retoma ticks a los ~60s post-scenario y sigue tickando
cada 30-60s por variable.

### `mains_failure_ats_transfer` persistente
`noCleanup:true` en el escenario de corte de red — el grupo queda corriendo hasta un
`mains_restore` explícito, en vez de apagarse a los 60s. Más fiel a un corte sostenido
real. Cambio de comportamiento documentado en el commit. Validación de vuelta a reposo
al cierre de sesión: disparé `mains_restore` sobre `CR00061-ATS`; se ejecutaron los steps
(mains_voltage→220, gen_status→STOPPED, gen_voltage/freq→0), el Cummins volvió a reposo
(rpm=0, oil_pressure=0, run_hours estable, fuel_level=74.95 estable) y ambos devices
siguieron tickando periódicamente post-scenario — BUG-SIM-5 fix validado también en la
rama `mains_restore` (ya tenía `noCleanup:true`; era el path que hacía notorio el
congelamiento).

### Validación visual E2E en browser
Franco entró a CR00061 con `cellowner-nea@wanomi.test` (grant `claro/nea`). Vio:
- ATS con `gen_voltage ≈ 222V`, `gen_freq ≈ 50 Hz` con jitter en banda realista.
- Cummins con `rpm = 1491`, `coolant_temp = 75°C`, `fuel_level` bajando monotónico,
  `run_hours` acumulando. Física evolucionando en vivo. Cascada sostenida.
- Placeholders visibles del ATS: `mains_freq` sigue oscilando ~50 Hz en corte (Área 1
  debe modelar apagar a 0), `load_kw` con jitter aleatorio sin contexto (Área 1 modelo
  de carga del sitio telco).

### Descubrimiento colateral — visibilidad post-TENANT-4
Sin bug de código: `fsugamielecinetiksrl@gmail.com` (usuario habitual de Franco por
CLAUDE.md) no tiene `grants`, por lo que `buildReadFilter('Site')` devuelve DENY sobre
CR00061 (owner: `operator-claro`, service account por DEC-REF-36). Camino de acceso
humano correcto: entrar como `cellowner-nea@wanomi.test` (grant `claro/nea`) o
`admin@wanomi.com` (superadmin). LiveValue arma el topic del owner del device desde
`$store.state.devices` — no hay desajuste de topic MQTT.

### Cadencia de publicación (aclarada con Franco)
El simulador NO publica en stream continuo: cada variable tiene su `variableSendFreq`
(30/60/120s por defecto en `seed.js`). Entre ticks el LiveValue muestra el último valor
recibido. Excepción: dentro de un scenario los `_set` publican inmediatos por step
(por eso la cascada se ve "en vivo"). Este comportamiento es esperado y alineado con
firmware real. La lentitud de siembra al abrir un site pertenece a BACKLOG-UI-7
(siembra del último valor conocido, depende de TENANT-9).

### Pendientes / ítems levantados en esta sesión
- **Área 1 — fidelidad física ATS**: `mains_freq` debe ir a 0 durante corte (hoy sigue
  oscilando ~50 Hz sin condicional a red apagada); `load_kw` necesita modelo de carga
  real del sitio telco (hoy `clamp(v + jitter(0.5), 0, 15)` sin contexto). Registrable
  como backlog de fidelidad — NO bloqueante para la demo, pero visible en pantalla.
- **Roadmap — página de escenarios**: UI para crear/disparar escenarios del simulador
  desde el frontend (hoy se disparan a mano por MQTT sobre `simulator/{dId}/control`).
  Facilitaría demos y QA.
- **Nota Hardware (Área 3)**: `sharedState` modela física/cableado del sitio, NO
  arquitectura de producto. El día del Hub real, `gen_running` se lee del fierro por
  Modbus (o del PLC), no de mutación de un objeto compartido JS. El simulador
  representa la señal, no el mecanismo.
- **Roadmap — contrato MQTT Hub real ↔ simulador**: cuando llegue el Hub, validar
  paridad del contrato en modo Connect (mismos topics, mismos payloads, misma
  semántica de scenarios/control). Aparece con la primera integración de Hub.
- **Aprendizaje operativo**: `pgrep -af "A\\|B"` NO alterna en regex de `pgrep` (usa
  ERE, `\|` queda literal). Dio un falso "procesos caídos" al abrir #38 — el simulador
  viejo (PID 4647) seguía vivo y contaminó una captura inicial. Verificar procesos con
  `ps -ef | grep`.
- **Observación menor (no bug)**: `this._timers` acumula refs a Timeouts ya expirados
  después de cada scenario. Leak trivial, preexistente, no regresión de los fixes.
  Micro-cleanup opcional (`_cancelActiveTimers` antes de `startPublishing` en el
  callback) — no vale la pena en A3.1.
- **Simulador filtrado**: en #38 corrió mucho tiempo con `--site=CR00061` (los otros 3
  sitios sin devices publicando → cards estáticas, esperado, no bug). Al cierre se
  relanzó SIN filtro (10 devices, 4 sitios). Decisión para futuras demos: si se corre
  filtrado por costo/foco o completo por realismo.

### Estado git al cierre
- Branch `feature/telco-support`, **7 commits ahead de origin, SIN PUSH**: `ce8a895`,
  `2e95c37`, `4f04af6`, `cf5f6c7`, `2e3b302`, `5ee28c8`, `359976d`.
- Working tree limpio salvo 2 untracked de hardware (`~$nomi_guia_layout_WN-SITE-CORE.docx`,
  `conectividad_recomendada_hub.pdf`) — arrastrados desde #37.
- Sim al cierre: `node run.js` (todos los sites), post-`mains_restore` en reposo.

### Pendiente — A3.2 y A3.3 (próxima sesión)
- **A3.2**: evaluador cross-equipo (`crossExpr` AND/OR + hoja de suma) + temporizador
  reactivo (`graceSec`, DEC-REF-48). Diseño ya cerrado en DEC-REF-47/48.
- **A3.3**: `correlationParent` persistido (DEC-REF-50) + escenario de cascada real
  coordinado + E2E que cierra A3.
- Después: A4 (RulePack cascada), A5-A8 (backend MVP), Fase B (frontend), Carril 2
  (consola). Secuenciamiento en bitácora #37.

## Sesión #39 — 2026-07-02 · Área 2 · Recon #39-R1 (verificación pre-A3.2)

> **CORRECCIÓN (#39, recon #39-R1):** el cierre de #38 asentó "7 commits ahead de
> origin, SIN PUSH". El recon #39-R1 verificó: 0 commits ahead, branch sincronizada
> con origin (`git log origin/feature/telco-support..HEAD` vacío, `git status` "up to
> date with origin"). Causa confirmada por Franco en sesión #39: push realizado y
> autorizado por él entre el cierre de #38 y la apertura de #39. Sin anomalía de
> proceso — la convención "push solo con orden explícita de Franco" se mantuvo;
> solo faltó asentarlo. El registro de cierre de #38 era correcto al momento de
> escribirse. Los 7 commits (`ce8a895`, `2e95c37`, `4f04af6`, `cf5f6c7`, `2e3b302`,
> `5ee28c8`, `359976d`) están en origin.

### Recon #39-R1 — resumen (read-only, pre-A3.2)

Ejecución read-only limpia siguiendo la convención de recon dirigido de #37/#38.
Entorno operativo confirmado: `edge-engine/index.js` (PID 5477) y `run.js` (PID 55328)
corriendo desde antes de #39; docker `node`/`emqx`/`mongo` Up 3 días.

**Hallazgos C — catálogo de RulePacks (DEC-REF-31):**
- Schema `rule_pack.js` presente y sano (`packId`, `deviceType`, `version`, `canary`,
  `rules[]` embebidas; colección `rulepacks`). 1 doc en Mongo: `cummins-pcc-v1`, 4 reglas
  (A1, D1, D2, G2). Coincide 1:1 con el schema, sin campos extra.
- Vínculo a tenancy AUSENTE (sin `operatorId`, `zoneId`, `overrides`). DEC-REF-31
  cumplida a medias — registrado como **BACKLOG-RULE-2** en WanomiRefactor.md §5e.

**Hallazgos D — inventario para A3.2:**
- `crossExpr` **YA existe** en `rule_definition.js` (`type` enum incluye `'cross'`;
  `crossExpr: Mixed, default null`) y está persistido en las 4 reglas vigentes con
  valor `null`. Precisa el "crossExpr 100% libre" del recon #37 — registrado como
  nota de implementación bajo la tabla DEC-REF en WanomiRefactor.md.
- Alcance real de A3.2 = EVALUADOR + su despacho en `ruleEngine.js` (el gate por
  `deviceType`+`variable` en `ruleEngine.js:12-13` saltearía las reglas `cross`) +
  validación de forma del árbol. NO hay migración de schema.
- Regla a nivel site ausente en el schema (alcance efectivo por `deviceType`; no por
  `dId` ni por template).
- `siteState` en `edge-engine`: `Map<dId, {vars..., _deviceType, _userId, _deviceName}>`.
  `_deviceType` inyectado por `siteState.js:57-59` desde la colección `devices`. Un
  evaluador `cross` puede resolver "el ATS del site" iterando `siteState.entries()`
  sin hardcodear `dId` — supuesto de DEC-REF-47 sostenible.

### Estado git al cierre de #39-R1
Branch `feature/telco-support`, up to date con origin. 2 untracked de hardware
arrastrados desde #37 (`~$nomi_guia_layout_WN-SITE-CORE.docx`,
`conectividad_recomendada_hub.pdf`).

### A3.2 — evaluador cross-equipo (bajado a diff con doble STOP GATE)

**Ciclo diseño-a-diff en gates.** Franco aprobó DEC-REF-51 (despacho por
bypass del gate para reglas `type='cross'`, evaluación por cada mensaje
del site contra `siteState` completo) tras el recon #39-R1. STOP GATE 1:
verificaciones de forma (deviceType strings reales, enum `mode`, firma de
`evaluateD`, patrón `windowState`, timestamp del handler). STOP GATE 2:
diff propuesto — Franco lo rechazó con dos correcciones: **C1** hoja de
suma se descarta al LOAD (no en runtime, categoría propia
`reason:'sum-pending'`, evaluator boolean puro) y **C2** scoping por site
(`_siteCode` inyectado en `siteState`, keys `${siteCode}:${ruleId}:*`,
guard en despacho). STOP GATE 2b: diff corregido aprobado + tres
verificaciones V1-V3 (fireAlarm sin `siteId` en firma — inyectado
downstream por `_siteId` env var; `loadPacks` no filtra por deviceType;
strings reales de escenarios — `transfer_state='MAINS_FAIL'` era supuesto,
el simulador no lo emite). STOP GATE 3: V4 (`eq`/`neq` con `===`/`!==`
strict — safe para strings) + diff aplicado (5 archivos, +163/-3).

**E2E de mecánica del evaluador — validación por inyección directa.**

*Setup*: pack efímero `test-cross-cascada-v1` en `rulepacks` con árbol
AND de 3 hojas usando strings reales de V3 — `ATS.mains_voltage lt 50`,
`ATS.gen_status neq "RUNNING"`, `cummins-pcc.oil_pressure_psi lt 5` —
`graceSec:30`, `cooldownSec:60`. Motor edge relanzado (log confirmó
`Packs cargados: cummins-pcc-v1, test-cross-cascada-v1` sin descartes).

*Positiva*: 3 msgs de seed en T0=02:52:30 (sellan `:start`), 32s de
espera, tick post-grace en T0+34s → dispara UNA vez con
`mode:'cross', reason:'cross-tree-fired', siteId:'CR00061',
severity:'critical'`. NOC event capturado en `wanomi/noc/CR00061/event`,
persistido en `db.notifications` con `mode:'cross'` (validado el enum
extendido — bug clase #37 prevenido en recon, no en runtime). Idempotencia:
3 ticks adicionales con árbol sostenido true → 0 nuevas alarmas (contadores
Mongo/NOC/edge log = 1).

*Negativa (2 intentos, honesto)*: primer intento — publiqué
`gen_status='RUNNING'` como superuser al topic para simular el arranque
del gen; :start se limpió correctamente (evidencia: el disparo
subsecuente esperó otros 30s completos, no fue inmediato). Pero apareció
un rebrote a T+2:44 min: el sim internamente sigue con `gen_status='STOPPED'`,
sus ticks periódicos re-publicaron ese valor y **el evaluador
correctamente re-abrió el episodio y disparó tras un nuevo grace de 30s**.
No fue bug del cross — reveló que publicar como superuser al topic NO
muta el estado interno del simulador. Segundo intento: `set_sensor` por
`simulator/{dId}/control` modifica el estado interno; sus ticks futuros
publican el valor nuevo. **0 alarmas en 45s post-arranque del gen** →
resolución por éxito validada limpiamente.

*No-contaminación*: 6/6 eventos NOC con `siteId:'CR00061'`, cero de otros
sites. Alcance limitado por SITE_ID env var (1 motor = 1 site hoy).

*No-regresión tipo D*: el pack productivo `cummins-pcc-v1` siguió
disparando `cummins-A1-oil-pressure` al recibir `oil_pressure_psi=0` de
mi inyección (4 alarmas D en la franja, cooldown 60s entre disparos) —
el bypass cross no interfiere con el gate D/C/S.

### Hallazgos surgidos del E2E

- **BUG-SIM-6 (nuevo, sin diagnosticar)** — el simulador `run.js` (PID
  desde Jul01) figura conectado a EMQX pero no publica `sdata`
  periódicos; canal de control vivo (comandos `set_sensor` recibidos y
  procesados en `/tmp/simulator.log`). Publish muerto, control vivo —
  recorta hipótesis pero no basta para concluir. Detectado en el intento
  fallido de disparar `genset_no_start`. Registrado en WanomiRefactor.md
  §5d. **Bloquea el E2E producto de DEC-REF-49 (A3.3)** y es
  demo-relevante (LiveValues congelados). Requiere recon dirigido en la
  apertura de A3.3, sin especular.

- **Actualización BACKLOG-SIM-3** — `genset_no_start` intenta setear
  `battery_voltage`, `crank_current`, `crank_attempts_failed`, que NO son
  variables del ATS. El sim aborta el escenario con "variables not in
  device". El escenario coordinado de cascada (DEC-REF-49) debe
  diseñarse contemplando qué device recibe cada trigger.

- **Lección operativa** — publicar como superuser al topic
  `{userId}/{dId}/{var}/sdata` cambia el `siteState` del motor edge pero
  NO el estado interno del simulador. Sus ticks periódicos pisan la
  modificación. Manipulación del sim en E2E = `set_sensor` por
  `simulator/{dId}/control` (afecta estado interno + publica).

> **CORRECCIÓN (#39, recon #39-R2) — BUG-SIM-6 RETIRADO como falso positivo.**
> Recon dirigido read-only tras el cierre inicial de A3.2. Tap pasivo de 150s
> sobre `+/+/+/sdata` = **321 msgs, 10/10 devices publicando** (CR00061
> completo: ATS `6z4LN2md`=25, GEN `Yf86psyC`=27, CUMMINS `Z5tKK1rN`=28, SEC
> `fbXULu7a`=40). Sesiones EMQX de los 10 clientes `sim_*` continuas desde
> `2026-07-01T17:34:13Z` (sin reconexión), 48h de logs de EMQX sin ACL deny
> ni disconnects. `/proc/55328/fd/{1,2}` → `/tmp/simulator.log`, log limpio
> sin errores ni excepciones. Además: `_runScenario` retorna por
> `missing.length` ANTES de `_cancelActiveTimers()` (device.js:216-223) → un
> scenario abortado NO deja al device sin timers; aunque lo hiciera, solo
> afectaría al ATS, no al site entero. **A3.3 NO está bloqueado.** El ID
> BUG-SIM-6 queda como línea-lápida (precedente TENANT-5, BACKLOG-SIM-1),
> no se reutiliza. Siguen vigentes e independientes: la lección `set_sensor`
> (arriba) y la actualización #39 de BACKLOG-SIM-3 (`genset_no_start` no
> disparable sobre el ATS). **Lección de método**: un tap de silencio MQTT
> debe durar ≥ 2-3× la cadencia máxima esperada (30-120s por variable en
> este sim), con expectativa teórica de mensajes calculada al lado. Los taps
> de 3-5s del cleanup A3.2 no cumplían ese piso — la conclusión "sim mudo"
> era artefacto de medición.

### Honestidad de validación

Lo que se validó E2E: **la mecánica del evaluador cross** (árbol AND/OR,
`graceSec`, idempotencia por episodio, resolución por éxito, scoping por
site, persistencia `mode:'cross'`). Lo que NO se validó: **el E2E producto
de DEC-REF-49** (cascada real coordinada con el simulador simulándola de
verdad, DEC-REF-14 "producto no demo"). Ese queda pendiente para A3.3,
precedido por el recon de BUG-SIM-6. Registrado sin eufemismos por
decisión de Franco.

### Cleanup del E2E (verificado antes/después)

| Ítem | Antes | Después |
|---|---|---|
| Pack `test-cross-cascada-v1` en `rulepacks` | 1 doc | 0 (lista = `cummins-pcc-v1`) |
| Notifs franja E2E (02:45–02:58 UTC) | 6 docs (2 cross + 4 cummins-A1) | 0 |
| Sim state ATS (recon `/tmp/simulator.log`) | `mains_voltage=0`, `gen_status=RUNNING` | `mains_voltage=220`, `gen_status='STOPPED'` (reposo V3) |
| mosquitto_sub PIDs 68021, 68022 | vivos | ambos killed |
| Motor edge | PID 67888 con pack de prueba cargado | PID 78726 relanzado, `Packs cargados: cummins-pcc-v1` |
| `run.js` PID 55328 | vivo desde Jul01 | vivo, intocado (escena BUG-SIM-6) |

### Estado git al cierre de A3.2
Branch `feature/telco-support`, 3 commits ahead de origin, SIN PUSH:
- `d0fd67f` docs recon #39-R1.
- `77d34c5` docs DEC-REF-51.
- `08a922c` feat evaluador cross-equipo + graceSec (A3.2).
+ este commit de cierre. 2 untracked de hardware arrastrados desde #37.

### Push autorizado por Franco (sesión #39)

Push explícitamente ordenado por Franco tras el cierre de A3.2. Rango
subido: `00c905c..56d5656` (4 commits): `d0fd67f`, `77d34c5`, `08a922c`,
`56d5656`. Rama sincronizada con origin. Convención "push solo con orden
explícita de Franco" respetada.

### Recon #39-R2 — retiro de BUG-SIM-6

Ejecutado read-only tras el push, con escena intacta (sin restart de
`run.js` PID 55328, sin comandos al sim, taps pasivos). Cinco gates de
evidencia dura:

| Gate | Evidencia | Veredicto |
|---|---|---|
| G1 — tap 150s | 321 msgs, 10/10 devices, CR00061 ATS 25 / GEN 27 / CUMMINS 28 / SEC 40 | Sim publica normalmente |
| G2 — fd/1+fd/2 | Ambos → `/tmp/simulator.log`, sin errores/reconexiones/skip | Log real limpio |
| G3a — EMQX clients | 10 sesiones `sim_*` continuas desde 2026-07-01T17:34:13Z | Sin reconexiones |
| G3b — EMQX logs 48h | Cero ACL deny, disconnect, error, refused | Broker limpio |
| G3c — `db.data` per dId | Última muestra CR00061 = 2026-06-01 (advertencia TENANT-9: persistencia rota) | NO prueba silencio MQTT |
| G3d — mtime `devices_state.json` | 2026-06-01 (cache seed inicial) | No refleja runtime |
| G4 — abort path `device.js` | Return por `missing.length` ANTES de `_cancelActiveTimers()` | Abort NO mata timers; hipótesis descartada |
| G5 — comandos control | `trigger`, `set_sensor`, `scenario`, `reset` (sin dump/state RO) | Listado, sin ejecutar |

**Causa raíz**: falso positivo del recon original. Los taps de 3-5s en el
cleanup A3.2 fueron insuficientes frente a cadencias de 30-120s por
variable. BUG-SIM-6 retirado con línea-lápida (precedente TENANT-5,
BACKLOG-SIM-1). Bump WanomiRefactor.md 0.21 → 0.22. Lección de método
registrada. A3.3 desbloqueado.

### Estado al cierre de #39

- **A3.2 CERRADO** (validación de mecánica; E2E producto → A3.3).
- Registro: WanomiRefactor.md v0.22 · DEC-REF-51 · BACKLOG-RULE-2 ·
  BUG-SIM-6 retirado (falso positivo) · SIM-3 actualizado.
- Git: commits de la sesión `d0fd67f`, `77d34c5`, `08a922c`, `56d5656`
  (pusheados por orden de Franco en sesión) + `de62399` (+ este cierre).
- Entorno: motor edge PID 78726 (solo `cummins-pcc-v1`) · simulador
  `run.js` PID 55328 publicando sano (verificado R2: 321 msgs/150s,
  10/10 devices) · docker node/emqx/mongo Up · Mongo limpio de fixtures.

### Pendiente — próxima sesión (#40): A3.3

- Escenario de cascada real coordinado (insumo: actualización #39 de
  BACKLOG-SIM-3 — definir qué device recibe cada trigger).
- `correlationParent` persistido en `saveToMongo` (DEC-REF-50).
- E2E producto de DEC-REF-49 (banco confirmado sano por R2).
- Después: A4 (RulePack cascada), A5-A8, Fase B, Carril 2.

## Sesión #40 — 2026-07-03/04 · Área 2 · A3.3 (persistencia correlationParent + cascada coordinada)

> Registro retroactivo: el push de `de62399`+`5e31117` fue ordenado por
> Franco al final de #39, posterior al commit de cierre — por eso el cierre
> los lista como "a espera". Sin anomalía de proceso.

> Nota temporal: la sesión #40 arrancó el 2026-07-03 (R1-R2) y cerró el
> 2026-07-04 (R3-R8). Cruce de fecha registrado; commits usan fecha del
> autor local.

### Naturaleza
Sesión larga de ejecución dividida en 8 rondas dirigidas por Franco:
apertura + recon (R1) → diff persistencia correlationParent (R2) →
aplicación + restart edge + commit (R3) → freno en dominio
`transfer_state` (R4) → diff escenario mínimo (R4bis) → aplicación +
smoke test + commit (R5) → fixtures cascada (R6) → seed + E2E producto
(R7) → cleanup + docs (R8, actual). Franco decisor. Voces de Área 2
(Backend Senior, Ingeniero de Software) implícitas en las decisiones
D1-D4.

### Decisiones de sala
- **D1 — Escenario coordinado**: **Camino A** (scenario nuevo en el
  sim, `mains_failure_gen_no_start`), coherente con DEC-REF-49
  ("validación con el simulador como producto, no con scripts").
  Descartada la orquestación externa (dos triggers separados vs. un
  scenario canónico); el sim reemplaza al sitio, no un script del
  test.
- **D2 — Alcance E2E**: **completo**. No solo persistencia estructural
  del campo `correlationParent` sino cadena madre→hija seedeada con
  correlationParent real, verificada en Mongo. La evidencia principal
  es el documento de la hija con `correlationParent` no-nulo apuntando
  al `ruleId` de la madre.
- **D3 — Mismatch nomenclatura pack↔template**: **backlog aparte
  (BACKLOG-RULE-3)**, NO scope de A3.3. Las reglas del E2E se
  escriben con nombres del template (`mains_voltage`, `gen_status`);
  la reconciliación del pack `cummins-pcc-v1` (`oil_pressure_psi` vs
  `oil_pressure`, `fuel_level_pct` vs `fuel_level`) se decide al armar
  A4 o en una sesión dedicada.
- **D4 — `transfer_state`**: **Opción 1** — escenario mínimo sin
  tocarlo. Introducir un valor intermedio es diseño semántico
  (dominio real del InteliATS PWR), no implementación mecánica. El
  modelado queda en **BACKLOG-SIM-4** con criterio de Área 3.

### Decisiones de implementación (dentro de diffs aprobados)
- **Restart selectivo del edge (R3):** motor edge se reinicia para
  tomar el schema nuevo; contenedor `node` (app puerto 3001) se deja
  para su próximo restart natural, ya que ningún consumer app rechaza
  campos extra (verificado en el sanity check de R2, paso 4).
- **Estilo de acceso directo en `saveToMongo`:** `alarm.correlationParent`
  sin normalización adicional, mirroring de `alarm.recommendation` (no
  ternario). El schema default `null` cubre el caso undefined.
- **Parámetros E2E aprobados por Franco:** umbral `mains_voltage < 100`
  (madre), `graceSec 90` (hija, ≥ cadencia máxima 60s), `cooldownSec
  300` en ambas, `severity critical` en ambas.
- **Pack único para fixtures:** `e2e-cascade-test-v1` con las 2 reglas
  embebidas en un solo documento — un `insertOne` + un `deleteOne` para
  todo el ciclo.

### Parámetros del E2E
- **Madre** `e2e-mains-loss-root`: D, `deviceType:'ATS'`,
  `variable:'mains_voltage'`, `condition:{op:'lt',value:100}`,
  `severity:'critical'`, `cooldownSec:300`, `correlationParent:null`.
- **Hija** `e2e-gen-no-start-child`: cross,
  `crossExpr = AND[ ATS.mains_voltage lt 100, ATS.gen_status neq
  'RUNNING' ]`, `graceSec:90`, `severity:'critical'`,
  `cooldownSec:300`, `correlationParent:'e2e-mains-loss-root'`.
- **Trigger**: `mains_failure_gen_no_start` (scenario nuevo, 1 step,
  60s `noCleanup`) sobre ATS `6z4LN2md`.
- **Restore**: `mains_restore` (scenario existente).

### Resultados E2E (R7 STOP GATE 8)
- **T_RUN_START** = 1783191320692 ms (2026-07-04T18:55:20Z).
- **T_RUN_END** = 1783191683174 ms (2026-07-04T19:01:23Z).
- **Veredicto madre**: disparó UNA vez a T+530ms (tick immediate del
  step at 0). `correlationParent:null` persistido en Mongo — DEC-REF-50
  caso base validado.
- **Veredicto hija**: disparó UNA vez a T+100.1s (grace 90s + próximo
  tick ~10s). `correlationParent:"e2e-mains-loss-root"` persistido —
  DEC-REF-50 evidencia principal, `mode:"cross"`,
  `reason:"cross-tree-fired"`.
- **Veredicto unicidad**: counts se mantuvieron 1 y 1 durante todo el
  cooldown de 300s, incluso con árbol sostenido true.
- **Veredicto no-regresión**: carga de packs sin descartes ni errores
  de schema tras la extensión con `correlationParent`; regresión
  funcional D/C/S no ejecutada (no requerida por A3.3).

### Incidencia de credenciales + lección de método
En R5 (`4a — capture env`), maté el sim PID 55328 tras un `grep`
filtrante del env que excluyó `USER_EMAIL/USER_PASSWORD`. Al no poder
relanzar, Franco me pasó las credenciales de autenticación del backend
(`USER_EMAIL`/`USER_PASSWORD`) por chat. El valor NO se reproduce en
este registro (evitar el vector RISK-SEC-1: secreto en git history);
referencia: transcript sesión #40, R5. Registrado como **RISK-SEC-2**
en `WanomiRefactor.md` v0.23 con rotación diferida al mismo trigger
que RISK-SEC-1. **Lecciones de método** que quedan protocolizadas:
- Antes de killear cualquier proceso, capturar
  `/proc/PID/environ` ENTERO con `tr '\0' '\n' > /tmp/env-preX.txt` y
  revisar el archivo completo — nunca grep filtrante.
- El `cwd` del shell puede cambiar entre commands (mi `cd` para
  relanzar el sim me hizo fallar el `git add` de R5 hasta re-anclar
  con `cd /root/IotLocalhost &&`). Consecuencia: comandos git usan
  path absoluto o re-cd explícito.

### Cleanup del E2E (R8, verificado antes/después)

| Ítem | Antes | Después |
|---|---|---|
| Pack `e2e-cascade-test-v1` | 1 doc | 0 (lista = `cummins-pcc-v1`) |
| Notifs franja (T_RUN_START..T_RUN_END) | 2 docs (root + child) | 0 |
| Motor edge | PID 11026 con pack de prueba | PID **12691** relanzado, `Packs cargados: cummins-pcc-v1` |
| Simulador `run.js` | PID 9163 | PID 9163 (intocado) |

### Estado git al cierre de A3.3 (antes de commits de cierre)
Branch `feature/telco-support`, 2 commits ahead de origin, SIN PUSH:
- `e25fefa` — feat: persist correlationParent in notifications (DEC-REF-50).
- `621691c` — feat(simulator): add mains_failure_gen_no_start cascade scenario (DEC-REF-49).
+ este cierre docs (pendiente en R9). 2 untracked hardware arrastrados
desde #37.

### Estado del entorno al cierre
- docker `node` / `emqx` / `mongo` — Up 4 días (healthy).
- motor edge PID 12691 con solo `cummins-pcc-v1` cargado.
- simulador `run.js` PID 9163 con 10/10 devices publicando sanos.
- Mongo `rulepacks` = `[cummins-pcc-v1]`, sin residuos de fixtures.

### Pendiente — próxima sesión (#41)
Prioridad Franco (secuencia #32): BACKLOG-TENANT-4 primero. Después,
retomar el carril A3→A4:
- **A4** — RulePack cascada productivo: reconciliar BACKLOG-RULE-3
  (mismatch nomenclatura pack ↔ template), formalizar `graceSec` en el
  schema `rule_definition.js`, decidir alcance de reglas cross en el
  RulePack productivo (cascada energética completa).
- **BACKLOG-SIM-4**: modelado del dominio real de `transfer_state`
  (criterio de Área 3).
- Fase B (frontend) y Carril 2 (consola) siguen después según #37.

## Sesión #41 — 2026-07-05 · Área 2 · BACKLOG-TENANT-4 (migración userId Claro → service account)

> Adenda RISK-SEC-2 (#40): verificación posterior al cierre de #40 halló
> 3 ocurrencias históricas de la credencial en `wanomi.md` (líneas
> 1750/1912/2488), previas a #40 y ya pusheadas a origin; cubiertas por
> el mismo trigger de rotación. El registro de #40 queda preciso con
> esta adenda.

> **Re-encuadre (aprobado por Franco):** recon R1 detectó premisa
> desalineada — TENANT-4 cerrado en #33 (DEC-REF-36). Sesión
> re-encuadrada a **BACKLOG-TENANT-9** (saver rules PERSONAL→SERVICE).
> Sala: (1) script dedicado idempotente con backup+`--restore`,
> (2) EMQX in-place preferido con fallback recreate+relink,
> (3) DEC-REF-52 antes del código, (4) exclusiones: `data` histórico,
> `notifications`, `templates` (consistente DEC-REF-36/37).

### R4-R5 — Ejecución TENANT-9 + destrabe del self-heal

**R4 (freno):** el script ejecutó limpio (10/10 saverrules SERVICE, backup
`seeds/_dev/backup_tenant9_2026-07-05_15-33-08.json`), pero
`docker restart node` NO gatilló `reconcileRules()`: waitForSaverResource
timeout 120s (38 × 3s) porque los 3 resources EMQX (`rule/alarm/saver-webhook`)
tienen `url=http://localhost:3001/...` (desde el contenedor `emqx`, localhost
apunta al propio emqx, sin backend). Causa raíz: `app/.env` tiene
`WEBHOOKS_HOST=localhost` mientras CLAUDE.md documenta `node` (deriva
`.env` real ↔ documentación, ver BACKLOG-OPS-2). El bootstrap
(`emqxapi.js:78-88`) es create-if-missing puro — no actualiza URL de
resources existentes. **Freno en R4 y consulta a Franco.**

**Decisión de Franco (opción 1 ampliada):** corregir `app/.env` +
DELETE de los 3 resources muertos + `docker restart node`. Registrar la
causa raíz refinada como adenda a DEC-REF-52 y a BACKLOG-OPS-1, y abrir
BACKLOG-OPS-2 (auditoría de deriva `.env` ↔ CLAUDE.md). El tratamiento
uniforme a los 3 resources (no solo saver-webhook) fue aprobado: es el
mismo fix, mismo self-heal — corrige toda la deriva de una vez.

**Nota de scope:** el cambio en `app/.env` es config fuera del repo
(`.env` gitignored), pero se registra acá para prevenir drift entre
sesiones (precedente: cambios fuera de prompt se anotan en bitácora).
Valor viejo: `WEBHOOKS_HOST=localhost` · valor nuevo: `WEBHOOKS_HOST=node`.

### R5 — Ejecución del fix + validación E2E

**Fix aplicado:** `app/.env` línea 5 (`WEBHOOKS_HOST=localhost → node`);
DELETE de los 3 resources muertos vía EMQX API v4 (`code:0` en los 3);
`docker restart node`. Bootstrap creó los 3 resources con
`url=http://node:3001/...` (ids nuevos `e2327e37`, `95b9d530`,
`cd1dfc4e`); `reconcileSaverRules` ejecutó y creó **10 rules EMQX** con
recreate + relink automático de los 10 `emqxRuleId` (ids nuevos, ninguno
de los huérfanos originales).

**Anatomía real** de la rule para `dId=a0qjh6dh` (recreada por el
reconcile, `emqxRuleId=rule:59e6d435`): `SELECT topic, payload FROM
"6a3992b435afd807a7f992fe/a0qjh6dh/+/sdata" WHERE payload.save = 1` —
FROM y `payload_tmpl` con userId SERVICE en ambos lugares (evidencia
directa del veredicto R3 A: el reconcile lee `rule.userId` del doc
Mongo). `$resource=resource:e2327e37`, `enabled=True`.

**E2E persistencia (tap 429s):**
- Snapshot pre-tap: `data` total 737, SERVICE 272, PERSONAL 465 (viejos);
  max(time) 2026-07-05T15:49:45Z (persistencia YA activa desde el
  restart).
- Teórico ajustado por 429s: ~974 msgs sobre 10 devices.
- **Resultado**: 860 docs nuevos, **860/860 SERVICE, 0 PERSONAL**.
  Distribución por dId coherente con templates (4 SEC × 106, CUMMINS 80,
  4 GEN × 75, ATS 56). Dentro del rango razonable con jitter de arranque
  de intervalos.
- Persistencia RESTAURADA end-to-end.

**Fila de oro DEC-REF-36 (validación positiva completada, pendiente
desde #33):** `GET /api/get-last-data?dId=6z4LN2md&variable=mains_voltage&chartTimeAgo=10`

| Actor | Response | Interpretación |
|---|---|---|
| `cellowner-nea` (grant claro/nea) | `{status:"success", data:[9 muestras SERVICE, ~226-230V]}` | 200 con valor por grant ✓ |
| `fsugamielecinetiksrl` (grants:[]) | `{status:"success", data:[]}` | 200 vacío por DENY de scope ✓ |
| `admin@wanomi.com` (super) | `{status:"success", data:[9 muestras SERVICE]}` | 200 con valor ✓ |

Path histórico por `dId` vía `resolveScopedDIds` (DEC-REF-34) funciona
sobre dato REAL, no solo sobre device efímero cross-tenant (#30.1).

**TENANT-9 CERRADO** — self-heal del producto validado end-to-end: el
mandato de Franco ("dejar la auto-reparación funcionando, no solo
destrabada") queda cumplido.

**Ruta del backup**: `seeds/_dev/backup_tenant9_2026-07-05_15-33-08.json`
(10 entradas con `userId` PERSONAL y `emqxRuleId` huérfanos).

**Rollback (contingencia NO ejecutada):**
1. `node seeds/migrate_tenant9_saverrules.js --restore seeds/_dev/backup_tenant9_2026-07-05_15-33-08.json`
   — repone `userId=PERSONAL` + `emqxRuleId` viejos.
2. `DELETE /api/v4/rules/{id}` × 10 sobre los ids nuevos (los que el
   reconcile creó).
3. `docker restart node` — el reconcile encontrará los 10 emqxRuleId
   viejos (huérfanos otra vez), recreará las 10 rules pero con SQL
   PERSONAL → topic sin matcher → volvemos al estado pre-migración.

**Estado del entorno al cierre**:
- sim `run.js` PID 9163 (intocado), edge `edge-engine/index.js` PID 12691
  (intocado), backend `docker node` reiniciado (bootstrap sano).
- Mongo: `saverrules` 10/10 SERVICE con `emqxRuleId` relinkeados;
  `data` creciendo activamente con `userId=SERVICE`.
- EMQX: 3 resources sanos (`http://node:3001/...`); 10 rules enabled.

### R6 — Fix de registro + adenda RISK-SEC

**Fix DEC-REF-52:** el registro que R5 escribió violaba la convención
"las DEC-REF-* NO se modifican retroactivamente" — reemplazó la fila
original renombrándola `(adenda)`, antepuso el texto nuevo y dejó un `|`
sin escapar en medio del texto que rompía la tabla markdown (columna
fantasma). Restaurado: fila `DEC-REF-52` con su texto original R3
exacto, y adenda R4/R5 movida a fila NUEVA `DEC-REF-52-A`. Verificación
mecánica: ambas filas 4 pipes / 3 columnas. Ningún cambio semántico —
todo el contenido preservado, solo redistribuido para respetar
convención.

**Adenda RISK-SEC (append al checklist de rotación diferida a
producción)** — sumar al mismo trigger de RISK-SEC-1/2 las passwords de
usuarios dev que aparecieron en bitácora o chat durante desarrollo:
- `admin@wanomi.com` (contexto #41-R5 D5, provista por Franco por chat).
- `cellowner-nea@wanomi.test` (documentada en `wanomi.md:1955` desde
  commit `0425840`).
- `fsugamielecinetiksrl@gmail.com` (contexto #40-R5 + #41-R5).
- `telco-test@wanomi.test` (existencia registrada; password no
  confirmada, sumar al checklist por precaución).

Misma política que las otras entradas RISK-SEC: **rotación con
disparador en deployment a producción, sin urgencia en dev** (entorno
localhost, sin cliente externo). Lección de método ratificada de #33
(`wanomi.md:2135`): "para E2E con credenciales, firmar JWT directo con
JWT_SECRET (no pasar passwords por el shell)" — aplicable a futuras
sesiones si el vector se puede evitar.

**Decisión de Franco sobre orden de la bitácora:** el orden R3/R4-R5
tal como quedó (R4-R5 antes de R3 por artefacto del edit posición) se
mantiene — **append-only prima sobre cosmética**; no se reordena por
prolijidad, solo por corrección de contenido.

### Sesión #41 CERRADA

- **TENANT-9 CERRADO** — self-heal del producto validado end-to-end
  (mandato de Franco cumplido: auto-reparación funcionando, no solo
  destrabada). Fila de oro DEC-REF-36 saldada (validación positiva
  pendiente desde #33 completada sobre dato REAL).
- **Registro**: WanomiRefactor.md v0.25 con DEC-REF-52 (Variante B) +
  DEC-REF-52-A (adenda causa raíz refinada + fix self-heal);
  BACKLOG-OPS-1 (enriquecido) y BACKLOG-OPS-2 (deriva `.env` ↔
  CLAUDE.md) abiertos; adenda RISK-SEC de passwords dev al checklist
  de rotación diferida.
- **Rango pusheado**: `bf52b95..6845a93` (4 commits de #41): `582581e`
  (DEC-REF-52 + OPS-1), `5d81bcf` (script migración), `b44d87a` (cierre
  R3-R5 + BACKLOG-OPS-2 + bump v0.25), `6845a93` (fix DEC-REF-52 +
  adenda RISK-SEC).
- **Entorno al cierre**: sim `run.js` PID 9163 (intocado), edge
  `edge-engine/index.js` PID 12691 (intocado), backend `docker node`
  reiniciado y sano; Mongo `saverrules` 10/10 SERVICE con `emqxRuleId`
  relinkeados, `data` creciendo activamente bajo `userId=SERVICE`;
  EMQX 3 resources sanos + 10 rules enabled.

### Pendiente — próxima sesión (#42)

- **A4 del carril A3→A4**: RulePack cascada productivo. Arrastra la
  decisión pendiente de **BACKLOG-RULE-3** (mismatch nomenclatura pack
  `cummins-pcc-v1` ↔ template `WN-GEN-Cummins-PowerCommand` —
  `oil_pressure_psi` vs `oil_pressure`, `fuel_level_pct` vs
  `fuel_level`). Requiere sala con Área 1 (dominio semántico) y Área 3
  (mapping driver Modbus futuro) para elegir entre las tres opciones
  registradas (rename en el pack, mapping en el bridge, reglas duales
  transicionales).
- Fase B (frontend) y Carril 2 (consola) siguen después según #37.

### R3 — Veredicto A + registro DEC-REF-52 y BACKLOG-OPS-1

**Veredicto A (Variante B confirmada tal cual):** `reconcileSaverRules`
(`emqxapi.js:257-320`) lee `rule.userId` del doc Mongo `saverrules` en
los dos puntos que reproducen la geometría de la creación original:
`:296` (FROM del SQL, `topic = rule.userId + "/" + rule.dId + "/+/sdata"`)
y `:304` (`payload_tmpl`, `"userId":"' + rule.userId + '"'`). Migrar el
doc primero ⇒ el recreate del reconcile deja EMQX con SERVICE en ambos
lugares. Gatillo: `initEmqxResources()` top-level en el `require` del
router (`emqxapi.js:534`) → espera saver resource (`:527-531`) → si
ready dispara `reconcileRules()`. Proceso a reiniciar para gatillarlo:
**contenedor `node`** (`docker restart node`), sin rebuild del bundle
Nuxt (nada del bundle cambia). El corte de R2-B4 (EMQX Rule Engine en
0) hace que la rama in-place se disuelva por falta de sujeto: el único
path es create+relink (patrón ya existente en el propio reconcile,
`emqxapi.js:308-313`).

**Registrado en `WanomiRefactor.md` v0.24:**
- **DEC-REF-52** — TENANT-9 vía self-heal del producto (Variante B),
  con la causa raíz doble, el orden obligatorio (script → restart), el
  backup+`--restore` Mongo-only, y las exclusiones sellosadas por R2-B5.
- **BACKLOG-OPS-1** — durabilidad de reglas/config EMQX ante ciclo de
  vida del contenedor (nueva sección `5f · Backlog de operaciones`).
  No urgente: el self-heal cubre el gap operativo; el hardening
  (persistencia real del volumen EMQX + auditoría de resources/ACLs/
  reglas alarm/actuator) queda como checklist de deployment junto a
  RISK-SEC-1/2.

## Sesión #42 — 2026-07-06 · Área 2 · A4 (RulePack cascada productivo: RULE-3 + graceSec + reglas cross)

### R1 — Recon dirigido (read-only)

Entorno heredado sano: TENANT-9 sigue cerrado (last SERVICE
2026-07-06T00:46:23Z, `data` SERVICE creció a 66,368 docs desde 272 en
el fix de #41-R5 — self-heal sostenido). Sim PID 9163 y edge PID 12691
intocados desde #40; docker Up 7d (mongo/emqx) / 9h (node).

**Hallazgos B1 (mismatch pack↔template)** — el problema de RULE-3 es
más amplio que el registro original de 2 mismatches: son **4 reglas
del pack, en 2 clases**:

| Regla | Var pack | Var template | `source_filter` | Clase |
|---|---|---|---|---|
| A1 oil-pressure | `oil_pressure_psi` (unit `kPa`, incoherencia) | `oil_pressure` | connect | rename + fix unit |
| G2 fuel-critical | `fuel_level_pct` | `fuel_level` | connect | rename |
| D1 service-due-soon | `hours_to_next_service_250` | (no existe) | inferred | variable derivada |
| D2 service-overdue | `hours_to_next_service_250` | (no existe) | inferred | variable derivada |

Radio de impacto acotado: los nombres del pack (`_psi`, `_pct`,
`hours_to_next_service_250`) viven SOLO en `seeds/cummins_pcc_v1.js`
+ 1 archivo dev (`seeds/_dev/test_typeC_no_setpoint.js`). Cero uso en
frontend, motor edge, sim de runtime. Los nombres del template
(`oil_pressure`, `fuel_level`, `mains_voltage`) viven solo en el
simulador. El pack productivo es la única fuente a tocar.

**Hallazgos B2 (graceSec y window en schema)**:
- **`graceSec` NO está en `rule_definition.js`**. Persistió en A3.2/A3.3
  vía `insertOne` directo (bypass mongoose). Latente clase-#37: si
  `seeds/cummins_pcc_v1.js` (que usa `RulePack.findOneAndUpdate`
  mongoose) intenta sumar una regla cross con `graceSec`, mongoose lo
  filtraría por `strict:true` — bug silencioso.
- **`window` SÍ está** (líneas 36-40: `durationSec, countThreshold,
  matchCondition`); `typeS.js:11` lo consume — nota #37 resuelta como
  mislabel del recon original A-H, no del código.
- **Cross fixtures vivos en Mongo hoy: 0**. Solo pack productivo con 4
  reglas D. Los fixtures A3.2/A3.3 fueron limpiados en sus cierres.

**Hallazgos B3 (ciclo de vida)**:
- Seed canónico: `seeds/cummins_pcc_v1.js:91` `RulePack.findOneAndUpdate({packId},...,{upsert:true})` idempotente. No hay endpoint HTTP.
- Motor edge lee packs UNA vez al arranque (`siteState.js:22` +
  `edge-engine/index.js:29`). **Sin hot-reload**: cambios en pack
  requieren `kill $EDGE_PID; relaunch`.
- Validación al load: solo `validateCrossTree` sobre reglas cross
  (DEC-REF-47). Reglas D/C/S entran sin validación al load; los
  guards viven en cada evaluator.

### R2 — Sala de A4 (Franco decisor, voces Área 2)

Cuatro decisiones cerradas, registradas como **DEC-REF-53** en
`WanomiRefactor.md v0.26`:

- **D1 (RULE-3 clase connect)** — rename en el pack: `oil_pressure_psi
  → oil_pressure`, `fuel_level_pct → fuel_level`. Opción (a) de RULE-3.
  Fix unit A1 a Bar canónico (warning <2.0 Bar, crítico <1.0 Bar) según
  biblioteca de campo. Opciones (b) mapping en bridge Modbus y (c)
  reglas duales transicionales descartadas: infraestructura especulativa
  y doble mantenimiento, respectivamente.
- **D2 (RULE-3 clase inferred)** — retiro de D1/D2 del pack productivo.
  Diseño preservado en **BACKLOG-RULE-4** (250 h aceite / 500 h filtro,
  derivable de Run Hours ComAp/Cummins). Alternativa de sala
  (publicar `run_hours` en sim para valor demo) descartada por scope,
  recuperable vía RULE-4.
- **D3 (graceSec)** — formalizar `graceSec` en el schema
  `rule_definition.js` **ANTES** de sumar reglas cross por vía canónica
  del seed. Sin migración: todas las reglas actuales lo tienen
  undefined; solo se abre el path futuro.
- **D4 (alcance cross)** — pack productivo suma UNA regla cross:
  `mains-loss → gen-no-start` (única cadena validada E2E en A3.3 con
  escenario `mains_failure_gen_no_start` existente). Cascada
  energética completa DIFERIDA — bloqueada por BACKLOG-SIM-4
  (transfer_state).

### Registro documental

- WanomiRefactor.md v0.25 → **v0.26**.
- **DEC-REF-53** — cuatro decisiones D1-D4.
- **BACKLOG-RULE-4** — diseño preservado de D1/D2 retiradas.
- **BACKLOG-RULE-3** cerrado con referencia a DEC-REF-53 (entrada
  conservada por precedente).

### Saneo

Verificación #42-R2 A: `grep -n "Sesión #42" docs/wanomi.md` = 1 sola
ocurrencia (línea 3103). Sin duplicado del header; nada que sanear.

### R3-R4 — Diff mostrado + refinamientos de sala

**R3 (diff inicial):** propuse diff schema (`graceSec` en
`rule_definition.js`, junto a crossExpr) + diff seed
`cummins_pcc_v1.js` (rename A1/G2, retiro D1/D2, agregado C1 cross
como única regla de cascada, `correlationParent:null` propuesto por no
existir madre en el pack). Fila de puntos a aprobar: umbral A1 Bar,
parámetros C1, secuencia R5.

**R4 (refinamientos):** sala refinó dos puntos sobre el diff R3:
- **A1 ganó una hermana warning A0** — `oil_pressure < 2.0 Bar`,
  severity warning, cooldown 300 (propuesto). Reglas independientes:
  cuando `oil_pressure < 1.0` disparan ambas (defensa en profundidad).
  Verificado con `typeD.js` que no hay estado compartido — cada regla
  evalúa contra su condition, cooldown propio por `ruleId`.
- **C1 gana madre (opción b de D4)** — se agrega alarma D
  `cummins-M1-mains-loss` sobre el ATS, con base en el fixture E2E
  `e2e-mains-loss-root` de A3.3 (bitácora #40-R7). Comentario obligatorio
  en el código: "migrar a pack ATS futuro con DEC propio" — abre
  **BACKLOG-RULE-5**.
- **`C1.correlationParent = 'cummins-M1-mains-loss'`** (reemplaza el null
  propuesto en R3) — cadena madre→hija persistida, evidencia de la
  vista de cascada (DEC-REF-41/50).

**Verificación estática del gate motor** (recon #42-R4 B4):
`ruleEngine.js:29-30` compara `rule.deviceType !== deviceType`
(deviceState del mensaje) — usa la propiedad de la regla, NO
`pack.deviceType`. Corolario: una regla con `deviceType:'ATS'` dentro
de un pack con `pack.deviceType:'cummins-pcc'` funciona correctamente
(el motor recorre todos los packs y todas las reglas por mensaje, sin
filtrar packs por su deviceType). Geometría "M1 ATS en pack Cummins"
válida por construcción.

Pack final aprobado: **5 reglas** — A0 (warning oil), A1 (critical
oil), G2 (fuel), M1 (madre mains-loss), C1 (cross hija con parentesco a
M1). Version 2.

### R5 — Ejecución (commits sin push)

**Paso 1 — schema:** aplicado. `graceSec: { type: Number }` insertado
después de `crossExpr`. Verificado con `git diff` (+1 línea).

**Paso 2 — seed:** aplicado íntegro contra el diff R4. Verificado con
`git diff --stat` (+77/-42, 5 ruleIds presentes, D1/D2 ausentes,
`graceSec:90` y `correlationParent:'cummins-M1-mains-loss'` en su
lugar).

**Paso 3 — seed run:** `node seeds/cummins_pcc_v1.js` → `✅ Seed OK —
packId: cummins-pcc-v1 · version: 2 · reglas: 5`. La primera regla
cross seedeada por vía canónica `findOneAndUpdate + runValidators:true`
— el momento que D3 destrababa.

**Paso 4 — Mongo (checklist):** 5 reglas, version 2. `A0.condition
{op:'lt',value:2}`, warning. `A1.unit:'Bar', condition {op:'lt',value:1}`,
critical. `G2.variable:'fuel_level'`. `M1.deviceType:'ATS',
variable:'mains_voltage', condition {op:'lt',value:100}`. **`C1.type:'cross',
correlationParent:'cummins-M1-mains-loss', graceSec:90 PERSISTIDO (no
silenciado por mongoose), crossExpr.op:'AND'`** ← evidencia de D3
destrabado.

**Paso 5 — restart edge:** env íntegro capturado en
`/tmp/edge-env-preR5.txt` (40 líneas totales, 6 app-relevantes
revisadas — lección #40). `kill 12691` directo. Relanzado con env
replicado + NODE_PATH. **Nuevo PID: 32527**. Sim PID 9163 intocado.

**Paso 6 — carga limpia:** log arranque muestra `Packs cargados:
cummins-pcc-v1`, sin descartes ni warnings de `validateCrossTree`.

**Paso 7 — E2E cascada M1→C1 (evidencia de oro):**

- **T0 = 2026-07-06T12:36:54Z (1783341414135)**.
- Baseline pre-trigger: M1=0, C1=0.
- Trigger: `mains_failure_gen_no_start` sobre `6z4LN2md`.
- **M1 disparó a T0+31ms** (¡velocidad excelente, tick immediate del
  step at 0). `mode:'direct', reason:'threshold', severity:'critical',
  correlationParent:null, thresholdUsed:100, value:0`. Doc completo
  persistido en `db.notifications`.
- **C1 disparó a T0+99.4s** (grace 90s + próximo tick ~10s, coherente
  con A3.3). `mode:'cross', reason:'cross-tree-fired',
  severity:'critical', correlationParent:'cummins-M1-mains-loss'` ←
  **cadena madre→hija persistida, evidencia de la vista de cascada
  DEC-REF-41/50**.
- Unicidad a T0+217s: M1=1, C1=1 sostenidos (cooldown 300s conteniendo).
- Restore `mains_restore` + 90s espera: M1=1, C1=1 sin re-emisiones
  (árbol cross false por `mains_voltage` restaurado + cooldown).
- Smoke TENANT-9: `data` SERVICE creció de 66,368 (baseline #42-R1) a
  **154,182 docs** — self-heal sostenido, sim publicando bajo SERVICE
  sin interrupciones.

**Paso 8 — docs + commits:**
- WanomiRefactor.md v0.26 → **v0.27**.
- Adenda a DEC-REF-53 (dos refinamientos R4: A0 + opción (b) madre M1
  + BACKLOG-RULE-5).
- **BACKLOG-RULE-5** — migración futura de M1 a pack ATS propio.
- Bitácora Sesión #42: R3/R4/R5 con evidencia numérica y timestamps.

Commits (3, un concern c/u, sin push):
1. `feat(edge-schema): formalize graceSec in rule_definition schema (DEC-REF-53 D3)`
2. `feat(seeds): reconcile cummins-pcc-v1 pack — A0/A1/G2 renamed, D1/D2 retired, M1+C1 cascada (DEC-REF-53)`
3. `docs(session-42): cierre A4 — pack reconciliado, cadena M1→C1 validada E2E, BACKLOG-RULE-5 (v0.27)`

### Estado del entorno al cierre R5

- Motor edge PID **32527** (relanzado en R5).
- Sim `run.js` PID 9163 (intocado desde #40).
- docker Up: mongo/emqx 7d, node 9h.
- Mongo `rulepacks`: `[cummins-pcc-v1]` (5 reglas, version 2).
- `data` SERVICE creciendo activamente (TENANT-9 sostenido).
- Backup pre-migración: N/A (este seed es idempotente por
  `findOneAndUpdate`; el pack anterior con 4 reglas D solo puede
  recuperarse desde `git show` del archivo pre-R5).

### Pendiente — próxima sesión (#43)

- **A5-A8 del carril**: backend MVP (endpoints de sites, feed de
  alarmas DEC-REF-43/44, ACK con auditoría DEC-REF-46, consola de
  reglas superadmin DEC-REF-42).
- **BACKLOG-RULE-5**: migración de M1 a pack ATS propio (no urgente).
- **BACKLOG-RULE-4**: reglas de mantenimiento preventivo por horas
  de uso (disparador BACKLOG-EDGE-1 driver Modbus).
- **BACKLOG-SIM-4**: modelado real de `transfer_state` (criterio Área
  3) para desbloquear cascada energética completa.
- Fase B (frontend) y Carril 2 (consola) siguen después según #37.

### R6 — Fix convención + cierre formal

**Violación detectada:** en R5 (paso 8) modifiqué retroactivamente la
fila `DEC-REF-53` de la tabla del registro para agregar los
refinamientos R4 (A0 + opción (b) madre M1). El texto de la fila 53
había sido commiteado como parte de `72228c0` (R2) y toda modificación
posterior debe ir como fila propia — precedente `DEC-REF-52-A` (R6
sesión #41). Regla ratificada por Franco al cierre de A4.

**Fix aplicado:** (a) `DEC-REF-53` restaurada al texto de `72228c0`
recuperado con `git show`; (b) creada fila nueva `DEC-REF-53-A` con los
refinamientos R4 (A0 warning + M1 madre + verificación estática del
gate `ruleEngine.js:29-30` + `C1.correlationParent` + referencia
BACKLOG-RULE-5 + resumen del pack final 5 reglas version 2 +
verificación E2E); (c) reorden de la tabla §5e `BACKLOG-RULE-4` antes
que `RULE-5` (convención append-only aplica a la bitácora, no a las
tablas del registro numérico); (d) bump v0.27 → **v0.28**.

### Sesión #42 CERRADA

- **A4 CERRADO** — pack productivo `cummins-pcc-v1` reconciliado (5
  reglas, version 2), BACKLOG-RULE-3 resuelto, `graceSec` formalizado
  en `rule_definition.js` (D3), cadena M1→C1 validada E2E sobre datos
  reales del sim (correlationParent persistido en Mongo — vista de
  cascada DEC-REF-41/50 con insumo real).
- **Registro:** WanomiRefactor.md **v0.28** con `DEC-REF-53` + `53-A`,
  `BACKLOG-RULE-4` y `RULE-5` (reordenadas en §5e); `BACKLOG-RULE-3`
  cerrado con referencia (entrada preservada).
- **Commits de #42** (5 commits, incluido este de cierre): `72228c0`
  registro DEC-REF-53 (v0.26), `6d1dc02` schema graceSec, `d95c653`
  seed reconciliado, `735271a` cierre A4 (v0.27), `[hash R6]` este fix
  convención (v0.28). Rango final pusheado se completa post-push.
- **Entorno al cierre**:
  - Motor edge PID **32527** (relanzado en R5 con env íntegro).
  - Simulador `run.js` PID **9163** (intocado desde #40, publicando
    sano bajo SERVICE).
  - Docker: `node` Up 21h, `emqx` Up 7d (healthy), `mongo` Up 7d (healthy).
  - Mongo `rulepacks`: `[cummins-pcc-v1]` (5 reglas, version 2).
  - `data` SERVICE: **155,948 docs** (last `2026-07-06T12:56:40Z`) —
    self-heal TENANT-9 sostenido, sim publicando activamente.

### Pendiente — próxima sesión (#43)

- **A5 del carril** (backend MVP) — decidido por Franco al cierre de
  #42. Endpoints de sites, feed de alarmas DEC-REF-43/44, ACK con
  auditoría DEC-REF-46, consola de reglas superadmin DEC-REF-42.
- **Backlog vigente**: BACKLOG-RULE-4 (mantenimiento por horas),
  BACKLOG-RULE-5 (migración M1 a pack ATS), BACKLOG-SIM-4 (dominio
  real `transfer_state`), BACKLOG-OPS-1 (durabilidad EMQX),
  BACKLOG-OPS-2 (deriva `.env` ↔ CLAUDE.md), BACKLOG-API-1 (hardening
  enrichments `GET /device`).

> Nota de forma (R7): el bloque R6/cierre fue insertado originalmente en
> la sección de Sesión #41 por artefacto de posición del edit (pusheado
> en 0fdfe56) y reubicado aquí. Corrección de contenido, no cosmética —
> salvedad del precedente #41. Decidido por Franco.

## Sesión #43 — 2026-07-06 · Área 2 · A5 (backend MVP: recon de alcance)

> Nota: los hashes pendientes del cierre #42 (`[hash R6]` en línea 3344 y
> commit R7 de reubicación) son **`0fdfe56`** (R6 — fix convención +
> v0.28) y **`98082e6`** (R7 — reubicación R6/cierre a sección #42). Se
> resuelve el placeholder por append sin editar el bloque cerrado de #42
> (convención append-only ratificada en #42/R6).

### R1 — Recon dirigido (STOP GATE 1)

Recon read-only del alcance A5 (endpoints sites, feed de alarmas
DEC-REF-43/44, ACK DEC-REF-46, consola DEC-REF-42). Hallazgos:
- Feed de alarmas hoy: `GET /notifications` (`webhooks.js:188`) gateado con
  `buildReadFilter('Notification')`; con `?siteId=X` retorna hasta 50 docs
  sort time desc, sin filtro `readed`. `correlationParent`/`mode` viajan
  crudos (sin projection).
- `/sites/status` (`sites.js:81`) agrupa por siteId (site-level) con
  ventana 15 min windowed (DEC-REF-27). Falta la variante por variable
  que pide DEC-REF-43.
- ACK actual: `PUT /notifications` (`webhooks.js:218`) solo setea
  `readed:true`, sin `acknowledgedBy`/`ackAt` (ambos ausentes del schema
  en `app/api/models/notifications.js` y en `edge-engine/notificationRouter.js`).
  Match query `{userId, _id}` sin `buildReadFilter`/`buildWriteFilter` —
  falla silente para cellowner sobre notifs de la cuenta de servicio.
- Consola de reglas: **no hay endpoint HTTP** para RulePack (0 rutas), **no
  hay página frontend**. Único acceso: seeds directos a Mongo + boot del
  motor edge en `siteState.js:22` (`RulePack.find({canary:false})`). Motor
  **sin hot-reload** — un pack nuevo requiere reiniciar el proceso PID 32527.
  `crossExpr` sí existe en `rule_definition` schema (línea 42).
- Endpoints sites/zones/devices: reads gateados (`buildReadFilter`),
  writes SIN gate (BACKLOG-TENANT-3). Zone: sin ruta HTTP dedicada.

Estado entorno al cierre R1: sim PID **9163**, edge PID **32527**, docker
Up (node 22h, emqx/mongo 7d). Mongo: `data.count = 159,859` (+3,911 desde
#42), notifs 354 (+276), sites 4, devices 10, rulepack 1 (`cummins-pcc-v1`
v2, 5 reglas). Cadena M1→C1 persistida (1 notif con
`correlationParent != null` + 1 con `mode:'cross'`).

### R2 — Decisión de sala: bloque A5-A9 sin backlog residual

Franco resuelve: los cuatro frentes candidatos se ejecutan junto con los
backlog vigentes relacionados como bloque cerrado — **A5-A9 esta sesión,
sin diferimientos**. Registrado como **DEC-REF-54** en
`docsRefactor/WanomiRefactor.md` (v0.28 → **v0.29**).

Plan A5-A9:
- **A5** — Feed alarmas site (DEC-REF-43): handler dedicado
  `GET /site/:siteCode/alarms` en `sites.js`, cursor por `time`, mapa
  `{variable → peor severidad 15 min}` reusando la ventana de
  `/sites/status`, response con `correlationParent`/`mode` crudos.
  Agrupación madre→hija (DEC-REF-50) en frontend.
- **A6** — `buildWriteFilter` + ACK auditable + cierre BACKLOG-TENANT-3:
  `buildWriteFilter` genérico espejo de `buildReadFilter`, `acknowledgedBy`
  + `ackAt` separados de `readed` (DEC-REF-45/46), notifs preexistentes
  `ackAt:null` sin migración, writes de Site/Device/Notification gateados.
- **A7** — Zone CRUD gateado + real-time-lite DEC-REF-44: ruta `zones.js`
  nueva; `layouts/default.vue` reemite `wanomi:notif` al bus; vista de
  detalle de site escucha y re-fetchea acotado.
- **A8** — Consola superadmin (DEC-REF-42) absorbiendo BACKLOG-RULE-2,
  BACKLOG-EDGE-2 y DEC-REF-47 (hoja de suma del constructor cross).
- **A9** — OPS-1 + OPS-2 + API-1 como pull operacional único.

RISK-SEC-1/2 mantiene trigger registrado (rotación diferida al despliegue
a producción, sin cambio). Backlog absorbidos NO se editan; anotados con
`>` blockquote debajo de la tabla respectiva (patrón §5a).

Este prompt ejecuta **A5+A6+A7** con gates internos (STOP si falla la
validación de cualquier fase). A8 y A9 se retoman en prompts posteriores.

### R3 — A5 ejecutado (feed alarmas del detalle de site)

Handler nuevo `GET /site/:siteCode/alarms` en
`app/api/routes/sites.js:130-197`. Reglas de gate:

- `Site.findOne({...buildReadFilter('Site'), siteCode})` → 404 si el
  gate niega (mismo comportamiento que `/site/:siteCode/full`).
- Feed: `Notification.find({...buildReadFilter('Notification'), siteId,
  ...(before?time:{$lt:before}:{})}).sort({time:-1}).limit(limit).lean()`.
  Sin projection — `correlationParent` y `mode` viajan crudos.
- Mapa `variableSeverity`: aggregate con la MISMA ventana `SEVERITY_WINDOW_MS
  = 15*60*1000` (constante nueva a nivel de módulo, reusada también por
  `/sites/status` — antes era una constante local de handler).
- `limit` default 50, cap 200; `before` cursor por `time` numérico.
- Respuesta: `{status, data: {siteCode, alarms, variableSeverity, cursor}}`.

E2E `curl` con JWT firmado en runtime (5 checks):
- **a**: cellowner `GET /site/CR00061/alarms` → 200, 50 alarms + cursor
  `1783360112505` + `variableSeverity:{oil_pressure:'critical'}`. Sin
  paginar hay 50 A0/A1 recientes (variables de aceite disparando).
- **a-bis**: paginación al pasado (`before=1783341600000`) trae la cadena
  M1→C1: `M1 _id=6a4ba166... time=1783341414166 mode=direct`; `C1
  _id=6a4ba1c9... time=1783341513487 mode=cross
  correlationParent=cummins-M1-mains-loss`. La cadena persistida en #42
  llega **cruda al feed** sin proyección que la mate.
- **b**: `?limit=2` + `?limit=2&before=<cursor>` avanza sin duplicados
  (page1 IDs `...7629, ...7627` · page2 IDs `...7624, ...7623`).
- **c**: personal-user → 404 "Site not found" (gate del Site niega antes de
  llegar al feed — más estricto que 403 y semánticamente coherente con
  `/site/:siteCode/full`).
- **d**: admin → 200 con data.
- **e**: siteCode inexistente → 404 limpio (`{status:"error",error:"Site
  not found"}`), sin stack trace en el response.

Commit: **`130c4da`** — `feat(api): GET /site/:siteCode/alarms — feed
gateado + mapa variable→severidad (DEC-REF-43, DEC-REF-54)`.

### R4 — A6 ejecutado (buildWriteFilter + ACK auditable + writes gateados)

**buildWriteFilter** (`app/api/middlewares/scope.js:139-160`): espejo
exacto de `buildReadFilter` — mismas 4 ramas (DENY / null / {} / positivo),
misma composición. JSDoc registra la elección semántica.

**Schema `notifications`** (ambos lados):
- `app/api/models/notifications.js`: `acknowledgedBy` (String, default
  null) + `ackAt` (Number, default null). Enum de `mode` alineado con edge
  (`['direct','calibrated','fallback','no-ref','window','cross']`).
- `edge-engine/notificationRouter.js` NotificationRO: mismos dos campos.
  Motor no los llena (default null) — set exclusivo desde app.

**Endpoint ACK** (`sites.js:206-262`): `PUT
/site/:siteCode/alarms/:notificationId/ack`. Doble gate: `buildReadFilter('Site')`
sobre el siteCode + `buildWriteFilter('Notification')` sobre el notif.
Idempotente: si `ackAt != null`, responde 200 con la autoría original y
`idempotent:true`; nunca sobrescribe.

**Writes gateados**:
- `sites.js`: POST /site rechaza con 403 explícito si `scope===null` o si
  el grant no cubre operatorCode/zoneCode del payload; DELETE/PUT y
  bind/unbind pasan por `buildWriteFilter('Site')`/`buildWriteFilter('Device')`.
- `devices.js`: DELETE /device gateado con `buildWriteFilter('Device')` +
  findOne guard (404 si no matchea).
- `webhooks.js` PUT /notifications: reemplaza `{userId:req.userData._id}`
  por `{...buildWriteFilter('Notification'), _id}` — fin de la falla
  silente sobre notifs de la cuenta de servicio. Respuesta 403 si
  `matchedCount===0` (Mongoose 5 usa `result.n`; guardado defensivo por
  compat futura con Mongoose 6+).

**Restart de node** (código nuevo) y **restart del edge**: PID viejo
32527 killeado tras capturar `/proc/32527/environ` (`SITE_ID=CR00061`,
`MONGODB_URI=mongodb://iotixmongo:...@localhost:27017/iotix`,
`MQTT_HOST=mqtt://localhost:1883`, `MQTT_USER=superiotix`,
`NODE_PATH=/root/IotLocalhost/app/node_modules`) y cwd
`/root/IotLocalhost`. Relanzado con `nohup node edge-engine/index.js`
bajo el mismo entorno — **PID nuevo 40054**.

E2E `curl` (6 checks):
- **a**: cellowner ACK notif `6a4bf6f0...` → 200, Mongo
  `acknowledgedBy=6a3458629b940316ccafa60b, ackAt=1783363405319,
  readed=false` (intacto).
- **b**: admin re-ACK → 200 `idempotent:true`, autoría original
  preservada (cellowner sigue como `acknowledgedBy`, `ackAt` intacto).
- **c**: personal ACK sobre CR00061 → 404 "Site not found" (site gate
  fail-closed antes del notif gate; explícito, no silencioso).
- **d**: personal PUT /notifications sobre notif de Claro → 403 explícito
  ("forbidden: grant does not cover..."); cellowner sobre la misma →
  200 y `readed:true` en Mongo (fix confirmado de la falla silente).
- **e**: personal POST /site → 403; admin POST /site (con cleanup
  posterior) → 200 `TEST-A6-01`.
- **f**: edge post-restart escribe notifs con campos nuevos en null
  (schema parity sin romper el flujo): 3 notifs post-restart con
  `acknowledgedBy=null, ackAt=null`. Sim + edge PIDs vivos (9163,
  40054); `data.count = 199,519` (+39,660 respecto al arranque R1),
  ingesta viva.

Commit: **`b4b9b0a`** — `feat(auth+api): buildWriteFilter + ACK
auditable + write-gates Site/Device/Notification (DEC-REF-46, cierra
BACKLOG-TENANT-3)`.

### R5 — A7 ejecutado (Zone CRUD + real-time-lite)

**Zone en el árbol de tenancy**: `hasDenyFallback('Zone')` = true
(entidad jerárquica sin `userId` en schema — sin ownership fallback,
fail-closed sin grant, análogo a Notification/Template). Nueva rama
en `scopeFilterFor` que filtra Zone por `operatorCode` (+ `zoneCode`
si el grant lo especifica).

**Ruta nueva** `app/api/routes/zones.js`:
- GET /zone → gateado por `buildReadFilter('Zone')`.
- POST /zone → checa manualmente si el actor es superadmin O tiene un
  grant que cubra `operatorCode` (+ zoneCode del grant si aplica);
  403 explícito si no.
- PUT /zone → `updateOne({...buildWriteFilter('Zone'), zoneCode,
  operatorCode}, {$set: {displayName}})`; 403 si `matched===0`.
- DELETE /zone → findOne gateado + `Site.countDocuments` para bloquear
  409 si hay sites vivos colgados de la zone (integridad referencial),
  y `deleteOne` bajo el mismo write filter.
- Registrada en `app/api/index.js:29`.

**Real-time-lite (frontend)**:
- `app/layouts/default.vue`: en el handler de mensaje MQTT tipo `notif`,
  se agregó `this.$nuxt.$emit('wanomi:notif', raw)` DESPUÉS del toast +
  badge existentes (sin quitar nada). Sin tópicos MQTT nuevos.
- `app/pages/sites/_siteCode.vue`: `data()` gana `alarms:[]`,
  `variableSeverity:{}`, `alarmsCursor:null`, `_notifHandler:null`.
  `mounted` corre `loadAlarms()` una vez + subscribe al bus
  `wanomi:notif` que dispara re-fetch acotado. `beforeDestroy`
  desregistra el handler (sin leaks) además del map cleanup existente.
  `loadAlarms()` pega a `/site/:siteCode/alarms?limit=50` con el token
  del store y guarda el response; falla transitoria del feed no rompe
  la vista.

**Rebuild frontend**: `docker-compose -f docker_nuxt_build.yml up`
completó (`dist/` regenerado con las 12 rutas — /sites incluida) y
`docker restart node` levantó la nueva build. Node sirve, sim y edge
siguen vivos.

E2E:
- **a — Zone CRUD** (todos con curl+JWT):
  - Admin GET → NEA (1 zona) · Cellowner GET → NEA (en scope) ·
    Personal GET → [] (DENY sin grants).
  - Admin POST `test-a7` → 200 `{status:"success",zoneCode:"test-a7",
    operatorCode:"claro"}`.
  - Personal POST → 403 `forbidden: grant does not cover this
    operator/zone`.
  - Admin DELETE `test-a7` → 200. Mongo residuo: solo NEA (1) — cleanup
    limpio.
- **b — backend RTL**: `GET /site/CR00061/alarms?limit=3` post-rebuild
  → 200, 3 alarms, `variableSeverity:{oil_pressure:critical}`, cursor
  `1783364111915`, campos `ackAt/acknowledgedBy` presentes (null) por
  paridad de schema.
- **c — validación visual (PENDIENTE DE FRANCO)**: abrir vista del
  site `CR00061` en el browser (`/sites/CR00061`), disparar en el sim
  el escenario `mains_failure_ats_transfer` (comando del sim console o
  MQTT directo al topic de control del ATS), observar que la vista:
  1. Recibe la notif (toast rojo y badge de navbar suben — DEC-REF-44
     comportamiento existente).
  2. Re-fetchea `/site/CR00061/alarms` sin refrescar la página (nueva
     llamada visible en Network tab del devtools; `alarms` y
     `variableSeverity` se actualizan reactivamente en `data()`).
  3. Ejecutar luego `mains_restore` y volver a observar el ciclo.
  La UI/UX del feed y del coloreo por variable son sub-pasos UI-1/UI-2
  posteriores; en este prompt el data-flow queda correcto pero el
  render visual del feed no está agregado al template.

Commits: **`25921ae`** — `feat(api): Zone CRUD gateado (DEC-REF-54)`; y
**`e4adeae`** — `feat(front): real-time-lite feed de site via bus $emit
(DEC-REF-44)`.

### Estado del entorno al cierre R5

- Motor edge PID **40054** (relanzado en R4 con env íntegro).
- Sim `run.js` PID **9163** (intocado desde #40).
- Docker: `node` Up post-rebuild, `emqx` Up 7d (healthy), `mongo` Up 7d
  (healthy).
- Mongo `rulepacks`: `[cummins-pcc-v1]` (5 reglas, version 2).
- Mongo `notifications`: 354+ notifs, 1 con `correlationParent`, 1 con
  `mode:cross`, y desde R4 los nuevos ACK (una notif con
  `acknowledgedBy=6a3458629b940316ccafa60b`).
- Mongo `data` ingesta viva (159,859 → 199,519 durante la sesión).

### Pendiente — STOP GATE 2

- **Validación visual R5.c** (Franco): browser + disparo de escenario en
  el sim + observación del re-fetch acotado.
- **A8** (consola superadmin, DEC-REF-42 absorbiendo BACKLOG-RULE-2,
  BACKLOG-EDGE-2, DEC-REF-47) — prompt posterior.
- **A9** (BACKLOG-OPS-1 + BACKLOG-OPS-2 + BACKLOG-API-1) — prompt
  posterior.

Range de commits de este prompt (6 commits, incluido este de cierre):
`ad1cc93` registro DEC-REF-54 + bitácora (v0.29), `130c4da` A5 feed,
`b4b9b0a` A6 write-gates+ACK, `25921ae` A7 Zone CRUD, `e4adeae` A7 RTL
frontend, `[hash R5-cierre]` este cierre de bitácora. **SIN PUSH**.

### R6 — Registro pendiente + diagnóstico RTL fallado

Resolución del placeholder `[hash R5-cierre]` de R5 (por append, patrón
#42/R6): commit de cierre de R5 = **`0815953`**.

**Segunda cascada M1→C1 validada (backend end-to-end reproducible)**:
- Trigger `mains_failure_gen_no_start` sobre ATS `6z4LN2md` a
  `1783366180033`.
- **T+68.6s** `cummins-M1-mains-loss` (`mode:direct`, raíz — el delay vs
  T+0 vino del cooldown residual 300s del disparo previo del scenario
  `mains_failure_ats_transfer`, no del motor).
- **T+94.7s** `cummins-C1-mains-loss-gen-no-start` (`mode:cross`,
  `correlationParent:cummins-M1-mains-loss`). Delta M1→C1 = 26.1s
  (comprimido por lo mismo — la condición evento-gatillo estuvo activa
  desde T+0 pero M1 recién emitió a T+68.6s; C1 midió su `graceSec`
  contra el evento, no contra M1). Semántica correcta.
- Contadores Mongo: `correlationParent != null` pasó de **1 → 2**;
  `mode:cross` pasó de **1 → 2**. La cascada validada en #42/R5 se
  reproduce sobre el pack productivo `cummins-pcc-v1` v2 sin
  intervención humana en la geometría.
- Ciclo cerrado con `mains_restore`: estado ATS final `mains_voltage=220,
  mains_freq=50, gen_status=STOPPED, gen_voltage=0, transfer_state=AUTO`.
  Coherente con el modelo del sim; las limitaciones de escenografía
  quedan en BACKLOG-SIM-3/-4 sin bloqueo.

**Pin rojo post-restore — DECISIÓN DE FRANCO (registrada)**: el pin de
CR00061 quedó rojo tras restaurar la AC. Comportamiento **correcto**
del handler actual (`sites.js:88-100` — aggregate en ventana
`SEVERITY_WINDOW_MS = 15 min` sobre notifs con severidad `warning`/
`critical`); el motor NO emite eventos de "resolve", el color decae
sólo cuando las notifs caen fuera de la ventana. Vs letra de
DEC-REF-45 ("color = condición activa; se apaga por silencio/
resolución"), la implementación es una PROXY con lag.

Decisión de sala:
- **NO** calibrar la ventana (5-10 min) por riesgo de titileo cuando
  la ventana ≈ cooldown de una regla (una regla que refire cada
  cooldown mantendría el pin encendido por ventanas seguidas con
  gaps intermitentes de color OK — peor UX que el lag actual).
- **SÍ** cerrar el gap con **resolve events en el motor edge**:
  cuando una regla D detecta que su `condition` dejó de cumplirse
  (evento entrante que no matchea), emite un evento de resolución
  (variante ya existente en el patrón reactivo DEC-REF-26/-48).
  `/sites/status` pasa de "hay notifs recientes" a "hay
  reglas-condición actualmente activas" — estado real, no proxy.
  Diseño y ejecución en **A8** (junto con el resto del rework del
  motor por consola). Sin efecto en A5-A7 ya ejecutados.

**GATE 3.c EN ROJO — validación visual falló**. Durante la cascada
recién validada, el browser en `/sites/CR00061`:
- NO mostró toast rojo (comportamiento PREEXISTENTE al bloque #43,
  vía DEC-REF-38 pieza 3).
- NO ejecutó re-fetch de `/site/:siteCode/alarms` (comportamiento
  A7 nuevo — imposible, depende del toast que también falló).

Como el `$emit('wanomi:notif')` que agregué en A7 se ejecuta en la
MISMA rama del handler que el toast y AGUAS ABAJO del toast
(`layouts/default.vue:289-303` cambio de A7), la falla es aguas
arriba: **el mensaje MQTT `notif` no está llegando al browser**.

Causa raíz (confirmada en R6, ver detalle abajo): **desalineación
entre topic del publisher y ACL/subscribe del browser**. El
publisher (motor edge + legacy webhooks) publica a
`${userId}/dummy-did/dummy-var/notif` (formato legacy de la era
mono-tenancy); el browser suscribe a `${owner}/${realDid}/+/notif`
(formato B-narrow DEC-REF-38) — el segmento 2 (`dummy-did`
literal) no matchea ningún dId real, y el `+` está en pos 3, no
en pos 2. Regresión de compatibilidad entre DEC-REF-38 (B-narrow
por dId) y el path legacy de publish notif (nunca actualizado).
No es bug de A7. Diseño de fix en parte D de este R6.

**Flag oil_pressure crítico sostenido** (feed inundado): el sim
publica `oil_pressure=0` de forma permanente porque `gen_running`
del sharedState del site nunca fue verdadero en dev
(`sensor-engine.js:130` — `if (!sharedState.gen_running) return
0`). Umbrales del pack v2 A0/A1 (`<2.0` / `<1.0`) sin conversión
de unidades vs. el rango operativo real del sim (35-55 **psi**
cuando el gen corre — `sensor-engine.js:131`). No es regresión de
#43; es un desalineamiento de unidad y de condición de arranque
que sobrevive de DEC-REF-53/BACKLOG-RULE-3. Diagnóstico limpio en
parte C; sin fix (fuera del alcance de A5-A7).

Commits post-R5-cierre en este R6 (solo docs, sin push):
`[hash R6]` — este append. **SIN PUSH**.

---

## Diagnóstico técnico R6 — detalle

### B1 — ¿El motor edge publica MQTT `notif`?  **SÍ, confirmado**

Publisher edge: `edge-engine/notificationRouter.js:51`
```
const topic = `${alarm.userId}/dummy-did/dummy-var/notif`;
_mqttClient.publish(topic, msg, { qos: 0 }, ...)
```

Publisher legacy (path EMQX alarm rules, no motor): existe también
en `app/api/routes/webhooks.js:369` y `:431` con exactamente el
mismo formato `${notif.userId}/dummy-did/dummy-var/notif`.

Ambos publican al MISMO tópico. La adenda DEC-REF-38 nunca tocó
esta rama; solo reescribió las suscripciones del browser.

### B2 — Subscribe del browser + ACL del cellowner  **MISMATCH TOTAL**

Frontend suscribe (`app/layouts/default.vue:216-218`):
```
const base = d.userId + "/" + d.dId + "/+/";
["sdata", "notif", "actdata"].forEach((t) => {
  this.client.subscribe(base + t, ...);
});
```
Patrón resultante: `${ownerUserId}/${realDid}/+/notif` — donde
`realDid` es el dId real del device.

ACL del cellowner (Mongo `emqxauthrules.subscribe` para
`userId=6a3458629b940316ccafa60b`, 31 tópicos):
- `6a3458629b940316ccafa60b/#` (namespace propio, no tiene datos
  post-TENANT-4).
- Diez tríos `6a3992b435afd807a7f992fe/<realDid>/+/{sdata|notif|
  actdata}` para los 10 devices SERVICE (patrón B-narrow
  DEC-REF-38).

Publisher: `6a3992b435afd807a7f992fe/dummy-did/dummy-var/notif`.
- Primer segmento: matchea el owner (`6a3992b435afd807a7f992fe`).
- Segundo segmento: `dummy-did` — no matchea ningún dId real
  autorizado en la ACL (no hay `/dummy-did/` allowlisted).
- Tercer segmento: `dummy-var` — matchearía el `+` **si** el
  segundo hubiera matcheado.

Resultado: **EMQX bloquea la entrega** al cellowner. El browser no
la recibe. Toast + `$emit` no se disparan. Regresión histórica de
DEC-REF-38 vs. path legacy de publish.

### B3 — Prueba de humo (observación viva)  **CONFIRMADA**

`mosquitto_sub` con superuser (bypass ACL) al patrón
`+/dummy-did/dummy-var/notif` durante 45 s:
```
6a3992b435afd807a7f992fe/dummy-did/dummy-var/notif
[CRITICAL] Presión de aceite baja | CR00061 | 0 Bar | umbral: 1 Bar
```
1 mensaje capturado durante la ventana (A1 natural del pack,
disparó según cooldown). El publisher funciona. Solo la ACL/
subscribe del browser no lo alcanza.

### B4 — Checks devtools (para Franco, contraste posterior)

Si tras el fix propuesto en D todavía no llega el toast, correr
en el browser en `/sites/CR00061` con devtools abiertos:
1. **Network → WS** (filtro WebSocket): debe verse una conexión
   viva a EMQX (`ws://<host>:8083/mqtt`) con packets fluyendo
   ("MQTT" opcode).
2. **Console**: buscar `MQTT subscribe error` (logueado en
   `layouts/default.vue:220`). Los errores enumeran el tópico
   rechazado por ACL — si aparece
   `6a3992b435afd807a7f992fe/6z4LN2md/+/notif` con error, la ACL
   no fue rehidratada tras el último login (rehidratación fresca
   descrita en `users.js:192-205`).
3. **Console**, tras un fire del sim: buscar `Message from topic
   ...` (logueado en `layouts/default.vue:282`). Si no aparece,
   el tópico llega bloqueado; si aparece con `dummy-did` en el
   texto, el fix del publisher no está en producción.

### C — Diagnóstico oil_pressure  **UNIDAD + CONDICIÓN DE ARRANQUE**

Sim `sensor-engine.js:54-68` `initialCumminsState()`:
`oil_pressure: 0.0` (base).

Evolve `sensor-engine.js:130-132`:
```
case 'oil_pressure':
  if (!sharedState.gen_running) return 0;
  return clamp(currentValue + jitter(1), 35, 55);
```

Interpretación:
- Cuando `gen_running=false` en el sharedState del site (99% del
  tiempo en dev — no hay demanda que arranque el gen), `oil_pressure`
  se **fija en 0** en cada tick.
- Cuando `gen_running=true`, rango operativo **35-55 psi** (no Bar
  — es rango típico Cummins en psi; en Bar sería ~2.4-3.8).

Pack v2 (`cummins-pcc-v1`, DEC-REF-53): A0 warning `<2.0 Bar`, A1
critical `<1.0 Bar`. Umbrales redactados en Bar (BACKLOG-RULE-3
resuelto para el rename de variable, no para la conversión de
unidad — la resolución fue "opción (a) rename simple"). El motor
compara `oil_pressure < 1.0` numéricamente, sin unidad; cualquier
psi del rango real cruzaría igual, pero como el sim publica `0`
permanente, la comparación cruza cada cooldown.

Notif texto (`notificationRouter.js:47-51`): "0 Bar | umbral: 1
Bar" — el mensaje asume Bar; el sim entrega psi (o 0 permanente).
Confusión de unidad no resuelta.

**Este NO es alcance de A5-A7**. Es un backlog independiente entre
sim y pack. Registrar como observación limpia; DEC-REF-14 y plan
#32 diferían la adaptación del sim, y BACKLOG-SIM-3 documenta el
espacio del disparo de escenarios (no cubre unidad de oil).

### D — Causa raíz RTL + insumo de diseño (fix NO aplicado)

**Causa raíz**: legacy pattern `${userId}/dummy-did/dummy-var/notif`
predata DEC-REF-30/38 (namespace por userId + B-narrow por dId).
Post-DEC-REF-38 el subscribe del browser es por (owner, realDid),
con la ACL espejo — el publisher nunca migró.

**Dimensión del fix** (insumo para la sala, NO aplicado):

| Componente | Cambio conceptual | Detalle |
|---|---|---|
| Publisher edge | Cambiar tópico | `notificationRouter.js:51` — de `${alarm.userId}/dummy-did/dummy-var/notif` a un formato que matchee las suscripciones B-narrow. Candidatos: `${owner}/${dId}/${variable}/notif` (matchea con `+` en pos 3 de la ACL actual), o topic dedicado por-site `${owner}/${dId}/notif` (formato de 3 segmentos — requeriría un rediseño más profundo del handler frontend y otra ACL). |
| Publisher legacy | Mismo cambio | `webhooks.js:369` y `:431`. Mantener paridad para no dejar un canal en formato viejo. |
| Payload | Considerar migrar a JSON | Hoy es texto plano legible; para que `$emit('wanomi:notif', payload)` traiga siteId/severity/ruleId estructurado (no solo el string), habría que emitir JSON. `sendMqttNotif` ya lo hace en el path NOC edge (`notificationRouter.js:83`, qos:1); podría reusarse el mismo helper con topic distinto para dashboard. |
| ACL browser | Sin cambio | La ACL ya autoriza `${owner}/${realDid}/+/notif`; cualquier topic que respete la forma `${realOwner}/${realDid}/*/notif` cae dentro. |
| Frontend handler | Micro-ajuste | Si el payload pasa a JSON, cambiar `layouts/default.vue:290-295` para parsear + mostrar. `$emit` gana un payload rico para que el re-fetch del site pueda filtrar `if (payload.siteId === this.siteCode) loadAlarms()` en vez de re-fetch ciego. |
| Frontend re-fetch | Optimización opcional | Con siteId en el payload, se evita re-fetch cuando la notif es de otro site. Hoy `_siteCode.vue:_notifHandler` re-fetchea sin filtrar — funcional pero derrochador si el cellowner tuviera muchos sites abiertos. |

**Puntos de decisión de sala**:
1. **Tópico**: reusar `+` de pos 3 (`${owner}/${dId}/${variable}/notif`,
   invasión mínima), o rediseñar por site (`${owner}/${dId}/notif` de
   3 segmentos, obliga a nueva ACL y ajuste del handler split de
   4 segmentos en `layouts/default.vue:286-287`).
2. **Payload**: texto vs. JSON.
3. **Convive con el `data.userId` real** de la notif (owner), no con
   el cellowner id — la ACL B-narrow ya cubre eso.

Sin resolve events (decisión de sala para A8), la limitación del
pin sigue vigente en el interim. El fix del RTL es separable y
más chico — se puede incorporar como sub-paso al inicio de A8, o
como A7.1 aparte si Franco quiere cerrarlo antes.

**STOP GATE 3-bis: hasta acá el diagnóstico. Franco + sala
deciden qué opción de fix se lleva antes de la próxima escritura.**

### R7 — Decisiones aprobadas (previo a ejecución A7.1/A7.2)

Sala decide (Franco), previo a implementar:

- **DEC-REF-55 (A7.1 — fix RTL)**: tópico `${owner}/${dId}/alarm/notif`
  (segmento 3 FIJO literal `alarm` — la variable viaja en el payload,
  no en el tópico; esquiva variables con `/` como el `n/a` de C1).
  Payload JSON `{siteId, severity, ruleId, variable, message, time,
  correlationParent, mode}`. Paridad obligatoria en los tres
  publishers (edge `notificationRouter.js:51` + legacy
  `webhooks.js:369` + `webhooks.js:431`). ACL B-narrow sin cambios
  (ya autoriza `${owner}/${realDid}/+/notif`, el `+` matchea
  `alarm`). Frontend: parsea JSON con try/catch, `$emit` con objeto,
  vista de detalle filtra `payload.siteId === this.siteCode` antes
  del re-fetch (fin del re-fetch ciego).

- **DEC-REF-56 (A7.2 — inhibición aceite)**: A0/A1 pasan a
  condición compuesta `<motor corriendo> AND <oil_pressure <
  umbral>`. Fundamento de campo: genset detenido reporta 0 por
  física, la alarma real requiere motor en marcha. El sim inundó
  el feed en R6 pero el bug es de producto, no del sim. Variable
  exacta de "motor corriendo" se decide en el recon micro de
  Fase 2 y se registra como DEC-REF-56-A. Pack bump a v3
  canónico. M1/C1 sin tocar.

Bump WanomiRefactor v0.29 → **v0.30**. Este prompt ejecuta
A7.1+A7.2 con gates internos.

### R7-exec — A7.1 y A7.2 ejecutados

**Commits R7 (5 commits, sin push)**:
- `6fce95f` docs registro DEC-REF-55/56 (v0.30).
- `4ac7667` fix backend (3 publishers → tópico `${owner}/${dId}/alarm/notif`
  + payload JSON con 8 campos).
- `838c5be` feat frontend (parse JSON con try/catch fallback; filtro
  por siteId antes del re-fetch).
- `73bcce1` fix pack v3 (A0/A1 pasan a type:`cross`, crossExpr
  `AND(rpm > 300, oil_pressure < umbral)`; DEC-REF-56-A registrada).
- `[hash R7-cierre]` este cierre.

**A7.1 — GATE 1 verde** (validación E2E ACL real del cellowner):
- Sub como cellowner (credenciales frescas via `POST /api/getmqttcredentials`
  con JWT del cell, `username=7Kh1998ZPX`) a los 4 topics ACL-autorizados
  del cellowner sobre owner service = `6a3992b435afd807a7f992fe/{6z4LN2md|
  Yf86psyC|Z5tKK1rN|fbXULu7a}/+/notif`. En 90s se capturaron 3 mensajes:
  ```
  6a3992b435afd807a7f992fe/Z5tKK1rN/alarm/notif
  {"siteId":"CR00061","severity":"critical",
   "ruleId":"cummins-A1-oil-pressure","variable":"oil_pressure",
   "message":"[CRITICAL] Presión de aceite baja | CR00061 | 0 Bar
   | umbral: 1 Bar","time":1783388522829,
   "correlationParent":null,"mode":"direct"}
  ```
  El cellowner que ANTES estaba bloqueado (R6 confirmó "All subscription
  requests were denied" sobre wildcards con `dummy-did`) ahora RECIBE el
  mensaje. Payload JSON válido, los 8 campos presentes, `siteId="CR00061"`,
  `message` legible.
- Legacy publishers (`webhooks.js:369, 431`): mismo formato de tópico y
  payload aplicado; no se ejercitaron end-to-end porque el path EMQX
  alarm/actuator rules no está activo (BACKLOG-OPS-1 histórico —
  `reconcile: 10 ok, 0 fixed, 0 err | alarm: 0 recreated | actuator:
  0 recreated`). Paridad de shape validada por diff estático.
- Grep residual `dummy-did` / `dummy-var` en `edge-engine/` + `app/api/`:
  **0 matches**. Limpieza completa.
- Frontend: parseo con try/catch (fallback texto plano → `{siteId:null,
  message:raw}` para robustez ante mensajes viejos en tránsito), toast
  usa `payload.message`, `$emit` emite el OBJETO. `_siteCode.vue`
  `_notifHandler` gana `if (!payload || payload.siteId !== this.siteCode)
  return;` — fin del re-fetch ciego.

**A7.2 — GATE 2 verde** (recon + seed v3 + 4 checks):
- Recon micro: `typeD.js:10-26` una sola condición op+value → NO expresa
  compound. `typeCross.js:16-119` (DEC-REF-47) AST AND/OR con hojas
  `{deviceType, variable, condition}` — SÍ expresa compound sin código
  nuevo. `ruleEngine.js:14-27` cross bypasea `rule.deviceType !==
  deviceType` (línea 29). Ambas hojas apuntan al mismo device
  (`cummins-pcc`); `findDeviceByType` resuelve al único CUMMINS del
  sitio, mismo devState para las dos leaves — funciona por
  construcción. Sim `sensor-engine.js:123-128` `rpm` target 1500
  cuando `gen_running=true`, target 0 en reposo, ramp ±100/tick.
  Umbral `rpm > 300` elegido. Registrado como **DEC-REF-56-A**.
- Seed aplicado con `MONGODB_URI` explícito + `NODE_PATH`:
  `✅ Seed OK — packId: cummins-pcc-v1 · version: 3 · reglas: 5`.
- Shape persistido verificado (lección D3 #42, strict:true silencioso):
  A0 y A1 con `type:'cross'`, `graceSec:0`, `condition:null`,
  `crossExpr` completo con las 2 hojas. G2/M1/C1 intactos.
- Edge relanzado con env íntegro (`SITE_ID=CR00061`, `MONGODB_URI`,
  `MQTT_HOST/USER/PASS`, `NODE_PATH`) — PID 47878 → **PID 48609**,
  packs cargados: `cummins-pcc-v1`, 4/4 devices hidratados.
- **Check b (silencio motor parado)**: baseline `1783388889827` (CUMMINS
  rpm=0, oil=0). **Ventana 762s (>2× A0 cooldown 300s)**: **0 fires de
  A0/A1**. rpm sostenido en 0, oil_pressure sostenido en 0 → compound
  nunca activa. Inhibición efectiva.
- **Check c (no-regresión cascada)**: `mains_failure_gen_no_start`
  trigger a `1783390406695`. Cascada:
  - **T+0.0s** M1 `cummins-M1-mains-loss` (mode:direct, raíz).
  - **T+100.5s** C1 `cummins-C1-mains-loss-gen-no-start` (mode:cross,
    `correlationParent=cummins-M1-mains-loss`).
  - **NINGUNA fire de A0/A1** durante la cascada pese a oil=0 sostenido
    — inhibición se mantiene.
  - Delta M1→C1 = 100.5s ≈ graceSec 90s + ~10s de tick → consistente
    con la validación original de #40/R7 y #42/R5.
- **Check d (feed + variableSeverity)**: `variableSeverity: {mains_voltage:
  critical, n/a: critical}` — SOLO M1/C1 vigentes. `oil_pressure` ya
  salió de la ventana de 15 min (último A1 pre-fix a `1783388856212`,
  fuera del `since = now - 15min`). Notif counts post-seed: A1=1
  (residuo pre-restart), M1=1, C1=1. **Cero A0/A1 espurios**.

### Estado del entorno al cierre R7

- Motor edge PID **48609** (relanzado en R7-Fase 2 con pack v3 cargado).
- Sim `run.js` PID **9163** (intocado desde #40).
- Docker: `node` Up post-rebuild, `emqx` Up 7d (healthy), `mongo` Up
  7d (healthy).
- Mongo `rulepacks`: `[cummins-pcc-v1]` version 3, 5 reglas (A0/A1
  cross-single-device inhibidas, G2/M1/C1 intactas).
- Mongo `notifications`: contador post-fix se mantiene sin A0/A1
  espurios; correlationParent≠null pasa a **2** (los dos C1 acumulados
  de #43 R6+R7), mode:'cross' a **3** (2 C1 + eventual futuro A0/A1
  cuando gen arranque).

### GATE 3.c — re-test visual pendiente de Franco

Pasos para observar el ciclo completo en el browser:

1. Abrir `/sites/CR00061` con **devtools abiertos** (Network + Console).
2. En la pestaña **Network** filtrar por WS (WebSocket): debe verse la
   conexión viva a EMQX (`ws://...:8083/mqtt`). Filtrar por XHR/Fetch
   para observar las llamadas a `/api/site/CR00061/alarms`.
3. Verificar que **M1 puede fire** — cooldown 300s desde el último
   disparo. La última M1 quedó a `1783390406741` (durante R7-check c).
   Consultar Mongo para el timestamp actual del último M1 y esperar
   si es necesario (`docker exec mongo mongo ... 'const m1 = db.notifications.find({ruleId:"cummins-M1-mains-loss", siteId:"CR00061"}).sort({time:-1}).limit(1); print("last:" + m1.toArray()[0].time)'`).
4. Cuando esté fuera de cooldown, disparar en el sim:
   `mosquitto_pub -h localhost -p 1883 -u superiotix -P <MQTT_PASS>
   -t 'simulator/6z4LN2md/control'
   -m '{"command":"scenario","value":"mains_failure_gen_no_start"}' -q 1`.
5. **Observar** (en el navegador, sin reload de página):
   - **Toast rojo con `payload.message`** aparece en la esquina
     (comportamiento preexistente + fix DEC-REF-55).
   - En **Network → XHR**, una nueva llamada `GET /api/site/CR00061/alarms?limit=50`
     dispara sin recargar la página. Es el re-fetch DEC-REF-44.
   - En **Console**, ver `Message from topic 6a3992b435afd807a7f992fe/
     6z4LN2md/alarm/notif ->` con el JSON del payload.
6. Espera ~90-100s: segundo toast con C1 (`Corte de AC sostenido...`) +
   segundo re-fetch de `/alarms`.
7. **Prueba de filtro por siteId** (opcional, no bloquea): abrir un
   segundo tab con `/sites/OTHER-SITE` (si existe otro site accesible
   por el cellowner). El toast dispara en AMBOS tabs (comportamiento
   preexistente del layout), pero el re-fetch de `/alarms` SOLO
   ocurre en el tab que matchea `payload.siteId === this.siteCode`.
   Verificable en Network del tab OTHER-SITE: cero request de `/alarms`
   durante los toasts de CR00061.
8. Cerrar el ciclo con `mains_restore`.

Si algo falla en 5-7, capturar `console.log` de la consola y screenshot
de Network — la causa raíz puede requerir R8. Si todo pasa, GATE 3.c
verde y bloque #43 A5-A7 queda cerrado.

### R7 — cierre formal (append post-validación de Franco, 2026-07-07)

Placeholder resuelto: **`[hash R7-cierre] = 01f9326`** (commit
`docs: bitácora #43 R7 — A7.1/A7.2 ejecutados, GATE 3.c a re-test de
Franco`, HEAD del branch `feature/telco-support`, 12 commits ahead de
origin sin push).

**GATE 3.c — VERDE.** Validación visual reportada por Franco:

- Toast rojo con `payload.message` legible en la esquina tras `mains_failure_gen_no_start`.
  Notado: primer intento requirió hard-refresh por caché de browser
  (SPA con bundle Nuxt viejo tras el `docker rebuild` — incidente de
  entorno, sin acción sobre el código). Post hard-refresh: comportamiento
  esperado.
- `GET /api/site/CR00061/alarms?limit=50` confirmado en pestaña Network
  **sin reload de página**, disparado por el re-fetch DEC-REF-44
  (real-time-lite).
- Segundo toast + segundo re-fetch a T+~100s con `cummins-C1-mains-loss-gen-no-start`
  (cascada M1→C1 intacta).
- **Cero toasts de aceite** (A0/A1) durante toda la prueba — inhibición
  compound (DEC-REF-56) sostenida en el escenario real.

**Bloque A5-A7 CERRADO.** Alcance efectivamente entregado en #43:

- **A5** — feed de alarmas del site (`GET /api/site/:code/alarms`)
  con `variableSeverity` derivada (DEC-REF-43).
- **A6** — `buildWriteFilter` centralizado + ACK auditable con
  `TENANT-3` cerrado (`ackBy`, `ackAt` requeridos + fallback owner)
  (DEC-REF-46).
- **A7** — Zone CRUD (RBAC completa cellowner scoped) + Real-Time-Lite
  (DEC-REF-44) con re-fetch WS-triggered.
- **A7.1** — fix tópico/payload notif `${owner}/${dId}/alarm/notif` + JSON
  (DEC-REF-55) — corrige mismatch pre-existente.
- **A7.2** — Inhibición A0/A1 con motor parado vía condición compuesta
  (DEC-REF-56) — pack `cummins-pcc-v1` v3 seed aplicado.

Pack v3 en Mongo: 5 reglas, A0/A1 con `type:'cross'` `graceSec:0`
`crossExpr` bilateral, G2/M1/C1 intactas.

### Estado heredado al abrir #44 (2026-07-07)

- HEAD `01f9326`, branch `feature/telco-support`, 12 commits ahead sin push.
- Working tree limpio salvo untracked conocidos:
  `.claude/`, `docs/hardware/~$nomi_guia_layout_WN-SITE-CORE.docx`,
  `docsRefactor/Hardware/conectividad_recomendada_hub.pdf`.
- Docker: `node`, `emqx`, `mongo` UP.
- Sim `run.js` PID **9163** (intocado desde #40).
- Edge PID **48609** (pack v3 cargado desde R7).
- Mongo `data.count` = **336.207** (subió de 199.519 al cierre #43 →
  ingesta viva ~135k mensajes en las últimas ~48 h, consistente con
  las 4 devices activas).
- Mongo `notifications.count` = **985** (sin espurios de aceite tras
  seed v3).
- Mongo `rulepacks`: `[cummins-pcc-v1]` version 3, 5 reglas.

---

## Sesión #44 — 2026-07-07 · Área 2 · A8 (consola superadmin: recon de apertura)

### Alcance del bloque

**A8 — Consola de reglas superadmin.** Absorbe:

- **DEC-REF-42** (contrato de A8, ver más abajo la reproducción textual).
- **BACKLOG-RULE-2** (tenancy de RulePack — grants/scope por
  `operatorId`/`zoneCode`).
- **BACKLOG-EDGE-2** (hot-reload de packs en edge sin restart —
  referencia DEC-REF-26).
- **DEC-REF-47** (deuda de RBAC de escritura sobre RulePack).
- **Resolve events** (evento inverso a `fire` cuando la condición sale
  de estado activo, decidido en #43/R6 según registro de bitácora).

Estimación: 2-3 sesiones. Esta apertura es **RECON de superficie**;
el diseño lo decide la sala con Franco DESPUÉS del recon.

### R1 — apertura + registro + recon dirigido (READ-ONLY salvo Fase A)

- **Fase A (esta escritura):** cierre formal de #43 en su bloque, apertura
  #44 con este header, smoke del entorno, commit `docs: cierre #43 (GATE
  3.c verde, bloque A5-A7) + apertura #44`.
- **Fase B (READ-ONLY):** micro-verificaciones colgadas de #43 (B0),
  contratos textuales de las DECs y backlogs absorbidos (B1), modelo
  RulePack y superficie de CRUD HTTP (B2), ciclo de vida de packs
  en el edge e implicaciones del hot-reload (B3), inventario de
  resolve events (B4), estructura de frontend para la consola (B5),
  mapa de dependencias y propuesta de orden para la sala (B6).

**STOP GATE 1** al terminar Fase B: reportar evidencia cruda y frenar.

### R2 — sala de diseño A8: decisiones D1-D6 + registro

R1 cerró con recon completo en STOP GATE 1 (commit `c672988`). La sala
de diseño con Franco tomó las siguientes decisiones sobre el reporte
del recon; se registran en el corpus canónico
(`docsRefactor/WanomiRefactor.md` §5, DEC-REF-57..60 + BACKLOG-RULE-6)
y se resumen acá para navegar la bitácora.

- **D1 — orden de sub-frentes** (→ DEC-REF-57):
  SF-1 CRUD HTTP RulePack → SF-3 hot-reload edge → SF-5 consola +
  constructor visual (en paralelo con SF-3) → SF-4 resolve events →
  SF-2 mínimo. SF-2 mínimo queda absorbido en SF-1 vía la rama
  `'RulePack'` de `scope.js` (DEC-REF-60), no como frente separado.
  Tombstone terminológico: BACKLOG-EDGE-2 en A8 y en adelante = hot-reload.

- **D2 — canal de hot-reload** (→ DEC-REF-58):
  MQTT `wanomi/edge/${SITE_ID}/reload` (segundo subscribe del edge).
  Criterio producto-real (DEC-STRAT-2) — en topología Hub remoto detrás
  de NAT, MQTT es el único canal de control que sobrevive; HTTP en edge
  y polling delta descartados. Requiere línea de ACL en EMQX
  (paraguas BACKLOG-OPS-1).

- **D3 — política de estado en reload** (→ DEC-REF-58):
  regla eliminada → limpiar sus keys en `cooldownState`/`windowState`/
  `crossState`; regla editada (contenido distinto) → limpiar sus keys,
  la definición nueva rige desde cero; regla intacta → preservar todo,
  el reload no perturba lo que no cambió.

- **D4 — resolve como campo separado** (→ DEC-REF-59):
  campo nuevo `kind: 'fire' | 'resolve'` en `notifications`, default
  `'fire'`. Las 985 notifs históricas se leen como `fire` sin migración.
  `mode` conserva su semántica de método de evaluación (no se contamina).
  Payload MQTT de DEC-REF-55 extendido con el mismo campo (aditivo).

- **D5 — UX del toast de resolución** (→ DEC-REF-59):
  visible y visualmente inconfundible respecto del de falla (paleta
  verde/azul, texto tipo "Resuelto: …"). Decisión reversible con
  criterio explícito: si en uso real resulta ruido, se suprime el toast
  y queda solo el re-fetch silencioso.

- **D6 — RBAC mínimo fail-close** (→ DEC-REF-60 + BACKLOG-RULE-6):
  `scopeFilterFor` gana rama `'RulePack'`: superadmin `{}` (match all);
  cualquier otro rol → DENY fail-close en lectura y escritura. Tenancy
  completa (`operatorId` + overrides por Zone) diferida hasta el 2º
  operador — no-hardening especulativo, coherente con DEC-REF-33/-37.
  Deuda diferida en BACKLOG-RULE-6.

Registro en corpus canónico: WanomiRefactor.md bump `v0.30 → v0.31`
(DEC-REF-57..60 + BACKLOG-RULE-6).

**Nota de corrección de proceso**: durante el registro se detectó
colisión de ID — el borrador aprobado nombraba el nuevo backlog como
`BACKLOG-RULE-4`, pero ese ID ya estaba ocupado por RULE-4 preexistente
(reglas de mantenimiento preventivo, DEC-REF-53 D2). Franco confirmó
opción 1: el nuevo se registra como **BACKLOG-RULE-6** y la referencia
final de DEC-REF-60 se ajustó al momento del append (única sustitución
textual autorizada por la sala; resto de textos idéntico al borrador).

### R3 — SF-1: CRUD HTTP RulePack (candado superadmin fail-close)

Ejecuta el primer sub-frente de A8. Cierra la brecha "el catálogo de
packs solo se escribe con seeds one-shot": ahora la escritura vive
detrás de HTTP + JWT + RBAC, respetando el mismo camino canónico
(`findOneAndUpdate` upsert + `runValidators`) que los seeds usan hoy.

**Alcance implementado.**

- **`app/api/services/ruleValidation.js`** (nuevo, 40 líneas). Extrae
  `validateCrossTree` de `edge-engine/evaluators/typeCross.js:16-50`
  a módulo compartido. Semántica preservada — `'sum-pending'` sigue
  siendo `{ok:false, reason:'sum-pending'}` (misma decisión que en
  edge, donde `siteState.js:29-43` descarta la regla con warning).
  App-side lo trata igual: 400 con razón explícita.
- **`edge-engine/evaluators/typeCross.js`** — la función local se
  reemplaza por `require('../../app/api/services/ruleValidation')`
  y se re-exporta al final. Backwards-compat con `siteState.js:4`
  que ya consume desde este path — cero cambio en `siteState.js`.
  Cross-import edge→app ya es patrón del proyecto
  (`edge-engine/siteState.js:3` require de `app/api/models/rule_pack`).
- **`app/api/middlewares/scope.js`** — rama nueva `'RulePack'` en
  `scopeFilterFor` (DEC-REF-60). Ubicada arriba, después del check
  superadmin y antes de la filtración de grants: fail-fast, sin I/O,
  sin cómputo innecesario. Retorna `DENY` explícito por Symbol —
  no `null` — para blindarse contra la aparición futura de `userId`
  en el schema RulePack (que caería en la rama ownership de
  `buildReadFilter:149` y sería 0-match por coincidencia, no por
  diseño).
- **`app/api/routes/rulepacks.js`** (nuevo, 4 endpoints).
  - `GET /rulepacks` · `GET /rulepacks/:packId` — gate por
    `buildReadFilter('RulePack')`. Superadmin ve todo; resto DENY
    (data=[] en lista, 404 en detalle — 404 evita filtrar
    información sobre existencia).
  - `PUT /rulepacks/:packId` — upsert canónico
    `findOneAndUpdate({packId}, doc, {upsert:true, new:true,
    runValidators:true, setDefaultsOnInsert:true})`. RBAC directo por
    rol (`isSuperadmin` explícito): un upsert con `DENY_FILTER` como
    filter crearía un doc nuevo con los campos del update (Mongo no
    aplica el filter al doc creado por upsert), abriendo un hueco.
    RBAC por rol lo cierra sin depender de coincidencias de shape.
    Antes del write se corre `validateCrossTree` sobre toda regla
    `type:'cross'`; primer fallo → 400 con `ruleId` y razón. Pack
    persistido "todo o nada".
  - `DELETE /rulepacks/:packId` — RBAC directo, `deleteOne`. 404 si
    no existe (idempotencia visible).
- **`app/api/index.js`** — `app.use("/api", require("./routes/rulepacks.js"))`
  espejando el patrón de `zones.js`.

**Validación E2E** contra Nuxt vivo (post-`docker restart node`),
tokens JWT firmados directo contra `JWT_SECRET` (lección #33 —
sin passwords por shell). Pack de test descartable `_test-sf1-crud`
con `canary:true` (no lo carga el motor edge — invisible al
runtime productivo). `cummins-pcc-v1` NO tocado en ningún test
de escritura/borrado — verificado post-test.

- **Cellowner** (`cellowner-nea@wanomi.test`, scope claro/nea) — 4/4 verbos DENY:
  - `GET /rulepacks` → `success · data:[]` (DENY_FILTER 0-match).
  - `GET /rulepacks/cummins-pcc-v1` → 404 (mismo filter, invisible).
  - `PUT /rulepacks/_test-cell-attempt` → 403 `superadmin required`.
  - `DELETE /rulepacks/cummins-pcc-v1` → 403 `superadmin required`.
- **Superadmin** (`admin@wanomi.com`) — 8/8 casos:
  - `PUT` create `_test-sf1-crud` v=1 con crossExpr `AND(rpm>300,
    oil<2)` → 200.
  - `GET` lista → 2 packs (`cummins-pcc-v1`, `_test-sf1-crud`).
  - `GET` detalle → v=1, rules=1, crossExpr.op=`AND`.
  - `PUT` edit v=1→2, crossExpr `OR(rpm>500, oil<1)` → 200.
  - `PUT` crossExpr `AND(children:[])` → 400
    `'crossExpr inválido en regla _test-bad: AND sin children'`.
  - `PUT` hoja sin condition → 400
    `'hoja equipo cummins-pcc/rpm sin condition'`.
  - `PUT` `{sum:[...], condition:{...}}` → 400 `'sum-pending'`
    (DEC-REF-47 hoja de suma no implementada).
  - Verificación atomicidad post-3-invalidos: pack sigue en v=2
    con `severity:'critical'` intacto — validación fail-fast, sin
    escritura parcial.
  - `DELETE` → 200. `DELETE` de nuevo → 404. Mongo: `_test-sf1-crud`
    ausente, `cummins-pcc-v1` v3/5 reglas, descripción intacta.

**Cambios diferidos** (SF-1 no los aborda):

- **Hot-reload** — los cambios via HTTP se persisten en Mongo pero el
  motor edge (PID 48609) los ignora hasta próximo start. Cierra en
  SF-3 (DEC-REF-58, arranque bajo orden explícita de Franco
  post-STOP GATE 2).
- **Tenancy full** — la rama `'RulePack'` es SF-2 mínimo (superadmin
  vs DENY). Con 2º operador se despliega `operatorId` + overrides
  por Zone según BACKLOG-RULE-6.

**Estado al cierre R3.**

- Commits: 5 en total (fase A + los 4 de SF-1). Sin push.
- Edge PID **48609** intocado (el swap de `typeCross.js` rige al
  próximo start del edge, no ahora).
- Pack `cummins-pcc-v1` v3, 5 reglas — intacto.
- Sim PID **9163** intacto.
- Docker `node` reiniciado 1 vez (para cargar `scope.js` +
  `rulepacks.js`).

**STOP GATE 2.** SF-3 (hot-reload) arranca solo con orden explícita
de Franco.
