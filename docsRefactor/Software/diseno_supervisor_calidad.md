# Diseño — Supervisor de Calidad (QA) del motor de reglas + UI de administración + diseños complementarios · 2026-10-05

**Origen:** la auditoría manual de hoy (`auditoria_motor_reglas_2026-10-05.md`) es el prototipo de este
supervisor. Objetivo: que lo que hice a mano (recomputar, backtestear, detectar falsas/mudas/muertas)
corra **solo, en vivo, y le dé al administrador las herramientas para decidir y actuar**.

## 0 · Principio cardinal
El supervisor **no comparte código con el motor**. Observa `db.data`, `notifications` y `rulepacks`
**read-only, out-of-band, con lógica propia**. Si importara los evaluadores, heredaría los bugs y
bendeciría la salida equivocada. Separa dos naturalezas de chequeo:
- **Invariantes duros** — ambiguos = siempre bug, 0 ruido (independientes por construcción).
- **Anomalías blandas** — heurísticas con umbral configurable (el supervisor no debe volverse él
  mismo un generador de falsas alarmas).

---

## 1 · Capa A — Gate pre-activación (backtest)
**Qué es:** antes de que una regla viva, se la evalúa contra N días de `db.data` y se predice su
comportamiento. Es el chequeo que habría frenado **C1/C4** (reglas inalcanzables que sembré hoy).

**Independencia:** acá reusar el evaluador real es **aceptable** — el gate predice "qué hará ESTE
config en producción", no "¿el motor es correcto?". La independencia importa en la Capa C.

**Veredictos:**
- **Alcanzable:** ¿disparó ≥1 vez? ¿umbral dentro del rango observado? (I9)
- **Permanente:** ¿condición verdadera > X% de las lecturas? (I10)
- **Ruidosa:** fires/día proyectados, flapping proyectado.
- **Fantasma:** `variable`/`deviceType` que ninguna ficha declara / ningún device publica (I11).
- **En banda de ruido:** umbral dentro de p50±σ de la variable (I12).

**Salida al usuario (el MVP de UX):** *"Si activás esta regla, en los últimos 30 días habría
disparado 2755 veces / nunca / el 87% del tiempo"* — con el histograma de la variable y la línea de
umbral superpuesta. El usuario **calibra con los datos a la vista**. Es el Bloque 11 de
`plan_correccion_motor_reglas` ascendido a pieza del QA.

---

## 2 · Capa B — Monitor de invariantes en runtime
**Qué es:** job cada ~5 min sobre la ventana reciente de `notifications` (+ join con `data`).
Mantiene un estado mínimo de "alarmas abiertas" reconstruido de las notificaciones. Cada violación
escribe un doc en `quality_findings`.

**Invariantes duros (sin oráculo — cazan el 80% de lo de hoy):**
- **I1 · resolve cruzado:** por cada `resolve`, debe existir un `fire` ABIERTO del **mismo
  `(ruleId, dId)`**. Si cierra otro dId → bug (A1). *Agregación:* ordenar `notifications` por `time`,
  reconstruir pila de abiertos por `(ruleId,dId)`, contar resolves sin fire-abierto-del-mismo-dId.
- **I2 · re-fire storm:** >1 `fire` del mismo `(ruleId,dId)` entre dos `resolve` (A3).
- **I4 · resolve huérfano:** `resolve` sin `fire` abierto.
- **I6 · value ≠ telemetría:** el `value` del fire debe coincidir con `data` de esa `variable` en ese
  `time` (±deadband de la ficha). Divergencia = valor viejo/equivocado propagado.

**Anomalías blandas:**
- **I3 · flapping:** ciclos fire→resolve→fire en < T seg (hoy accel 94%).
- **I5 · zombie:** `fire` activo mientras `data` muestra la condición despejada hace > X (A5).
- **I-rate · ráfaga:** salto súbito en la tasa de una regla = regresión tras una edición.

---

## 3 · Capa C — Auditoría profunda nocturna (oráculo)
**Qué es:** cron nocturno. Acá **sí** vive la re-implementación independiente.

- **I7 · oráculo de cálculos:** recomputa desde crudo las derivadas que publica el edge
  (`autonomy_hours`, `fuel_efficiency`, `consumption_tank`) en el mismo `ts` y compara (±tol).
  Divergencia = deriva de cálculo. *Ataca directo "los cálculos no son precisos".* Scope mínimo:
  autonomía + sifoneo/eficiencia (no las 14 métricas).
- **I8 · sanidad física:** derivada/cruda fuera de rango plausible (fuel 0-100, eficiencia ≥0,
  **signo del bus DC**). Habría cazado C1 solo.
