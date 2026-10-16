# Análisis de equipo — G2 y el supervisor de calidad sobre el Hub (Orange Pi Zero 3) · 2026-10-16

**Pedido de Franco:** las decisiones de G2 que dependen del hardware se toman con los
especialistas de cada área. Este informe reúne la mirada de cada uno, separa lo que está
**medido** de lo que es **estimación** (DEC-PRED-1) y cierra con las decisiones a firmar.

## 0 · Hechos de partida (verificados en el corpus y el repo)
| Hecho | Fuente |
|---|---|
| Cada site tiene su propio Hub con **su propio Mongo local**; **no hay base central** con todos los sites. | `docs/wanomi.md` · DEC-ARCH-1 |
| Hub de campo: **Orange Pi Zero 3** (detrás de NAT, arranque autónomo crash-only). | DEC-REF-68, `WanomiRefactor.md:113` |
| Stack del compose: `mongo:4.4`, `emqx 4.2.3`, 4 contenedores `node:14` (app, edge, qa, build). | `docker_compose_production.yml` |
| **Ningún contenedor tiene límite de RAM/CPU**, y Mongo usa el caché por defecto. | idem (sin `mem_limit` / `cacheSizeGB`) |
| El supervisor (`wanomi-qa`) corre: Capa B cada 5 min y Capa C (backtest) a las 03:00. | `qa/index.js:32-33` |
| Escrituras periódicas nuevas desde G1: `rulefsm` (lote ≤ 1 s, solo instancias no en reposo) y `ruletransitions` (bitácora, vence a 30 días). | `fsmStore.js` |

**Lo que NO sabemos todavía:** qué variante de RAM del Zero 3 se compra (1 / 1.5 / 2 / 4 GB),
el almacenamiento (microSD o eMMC/USB), y el volumen real de notificaciones por día por site.

## 1 · Mirada de cada especialista

### Backend senior MongoDB / EMQX
- **I15 sin cota es el problema.** Agrupa todo `notifications` cada 5 min. Hoy se calcula en ms (409 ms la corrida completa de Capa B en el equipo de desarrollo), pero el costo crece todos los días y **no hay índice** para `{ruleId, dId, siteId, time}`. Recomienda una ventana de 30 días (coherente con el vencimiento de la bitácora) y ese índice compuesto. El mismo índice beneficia a la consola (`alarms.js` hace el mismo agrupamiento por pareja).
- **Mongo 4.4 es techo en este hardware:** Mongo ≥ 5 exige ARMv8.2 y el H618 (Cortex-A53) es ARMv8.0. Hay que quedarse en 4.4 y planificar.
- **Caché de WiredTiger:** por defecto toma ~50 % de (RAM − 1 GB), con un mínimo de 256 MB. En un Zero 3 de 1–2 GB, eso compite con EMQX y tres procesos Node. Recomienda fijar `--wiredTigerCacheSizeGB` explícito según la variante de RAM.

### Ing. software senior (Vue / Node / MQTT)
- **Cola de reintento de cierres:** está acotada por tiempo pero no por cantidad. Recomienda un tope de 200 (cada entrada pesa ~1 KB → ≤ 200 KB). Al llenarse se descarta la más vieja con log, y la detecta I15.
- **El build de Nuxt no debe correr en el Hub:** el front se compila en desarrollo y llega armado. Hoy el compose de producción incluye el contenedor de build.
- **Deuda `node:14` EOL** (ya registrada en DEC-REF-68): no la agrava G2, pero cualquier dependencia nueva tiene que seguir siendo compatible con 14.
- El resto de G2 (cierre de huérfanas, I14, test de modos) es despreciable en CPU y memoria.

