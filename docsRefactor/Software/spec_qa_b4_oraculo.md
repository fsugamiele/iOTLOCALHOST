# SPEC — Bloque 4 (QA): Capa C · oráculo nocturno · 2026-10-06

**Dirección firmada por Franco:** camino A, Wave 2. El cron nocturno donde vive la **re-implementación
independiente** (§3 diseño): recomputa derivadas, chequea sanidad física, drift vs snapshot, y persiste
los veredictos de alcanzabilidad (muerta/permanente/ruidosa) que alimentan el inventario del 140. Corre en
`wanomi-qa` (Capa C, 03:00), READ-ONLY sobre el motor.

## 0 · CANDADO
**preguntas_abiertas: 0.**
Decisiones cerradas:
- Un archivo = un check auto-descubierto: `qa/checks/oracle.js` exporta `{ layer:'C', name:'oraculo', run }`.
- **I7 (recompute independiente)** — fórmulas del edge, reimplementadas acá (NO se importan):
  `fuel_efficiency = fuel_rate ÷ genset_power_kw` (edge/efficiency.js); `autonomy_hours = fuelLevel% ×
  tankCapacity/100 ÷ consumo` (edge/autonomy.js). **Primario: fuel_efficiency** (recompute limpio de 2
  variables publicadas). `autonomy_hours`/`consumption_tank`: best-effort SI los insumos están en `data`;
  si no, se saltean (NO bloquea). Compara el recompute vs la derivada publicada (en `data`, misma var) al
  mismo ts (±`QA_C_TS_TOL_MS`) con tolerancia `QA_I7_REL_TOL`. Divergencia → finding I7.
- **I8 (sanidad física)** — rangos plausibles por variable (config nombrada, NO hardcode): `fuel_level`
  0-100; `fuel_efficiency` ≥0; **`dc_bus` NEGATIVO** (rango `[QA_DC_MIN=-60, QA_DC_MAX=-40]`, PROVISORIO
  — estándar −48 telco, pendiente registro Eltek 350020.073). Valor fuera de rango → finding I8.
- **I13 (drift de forma)** — compara la definición VIVA (`rulepacks`) vs `rule_snapshots.definition`
  (require `rule_snapshot` module.exports). Normaliza (ignora campos volátiles: `version`, timestamps,
  `_id`); diferencia → finding I13 con el diff.
- **Veredictos de alcanzabilidad** — corre `qa/lib/backtest.backtest()` (bloque 136, reusa evaluadores)
  sobre cada pack y persiste findings por regla: **MUERTA** (🔴, 0 episodios Y la variable llega — usar
  `require('./dataHealth').computeSilent` para NO marcar muerta una regla cuyo device está callado),
  **PERMANENTE** (🟣), **RUIDOSA** (🟡). Estos alimentan los badges del inventario (140).
- Knobs por `process.env` con default nombrado: `QA_I7_REL_TOL` (0.08), `QA_C_TS_TOL_MS` (120000),
  `QA_DC_MIN` (-60), `QA_DC_MAX` (-40), `QA_DEAD_DAYS` (30), `QA_C_WINDOW_DAYS` (7) para el backtest.
- El **digest** NO se genera acá: el 140 lo deriva de `quality_findings` on-demand (evita duplicar estado).

## 1 · Presupuesto de bloque
- Tipo: **MEDIO/PESADO** (varios chequeos, pero 1 archivo).
- Archivos (LISTA CERRADA): 1. `qa/checks/oracle.js` (NUEVO). **Total: 1 · Límite: 6.**
- NO toca `qa/index.js` (auto-descubrimiento) ni `.env.qa.example` (knobs los centraliza el supervisor).

## 2 · Recon que lo funda
- `edge-engine/efficiency.js` (fórmula fuel_efficiency), `edge-engine/autonomy.js` (fórmula autonomy_hours,
  tankCapacity de la config de autonomía). SOLO para leer la fórmula y REIMPLEMENTARLA (no importar).
- `app/api/models/rule_snapshot.js` (module.exports) + `rule_pack.js` para I13.
- `qa/lib/backtest.js` (bloque 136) — `backtest({packId, days, ruleId})` devuelve verdict/episodes/pct por regla.
- `qa/checks/dataHealth.js` (bloque 139) — `computeSilent({windowH})` para el anti falso-muerto.
- `qa/lib/findings.js` — `upsertFinding` (type I7/I8/I13/MUERTA/PERMANENTE/RUIDOSA).
- `diseno_supervisor_calidad.md` §3 (Capa C), §2 (I13). DC negativo: [[project-catalogo-fallas-seed]] / DEC-REF-123.

## 3 · Forma del check
```
module.exports = { layer:'C', name:'oraculo', run };
async function run() {
  // I7 recompute (fuel_efficiency + best-effort autonomy); I8 rangos físicos; I13 drift vs snapshot;
  // backtest por pack → MUERTA/PERMANENTE/RUIDOSA (excluyendo silenciadas por computeSilent).
  // upsertFinding por hallazgo distinto (dedup por corrida). Devuelve cobertura.
  return { check:'oraculo', rulesCovered:[...], devicesCovered:[...], findingsWritten:N };
}
```
Severidades: I7/I8/MUERTA = 'hard'; I13/PERMANENTE/RUIDOSA = 'soft'. `evidence` con los números
inspeccionables (recompute vs publicado, rango violado, diff de forma, episodios/día). Incluir `variable`
donde aplique (va a la clave, DEC-REF-139). `suggestedAction` en lenguaje de operador.

## 4 · Casos raros — ENUMERADOS
| # | Caso | Esperado |
|---|---|---|
| 1 | insumos de I7 ausentes (sin genset_power_kw) | se saltea esa derivada, no falso positivo |
| 2 | regla sin snapshot (I13) | se saltea (no hay "de fábrica" contra qué comparar) |
| 3 | regla muerta pero su device está callado (139) | NO se marca MUERTA (computeSilent la excluye) |
| 4 | backtest de un pack falla | se captura, se sigue con los demás packs; qa_run.ok refleja el error parcial |
| 5 | dc_bus justo en el borde del rango | configurable; documentar que es PROVISORIO |

## 5 · Path real (DEC-PROC-5)
Worker qa (Capa C, 03:00) → recomputa de `data` real, corre el backtest real, compara contra snapshots
reales → escribe `quality_findings`. Verificable invocando `run()` por `docker exec` (sin esperar a las 03:00).

## 6 · IDs reservados
- **DEC-REF-138** — Capa C: oráculo nocturno (I7 recompute, I8 sanidad física, I13 drift, veredictos de alcanzabilidad).

## 7 · Cómo se prueba (sin reiniciar container, sin commitear)
`docker exec wanomi-qa node -e "const m=require('mongoose');(async()=>{await m.connect(process.env.MONGODB_URI,{...}); console.log(await require('./checks/oracle').run()); await m.disconnect()})()"` →
cobertura + findings. Inspeccionar `quality_findings` por type I7/I8/I13/MUERTA/PERMANENTE/RUIDOSA.
I8 debe cazar cualquier dc_bus positivo (signo invertido) si existiera. Limpiar findings de prueba si se namespacean (los reales pueden quedar).

## 8 · Reversión
Borrar `qa/checks/oracle.js`. Cero efecto sobre el motor.
