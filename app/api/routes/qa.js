// DEC-REF-140 (bloque 6 · spec_qa_b6_api) — API de LECTURA /api/qa/* para el
// Supervisor de Calidad. La superficie que node expone para que la UI /admin/calidad
// (141) lea lo que el worker `wanomi-qa` produjo (Capas A/B/C, DEC-REF-134/135/138).
//
// Regla cardinal: SOLO LEE quality_findings / qa_runs / rulepacks / notifications.
// NUNCA escribe findings — el único write que hace es el PATCH de `status` de un
// finding (ack/mute/resolve a mano por el admin), que es la vía firmada del mockup.
// Los badges del inventario NO se evalúan acá: salen tal cual de quality_findings
// (los produce el worker). El backtest se PROXEA on-demand al worker.
//
// RBAC server-side (DEC-REF-62.a): cada ruta es checkAuth + isSuperadmin. El
// middleware de front es solo UX; la autorización real vive acá, igual que
// rulepacks.js:63.
//
// En node HAY babel (a diferencia del worker qa) → se pueden importar los modelos
// aunque sean `export default`. Se usan los modelos reales (fuente única de schema).

const express = require("express");
const router = express.Router();
const axios = require("axios");
const { checkAuth } = require("../middlewares/authentication.js");

// Modelos. rule_pack / quality_finding / qa_run son module.exports; notifications
// es `export default` (babel resuelve el require en node).
const RulePack = require("../models/rule_pack.js");
const QualityFinding = require("../models/quality_finding.js");
const QaRun = require("../models/qa_run.js");
const Notification = require("../models/notifications.js").default;
const Data = require("../models/data.js").default;
// DEC-REF-143 — la ficha nominal del detalle sale de equipment_sheet por deviceType
// (`export default` → `.default`, patrón Data/Notification).
const EquipmentSheet = require("../models/equipment_sheet.js").default;

// ── RBAC — réplica EXACTA de rulepacks.js:63. grants frescos de DB los pone checkAuth.
function isSuperadmin(req) {
  const grants = req.userData?.grants || [];
  return grants.some(g => g.role === 'superadmin');
}

function denySiNoSuperadmin(req, res) {
  if (!isSuperadmin(req)) {
    res.status(403).json({ status: "error", error: "forbidden: superadmin required" });
    return true;
  }
  return false;
}

// ── Proxy del backtest: host/puerto del worker SIN hardcodeo (defaults nombrados). ──
const QA_HOST = process.env.QA_HOST || 'wanomi-qa';
const QA_HTTP_PORT = process.env.QA_HTTP_PORT || 3010;

// ── Catálogo de status válidos del finding (enum del schema quality_finding). ──
const STATUS_VALIDOS = ['open', 'ack', 'muted', 'resolved'];

// Ventana de 30 días en ms, para "fires30d" / "lastFire" (notifications por kind='fire').
const VENTANA_30D_MS = 30 * 24 * 3600 * 1000;

// Timeline (ficha de hallazgo): ventana por defecto y cota máxima (sin hardcode mágico).
const TIMELINE_DEFAULT_H = Number(process.env.QA_TIMELINE_DEFAULT_H || 24);
const TIMELINE_MAX_H = Number(process.env.QA_TIMELINE_MAX_H || 168); // 7 días
// Cota de puntos de telemetría para no volcar series gigantes a la ficha.
const TIMELINE_MAX_POINTS = Number(process.env.QA_TIMELINE_MAX_POINTS || 2000);

// ── DEC-REF-143 · Parámetros del PRONÓSTICO (regresión lineal). Sin hardcodeo:
//    todos por process.env con default NOMBRADO (spec §3). Nunca se imprime su valor. ──
const FORECAST_WINDOW_H   = Number(process.env.QA_FORECAST_WINDOW_H   || 24);   // ventana de serie por defecto
const FORECAST_MAX_H      = Number(process.env.QA_FORECAST_MAX_H      || 168);  // cap de la ventana (7 días)
const FORECAST_MIN_N      = Number(process.env.QA_FORECAST_MIN_N      || 20);   // mínimo de muestras
const FORECAST_MIN_SPAN_H = Number(process.env.QA_FORECAST_MIN_SPAN_H || 2);    // mínimo de span (horas)
const FORECAST_HORIZON_H  = Number(process.env.QA_FORECAST_HORIZON_H  || 12);   // horizonte de proyección
const FORECAST_K          = Number(process.env.QA_FORECAST_K          || 2);    // ancho de banda (±k·se)
const FORECAST_MIN_SLOPE_SE = Number(process.env.QA_FORECAST_MIN_SLOPE_SE || 2);// umbral de significancia de pendiente
// Cota de puntos de la serie histórica que viaja al chart (submuestreo).
const FORECAST_MAX_POINTS = Number(process.env.QA_FORECAST_MAX_POINTS || 300);
// Un cruce de umbral MÁS ALLÁ de este horizonte cercano se presenta como "sin cruce
// próximo": un cruce a 84 días es honesto pero no accionable, y mostrarlo como un número
// grande ("~2025 h") erosiona la confianza. Configurable (DEC-REF-143, afinado en verificación).
const FORECAST_ETA_CAP_H = Number(process.env.QA_FORECAST_ETA_CAP_H || 72);

