# Blueprint de implementación — Refactor Software Wanomi 3.0

> ⚠️ **Estado:** documento de diseño pre-implementación (≈#15-#17). El motor de reglas edge fue implementado y validado en #18-#24 (DEC-REF-18 a 26). Para el estado vigente, ver `docs/wanomi.md` (Log de Sesiones) y `docsRefactor/WanomiRefactor.md` §5. Este documento se conserva como contexto histórico de diseño.

**Sesión #14 · Bloque 3 (cierre) · Área 2**
Principio rector: **reutilizar, no reescribir** (DEC-STACK-1). El modelo `variable→widget→template` se conserva; se extiende con capa Site (arriba) y capa Driver (abajo). Código nuevo escrito migrable.

> Nota: el detalle de schema debe confirmarse contra el código real en auditoría. Esto es el diseño arquitectónico, no el schema exacto.

---

## Capas del sistema (de abajo hacia arriba)

```
Equipo real (ComAp InteliGen / Cummins / Eltek)
   │  Modbus RTU/TCP (read-only)
   ▼
[Driver]  ── normaliza raw→variable (escalas, °F→°C, 32-bit, bitmap)
   │  MQTT local (dId+variable)  ← mismo formato que el simulador
   ▼
[EMQX → saver-webhook → Mongo local del Hub]  ← pipeline EXISTENTE, reutilizado
   │
   ├─► [Motor de reglas]  (edge, DEC-SENSOR-2) → Alarm/Event
   │        └─► [NotificationRouter] → Dashboard | Telegram | MQTT-NOC
   │
   └─► [Widgets/Templates] → vista de Site (compone DevicePanels)
```

---

## 1 · Modelo de datos — qué se mantiene, generaliza y agrega

| Entidad | Estado | Detalle |
|---|---|---|
| **Site** | existe (Fase 4) | Agrega N equipos + geo + metadata. Es la unidad de composición |
| **Device → Equipment** | generaliza | Un equipo = un controlador real o sensor. Suma `deviceType` + `driverConfig` (protocolo, slave/IP, baudrate) |
| **Variable** | extiende | Suma flag `source: physical \| inferred \| connect` (DEC-SENSOR-3). Tipos `categorical`/`int` (DEC-48) cubren Engine State, Fault Type, bits NFPA |
| **Template** | reutiliza | **Por tipo de equipo**, no por sitio: `tpl-comap-inteligen`, `tpl-eltek-smartpack`, `tpl-cummins-pcc`, `tpl-battery` |
| **Widget** | reutiliza + nuevos | Nuevos widgets: presión aceite, temp motor, estado transferencia, nivel combustible |
| **RuleDefinition / RulePack** | nuevo | Reglas por `deviceType`, auto-adjuntables |
| **Alarm / Event** | robustecer existente | Severidad warning/critical, timestamp, equipo origen |
| **NotificationRoute** | nuevo | Mapea severidad → canales |

Variables EN en código / ES en UI se mantiene (DEC-47).

## 2 · Capa Driver (nueva, en el Hub) — read-only

- Cliente **Modbus RTU** (maestro RS485) + **Modbus TCP** (cliente, para Eltek).
- **Detección de controlador** (Paso 1): leer 40051@57600 (ComAp) → si timeout, 40035@9600 (Cummins) → reintentar baudrates → guardar tipo en NVS.
- **Lecturas batch** según el mapa consolidado (ComAp: 0x0032 qty7 + 0x00A2 qty3; Cummins: 0x0022 qty11 + 0x000A qty3 + NFPA 0x0010).
- **Normalización**: escalas (×0.1, ×0.01), °F→°C (Cummins Oil Temp), splits 32-bit (Run Hours), decode de bitmap NFPA a booleanos.
- **Read-only estricto**: registros de comando deshabilitados en firmware (decisión de seguridad del Bloque 3).
- Publica a MQTT local con el mismo formato `dId+variable` que el simulador.

## 3 · Pipeline de ingestión — REUTILIZADO

Driver → MQTT local → saver-webhook → Mongo local. **Es el mismo pipeline que ya valida el simulador.** Las variables `connect` entran igual que las simuladas. Cero reescritura acá.

## 4 · Motor de reglas — robustecer el existente

- Corre en el **Hub** (edge, DEC-SENSOR-2). Evalúa contra variables entrantes.
- **Tipos:** D (umbral directo), C (auto-calibrada vs setpoint leído del bus), S (stateful/ventana), **cross-equipo** (referencia variables de >1 equipo del Site — capacidad nueva, el valor no-copiable).
- **RulePacks precargados por deviceType:** al sumar un equipo tipo X al Site, su pack se auto-adjunta. El catálogo de ~40 reglas = los seed packs (InteliGen, Cummins+NFPA, Eltek).
- Mantiene estado para reglas S; emite Alarm/Event con severidad.

## 5 · Capa de notificación (nueva)

`Alarm → NotificationRouter → canales`:
- **Dashboard** — feed de alarmas (componente ya existe).
- **Telegram** — bot, alerta humana al cellowner (rápido, demo-friendly).
- **MQTT event al NOC** — solo evento, no telemetría cruda (DEC-ARCH-2).

Ruteo: critical → los tres; warning → dashboard (+ Telegram opcional).

## 6 · Frontend — construir `pages/sites/` (faltante de Fase 4)

- **Lista de sitios:** mapa Leaflet con pins (DEC-DASH-1 operador).
- **Detalle de sitio:** compone los `DevicePanel` de los equipos presentes + feed de alarmas + estado. **Reutiliza `DeviceList`/`DevicePanel`** del simulador (ya renderizan widgets desde MQTT, validados en Sim-3).
- El Site **compone** templates por equipo, no usa un mega-template.
- Display local del Hub = misma vista servida local (DEC-DASH-2).

## 7 · El simulador como banco de pruebas — de-risquea el lab ★

El simulador (DEC-STRAT-2, herramienta interna viva) se extiende para **emitir telemetría de registros ComAp/Cummins simulada**. Con esto se valida **driver + motor de reglas + notificaciones end-to-end SIN equipo físico**.

> Esto ataca directamente el bloqueo "falta equipo de lab": el firmware del driver y el motor de reglas se validan contra el simulador; el equipo físico queda solo para confirmar escalas y timing reales, no para el desarrollo. Reduce fuerte el riesgo de plazo del MVP.

---

## Orden de implementación — iteración 1

1. Modelo de datos: Site→Equipment→Variable(source)→Template + Rule/RulePack/Alarm/Notification.
2. Templates por equipo (InteliGen + Eltek) + seed de RulePacks.
3. Simulador emite registros ComAp/Cummins → valida pipeline.
4. Driver Modbus en el Hub (contra simulador, luego lab).
5. Motor de reglas robustecido + RulePacks precargados.
6. Notificaciones (dashboard + Telegram + evento NOC).
7. `pages/sites/` (lista + detalle).

## Resumen: mantiene / cambia / agrega

| | |
|---|---|
| **Mantiene** | variable→widget→template · pipeline MQTT→saver→Mongo · DevicePanel/DeviceList · tipos de variable (DEC-48) · EN código/ES UI (DEC-47) |
| **Cambia** | Device → Equipment con driverConfig · motor de reglas robustecido + cross-equipo |
| **Agrega** | capa Site (compone) · capa Driver (Modbus) · RulePacks por equipo · NotificationRouter (Telegram) · pages/sites/ |

Deuda DEC-STACK-1 (migración Vue 3) sigue postergada post-piloto; todo lo nuevo se escribe con lógica separada de vista para que sea migrable.
