# SPEC — P2: herramienta "probar regla contra historial" (backtest) · 2026-10-06

**Dirección firmada por Franco:** primer bloque P2 + **Capa A del supervisor de calidad**
(`diseno_supervisor_calidad.md §1`). Replaya una regla (o un pack) contra N días de `db.data` y
predice su comportamiento: fires/episodios, % en condición, distribución de la variable, y un
**veredicto** (muerta / permanente / ruidosa / sana). Es el gate que habría frenado C1/C4
(reglas inalcanzables/permanentes) antes de producción.

## 0 · CANDADO
**preguntas_abiertas: 0.**

Decisiones cerradas:
- **Reusa los evaluadores REALES del edge** (`evaluateD/C/S/M/cross`) — para un GATE que predice
  "qué hará ESTE config en producción", reusar es correcto (supervisor §1 Capa A). Sin reimplementación
  → sin divergencia con el motor.
- **Read-only**, fuera de línea: solo lee `db.data`/`rulepacks`/`equipmentsheets`; no toca estado vivo
  ni emite notificaciones. Corre en el contenedor `wanomi-edge` (tiene los evaluadores + mongoose).
- **Replay fiel:** por cada lectura histórica (en orden temporal) actualiza un `siteState` sintético
  y llama al evaluador; cuenta **episodios** (transición no-disparo→disparo ≈ alarmas que vería el
  operador tras el anti-refire P0-1) y **% en condición**.
- **Veredicto:** 🔴 muerta (0 episodios y umbral fuera del rango observado) · 🟣 permanente (>80% del
  tiempo en condición) · 🟡 ruidosa (episodios/día > 10) · 🟢 sana. `spread` (multi-equipo) y la
  profundidad total de `cross` = best-effort con nota (MVP: 1 equipo representativo por deviceType).
- **Alcance MVP:** tool CLI. El endpoint/inline-en-editor es el paso siguiente (misma lógica).

## 1 · Presupuesto de bloque
- Tipo de bloque: **NORMAL** (read-only, bajo riesgo)
- Un concern: no hay forma de saber si una regla es alcanzable/ruidosa antes de activarla (C1/C4 llegaron a prod).
- Una decisión de diseño: replay fiel reusando los evaluadores reales; veredicto por episodios + % + distribución.
- Archivos a tocar (LISTA CERRADA):
  1. `tools/backtest_rule.js` — CLI + harness de replay (nuevo).
- Total: **1 archivo · Límite: 6.**

## 2 · Recon que lo funda
`plan_correccion_motor_reglas §P2-18` + `diseno_supervisor_calidad §1` (Capa A); evaluadores exportados
(`edge-engine/evaluators/*` → evaluateD/C/S/M/cross); `db.data` ({dId,variable,value,time}); la auditoría
offline (C1-C5) es el prototipo de este replay.

## 3 · Consumidores
| Consumidor | Qué | 
|---|---|
| Operador/admin (CLI hoy) | corre el backtest antes de activar/ajustar un umbral |
| Supervisor de calidad (futuro) | Capa A: gate pre-activación + reporte de "reglas muertas" |
| Editor (futuro) | botón "probar contra historial" inline (misma lógica vía endpoint) |

## 4 · Entradas / salidas
| Qué | Detalle |
|---|---|
| Entrada | `packId` (+ filtro `ruleId` opcional), `days` (default 7) |
| Pull | series de `db.data` de la(s) variable(s) de la regla (variable + hojas cross + inputs M2 + setpoint C + weightVariable) para 1 device representativo por deviceType |
| Salida | por regla: `episodios`, `episodios/día`, `% en condición`, `dist` (min/max/avg/p50/p99 de la variable), `veredicto` |

## 5 · Comportamiento
| Control | Qué hace |
|---|---|
| replay por tipo | D→evaluateD · C→evaluateC · S→evaluateS · M→evaluateM (buffer en mState) · cross→evaluateCross (crossState) |
| episodios | transición no-disparo→disparo (cross: `res.fired` ya es por transición) |
| veredicto | muerta/permanente/ruidosa/sana según episodios + % + rango vs umbral |

## 6 · Casos raros — ENUMERADOS
| # | Caso | Esperado |
|---|---|---|
| 1 | Regla D con umbral fuera del rango (DC-05 gt -57 vs bus -46..-49) | 🔴 muerta (0 episodios) |
| 2 | Regla permanente (A2 gt -48 con bus -48) | 🟣 permanente (>80%) |
| 3 | Sin datos de la variable en N días | "sin datos" (no veredicto) |
| 4 | Regla M sin suficientes muestras para la ventana | episodios por lo que alcanzó; nota insufficient |
| 5 | spread / cross profundo | best-effort + nota (MVP) |
| 6 | Regla deshabilitada (enabled:false) | se backtestea igual (sirve para decidir reactivar) |

## 7 · Path real (DEC-PROC-5)
Read-only sobre Mongo (`db.data`, `rulepacks`, `equipmentsheets`) con los evaluadores reales del edge.
No escribe. Se ejecuta: `docker exec -i wanomi-edge node < tools/backtest_rule.js <packId> [days] [ruleId]`.

## 8 · Disenso registrado
| Posición A | Posición B | Estado |
|---|---|---|
| Reimplementar los evaluadores (independiente) | Reusar los reales | **Cerrado:** reusar (gate predice producción; independencia es para la Capa C del supervisor) |
| Fidelidad total de cooldown/cross-tree | Episodios + %-en-condición (MVP) | **Cerrado:** MVP; refinar en el supervisor |

## 9 · IDs reservados
- **DEC-REF-131** (backtest tool = Capa A del supervisor de calidad).

## 10 · Cómo se prueba
Correr contra los packs actuales → debe clasificar correcto: 🔴 `cat-DC-05`/`cat-GE-07` (muertas),
🟣 (permanentes si las hubiera), 🟢 `gen-fuel-crit`/oil-life (sanas). Contrastar con los números de
la auditoría (C1-C5).

## 11 · Costuras
| CST | Antes | Después | Verif |
|---|---|---|---|
| Activación de reglas | a ciegas (C1/C4 a prod) | gate: veredicto contra historial antes de activar | §10 |

## 12 · Reversión
Borrar `tools/backtest_rule.js`. Read-only, sin efectos.