// ── Helpers de pronóstico ──────────────────────────────────────────────────

// Tipos de regla que NO siguen una medición numérica simple comparable contra un
// umbral de la condición: cross (condición compuesta, condition:null) y M (compara
// una métrica DERIVADA, no la variable cruda). Para ellos el pronóstico no aplica
// (spec §3/§5 caso 5). D/C/S con variable numérica + umbral sí se proyectan.
const TIPOS_SIN_SERIE_SIMPLE = ['cross', 'M'];

// Regresión lineal por mínimos cuadrados. x=horas (relativas), y=valor.
// Devuelve pendiente/hora, intercept, r2, se (desvío estándar de residuos) y n.
function regresionLineal(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  // Serie plana en x (todos los tiempos iguales) → sin pendiente definible.
  if (sxx === 0) return { slope: 0, intercept: my, r2: 0, se: 0, n, sxx: 0, mx };
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = syy === 0 ? 1 : Math.max(0, Math.min(1, (sxy * sxy) / (sxx * syy)));
  // Error estándar de los residuos: sqrt(SSE/(n-2)). n<3 → se=0 (sin grados de libertad).
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const yhat = intercept + slope * xs[i];
    sse += (ys[i] - yhat) * (ys[i] - yhat);
  }
  const se = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;
  return { slope, intercept, r2, se, n, sxx, mx };
}

// Formatea horas a texto llano ("~5 h", "~1,5 h") con coma decimal (es-AR).
function hText(h) {
  const r = Math.round(h * 10) / 10;
  return (Number.isInteger(r) ? String(r) : r.toFixed(1).replace('.', ',')) + ' h';
}

// Submuestrea una serie a <= max puntos conservando extremos (paso uniforme).
function submuestrear(arr, max) {
  if (arr.length <= max) return arr;
  const paso = (arr.length - 1) / (max - 1);
  const out = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.round(i * paso)]);
  return out;
}

// ── Mapeo type-de-finding → badge, por PRIORIDAD (spec §0):
//    🔴 MUERTA > 🟣 PERMANENTE > 🟡 RUIDOSA/I2 > 🔁 I3(flap) > 🧟 I5(zombie) > ⚠️ I6 > 🟢 sana
// El worker (Capa C/B4) escribe los types 'MUERTA'/'PERMANENTE'/'RUIDOSA'; la Capa B
// escribe I2/I3/I5/I6. El badge de una regla es el de MAYOR prioridad entre sus findings.
// Una regla sin ningún finding → 🟢 sana (caso raro 5).
const PRIORIDAD_BADGE = [
  { match: t => t === 'MUERTA',     key: 'dead',  emoji: '🔴', label: 'muerta' },
  { match: t => t === 'PERMANENTE', key: 'perm',  emoji: '🟣', label: 'permanente' },
  { match: t => t === 'RUIDOSA' || t === 'I2', key: 'noisy', emoji: '🟡', label: 'ruidosa' },
  { match: t => t === 'I3',         key: 'flap',  emoji: '🔁', label: 'parpadea' },
  { match: t => t === 'I5',         key: 'zombie', emoji: '🧟', label: 'zombie' },
  { match: t => t === 'I6',         key: 'mismatch', emoji: '⚠️', label: 'valor≠telemetría' },
];
const BADGE_SANA = { key: 'ok', emoji: '🟢', label: 'sana' };

