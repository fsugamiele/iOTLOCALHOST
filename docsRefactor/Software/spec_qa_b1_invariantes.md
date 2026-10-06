# SPEC — Bloque 1 (QA): Capa B · monitor de invariantes runtime · 2026-10-06

**Dirección firmada por Franco:** camino A, Wave 1. Es el **corazón del MVP** (§8 diseño): los
invariantes duros habrían cazado casi todo el informe del 05-oct. Corre en el worker `wanomi-qa`
(DEC-REF-134), **out-of-band y con lógica propia** (NO importa los evaluadores del motor: si los
importara heredaría sus bugs y bendeciría la salida equivocada).

## 0 · CANDADO
**preguntas_abiertas: 0.**
Decisiones cerradas:
- Lee `notifications` + `data` por **acceso crudo** `mongoose.connection.db.collection(...)` (NO los
  modelos `export default`, que el worker no puede requerir sin babel — patrón del backtest CLI).
- Reconstruye el estado "alarmas abiertas" por `(ruleId, dId)` ordenando `notifications` por `time`
  (epoch ms) y `kind` ('fire'|'resolve'; default 'fire' en docs viejos).
- **Invariantes duros** (severity 'hard', 0 ruido por construcción): I1, I2, I4, I6.
- **Anomalías blandas** (severity 'soft', umbral configurable): I3 (flapping), I5 (zombie).
- Escribe con `qa/lib/findings.upsertFinding` (idempotente por type/ruleId/dId). **Dedup por corrida:**
  un hallazgo distinto = un upsert (no uno por lectura).
- Knobs por `process.env` con default nombrado (NO hardcodes): `QA_B_WINDOW_H` (48),
  `QA_FLAP_SEC` (90), `QA_ZOMBIE_MIN` (30), `QA_I6_REL_TOL` (0.02), `QA_I6_TIME_TOL_MS` (120000).
- Un archivo = un check auto-descubierto: exporta `{ layer:'B', name:'invariantes-runtime', run }`.

## 1 · Presupuesto de bloque
- Tipo: **MEDIO** (lógica de 6 invariantes, pero 1 archivo nuevo).
- Concern: hoy nadie detecta en vivo cierres cruzados / re-fire / zombies / valores viejos.
- Archivos (LISTA CERRADA): 1. `qa/checks/invariants.js` (NUEVO). **Total: 1 · Límite: 6.**
- NO toca `qa/index.js` (auto-descubrimiento), ni `.env.qa.example` (el supervisor centraliza los knobs después).

## 2 · Recon que lo funda
- `app/api/models/notifications.js`: campos `dId`, `ruleId`, `kind`, `time`(Number epoch ms), `value`,
  `variable`, `siteId`, `severity`, `correlationParent`, `thresholdUsed`, `label`. (NO requerible: export default.)
- `app/api/models/data.js`: `dId`, `variable`, `value`(Mixed), `time`(Number epoch ms). Índices
  `{dId,variable,time:-1}` y `{dId,time:-1}` → las queries de ventana son O(log n).
- `tools/backtest_rule.js`: patrón de acceso crudo + stats/percentiles (reutilizar el estilo).
- `auditoria_motor_reglas_2026-10-05.md`: A1 (resolve cruzado 87-89%), A3 (re-fire), A5 (zombie), I6.
- `rulepacks` (vía `require('../../app/api/models/rule_pack')`, es module.exports → requerible) para
  leer la `condition` de cada regla (I5/I6 comparan contra el umbral SIN importar el evaluador: se
  reimplementan los 6 comparadores lt/lte/gt/gte/eq/neq localmente).

## 3 · Invariantes (sobre la ventana `QA_B_WINDOW_H`)
| # | Sev | Qué | Evidencia a guardar |
|---|---|---|---|
| **I1** resolve cruzado | hard | un `resolve` sin `fire` ABIERTO del MISMO (ruleId,dId), pero con fire abierto del mismo ruleId en OTRO dId | ruleId, dId del resolve, dId del fire abierto, times |
| **I2** re-fire storm | hard | >1 `fire` del mismo (ruleId,dId) entre dos `resolve` | n fires, times, ventana |
| **I4** resolve huérfano | hard | `resolve` sin ningún `fire` abierto de ese (ruleId,dId) | ruleId, dId, time |
| **I6** value≠telemetría | hard | el `value` del fire difiere de `data` de esa `variable`/dId cerca de `time` (±`QA_I6_REL_TOL`, ±`QA_I6_TIME_TOL_MS`) | value del fire, value de data, delta, time |
| **I3** flapping | soft | ciclos fire→resolve→fire del mismo (ruleId,dId) en < `QA_FLAP_SEC` | n ciclos, periodo medio |
| **I5** zombie | soft | `fire` abierto mientras `data` muestra la condición DESPEJADA hace > `QA_ZOMBIE_MIN` (comparadores reimplementados contra la `condition` del rulepack) | último value, umbral, minutos despejado |

## 4 · Forma del check
```
module.exports = { layer:'B', name:'invariantes-runtime', run };
async function run() {
  // 1 lectura de notifications (ventana) + data relevante; reconstruye pilas por (ruleId,dId);
  // corre I1..I6; upsertFinding por hallazgo distinto; devuelve cobertura.
  return { check:'invariantes-runtime', rulesCovered:[...], devicesCovered:[...], findingsWritten:N };
}
```
`layer`/`severity`/`type` de cada finding: layer 'B'; type 'I1'..'I6'; severity hard/soft por tabla §3.
`suggestedAction` en lenguaje de operador (ej. I1: "revisar la lógica de resolve — cierra el equipo equivocado").

## 5 · Casos raros — ENUMERADOS
| # | Caso | Esperado |
|---|---|---|
| 1 | docs viejos sin `kind` | leen como 'fire' (default del schema; replicar en el acceso crudo: `kind || 'fire'`) |
| 2 | fire abierto al inicio de la ventana (su resolve quedó fuera) | no contar como I4 falso: tolerar "abierto desde antes" (no es huérfano) |
| 3 | regla sin `condition` (cross/M) para I5/I6 | I5/I6 se saltean esa regla (solo D/C/S con umbral simple); documentar |
| 4 | `value` no numérico en data | I6 se saltea esa variable |
| 5 | finding 'muted' por el admin | `upsertFinding` NO lo re-abre (lo garantiza el helper) |
| 6 | re-detección en corridas sucesivas | mismo doc, `count++`, `lastSeen` nuevo (idempotente) |

## 6 · Path real (DEC-PROC-5)
Worker `wanomi-qa` (Capa B, `setInterval`) → `run()` lee las colecciones reales de `iotix` → escribe
`quality_findings` por el modelo compartido (vía `qa/lib/findings`). Se verifica con `docker exec`
requiriendo el módulo directo (sin reiniciar el container).

## 7 · IDs reservados
- **DEC-REF-135** — Capa B: monitor de invariantes runtime del Supervisor de Calidad.

## 8 · Cómo se prueba (sin reiniciar el container, sin commitear)
`docker exec wanomi-qa node -e "require('./checks/invariants').run().then(r=>console.log(r))"` tras
conectar mongoose → imprime cobertura y findings escritos. Inspeccionar `quality_findings` por type
I1/I6 y comparar con lo que el informe del 05-oct marcó a mano (resolve cruzado del A2, etc.).
Limpiar findings de prueba si se namespacearon. **No reiniciar wanomi-qa** (lo hace el supervisor).

## 9 · Reversión
Borrar `qa/checks/invariants.js` → el auto-descubrimiento deja de cargarlo; findings previos quedan
pero no se renuevan. Cero efecto sobre el motor.
