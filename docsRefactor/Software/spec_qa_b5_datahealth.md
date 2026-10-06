# SPEC — Bloque 5 (QA): salud de ingesta (data-health) · 2026-10-06

**Dirección firmada por Franco:** camino A, Wave 1. El supervisor necesita saber qué device/variable
**dejó de reportar** para NO llamar "muerta" a una regla cuyo insumo nunca llega (§7.4 diseño): distingue
"condición falsa" de "device callado". Corre en el worker `wanomi-qa`, lógica propia, READ-ONLY.

## 0 · CANDADO
**preguntas_abiertas: 0.**
Decisiones cerradas:
- Lee `data` por acceso crudo `mongoose.connection.db.collection('data')` (igual que 135/backtest).
- Por `(dId, variable)` en la ventana: último `time`, cadencia (mediana de inter-arribos), gap actual.
  Una fuente está **callada** si el gap > `QA_STALE_MULT` × cadencia mediana, con piso `QA_STALE_MIN_MIN`.
- Escribe findings type `'INGESTA'` (severity 'soft', layer 'B') por fuente callada, con
  `qa/lib/findings.upsertFinding` (ruleId=null, dId=el device; evidence: lastSeen, cadencia, gap).
- **Exporta además** `computeSilent({windowH})` → `Set` de `dId|variable` callados, para que la Capa C
  (138, oráculo) lo importe y NO marque "muerta" una regla sin datos por device callado.
- Knobs por `process.env` con default nombrado (NO hardcodes): `QA_STALE_MULT` (3), `QA_STALE_MIN_MIN`
  (30), `QA_DH_WINDOW_H` (24).
- Un archivo = un check auto-descubierto: exporta `{ layer:'B', name:'data-health', run, computeSilent }`.

## 1 · Presupuesto de bloque
- Tipo: **LIGERO/MEDIO**.
- Archivos (LISTA CERRADA): 1. `qa/checks/dataHealth.js` (NUEVO). **Total: 1 · Límite: 6.**
- NO toca `qa/index.js` (auto-descubrimiento) ni `.env.qa.example` (knobs los centraliza el supervisor).
- La **vista** por device/variable (UI nav "Salud de ingesta") la calcula el endpoint de lectura en
  node (bloque 140) directo sobre `data` — este bloque NO persiste la vista, solo findings + helper.

## 2 · Recon que lo funda
- `app/api/models/data.js`: `dId`, `variable`, `value`, `time`(epoch ms); índices `{dId,variable,time:-1}`
  y `{dId,time:-1}` → "último por device/variable" es O(log n).
- `tools/backtest_rule.js`: patrón de acceso crudo + agregación por dId.
- `diseno_supervisor_calidad.md` §7.4 (salud de ingesta), §3 (Capa C "reglas muertas" la consume).
- `edge-engine` publica `_lastSeen` por device, pero el QA es out-of-band → lo recomputa de `data` (no depende del edge).

## 3 · Lógica
Para cada `(dId, variable)` con ≥2 lecturas en `QA_DH_WINDOW_H`:
- `cadencia` = mediana de diferencias de `time` consecutivos.
- `gap` = `now - lastTime`.
- callada si `gap > max(QA_STALE_MULT*cadencia, QA_STALE_MIN_MIN*60000)`.
Finding por fuente callada (dedup por corrida). `computeSilent` devuelve el set para 138.

## 4 · Casos raros — ENUMERADOS
| # | Caso | Esperado |
|---|---|---|
| 1 | variable con 1 sola lectura | sin cadencia → no se evalúa callada (evitar falso positivo) |
| 2 | device nuevo (poca historia) | piso `QA_STALE_MIN_MIN` evita marcarlo callado por cadencia ruidosa |
| 3 | fuente que vuelve a reportar | próxima corrida: el finding deja de renovarse (lo cierra 140 por lastSeen viejo) |
| 4 | muchísimos (dId,variable) | agregación en Mongo, no en memoria (usar pipeline) |

## 5 · Path real (DEC-PROC-5)
Worker qa (Capa B) → lee `data` real → findings `INGESTA` + `computeSilent` disponible para 138.
Verificable con `docker exec` requiriendo el módulo.

## 6 · IDs reservados
- **DEC-REF-139** — salud de ingesta (data-health): detección de fuentes calladas + helper anti falso-muerto.

## 7 · Cómo se prueba (sin reiniciar container, sin commitear)
`docker exec wanomi-qa node -e "require('./checks/dataHealth').run().then(r=>console.log(r))"` tras
conectar mongoose → cobertura + findings. `computeSilent({windowH:24})` → set de fuentes calladas.
Contrastar con un device que el sim tenga apagado / una variable que no publique.

## 8 · Reversión
Borrar `qa/checks/dataHealth.js`. Cero efecto sobre el motor.
