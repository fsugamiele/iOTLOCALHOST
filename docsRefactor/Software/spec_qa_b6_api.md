# SPEC — Bloque 6 (QA): API de lectura `/api/qa/*` · 2026-10-06

**Dirección firmada por Franco:** camino A, Wave 2. La API que node expone para que la UI `/admin/calidad`
(141) lea lo que el worker produjo. **Solo lee** `quality_findings`/`qa_runs`/`rulepacks`/`notifications`
(NUNCA escribe findings) + proxea el backtest on-demand al worker. Todo gateado **superadmin** server-side.

## 0 · CANDADO
**preguntas_abiertas: 0.**
Decisiones cerradas:
- Rutas bajo `/api/qa`, en `app/api/routes/qa.js`, registradas en `app/api/index.js`
  (`app.use("/api", require("./routes/qa.js"))`). Patrón del repo.
- **RBAC server-side:** cada ruta usa `checkAuth` + un `isSuperadmin(req)` (réplica del de `rulepacks.js`:
  `req.userData?.grants` con role 'superadmin'). DEC-REF-62.a (el middleware de front es UX; la autorización
  real va en la API).
- **Badges del inventario salen de `quality_findings`** (los produce 135/138), NO se evalúa nada acá:
  prioridad 🔴 MUERTA > 🟣 PERMANENTE > 🟡 RUIDOSA/I2 > 🔁 I3(flap) > 🧟 I5(zombie) > ⚠️ I6 > 🟢 sana.
  "disparó (30d)" y "último" salen de `notifications` (fires por ruleId/dId); "en circulación" del rulepack.
- **Proxy de backtest:** `POST /api/qa/backtest` reenvía a `http://<QA_HOST>:<QA_HTTP_PORT>/backtest`
  (defaults nombrados `QA_HOST='wanomi-qa'`, `QA_HTTP_PORT=3010`; override por env). Es el camino que usará
  el botón inline del editor (141).
- **Digest** = derivado on-demand en `/overview` desde `quality_findings` (no hay colección aparte).

## 1 · Presupuesto de bloque
- Tipo: **MEDIO**.
- Archivos (LISTA CERRADA):
  1. `app/api/routes/qa.js` (NUEVO).
  2. `app/api/index.js` (EDITAR: 1 línea de registro).
  - **Total: 2 · Límite: 6.** NO toca UI (141) ni el worker qa.

## 2 · Recon que lo funda
- `app/api/index.js`: registro de rutas (`app.use("/api", require("./routes/<x>.js"))`).
- `app/api/routes/rulepacks.js`: `isSuperadmin(req)` server-side (:63), `checkAuth` del header `token`.
- Modelos: `quality_finding.js`, `qa_run.js`, `rule_pack.js` (module.exports — requeribles), `notifications.js`
  (`export default` → en node SÍ se puede importar, hay babel; pero `data`/`notifications` se consultan mejor
  por `.find()` del modelo que ya existe). ⚠️ en node HAY babel (a diferencia del worker) → podés usar los modelos.
- `supervisor_calidad_mockup.html`: tiles del semáforo, columnas del inventario, ficha de hallazgo, digest.

## 3 · Endpoints (todos checkAuth + isSuperadmin)
| Método · ruta | Devuelve |
|---|---|
| `GET /api/qa/overview` | semáforo: `{ crossClosePct (I1 vs resolves), firesPerDay, flappingRules (I3), deadRules (MUERTA), permanentRules, openFindingsByType, lastRun:{B,C: {at, ok}}, digest:[líneas] }` |
| `GET /api/qa/inventory` | por regla de todos los packs: `{ ruleId, packId, label, deviceType, enabled, fires30d, lastFire, badge, findingIds }` (badge por prioridad §0) |
| `GET /api/qa/findings` | lista de findings (filtros `status`,`type`,`ruleId`; orden lastSeen desc; paginado) |
| `PATCH /api/qa/findings/:id/status` | setea `status` ∈ {open,ack,muted,resolved} (el "Silenciar" del mockup = muted) |
| `POST /api/qa/backtest` | proxy a `wanomi-qa:/backtest` (body `{packId,days?,ruleId?}`) → el JSON estructurado |

## 4 · Casos raros — ENUMERADOS
| # | Caso | Esperado |
|---|---|---|
| 1 | request sin token / no superadmin | 401 (checkAuth) / 403 (isSuperadmin), sin filtrar datos |
| 2 | finding id inexistente en PATCH | 404 |
| 3 | status inválido | 400 (enum) |
| 4 | worker qa caído (proxy) | 502/504 con JSON claro, no cuelga la request de node |
| 5 | regla sin ningún finding | badge 🟢 sana |
| 6 | overview con colecciones vacías | ceros, no error |

## 5 · Path real (DEC-PROC-5)
node sirve `/api/qa/*` en el mismo Express (serverMiddleware). Requiere **restart de node** para registrar
la ruta nueva (lo hace el supervisor en la verificación). El proxy alcanza al worker por el nombre de
servicio docker. Se verifica con HTTP real + JWT superadmin.

## 6 · IDs reservados
- **DEC-REF-140** — API de lectura `/api/qa/*` (overview/inventario/findings/mute + proxy backtest).

## 7 · Cómo se prueba (sin commitear)
El supervisor reinicia node y prueba con un JWT admin (firmado con JWT_SECRET, como los seeds):
`GET /api/qa/overview`, `/inventory`, `/findings`; `PATCH .../status` (muted); `POST /api/qa/backtest`.
401 sin token, 403 sin superadmin. Comparar el inventario con los findings reales que ya escribió la Capa B.

## 8 · Reversión
Borrar `routes/qa.js` + revertir la línea de registro en `index.js`. Read-only, cero efecto sobre el motor.
