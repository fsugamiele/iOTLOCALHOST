# SPEC — Bloque 0 (QA): gobierno (5ta pata) + andamiaje `wanomi-qa` + contratos de datos · 2026-10-06

**Dirección firmada por Franco (hoy):** camino A del Supervisor de Calidad = implementar el mockup
1:1, lo más compacto posible en bloques, fiel a `diseno_supervisor_calidad.md`. Topología elegida:
**componente propio `wanomi-qa` (5ta pata viva)**. Este bloque es el **cimiento**: no lo delega
ningún agente — define los contratos de datos y el proceso donde viven los 7 bloques siguientes.

## 0 · CANDADO
**preguntas_abiertas: 0.**

Decisiones cerradas:
- **Topología:** nuevo container `wanomi-qa` (como edge/sim), out-of-band, **read-only sobre el motor**
  (observa `db.data`/`notifications`/`rulepacks`; §0 del diseño). Escribe SOLO sus colecciones
  (`quality_findings`, `qa_runs`, y en B3 `rule_snapshots`). El motor NO lee del QA.
- **No comparte código con el motor para B/C** (lógica propia). **Excepción diseñada:** la Capa A
  (backtest, bloque 136) SÍ reusa los evaluadores reales del edge → por eso `wanomi-qa` monta
  `./edge-engine/` (igual que lo hace hoy el container edge).
- **RBAC:** se reusa `superadmin` (patrón DEC-REF-62.b: `middleware/superadmin.js` + doble chequeo
  server-side en las rutas). NO se crea rol `qa_admin`.
- **Modelos compartidos:** los schemas viven en `app/api/models/` (fuente única) → el QA los importa
  por el mount `./app` (igual que el edge importa `rule_pack`), y node los lee sin duplicar schema.
- **Backtest on-demand:** `wanomi-qa` levanta un **http interno** (sin `ports:` al host, solo red
  docker) para que node proxee el backtest; el schema del endpoint se cierra en el bloque 136, acá
  solo queda el **listener vacío con `/health`**.
- Este bloque es **andamiaje**: `index.js` conecta, arma los **slots** del scheduler (Capa B
  `setInterval`, Capa C nocturno) **vacíos** y el http interno; la lógica de cada check entra en
  135/138. Sin checks todavía = no escribe findings reales (solo el de humo de §10).

## 1 · Presupuesto de bloque
- Tipo de bloque: **MEDIO** (toca infra + congela contratos de datos de todo el programa).
- Un concern: el supervisor no tiene dónde vivir ni con qué forma persistir sus hallazgos.
- Una decisión de diseño: componente `wanomi-qa` + 2 colecciones con schema de fuente única.
- Archivos a tocar (LISTA CERRADA):
  1. `docker_compose_production.yml` — servicio `wanomi-qa`.
  2. `qa/.env.qa` (+ `qa/.env.qa.example`) — **CORRECCIÓN POR RECON:** el edge NO usa el
     `.env` raíz sino un env-file dedicado (`edge-engine/.env.edge`). Calco ese patrón: env-file
     propio del qa (ver §6). El `.env.qa` real queda gitignored (`.env.*`); se commitea solo
     `.env.qa.example`. Archivos trackeados que cambian = 6 (el `.env.qa` es infra local, no repo).
  3. `qa/index.js` — conexión Mongo + scheduler shell + http interno + SIGTERM.
  4. `app/api/models/quality_finding.js` — modelo compartido.
  5. `app/api/models/qa_run.js` — modelo compartido.
  6. `tools/apertura.sh` — registrar `wanomi-qa` en el chequeo de arranque.
- Total: **6 archivos · Límite: 6.**

> `installer.txt` NO se toca (CLAUDE.md §4: su sincronía con el `.env` NO está decidida).
> El entry en `WanomiRefactor.md` (DEC-REF-134) se escribe en el **cierre de sesión** (DEC-PROC-8),
> no cuenta como archivo de implementación.

## 2 · Recon que lo funda
- `docker_compose_production.yml`: el container `wanomi-edge` monta `./app/`→`/home/edge/app` **y**
  `./edge-engine/`→`/home/edge/edge-engine`, con `NODE_PATH=/home/edge/app/node_modules` → precedente
  exacto de "container node:14 que importa modelos de app + evaluadores de edge". `wanomi-sim` es el
  precedente de "container que monta `app/.env` read-only y corre un script de `tools/`".
- `diseno_supervisor_calidad.md` §0 (out-of-band, lógica propia), §4 (schema de `quality_findings`,
  `qa_runs`, `rule_snapshots`), §5 (RBAC superadmin, patrón DEC-REF-62.b), §8 (QA = pata viva → DEC-REF).
- `app/api/models/*.js`: patrón Mongoose del repo (la mayoría `export default` vía babel; en models
  node-puro es `module.exports` — seguir el patrón de `rule_pack.js`/`rule_definition.js` que son
  `module.exports` para que el QA los importe sin `.default`).
- `app/api/index.js`: registro de rutas (las de lectura `/api/qa/*` llegan en el bloque 140).

## 3 · Consumidores
| Consumidor | Qué |
|---|---|
| worker `wanomi-qa` (B/C) | **escribe** `quality_findings` + `qa_runs` por el modelo compartido |
| node/API (`/api/qa/*`, bloque 140) | **lee** las colecciones (nunca escribe findings) |
| UI `/admin/calidad` (bloque 141) | consume vía la API de node |
| `apertura.sh` | verifica que el container esté vivo tras arranque |

