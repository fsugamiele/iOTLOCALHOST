# SPEC — Bloque 3 (QA): snapshot canónico + revertir + ruleId inmutable · 2026-10-06

**Dirección firmada por Franco:** camino A, Wave 1. Guarda la definición "de fábrica" de cada regla
(la de siembra) → habilita **I13 (drift de forma)** en la Capa C (138) y el botón **"revertir a la
definición original"** (antídoto a la corrupción del editor, B del informe). App-side; **dueño único
de `rulepacks.js`** en la Wave 1 (ningún otro bloque lo toca).

## 0 · CANDADO
**preguntas_abiertas: 0.**
Decisiones cerradas:
- Colección nueva `rule_snapshots`, modelo `app/api/models/rule_snapshot.js` **module.exports** (para
  que node Y el worker qa —bloque 138, I13— lo requieran sin babel, patrón `rule_pack.js`).
- **Captura:** en el PUT productivo (`router.put('/rulepacks/:packId')`, tras el `findOneAndUpdate`
  exitoso): por cada regla del pack SIN snapshot aún, guardar uno (`capturedFrom:'put'`). Idempotente:
  no re-captura si ya existe (el snapshot es la PRIMERA versión vista = "de fábrica"). NO sobrescribe.
- **Revertir:** `POST /rulepacks/:packId/rules/:ruleId/revert` (checkAuth) → toma `snapshot.definition`
  y la reescribe en el pack por el MISMO camino productivo (`findOneAndUpdate` del subdoc + `publishReload`).
- **ruleId inmutable (soft):** en el PUT, si un ruleId que TENÍA snapshot desaparece del pack entrante
  (rename/borrado), loguear advertencia (el historial del QA es por ruleId; un rename lo huérfana).
  NO bloquea (borrar una regla es legítimo). Enforcement duro = futuro.
- NO expone UI (botón "revertir" = bloque 141). NO toca `qa/index.js`.

## 1 · Presupuesto de bloque
- Tipo: **MEDIO**.
- Archivos (LISTA CERRADA):
  1. `app/api/models/rule_snapshot.js` (NUEVO).
  2. `app/api/routes/rulepacks.js` (EDITAR: hook de captura en PUT + endpoint revert + warning de ruleId).
  - **Total: 2 · Límite: 6.**

## 2 · Recon que lo funda
- `app/api/routes/rulepacks.js`: PUT :115, `findOneAndUpdate` :172, `publishReload` :177, PATCH
  quirúrgico :257 (patrón de update de un subdoc por `rules.$`). El hook de captura va DESPUÉS de :172.
- `app/api/models/rule_pack.js` + `rule_definition.js`: forma del subdoc a snapshotear (la `definition`
  es el objeto regla completo). `rule_pack.js` es module.exports → calcar.
- `diseno_supervisor_calidad.md` §7.2 (snapshot + revertir), §7.5 (ruleId inmutable), §2 (I13 lo consume).

## 3 · Modelo `rule_snapshots`
```
{ ruleId: String (required, index),
  packId: String (required),
  definition: Mixed,          // la regla COMPLETA tal como se sembró (clon del subdoc)
  capturedFrom: String,       // 'seed' | 'put'
  capturedAt: Date }
```
Único por `ruleId` (el "de fábrica"): índice `{ruleId:1}` unique. (Si en el futuro se versiona, se
relaja — hoy una sola foto canónica por ruleId.)

## 4 · Endpoint revert
`POST /rulepacks/:packId/rules/:ruleId/revert` (checkAuth; RBAC fino lo refuerza 140):
- busca el snapshot por ruleId; 404 si no hay.
- reescribe `rules.$.definition` en el pack (findOneAndUpdate con `rules.ruleId`), `$inc version`,
  `publishReload(...)` → el edge recarga (SF-3). Devuelve la regla revertida.

## 5 · Casos raros — ENUMERADOS
| # | Caso | Esperado |
|---|---|---|
| 1 | PUT de un pack ya sembrado | captura solo las reglas SIN snapshot; las que ya tienen quedan intactas |
| 2 | revert de un ruleId sin snapshot | 404 `{ok:false}` |
| 3 | ruleId renombrado en un PUT | se loguea warning (no bloquea); el snapshot viejo queda |
| 4 | regla nueva recién creada por PUT | se le captura snapshot en ese mismo PUT (su "de fábrica") |
| 5 | revert dispara reload | el edge cierra/reabre limpio (maquinaria SF-3 existente) |

## 6 · Path real (DEC-PROC-5)
Captura en el PUT real (no un atajo); revert reescribe por `findOneAndUpdate` + `publishReload` (mismo
camino que el editor). Se verifica con un PUT/revert reales contra la API en el container node.

## 7 · IDs reservados
- **DEC-REF-137** — snapshot canónico de reglas + revertir + ruleId inmutable (soft).

## 8 · Cómo se prueba (sin commitear)
1. PUT de un pack existente (ej. `eltek-smartpack-v1`) con JWT admin → verificar `rule_snapshots`
   tiene una foto por regla (idempotente: segundo PUT no duplica).
2. Editar una regla por PUT, luego `POST .../revert` → la regla vuelve a la definición de fábrica y el
   edge recarga. Limpiar los docs de prueba.

## 9 · Reversión
Borrar `rule_snapshot.js` + revertir el hook/endpoint en `rulepacks.js`. La colección queda huérfana
(vacía o con snapshots inertes). Cero efecto sobre el motor.