// Dado el conjunto de types de los findings de una regla, devuelve el badge de mayor prioridad.
function badgeDeTypes(types) {
  for (const b of PRIORIDAD_BADGE) {
    if (types.some(t => b.match(t))) {
      return { key: b.key, emoji: b.emoji, label: b.label };
    }
  }
  return BADGE_SANA;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/qa/overview — semáforo del supervisor. Colecciones vacías → ceros (caso 6).
// ─────────────────────────────────────────────────────────────────────────────
router.get("/qa/overview", checkAuth, async (req, res) => {
  if (denySiNoSuperadmin(req, res)) return;
  try {
    const ahora = Date.now();
    const desde30d = ahora - VENTANA_30D_MS;

    // Findings abiertos por tipo (alimenta digest + contadores).
    const porTipo = await QualityFinding.aggregate([
      { $match: { status: 'open' } },
      { $group: { _id: '$type', c: { $sum: 1 } } },
    ]);
    const openFindingsByType = {};
    for (const r of porTipo) openFindingsByType[r._id] = r.c;

    // crossClosePct — findings I1 (resolve cruzado) contra el total de resolves en la
    // ventana. Un I1 = un resolve que no casó con un fire abierto del mismo (ruleId,dId).
    // % = resolves problemáticos / resolves totales. Sin resolves → 0 (no divide por cero).
    const resolvesTotal = await Notification.countDocuments({ kind: 'resolve', time: { $gte: desde30d } });
    const i1Count = openFindingsByType['I1'] || 0;
    const crossClosePct = resolvesTotal > 0 ? +(100 * i1Count / resolvesTotal).toFixed(1) : 0;

    // firesPerDay — fires en la ventana de 30 d / 30. 'fire' por default si falta kind
    // (los docs viejos sin campo leen como fire; se cuentan los != 'resolve').
    const firesTotal = await Notification.countDocuments({
      time: { $gte: desde30d },
      kind: { $ne: 'resolve' },
    });
    const firesPerDay = +(firesTotal / 30).toFixed(1);

    // Contadores de reglas con problema estructural (por findings abiertos).
    const flappingRules = openFindingsByType['I3'] || 0;
    const deadRules = openFindingsByType['MUERTA'] || 0;
    const permanentRules = openFindingsByType['PERMANENTE'] || 0;

    // lastRun B/C — última corrida de cada capa (qa_runs). null si la capa nunca corrió
    // (regla cardinal del diseño: un check que NO corrió NO pasa como verde).
    async function ultimaCorrida(layer) {
      const r = await QaRun.findOne({ layer }).sort({ startedAt: -1 }).lean();
      if (!r) return null;
      return { at: r.finishedAt || r.startedAt, ok: !!r.ok };
    }
    const [lastRunB, lastRunC] = await Promise.all([ultimaCorrida('B'), ultimaCorrida('C')]);

    // Digest — líneas derivadas de los findings abiertos (no hay colección aparte).
    const digest = [];
    if (deadRules)      digest.push(`🔴 ${deadRules} regla(s) muerta(s) (nunca pueden dispararse)`);
    if (permanentRules) digest.push(`🟣 ${permanentRules} regla(s) permanente(s) (condición casi siempre verdadera)`);
    if ((openFindingsByType['RUIDOSA'] || 0) + (openFindingsByType['I2'] || 0) > 0) {
      digest.push(`🟡 ${(openFindingsByType['RUIDOSA'] || 0) + (openFindingsByType['I2'] || 0)} regla(s) ruidosa(s)`);
    }
    if (flappingRules)  digest.push(`🔁 ${flappingRules} regla(s) parpadea(n) (fire→resolve→fire muy seguido)`);
    if (openFindingsByType['I5']) digest.push(`🧟 ${openFindingsByType['I5']} alarma(s) zombie (abierta con condición despejada)`);
    if (openFindingsByType['I1']) digest.push(`🔗 ${openFindingsByType['I1']} resolve(s) cruzado(s) sin fire abierto`);
    if (openFindingsByType['I4']) digest.push(`🪵 ${openFindingsByType['I4']} resolve(s) huérfano(s)`);
    if (openFindingsByType['I6']) digest.push(`⚠️ ${openFindingsByType['I6']} fire(s) con valor ≠ telemetría`);
    if (openFindingsByType['I13']) digest.push(`✏️ ${openFindingsByType['I13']} regla(s) cambiada(s) vs su siembra`);
    if (openFindingsByType['INGESTA']) digest.push(`📉 ${openFindingsByType['INGESTA']} fuente(s) que dejó de reportar`);

    return res.json({
      status: "success",
      data: {
        crossClosePct,
        firesPerDay,
        flappingRules,
        deadRules,
        permanentRules,
        openFindingsByType,
        lastRun: { B: lastRunB, C: lastRunC },
        digest,
      },
    });
  } catch (error) {
    console.log("ERROR GETTING QA OVERVIEW");
    console.log(error);
    return res.status(500).json({ status: "error", error: error.message || error });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/qa/inventory — una fila por regla de TODOS los packs, con su badge.
// badge sale de los findings (NO se evalúa nada). fires30d/lastFire de notifications
// (kind='fire' por ruleId). enabled del rulepack (y de la regla). Colecciones vacías
// → inventario vacío (no error).
// ─────────────────────────────────────────────────────────────────────────────
router.get("/qa/inventory", checkAuth, async (req, res) => {
  if (denySiNoSuperadmin(req, res)) return;
  try {
    const ahora = Date.now();
    const desde30d = ahora - VENTANA_30D_MS;

    const packs = await RulePack.find({}).lean();

    // Findings agrupados por ruleId: types presentes (para el badge) + ids (findingIds).
    const findingsPorRegla = await QualityFinding.aggregate([
      { $match: { ruleId: { $ne: null } } },
      { $group: { _id: '$ruleId', types: { $addToSet: '$type' }, ids: { $push: '$_id' } } },
    ]);
    const mapaFindings = new Map();
    for (const f of findingsPorRegla) mapaFindings.set(f._id, { types: f.types, ids: f.ids });

    // Fires en 30 d por ruleId: conteo + último (lastFire). kind != 'resolve' = fire
    // (default 'fire' para docs sin campo). Una sola agregación para todas las reglas.
    const firesPorRegla = await Notification.aggregate([
      { $match: { time: { $gte: desde30d }, kind: { $ne: 'resolve' }, ruleId: { $ne: null } } },
      { $group: { _id: '$ruleId', fires30d: { $sum: 1 }, lastFire: { $max: '$time' } } },
    ]);
    const mapaFires = new Map();
    for (const f of firesPorRegla) mapaFires.set(f._id, { fires30d: f.fires30d, lastFire: f.lastFire });

    const inventory = [];
    for (const pack of packs) {
      const packEnabled = pack.enabled !== false;
      for (const rule of (pack.rules || [])) {
        const f = mapaFindings.get(rule.ruleId) || { types: [], ids: [] };
        const fires = mapaFires.get(rule.ruleId) || { fires30d: 0, lastFire: null };
        inventory.push({
          ruleId: rule.ruleId,
          packId: pack.packId,
          label: rule.label || rule.ruleId,
          deviceType: rule.deviceType || pack.deviceType,
          // enabled efectivo: la regla cuenta como habilitada solo si su pack Y ella lo están.
          enabled: packEnabled && (rule.enabled !== false),
          fires30d: fires.fires30d,
          lastFire: fires.lastFire,
          badge: badgeDeTypes(f.types),
          findingIds: f.ids,
        });
      }
    }

    return res.json({ status: "success", data: inventory });
  } catch (error) {
    console.log("ERROR GETTING QA INVENTORY");
    console.log(error);
    return res.status(500).json({ status: "error", error: error.message || error });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/qa/findings — lista de findings. Filtros status/type/ruleId; orden
// lastSeen desc; paginado (page/limit).
// ─────────────────────────────────────────────────────────────────────────────
router.get("/qa/findings", checkAuth, async (req, res) => {
  if (denySiNoSuperadmin(req, res)) return;
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.type)   filter.type = req.query.type;
    if (req.query.ruleId) filter.ruleId = req.query.ruleId;

    // Paginado defensivo: page >= 1, limit acotado [1..200], default 50.
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const [total, findings] = await Promise.all([
      QualityFinding.countDocuments(filter),
      QualityFinding.find(filter).sort({ lastSeen: -1 }).skip(skip).limit(limit).lean(),
    ]);

    return res.json({
      status: "success",
      data: findings,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.log("ERROR GETTING QA FINDINGS");
    console.log(error);
    return res.status(500).json({ status: "error", error: error.message || error });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/qa/findings/:id/status — ack / mute / resolve a mano por el admin
// ("Silenciar" del mockup = muted). ÚNICO write de la ruta, y SOLO sobre el campo
// status del finding (nunca crea/borra findings). 400 status inválido · 404 id inexistente.
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/qa/findings/:id/status", checkAuth, async (req, res) => {
  if (denySiNoSuperadmin(req, res)) return;
  try {
    const { status } = req.body || {};
    if (!STATUS_VALIDOS.includes(status)) {
      return res.status(400).json({
        status: "error",
        error: `status inválido; debe ser uno de ${STATUS_VALIDOS.join(', ')}`,
      });
    }

    const finding = await QualityFinding.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true, runValidators: true }
    ).lean();

    if (!finding) {
      return res.status(404).json({ status: "error", error: "finding no encontrado" });
    }
    return res.json({ status: "success", data: finding });
  } catch (error) {
    console.log("ERROR PATCH QA FINDING STATUS");
    console.log(error);
    // CastError de un _id mal formado → 404 (no existe), no 500.
    if (error.name === 'CastError') {
      return res.status(404).json({ status: "error", error: "finding no encontrado" });
    }
    return res.status(500).json({ status: "error", error: error.message || error });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/qa/backtest — PROXY on-demand al worker (POST http://QA_HOST:QA_HTTP_PORT
// /backtest). Reenvía el body {packId,days?,ruleId?} tal cual y devuelve el JSON del
// worker. Worker caído / timeout → 502/504 con JSON claro, SIN colgar la request (caso 4).
// ─────────────────────────────────────────────────────────────────────────────
router.post("/qa/backtest", checkAuth, async (req, res) => {
  if (denySiNoSuperadmin(req, res)) return;
  const url = `http://${QA_HOST}:${QA_HTTP_PORT}/backtest`;
  try {
    const upstream = await axios.post(url, req.body || {}, {
      timeout: 60000,
      // No lanzar por status del worker: reenviamos su código/JSON tal cual (ej. 400).
      validateStatus: () => true,
    });
    return res.status(upstream.status).json(upstream.data);
  } catch (error) {
    // Worker inalcanzable (ECONNREFUSED/ENOTFOUND) → 502; timeout → 504.
    const esTimeout = error.code === 'ECONNABORTED' || /timeout/i.test(error.message || '');
    const code = esTimeout ? 504 : 502;
    console.log(`ERROR PROXY QA BACKTEST (${error.code || 'n/a'})`);
    return res.status(code).json({
      status: "error",
      error: esTimeout
        ? "el worker de calidad no respondió a tiempo (timeout)"
        : "no se pudo contactar al worker de calidad",
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/qa/rule/:ruleId/timeline?dId=<opt>&hours=<opt, default 24> — línea de
// tiempo de la ficha de hallazgo (UI 141): eventos fire/resolve de notifications +
// serie de telemetría de la variable observada (de data) para superponer.
// Aditivo: no toca los otros endpoints. Regla inexistente → 404; sin datos → arrays
// vacíos (no error). cross/M sin variable simple → telemetry:[] (solo eventos).
// ─────────────────────────────────────────────────────────────────────────────
router.get("/qa/rule/:ruleId/timeline", checkAuth, async (req, res) => {
  if (denySiNoSuperadmin(req, res)) return;
  try {
    const { ruleId } = req.params;
    const dId = req.query.dId || null;

    // hours acotado a (0, TIMELINE_MAX_H], default TIMELINE_DEFAULT_H.
    let hours = parseInt(req.query.hours, 10);
    if (!Number.isFinite(hours) || hours <= 0) hours = TIMELINE_DEFAULT_H;
    hours = Math.min(hours, TIMELINE_MAX_H);

    const ahora = Date.now();
    const desde = ahora - hours * 3600 * 1000;

    // Resolver la regla en los packs (para 404 y para la variable observada). El
    // ruleId es único por regla; se busca en cualquier pack que la contenga.
    const pack = await RulePack.findOne({ 'rules.ruleId': ruleId }, { packId: 1, rules: 1 }).lean();
    const rule = pack && (pack.rules || []).find(r => r.ruleId === ruleId);
    if (!rule) {
      return res.status(404).json({ status: "error", error: "regla no encontrada" });
    }

    // Eventos: fires/resolves de notifications de esa regla (y dId si se pasó), en ventana.
    const eventFilter = { ruleId, time: { $gte: desde } };
    if (dId) eventFilter.dId = dId;
    const eventsRaw = await Notification.find(eventFilter)
      .select({ time: 1, kind: 1, dId: 1, value: 1, _id: 0 })
      .sort({ time: 1 })
      .lean();
    // Normaliza kind ausente → 'fire' (default del schema; docs viejos).
    const events = eventsRaw.map(e => ({
      time: e.time,
      kind: e.kind || 'fire',
      dId: e.dId,
      value: e.value,
    }));

    // Telemetría: serie de la variable observada de la regla. También para cross/M si la
    // regla declara una variable primaria (p.ej. una hoja del cross, como battery_voltage)
    // → da una serie útil para superponer. Sin variable declarada → telemetry:[] (solo eventos).
    let telemetry = [];
    const variable = rule.variable || null;
    if (variable) {
      const dataFilter = { variable, time: { $gte: desde } };
      if (dId) dataFilter.dId = dId;
      const serie = await Data.find(dataFilter)
        .select({ time: 1, value: 1, _id: 0 })
        .sort({ time: 1 })
        .limit(TIMELINE_MAX_POINTS)
        .lean();
      telemetry = serie.map(d => ({ time: d.time, value: d.value }));
    }

    return res.json({
      status: "success",
      data: {
        ruleId,
        packId: pack.packId,
        dId,
        variable,
        hours,
        events,
        telemetry,
      },
    });
  } catch (error) {
    console.log("ERROR GETTING QA RULE TIMELINE");
    console.log(error);
    return res.status(500).json({ status: "error", error: error.message || error });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/qa/rule/:ruleId/detail — todo lo "no-gráfico" del detalle de regla
// (DEC-REF-143, spec §2). Config de la regla (rulepacks) + ficha nominal de la
// variable observada (equipment_sheet por deviceType) + badge (mismo criterio de
// prioridad que /inventory, reusa badgeDeTypes) + los quality_findings de ESE ruleId.
// Regla inexistente → 404. Sin ficha → fichaNominal:null. Sin findings → findings:[].
// READ-ONLY.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/qa/rule/:ruleId/detail", checkAuth, async (req, res) => {
  if (denySiNoSuperadmin(req, res)) return;
  try {
    const { ruleId } = req.params;

    // Resolver la regla en los packs (ruleId único por regla; cualquier pack que la contenga).
    const pack = await RulePack.findOne({ 'rules.ruleId': ruleId }, { packId: 1, rules: 1 }).lean();
    const rule = pack && (pack.rules || []).find(r => r.ruleId === ruleId);
    if (!rule) {
      return res.status(404).json({ status: "error", error: "regla no encontrada" });
    }

    const deviceType = rule.deviceType || null;
    const variable = rule.variable || null;

    // Condición de la regla (op/value/deadband). cross/S → condition:null.
    const condition = rule.condition
      ? { op: rule.condition.op, value: rule.condition.value, deadband: rule.condition.deadband ?? null }
      : null;

    // Ficha nominal: busca la ficha por deviceType y, dentro, la variable observada.
    // Sin ficha, o sin esa variable en la ficha → fichaNominal:null (honesto).
    let fichaNominal = null;
    if (deviceType && variable) {
      const sheet = await EquipmentSheet.findOne({ deviceType }, { variables: 1 }).lean();
      const v = sheet && (sheet.variables || []).find(x => x.name === variable);
      if (v) {
        fichaNominal = {
          factoryRange: v.factoryRange ?? null,
          deadband: v.deadband ?? null,
          limits: (v.limits || []).map(l => ({
            kind: l.kind, op: l.op, value: l.value, unit: l.unit, source: l.source,
          })),
        };
      }
    }

    // Findings de ESE ruleId. badge = mismo criterio de prioridad que /inventory.
    const findingsRaw = await QualityFinding.find({ ruleId }).sort({ lastSeen: -1 }).lean();
    const findings = findingsRaw.map(f => ({
      _id: f._id,
      type: f.type,
      severity: f.severity,
      dId: f.dId,
      variable: f.variable,
      evidence: f.evidence,
      suggestedAction: f.suggestedAction,
      status: f.status,
      firstSeen: f.firstSeen,
      lastSeen: f.lastSeen,
      count: f.count,
    }));
    // El badge sale de los types presentes (igual que /inventory). Sin findings → 🟢 sana.
    const badge = badgeDeTypes(findingsRaw.map(f => f.type));

    return res.json({
      status: "success",
      data: {
        ruleId,
        packId: pack.packId,
        label: rule.label || ruleId,
        deviceType,
        variable,
        type: rule.type,
        enabled: (pack.enabled !== false) && (rule.enabled !== false),
        condition,
        fichaNominal,
        badge,
        findings,
      },
    });
  } catch (error) {
    console.log("ERROR GETTING QA RULE DETAIL");
    console.log(error);
    return res.status(500).json({ status: "error", error: error.message || error });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/qa/rule/:ruleId/forecast?dId=&hours= — proyección de tendencia de la
// variable observada por REGRESIÓN LINEAL (mínimos cuadrados) sobre la serie
// reciente, con banda de incertidumbre (±k·se) y cruce de umbral (de la condición).
// DEC-REF-143, spec §3/§4. Se computa EN NODE (determinista, re-derivable).
// EN TODAS las reglas: si no aplica, lo dice (applicable:false + reason). Regla
// inexistente → 404. READ-ONLY.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/qa/rule/:ruleId/forecast", checkAuth, async (req, res) => {
  if (denySiNoSuperadmin(req, res)) return;
  try {
    const { ruleId } = req.params;

    const pack = await RulePack.findOne({ 'rules.ruleId': ruleId }, { packId: 1, rules: 1 }).lean();
    const rule = pack && (pack.rules || []).find(r => r.ruleId === ruleId);
    if (!rule) {
      return res.status(404).json({ status: "error", error: "regla no encontrada" });
    }

    const variable = rule.variable || null;

    // Respuesta estándar de "no aplicable": contrato completo con applicable:false + reason.
    const noAplica = (reason, note) => res.json({
      status: "success",
      data: {
        applicable: false, reason, variable,
        n: 0, spanHours: 0, slopePerHour: null, r2: null, threshold: null,
        historical: [], projection: [], crossing: null, note,
      },
    });

    // Gate 1 — regla cross/M: no sigue una medición numérica simple vs umbral (spec §5 caso 5).
    if (TIPOS_SIN_SERIE_SIMPLE.includes(rule.type) || !variable || variable === 'n/a') {
      return noAplica('regla sin variable simple',
        'Sin pronóstico aplicable: esta regla no sigue una medición numérica simple.');
    }

    // Ventana: hours acotado a (0, FORECAST_MAX_H], default FORECAST_WINDOW_H.
    let hours = parseInt(req.query.hours, 10);
    if (!Number.isFinite(hours) || hours <= 0) hours = FORECAST_WINDOW_H;
    hours = Math.min(hours, FORECAST_MAX_H);

    const ahora = Date.now();
    const desde = ahora - hours * 3600 * 1000;

    // Device: el pasado en ?dId; si no, el representativo (más datos de la variable en la ventana).
    let dId = req.query.dId || null;
    if (!dId) {
      const top = await Data.aggregate([
        { $match: { variable, time: { $gte: desde } } },
        { $group: { _id: '$dId', c: { $sum: 1 } } },
        { $sort: { c: -1 } },
        { $limit: 1 },
      ]);
      dId = top.length ? top[0]._id : null;
    }
    if (!dId) {
      return noAplica('datos insuficientes', 'Datos insuficientes para proyectar.');
    }

    // Serie de la variable para el device en la ventana (ascendente por tiempo).
    const serieRaw = await Data.find({ dId, variable, time: { $gte: desde } })
      .select({ time: 1, value: 1, _id: 0 })
      .sort({ time: 1 })
      .lean();

    // Solo valores numéricos (un fault_code textual, un estado, etc. no se proyecta).
    const serie = serieRaw.filter(d => typeof d.value === 'number' && Number.isFinite(d.value));
    if (serie.length === 0) {
      // Había docs pero ninguno numérico → variable no numérica.
      if (serieRaw.length > 0) {
        return noAplica('variable no numérica',
          'Sin pronóstico aplicable: esta variable no es numérica.');
      }
      return noAplica('datos insuficientes', 'Datos insuficientes para proyectar.');
    }

    const t0 = serie[0].time;                 // origen temporal (ms)
    const tLast = serie[serie.length - 1].time;
    const spanHours = (tLast - t0) / 3600000;

    // Gate 2 — muestra: n y span mínimos (spec §3).
    if (serie.length < FORECAST_MIN_N || spanHours < FORECAST_MIN_SPAN_H) {
      return noAplica('datos insuficientes', 'Datos insuficientes para proyectar.');
    }

    // Regresión: x=horas desde t0, y=valor.
    const xs = serie.map(d => (d.time - t0) / 3600000);
    const ys = serie.map(d => d.value);
    const { slope, intercept, r2, se, n } = regresionLineal(xs, ys);

    const xLast = (tLast - t0) / 3600000;
    const yAt = (xh) => intercept + slope * xh;

    // Umbral de la condición (si es numérico) → para el cruce.
    const threshold = (rule.condition && typeof rule.condition.value === 'number')
      ? rule.condition.value : null;

    // Significancia de la pendiente: |slope| vs FORECAST_MIN_SLOPE_SE·(se/√n).
    const errPendiente = n > 0 ? se / Math.sqrt(n) : 0;
    const umbralSignif = FORECAST_MIN_SLOPE_SE * errPendiente;
    const pendienteSignificativa = Math.abs(slope) > umbralSignif;

    // Proyección: extender la recta FORECAST_HORIZON_H h hacia adelante (desde tLast).
    // Banda lo/hi = ŷ ± k·se. ~24 puntos de proyección para una curva suave.
    const PUNTOS_PROY = 24;
    const projection = [];
    for (let i = 1; i <= PUNTOS_PROY; i++) {
      const dh = (FORECAST_HORIZON_H * i) / PUNTOS_PROY;
      const xh = xLast + dh;
      const yhat = yAt(xh);
      projection.push({
        time: tLast + dh * 3600000,
        value: yhat,
        lo: yhat - FORECAST_K * se,
        hi: yhat + FORECAST_K * se,
      });
    }

    // Serie histórica para el chart (submuestreada).
    const historical = submuestrear(serie.map(d => ({ time: d.time, value: d.value })), FORECAST_MAX_POINTS);

    const baseR2 = +r2.toFixed(3);
    const slopePerHour = +slope.toFixed(6);

    // Pendiente no significativa → tendencia plana, sin cruce (pero applicable:true, banda plana).
    if (!pendienteSignificativa) {
      return res.json({
        status: "success",
        data: {
          applicable: true, reason: null, variable,
          n, spanHours: +spanHours.toFixed(2),
          slopePerHour, r2: baseR2, threshold,
          historical, projection,
          crossing: null,
          note: `Tendencia plana: sin cruce previsto en ${FORECAST_HORIZON_H} h.`,
        },
      });
    }

    // Cruce de umbral: solo si hay threshold numérico y la pendiente APUNTA hacia él.
    // etaHours = resolver recta=threshold, relativo a tLast. Banda = eta con y±k·se.
    let crossing = null;
    let note;
    if (threshold !== null && slope !== 0) {
      const yNow = yAt(xLast);
      const apunta = (threshold > yNow && slope > 0) || (threshold < yNow && slope < 0);
      if (apunta) {
        const etaH = (threshold - yNow) / slope;               // horas desde tLast hasta la recta=umbral
        if (etaH > FORECAST_ETA_CAP_H) {
          // Cruce real pero MUY lejano → en la práctica, tendencia estable. Honesto + útil.
          note = `Tendencia muy lenta: sin cruce próximo (al ritmo actual, recién en ~${hText(etaH)}).`;
        } else {
          // Banda del cruce: resolver (ŷ±k·se)=threshold → desplaza el eta por ±k·se/|slope|.
          const delta = Math.abs((FORECAST_K * se) / slope);
          const loH = Math.max(0, etaH - delta);
          const hiH = etaH + delta;
          crossing = { etaHours: +etaH.toFixed(2), band: [+loH.toFixed(2), +hiH.toFixed(2)] };
          const pm = (delta > 0) ? ` (±${hText(delta)})` : '';
          note = `A este ritmo llega a su umbral en ~${hText(etaH)}${pm}.`;
        }
      }
    }
    if (!crossing) {
      // Pendiente significativa pero sin umbral, o se aleja de él (cruce ya pasado / dirección contraria).
      note = threshold === null
        ? 'Tendencia detectada; esta regla no define un umbral numérico para proyectar un cruce.'
        : 'Tendencia detectada, pero no se dirige al umbral: sin cruce previsto.';
    }

    return res.json({
      status: "success",
      data: {
        applicable: true, reason: null, variable,
        n, spanHours: +spanHours.toFixed(2),
        slopePerHour, r2: baseR2, threshold,
        historical, projection,
        crossing,
        note,
      },
    });
  } catch (error) {
    console.log("ERROR GETTING QA RULE FORECAST");
    console.log(error);
    return res.status(500).json({ status: "error", error: error.message || error });
  }
});

module.exports = router;