### Confiabilidad industrial (KPIs, MTBF, SLA)
- **El supervisor tiene que correr en el Hub.** Por DEC-ARCH-1 el dato vive solo ahí: un supervisor central no vería `notifications` ni `rulefsm` del site. Además, I15 es exactamente el tipo de control que sostiene un SLA ("lo que ve el NOC es verdad").
- **El backtest diario es lo único pesado.** En el Hub tiene que respetar tres condiciones: correr en una franja de baja carga, tener un tope de duración y **ceder siempre ante el motor**. El motor de reglas es la función crítica, y el supervisor nunca debe demorarla.
- Pide medir antes de dimensionar: CPU y RAM del edge con el supervisor corriendo, en el hardware real.

### Integración OSS/BSS (SNMP / REST / Syslog al NOC)
- Si el supervisor corre en cada Hub, los hallazgos graves (I15, I14) tienen que **llegar al NOC**, porque nadie entra a la bandeja de calidad de cada site. Propone emitirlos por el canal de eventos al NOC que ya existe (`sendNocEvent`). Se puede hacer más adelante; anotarlo como backlog para no perderlo.

### Ing. electrónico industrial / Ing. potencia DC
- **Almacenamiento:** una microSD sufre con escrituras pequeñas y constantes (bitácora, `rulefsm`, hallazgos, telemetría). Recomienda **eMMC o SSD por USB** para el Hub de campo; la microSD solo para arranque.
- **Temperatura:** dentro de un shelter, el H618 puede bajar su frecuencia por calor (throttling). Si la medición de CPU se hace en el escritorio, va a dar números optimistas. Hay que medir con el gabinete cerrado.
- **Cortes de energía:** con arranque crash-only (DEC-REF-68), la cola de reintento en memoria se pierde en un corte. Está contemplado (caso raro #2 de G2: lo detecta I15 y se cierra desde la UI).

## 2 · Consenso del equipo
1. G2 no requiere rediseño, pero **I15 y la cola necesitan cota** antes de llegar al Hub.
2. El supervisor va **en el Hub**: lo exige DEC-ARCH-1.
3. Antes de fijar números finos (caché de Mongo, ventana del backtest), hay que **medir en un Zero 3 real**, con el gabinete cerrado. No se predice sin evidencia (DEC-PRED-1).

## 3 · Decisiones a firmar
| # | Decisión | Recomendada | Alternativa |
|---|---|---|---|
| H1 | Dónde corre el supervisor | **En el Hub** (DEC-ARCH-1), con prioridad menor que el motor. | Solo en el servidor central (no ve el dato del site). |
| H2 | I15 acotado | **Ventana de 30 días + índice `{ruleId, dId, siteId, time}`** en `notifications`. | Sin cota (crece con el historial). |
| H3 | Tope de la cola de reintento | **200 cierres**; al llenarse, descarta el más viejo con log. | Sin tope. |
| H4 | Backtest diario en el Hub | **Franja de las 03:00 con tope de duración (15 min) y ventana de datos acotada**; se ajusta con la medición de H6. | Apagado en el Hub. |
| H5 | Build de Nuxt | **Fuera del Hub**: el front llega compilado. | Compilar en el Hub. |
| H6 | Medición en hardware real | **Banco con Orange Pi Zero 3** (variante de RAM a definir), gabinete cerrado, 24 h con el simulador: CPU, RAM, I/O, duración de Capa B y C. Con eso se fijan el caché de Mongo y los límites de cada contenedor. | Estimar sin medir. |
| H7 | Hallazgos graves al NOC | **Backlog** (no entra en G2): enviarlos por `sendNocEvent`. | Solo en la bandeja local. |

**Datos que tiene que definir Franco o el área de Hardware:** la variante de RAM del Zero 3
y el almacenamiento (microSD o eMMC/SSD).

## 4 · Qué se implementa si se firma
- **Adenda G2 (2 archivos):** `qa/checks/invariants.js` (ventana 30 días de I15) y `edge-engine/notificationRouter.js` (tope de la cola). El índice se crea en el modelo `app/api/models/notifications.js` (3 archivos en total).
- **Fuera de G2 (H4–H6):** requiere la medición. Va a un bloque propio, "Perfil Hub", junto con el empaquetado del Hub que ya está previsto en el corpus.