- **I13 · drift de forma:** la regla viva vs su **snapshot canónico** (la siembra): redondeo a
  minutos, `correlationParent` perdido, unidad compuesta → caza la corrupción del editor (B).
- **Reglas muertas:** sin fire ni resolve en 30 d → reporte (anti falsa-cobertura).
- **Deriva de distribución:** umbral que fue bueno pero la planta cambió (percentiles se movieron).
- **Replay diferencial (fase 2, el más potente/caro):** re-evaluar reglas críticas con evaluador
  propio y comparar la línea fire/resolve contra `notifications` real → detecta bugs de **lógica del
  motor** (A1/A2/A5 saldrían como "el edge disparó/resolvió donde el oráculo no").

---

## 4 · Modelo de datos del supervisor
- **`quality_findings`**: `{ _id, type (I1…I13), severity (hard|soft), ruleId, packId, dId, siteCode,
  evidence (números/serie), firstSeen, lastSeen, count, status (open|ack|resolved|muted), suggestedAction }`.
  Idempotente por `(type, ruleId, dId)` para no duplicar; agrega `count`/`lastSeen`.
- **`rule_snapshots`** (canónico): definición original (siembra) por `ruleId` → base de I13 y del
  botón "revertir a la definición sembrada".
- **`qa_runs`**: cobertura de cada corrida (qué reglas/devices se chequearon) → el supervisor **se
  audita a sí mismo**; un check que no corrió NO pasa como verde (la lección del subagente caído hoy).

---

## 5 · Visualización — SOLO ADMINISTRADOR
- **RBAC:** vistas QA gateadas por rol (`scope.js`/grants; rol `superadmin` o nuevo `qa_admin`).
- **Montaje concreto (la infraestructura ya existe):** página `/admin/calidad` con
  `middleware: ['authenticated','superadmin']` — el patrón DEC-REF-62.b ya está implementado en
  `app/middleware/superadmin.js` y la consola `admin.vue` ya usa tabs (`el-tabs`), así que la consola
  QA entra como tab propio o página hermana con la misma protección. Doble chequeo server-side en las
  rutas `/api/qa/*` (DEC-REF-62.a: el middleware es UX, la autorización real va en la API).
- **Separada del NOC:** sección `/admin/calidad`, **nunca** en el dashboard del operador. El operador
  no debe ver el meta-ruido — vería "la plataforma duda de sus propias alarmas" y se erosiona la
  confianza en las alarmas que **sí** debe atender. El QA es para el equipo Wanomi.
- **Cero Telegram al operador:** los findings van a panel + `quality_findings` + digest semanal interno.

---

## 6 · UI — para que el administrador ENTIENDA el trabajo del supervisor y DECIDA
Principios: **mostrar el dato, no solo el veredicto** (cada verdict con su gráfico/número inspeccionable
→ genera confianza en el propio supervisor); **acción a un clic** en cada hallazgo; **lenguaje de
operador** ("esta regla grita 118 veces/día y nunca se apaga", no "A3 re-fire").

**Vistas:**
1. **Semáforo de salud del motor** (overview): score + la tabla de métricas de mi plan de corrección
   (resolves cruzados %, fires/día, flapping %, reglas muertas) con tendencia. Un vistazo: ¿sano?
2. **Inventario de reglas con estado de calidad** (el corazón): toda regla de todos los packs con
   badge: 🟢 sana · 🟡 ruidosa · 🔴 muerta/inalcanzable · ⚫ fantasma · 🟣 permanente · 🔁 flapping.
   Columnas: regla · pack · equipo · "disparó (30d)" · "% en condición" · último fire · veredicto
   backtest · **interruptor on/off**. Acá el admin **ve lo roto y actúa**.
3. **Ficha de hallazgo:** qué, evidencia (histograma de la variable con la línea de umbral; línea de
   tiempo fire/resolve con la telemetría superpuesta → *se ve* el flapping), invariante violado,
   severidad, **acción sugerida** ("umbral 105 > máx observado 100 → bajar o desactivar"), botones:
   *desactivar · abrir editor precargado · silenciar hallazgo*.
4. **Backtest inline en el editor** (gate pre-activación): botón "probar contra historial" dentro del
   editor de reglas → "habría disparado N veces; acá la distribución y tu umbral". Cierra el loop:
   calibrar **con** los datos enfrente. **Obligatorio antes de activar un umbral nuevo.**
5. **Línea de tiempo de una regla:** fires/resolves + telemetría en el tiempo → el flapping/re-fire
   se *ve*, no se explica.
