# SPEC — Bloque 2 (QA): Capa A · backtest on-demand (módulo + ruta interna) · 2026-10-06

**Dirección firmada por Franco:** camino A, Wave 1. Asciende el CLI `tools/backtest_rule.js`
(DEC-REF-131) a **módulo reutilizable + ruta http interna del worker**, para que luego el editor
pueda "probar una regla contra el historial antes de activarla". **Re-corte de alcance:** el proxy
`/api/qa/backtest` (node) va al bloque **140** y el botón inline al **141** — este bloque es SOLO el
worker (evita colisión en archivos de app/UI con otros bloques de la Wave 1).

## 0 · CANDADO
**preguntas_abiertas: 0.**
Decisiones cerradas:
- La Capa A **SÍ reusa los evaluadores reales** del edge (`/home/qa/edge-engine/evaluators/*`,
  montados en el container qa) — acá es correcto: el gate predice "qué hará ESTE config en producción",
  no audita la corrección del motor (eso es Capa C). READ-ONLY.
- El núcleo del CLI se extrae a `qa/lib/backtest.js` como función `backtest({packId, days, ruleId})`
  que **devuelve datos estructurados** (no `console.log`): por regla, veredicto + episodios + %en
  condición + distribución (histograma/percentiles) + umbral. Esa forma alimenta la ficha/chart (141).
- `qa/routes/backtest.js` expone `POST /backtest` (auto-descubierto por `index.js`): body
  `{ packId, days?, ruleId? }` → llama al módulo → responde JSON. Sin auth acá (red interna; la auth
  superadmin vive en el proxy de node, bloque 140).
- El CLI `tools/backtest_rule.js` se **reescribe para reusar el módulo** (fuente única; mismo output
  por consola). Si el agente ve riesgo, puede dejar el CLII intacto y duplicar mínimo — pero preferido reusar.

## 1 · Presupuesto de bloque
- Tipo: **MEDIO**.
- Concern: el backtest solo existe como script manual; no es invocable programáticamente ni devuelve estructura.
- Archivos (LISTA CERRADA):
  1. `qa/lib/backtest.js` (NUEVO — módulo).
  2. `qa/routes/backtest.js` (NUEVO — ruta interna).
  3. `tools/backtest_rule.js` (REESCRIBIR para reusar el módulo; mismo comportamiento CLI).
  - **Total: 3 · Límite: 6.** NO toca app/ ni UI (va en 140/141). NO toca `qa/index.js`.

## 2 · Recon que lo funda
- `tools/backtest_rule.js`: toda la lógica actual (neededVars, acceso crudo a data/rulepacks/devices,
  replay por tipo D/C/S/M/cross, stats/percentiles, veredicto muerta/permanente/ruidosa/sana). Es el
  insumo a modularizar SIN cambiar la semántica.
- `docker_compose_production.yml`: el container qa monta `./edge-engine` → `require('/home/qa/edge-engine/evaluators/typeD')` etc.
- `diseno_supervisor_calidad.md` §1 (Capa A, veredictos alcanzable/permanente/ruidosa/fantasma/banda).

## 3 · Salida estructurada (contrato para 140/141)
```
backtest({packId, days=7, ruleId=null}) → {
  packId, days, site,
  rules: [{
    ruleId, type, verdict,              // '🔴 muerta' | '🟣 permanente' | '🟡 ruidosa' | '🟢 sana' | '⚪ sin evals'
    episodes, perDay, pctInCondition, evals,
    distribution: { n, min, max, avg, p50, p99, histogram:[{from,to,count}] },  // null si variable no numérica
    threshold                           // el value de la condition (para la línea del chart)
  }]
}
```
El histograma habilita el gráfico de la ficha (141); `threshold` es la línea de umbral superpuesta.

## 4 · Casos raros — ENUMERADOS
| # | Caso | Esperado |
|---|---|---|
| 1 | pack inexistente | `{error:'pack no encontrado'}` (no throw que tumbe la ruta) |
| 2 | regla sin variable / sin datos | la entrada de esa regla con `verdict:'⚪ sin evaluaciones'` |
| 3 | variable no numérica | `distribution:null`, veredicto por episodios igual |
| 4 | `days` enorme | cota sensata (reusar/define `QA_BACKTEST_MAX_DAYS`, default 90) |
| 5 | ruta con body inválido | 400 JSON `{ok:false,error}` |

## 5 · Path real (DEC-PROC-5)
`POST http://wanomi-qa:<QA_HTTP_PORT>/backtest {packId}` → módulo lee `rulepacks`/`data`/`devices`
reales + corre los evaluadores reales → JSON. El CLI sigue funcionando (`docker exec -i -e PACK=... wanomi-edge node < tools/backtest_rule.js`), ahora reusando el módulo.

## 6 · IDs reservados
- **DEC-REF-136** — Capa A: backtest on-demand (módulo + ruta interna del worker qa).

## 7 · Cómo se prueba (sin commitear, sin reiniciar el container si se puede)
- Módulo: `docker exec wanomi-qa node -e "require('./lib/backtest').backtest({packId:'eltek-smartpack-v1',days:7}).then(r=>console.log(JSON.stringify(r.rules.map(x=>[x.ruleId,x.verdict]))))"`.
- Para la ruta hace falta que el container cargue `qa/routes/` (boot) → el supervisor reinicia y prueba
  `POST /backtest` desde node. Comparar veredictos con la corrida CLI (deben coincidir).
- CLI: correr la forma vieja y confirmar mismo output.

## 8 · Reversión
Borrar `qa/lib/backtest.js` + `qa/routes/backtest.js` y revertir `tools/backtest_rule.js`. Read-only, cero efecto sobre el motor.