## 4 · Contratos de datos (congelados para 135–141)
**`quality_findings`** — idempotente por `(type, ruleId, dId)` (upsert: agrega `count`/`lastSeen`):
```
{ type: String,         // 'I1'..'I13' (invariante/anomalía)
  severity: String,     // 'hard' | 'soft'
  layer: String,        // 'A' | 'B' | 'C' (quién lo encontró)
  ruleId, packId, dId, siteCode: String,
  evidence: Mixed,      // números/serie inspeccionables (alimenta la ficha de hallazgo)
  suggestedAction: String,
  firstSeen, lastSeen: Date,
  count: Number,
  status: String }      // 'open' | 'ack' | 'resolved' | 'muted'  (default 'open')
```
**`qa_runs`** — auto-auditoría de cobertura (un check que NO corrió no pasa como verde, §4 diseño):
```
{ layer: String,                 // 'A'|'B'|'C'
  checks: [String],              // qué invariantes corrieron
  rulesCovered, devicesCovered: [String],
  findingsWritten: Number,
  startedAt, finishedAt: Date,
  ok: Boolean,                   // terminó sin excepción
  error: String }                // si ok=false
```
> `rule_snapshots` **NO** se define acá — es del bloque 137 (quien lo necesita).

## 5 · Topología del componente (`wanomi-qa`)
```
wanomi-qa:
  container_name: wanomi-qa
  image: node:14
  working_dir: /home/qa/qa
  environment: { NODE_PATH: /home/qa/app/node_modules, ... (ver §6) }
  volumes:
    - ./app/:/home/qa/app            # modelos + node_modules (fuente única de schema)
    - ./edge-engine/:/home/qa/edge-engine   # evaluadores reales (backtest, bloque 136)
    - ./qa/:/home/qa/qa              # código nuevo del supervisor
    - ./logs/:/home/qa/logs
  depends_on: { mongo: healthy }
  command: node /home/qa/qa/index.js
```
`qa/index.js` (andamiaje, sin lógica de checks):
- conecta a Mongo con `MONGODB_URI` (mismo patrón que edge; en el container la URI interna funciona);
- si `QA_ENABLED !== 'true'` → conecta y queda idle (apagable sin bajar el container);
- arma **slots vacíos**: Capa B `setInterval(…, QA_CAPA_B_INTERVAL_MS)` y Capa C (disparo nocturno
  según `QA_CAPA_C_HOUR`) — **sin** funciones de check todavía (las registran 135/138);
- levanta **http interno** en `QA_HTTP_PORT` con `GET /health` (el `POST /backtest` llega en 136);
- `SIGTERM` → cierra http + Mongo con flush, como el edge.

## 6 · Variables nuevas — `.env` de infra (por NOMBRE, jamás valor)
`QA_ENABLED`, `QA_HTTP_PORT`, `QA_CAPA_B_INTERVAL_MS`, `QA_CAPA_C_HOUR`.
Reusa (ya existen, el container las hereda como edge): `MONGODB_URI`, `MONGO_*`, `SITE_ID`.
Chequeo de presencia SIN filtrar valor: `[ -n "$VAR" ] && echo "$K=SET" || echo "$K=UNSET"`.

## 7 · Path real (DEC-PROC-5)
`docker compose up wanomi-qa` → `index.js` conecta a `iotix` → cuando 135/138 registren checks,
persisten por el **modelo Mongoose compartido** (no `insertOne` crudo). `apertura.sh` lista el
container entre los vivos. node lee las colecciones por el mismo modelo (bloque 140).

## 8 · Casos raros — ENUMERADOS
| # | Caso | Esperado |
|---|---|---|
| 1 | `QA_ENABLED=false` | conecta pero no agenda nada (kill-switch sin bajar container) |
| 2 | Mongo caído al arrancar | reintenta como el edge (no crashea en loop) |
| 3 | http interno | **sin** `ports:` al host → solo alcanzable por `wanomi-qa:<QA_HTTP_PORT>` dentro de la red docker (node lo usa en 136) |
| 4 | dos corridas solapadas (B lenta) | el slot no re-entra si la anterior no terminó (guard `running`) |
| 5 | SIGTERM a mitad de corrida | cierra prolijo; la corrida incompleta queda con `qa_run.ok=false` |

## 9 · IDs reservados
- **DEC-REF-134** — QA es la 5ta pata viva del producto (infra/app/edge/firmware/**qa**); andamiaje
  `wanomi-qa` + contratos `quality_findings`/`qa_runs`.

## 10 · Cómo se prueba
1. `docker compose -f docker_compose_production.yml up -d wanomi-qa` → log:
   `QA worker conectado · scheduler armado (B:slot cada Nms, C:slot HHhs) · http interno :PORT`.
2. Humo: insertar un `quality_finding` de prueba **por el modelo compartido** desde el container qa y
   leerlo desde el container node por el mismo modelo → mismo doc (contrato compartido verificado).
3. `GET http://wanomi-qa:<QA_HTTP_PORT>/health` desde node → `200 {ok:true}`.
4. `bash tools/apertura.sh` → muestra `wanomi-qa` healthy junto a mongo/emqx/node/edge/sim.
5. `QA_ENABLED=false` + restart → conecta, log "idle (QA_ENABLED=false)", no agenda.

## 11 · Costuras
| CST | Antes | Después | Verif |
|---|---|---|---|
| Dónde vive el QA | no existía | container `wanomi-qa` vivo en compose | §10.1/§10.4 |
| Forma del hallazgo | no existía | `quality_findings`/`qa_runs` schema congelado | §4/§10.2 |
| Acceso a evaluadores (backtest) | solo en edge | montados también en qa | §5 mount |

## 12 · Reversión
Quitar el servicio `wanomi-qa` del compose + borrar `./qa` + los 2 modelos + revertir `apertura.sh`
y las 4 vars del `.env`. Las colecciones quedan huérfanas pero vacías; **cero efecto sobre el motor**
(el QA nunca le escribe).