6. **Digest semanal:** "3 muertas, 2 ruidosas, 1 cálculo con deriva, 1 regla cambió vs su siembra".

**Mockup navegable:** `mockups/supervisor_calidad_ui.html` — este diseño hecho visual, con datos reales
de la auditoría del 05-oct (abrir en el navegador, sin build).

---

## 7 · Diseños PARALELOS que complementan al supervisor

### 7.1 · Interruptor on/off por regla y por pack (lo que pediste) — la pata de ACCIÓN
- **Schema:** `rule_definition.enabled {Boolean, default:true}` + `rule_pack.enabled {Boolean, default:true}`
  (kill-switch de pack completo). Más `disabledBy`, `disabledAt`, `disabledReason` (procedencia: por
  qué se sacó de circulación ese parámetro).
- **Motor:** `siteState.loadPacks` filtra `enabled !== false` (pack y regla). En el reload, una regla
  que pasa a disabled "desaparece" del set activo → el diff la ve como `removed` → **cleanup + resolve
  limpio** (reusa la maquinaria SF-3 existente; una regla activa desactivada NO queda zombie).
- **DECISIÓN CLAVE:** el toggle es un **PATCH quirúrgico** de un solo booleano
  (`PATCH /rulepacks/:packId/rules/:ruleId/enabled`), que **NO pasa por el round-trip del editor**
  (`sentenceToRule`) — si pasara, apagar una regla la **corrompería** (B1/B2). Apagar debe ser seguro
  e inocuo sobre el resto de la definición.
- **UI:** switch en la fila de la regla y en el header del pack; filas desactivadas en gris con
  "fuera de circulación por {user} · {fecha} · {motivo}". El botón "desactivar" de cada **finding del
  QA** llama a este mismo PATCH → cierra el loop detectar→actuar.
- **Semántica:** disabled ≠ deleted (preserva regla + historial, reversible). Una regla disabled se
  **excluye** del reporte de "reglas muertas" (está apagada a propósito).
- **Tercer estado opcional:** `quarantined-by-QA` (distinto de `disabled-by-user`) → procedencia de
  quién la sacó: el humano o el supervisor (cuarentena opt-in, fase 2).

### 7.2 · Snapshot canónico + versionado de reglas
Guardar la definición de siembra (`rule_snapshots`) habilita **I13 (drift de forma)** y el botón
**"revertir a la definición original"** — antídoto directo a la corrupción del editor.

### 7.3 · Audit log de ediciones de reglas
Quién cambió qué umbral y cuándo → ata una regresión de calidad a una edición ("A2 empezó a flapear
tras la edición de las 18:45"). Insumo del I-rate y del drift.

### 7.4 · Salud de ingesta (data health)
Vista por device/variable: último visto, cadencia, gaps. El supervisor la necesita para **no llamar
muerta** a una regla cuyo insumo nunca llega (distingue "condición falsa" de "device callado"). Es
también la base de la regla `staleness` por-equipo (A7).

### 7.5 · Convención de `ruleId` inmutable (o migración de historial)
Los chequeos del QA son históricos (30 d); un rename hoy **huérfana** el historial (C8). Sin esto, el
supervisor pierde memoria en cada renombre.

### 7.6 · Deadband/hysteresis nativo (del plan de corrección)
Complementa: el QA **detecta** el flapping; el deadband lo **previene**. Juntos cierran el problema.

---

## 8 · Secuencia, MVP y gobierno
- **MVP (máximo retorno, mínimo costo):** invariantes duros de notificaciones **I1/I2/I4/I6** +
  reachability/always-true **I9/I10** (Capa A+B) + **interruptor on/off (7.1)**. Esto habría cazado
  **todo** lo del informe de hoy y le da al admin el botón para sacarlo de circulación. Sin oráculo,
  sin UI compleja: tabla de inventario + findings + toggle.
- **Fase 2:** oráculo (I7/I8), backtest inline en el editor (gate), snapshot/drift (I13, 7.2),
  cuarentena opt-in.
- **Fase 3:** replay diferencial (detecta bugs de lógica del motor), data-health, audit log.
- **Construir en paralelo al P0-1 de la corrección:** el supervisor es el **banco de pruebas** que
  certifica cada fix — sus asserts SON las metas del plan de corrección.
- **Gobierno:** capacidad nueva → **DEC-REF** propia. Define si "QA" es una cuarta pata viva del
  producto (junto a infra/app/edge/firmware). El interruptor on/off + PATCH quirúrgico es una
  **DEC-REF** aparte (toca schema + ruta + motor + UI) y debería ir **primero** (desbloquea la acción
  aunque el resto del QA todavía no exista).
