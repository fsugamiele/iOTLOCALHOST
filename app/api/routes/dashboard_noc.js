const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { checkAuth } = require("../middlewares/authentication.js");
const { buildReadFilter } = require("../middlewares/scope.js");
const RulePack     = require("../models/rule_pack.js");

import Site         from "../models/site.js";
import Device       from "../models/device.js";
import Template     from "../models/template.js";
import Notification from "../models/notifications.js";
import Data         from "../models/data.js";

// ── Constantes documentadas (DEC-REF-69) ────────────────────────────────
// (5) — timezone único de la agregación diaria del histograma. Toda partición
// por "día" pasa por este TZ; si cambia, cambia acá (single point of truth).
const TZ_OPERACION = "America/Argentina/Buenos_Aires";

// "Dentro de cadencia" = last-data ≤ FACTOR × heartbeatSec del template.
// P3 (#79): el estado online se mide contra el LATIDO del device (publica
// todo cada heartbeatSec aunque nada cambie), no contra la cadencia mínima
// de variables — con publicación por cambio, una variable quieta no dice
// nada sobre la salud del equipo. FACTOR=2 alinea con la lección BUG-SIM-6
// y con el criterio de SF-4 de no marcar offline por jitter puntual.
const CADENCE_TOLERANCE_FACTOR = 2;

// Ventanas fijas por KPI (resolución de sala #49, R2/GATE 2).
const ACTIVE_ALARM_WINDOW_MS = 15 * 60 * 1000;      // DEC-REF-64.c — red de seguridad
const HISTOGRAM_WINDOW_DAYS  = 7;
const UPTIME_WINDOW_DAYS     = 7;
const FUEL_WINDOW_MS         = 24 * 60 * 60 * 1000; // (3bis) Diésel 24h fijo
const RECENT_ALARMS_LIMIT    = 10;                  // (A)
const TREND_MAX_POINTS       = 400;                 // (D) techo /trend
const TREND_MIN_BUCKET_MS    = 30 * 1000;

// (7) — nombre con este sufijo NO es telemetría: eco de configuración del
// device. Se excluye del selector aunque cumpla el resto de la intersección.
const SETPOINT_SUFFIX = "_setpoint";

// (C) — prioridades verificadas contra distinct('variable') sobre db.data.
const FUEL_PRIORITY  = ["fuel_level"];
const TEMP_PRIORITY  = ["coolant_temp", "exhaust_temp", "shelter_temp"];
const MAINS_PRIORITY = ["mains_voltage"];

// Clasificación de agregación por variable. Hardcoded en esta ronda (DEC-REF-69
// declara: clasificación futura por metadata de template, NO scope de v1).
// avg  → variable interpretada como "nivel/porcentaje" con promedio de red útil.
// range → magnitud física por site, min-max entre sites informativo.
const AVG_VARIABLES = new Set(["fuel_level"]);
const classifyAggregation = (v) => AVG_VARIABLES.has(v) ? "avg" : "range";

// ── Caché de servidor para /noc (DEC-REF-85 v · -85-A · DEC-REF-101) ──────
// DEC-REF-101 rebalanceó los tramos. Con el índice garantizado desde la API
// (D-2) y trendVariables derivado de templates (D-3), la ÚNICA query pesada
// que queda es uptimeAgg ($group de 7 días sobre db.data). Todo lo demás —
// lastByDid, lastValues, diesel, trendVariables — es fan-out de findOne
// IXSCAN y se computa SIEMPRE fresco, en ambas fases:
//
//   D-1 — el estado online de un sitio JAMÁS se calcula contra datos
//         cacheados: el caché PESADO de 180 s generaba flap offline/online
//         determinista cuando 2×cadencia < TTL (el sitio caía "offline" a
//         los ~120 s de un HIT aunque el device siguiera publicando;
//         medido en #76 — no eran desuscripciones MQTT).
//
//   uptimeAgg — caché in-memory con TTL 1 h (D-5: un uptime de 7 días no
//               necesita refrescarse cada 3 min). `?fresh=1` NO lo invalida.
//               En la fase viva se sirve solo si hay HIT; nunca se dispara
//               el MISS desde ?phase=vivo.
//
// Clave = hash(sorted(siteCodes)) — SIN userId. Es SEGURO agnóstico al
// usuario porque uptimeAgg deriva EXCLUSIVAMENTE de `siteCodes` y de
// `Device.find({siteId:{$in:siteCodes}})` (sin buildReadFilter). Dos
// usuarios con mismos siteCodes ⇒ mismos allowedDIds ⇒ misma consulta ⇒
// mismo resultado (mismo argumento auditado en DEC-REF-85-A, sesión #53).
// El tramo que sí depende del usuario (notifFilter) se recomputa por
// request, cerrando el defecto histórico de respuesta cross-tenant por
// coincidencia empírica (DEC-REF-85-A).
const UPTIME_TTL_MS = 60 * 60 * 1000;
const nocUptimeCache = new Map(); // scopeKey → { at, payload: uptimeAgg }
// (DEC-REF-101 D-6) — caché corto del endpoint /trend: el aggregate
// bucketizado sobre db.data se repite idéntico ante polls del gráfico.
// TTL 60 s, key = sha1(variable|window|sorted(siteCodes)); la variable ya
// fue validada contra el scope al momento del cómputo.
const TREND_TTL_MS = 60 * 1000;
const trendCache = new Map(); // trendKey → { at, payload }
function scopeKeyOf(siteCodes) {
  if (!siteCodes.length) return "empty";
  return crypto.createHash("sha1").update(siteCodes.slice().sort().join("|")).digest("hex");
}

// ── Helpers ─────────────────────────────────────────────────────────────

// (7 · R4) — variables del selector de tendencia: declaradas en los widgets
// de los templates del scope (float|int, sin sufijo _setpoint).
// Enriquecido con label legible: variableFullName del primer widget que
// declara la variable en el scope; fallback a la variable cruda.
// (DEC-REF-101 D-3) — se retiró el Data.distinct de "presencia": escaneaba
// db.data sin filtro temporal en cada MISS; la fuente de verdad de qué
// variables existen es el template. Una variable declarada sin datos aún
// produce serie vacía en /trend, sin costo de escaneo acá.
// Acepta templates pre-cargados para evitar re-fetch en el handler principal.
function computeTrendVariablesFromTemplates(templates) {
  const declared = new Set();
  const labelByVar = new Map();
  const unitByVar  = new Map();
  templates.forEach(t => (t.widgets || []).forEach(w => {
    if (!w || !w.variable) return;
    if (w.variableType !== "float" && w.variableType !== "int") return;
    if (w.variable.endsWith(SETPOINT_SUFFIX)) return;
    declared.add(w.variable);
    if (!labelByVar.has(w.variable) && w.variableFullName) {
      labelByVar.set(w.variable, w.variableFullName);
    }
    // DEC-REF-75-D: unit viaja en el contrato del endpoint. Primer widget que
    // declara la variable gana (igual criterio que labelByVar).
    if (!unitByVar.has(w.variable) && w.unit) {
      unitByVar.set(w.variable, w.unit);
    }
  }));
  return [...declared]
    .sort()
    .map(v => ({
      variable:    v,
      label:       labelByVar.get(v) || v,
      unit:        unitByVar.get(v) || "",
      aggregation: classifyAggregation(v)
    }));
}
async function computeTrendVariables(templateIds) {
  if (!templateIds.length) return [];
  const templates = await Template.find({ _id: { $in: templateIds } }, { widgets: 1 }).lean();
  return computeTrendVariablesFromTemplates(templates);
}

function minCadenceSec(template) {
  const cads = (template.widgets || [])
    .map(w => Number(w.variableSendFreq))
    .filter(n => Number.isFinite(n) && n > 0);
  return cads.length ? Math.min(...cads) : null;
}

// P3 (#79) — latido efectivo del template (default 300 s si no declarado).
function heartbeatSecOf(template) {
  const hb = template ? Number(template.heartbeatSec) : NaN;
  return Number.isFinite(hb) && hb > 0 ? hb : 300;
}

// ── GET /dashboard/noc ──────────────────────────────────────────────────
router.get("/dashboard/noc", checkAuth, async (req, res) => {
  try {
    const t0 = Date.now();
    const now = t0;
    const window = String(req.query.window || "7d");
    const since7d     = now - HISTOGRAM_WINDOW_DAYS * 86400000;
    const sinceUptime = now - UPTIME_WINDOW_DAYS    * 86400000;
    const since24h    = now - FUEL_WINDOW_MS;
    const sinceActive = now - ACTIVE_ALARM_WINDOW_MS;

    const siteFilter  = await buildReadFilter(req, "Site");
    const notifFilter = await buildReadFilter(req, "Notification");

    const sites = await Site.find(siteFilter).lean();
    const siteCodes = sites.map(s => s.siteCode);

    if (siteCodes.length === 0) {
      return res.json({
        status: "success",
        data: {
          window, generatedAt: now,
          kpis: {
            // R5 · G8 · 6 — sitesOnline/activeAlerts sin unidad (el detalle
            // "de N" / "N críticas · N atención" ya lo dice); diésel y uptime
            // conservan "%".
            sitesOnline:    { label: "Sitios Online", sublabel: "transmitiendo dentro de cadencia", value: 0, total: 0, unit: null },
            dieselDelta24h: { label: "Diésel 24h", sublabel: "nivel promedio red", value: null, delta24h: null, sitesWithFuel: 0, unit: "%" },
            activeAlerts:   { label: "Alertas", sublabel: "activas ahora", value: 0, critical: 0, warning: 0, unit: null },
            uptime:         { label: "Uptime", sublabel: "% ventanas de latido con telemetría · 7d", value: null, received: 0, expected: 0, unit: "%" }
          },
          sites: [],
          severityHistogram7d: { tz: TZ_OPERACION, buckets: [] },
          recentAlarms: [],
          trendVariables: []
        }
      });
    }

    // Caché servidor (DEC-REF-85 v · -85-A) — key para el tramo PESADO.
    // `?fresh=1` YA NO invalida (era el mecanismo que hacía que el operador
    // pagase 12 s por refresh event-driven, DEC-REF-83 ii). El tramo VIVO
    // se recomputa siempre; el PESADO respeta TTL 180 s.
    const cacheKey = scopeKeyOf(siteCodes);

    // Devices + templates — necesarios para armar allowedDIds y templateById.
    const devices = await Device.find(
      { siteId: { $in: siteCodes } },
      { dId: 1, siteId: 1, templateId: 1, name: 1, deviceType: 1, _id: 0 }
    ).lean();
    const templateIds = [...new Set(devices.map(d => d.templateId).filter(Boolean))];
    const templates = await Template.find({ _id: { $in: templateIds } }, { _id: 1, name: 1, widgets: 1 }).lean();
    const templateById = new Map(templates.map(t => [String(t._id), t]));
    const devicesBySite = new Map();
    devices.forEach(d => {
      if (!devicesBySite.has(d.siteId)) devicesBySite.set(d.siteId, []);
      devicesBySite.get(d.siteId).push(d);
    });
    const allowedDIds = devices.map(d => d.dId);

    // (DEC-REF-100 D-5 · F5 · DEC-REF-101 D-1/D-4) — render progresivo: con
    // `?phase=vivo` el handler responde TODO el panel fresco (sitios con
    // estado online, KPIs, alarmas, histograma, trendVariables) salvo el KPI
    // de uptime, que solo se sirve si hay HIT de su caché de 1 h (D-5). El
    // fetch full completa uptime. Desde DEC-REF-101 ya no hay queries
    // pesadas fuera de uptimeAgg: el resto es fan-out IXSCAN.
    const phaseVivo = req.query.phase === "vivo";

    // (R4 · G7 · 1b · DEC-REF-101 D-1) — lastByDid: findOne({dId}).sort(
    // {time:-1}) × device en paralelo (IXSCAN puro c/u sobre
    // idx_data_reconstruct). Se computa SIEMPRE, también en la fase viva:
    // el estado online del sitio se calcula contra el último dato FRESCO,
    // nunca contra el caché (el caché de 180 s era la causa del flap
    // offline/online medido en #76).
    const lastByDidPromise = Promise.all(
      allowedDIds.map(dId =>
        Data.findOne({ dId }, { time: 1, _id: 0 }).sort({ time: -1 }).lean()
          .then(doc => [dId, doc ? doc.time : null])
      )
    );

    // (R4 · G7 · 1a) — todo lo demás va en Promise.all de nivel superior.
    // activeEpisodes: aggregate sobre Notification (H1).
    const activeEpisodesPromise = Notification.aggregate([
      { $match: { ...notifFilter,
                  time: { $gte: sinceActive },
                  severity: { $in: ["warning", "critical"] } } },
      { $sort:  { time: -1 } },
      { $group: {
          _id: { ruleId: "$ruleId", siteId: "$siteId" },
          lastKind:     { $first: "$kind" },
          lastSeverity: { $first: "$severity" }
      } },
      { $match: { $expr: { $ne: [ { $ifNull: [ "$lastKind", "fire" ] }, "resolve" ] } } }
    ]);

    // (R4 · G7 · 1a) — lastValues por site: TODAS las promesas de pickLastValue
    // en un solo Promise.all global (antes: Promise.all por site — serial entre sites).
    // Por site son 3 findOne (fuel/temp/mains) que ya iban en Promise.all interno.
    const lastValueOne = (siteCode, priority) => {
      const devs = devicesBySite.get(siteCode) || [];
      const dIds = devs.map(d => d.dId);
      if (!dIds.length) return Promise.resolve(null);
      // Recorre priority en secuencia — típicamente 1-2 items, IXSCAN puro c/u.
      return (async () => {
        for (const varName of priority) {
          const doc = await Data.findOne(
            { dId: { $in: dIds }, variable: varName },
            { value: 1, time: 1, dId: 1, _id: 0 }
          ).sort({ time: -1 }).lean();
          if (doc && Number.isFinite(doc.value)) {
            return { value: doc.value, variable: varName, ageSec: Math.round((now - doc.time)/1000), dId: doc.dId };
          }
        }
        return null;
      })();
    };
    const lastValuesPromise = Promise.all(
      sites.flatMap(s => [
        lastValueOne(s.siteCode, FUEL_PRIORITY),
        lastValueOne(s.siteCode, TEMP_PRIORITY),
        lastValueOne(s.siteCode, MAINS_PRIORITY)
      ])
    );

    // (R4 · G7 · 1a) — Diésel: los 2 findOne × device (first en 24h, last global)
    // van en Promise.all global (antes: for anidado serial por site y por device).
    const dieselJobs = sites.flatMap(s => {
      const devs = devicesBySite.get(s.siteCode) || [];
      return devs.map(d => ({
        siteCode: s.siteCode,
        dId: d.dId
      }));
    });
    const dieselResultsPromise = Promise.all(dieselJobs.map(job => Promise.all([
      Data.findOne(
        { dId: job.dId, variable: "fuel_level", time: { $gte: since24h } },
        { value: 1, _id: 0 }
      ).sort({ time: 1  }).lean(),
      Data.findOne(
        { dId: job.dId, variable: "fuel_level" },
        { value: 1, _id: 0 }
      ).sort({ time: -1 }).lean()
    ]).then(([first, last]) => ({ ...job, first, last }))));

    // (R4 · G7 · 1a · DEC-REF-101 D-5) — uptime aggregate: el ÚNICO tramo
    // PESADO que queda ($group de 7 días sobre db.data, dominante del wall
    // en MISS). Caché propio TTL 1 h. En fase viva NUNCA se dispara el MISS:
    // se sirve el HIT si existe, si no el KPI de uptime queda null hasta el
    // fetch full (que sí lo computa).
    let pesadoStatus;
    let uptimeAggPromise;
    const cachedUptime = nocUptimeCache.get(cacheKey);
    const uptimeHit = cachedUptime && (now - cachedUptime.at) < UPTIME_TTL_MS;
    if (uptimeHit) {
      uptimeAggPromise = Promise.resolve(cachedUptime.payload);
      pesadoStatus = "HIT";
    } else if (phaseVivo) {
      uptimeAggPromise = Promise.resolve(null);
      pesadoStatus = "SKIP";
    } else {
      // P4 (#79) — uptime por PRESENCIA de latido, no por volumen: con
      // publicación por cambio un device sano puede publicar poco. Se cuenta
      // en cuántas ventanas de heartbeatSec (del template de cada device)
      // apareció ≥1 dato. Un aggregate por valor de heartbeat distinto
      // (en la práctica casi siempre uno solo: 300 s default).
      uptimeAggPromise = (async () => {
        const byHb = new Map(); // hbSec → [dId]
        for (const d of devices) {
          const tpl = templateById.get(String(d.templateId));
          const hb = heartbeatSecOf(tpl);
          if (!byHb.has(hb)) byHb.set(hb, []);
          byHb.get(hb).push(d.dId);
        }
        const out = [];
        for (const [hb, dIds] of byHb) {
          const hbMs = hb * 1000;
          const rows = await Data.aggregate([
            { $match: { dId: { $in: dIds }, time: { $gte: sinceUptime } } },
            { $group: { _id: { dId: "$dId", bucket: { $subtract: ["$time", { $mod: ["$time", hbMs] }] } } } },
            { $group: { _id: "$_id.dId", buckets: { $sum: 1 } } }
          ]).allowDiskUse(true);
          rows.forEach(r => out.push({ dId: r._id, hb, buckets: r.buckets }));
        }
        return out;
      })().then(u => {
        nocUptimeCache.set(cacheKey, { at: Date.now(), payload: u });
        return u;
      });
      pesadoStatus = "MISS";
    }

    // (R4 · G7 · 1a) — severityHistogram7d aggregate (H3 / TZ_OPERACION).
    const histAggPromise = Notification.aggregate([
      { $match: { ...notifFilter, time: { $gte: since7d } } },
      { $match: { $expr: { $eq: [ { $ifNull: [ "$kind", "fire" ] }, "fire" ] } } },
      { $addFields: {
        day: { $dateToString: {
          format: "%Y-%m-%d",
          date: { $toDate: "$time" },
          timezone: TZ_OPERACION
        } }
      } },
      { $group: {
        _id: "$day",
        critical: { $sum: { $cond: [ { $eq: ["$severity","critical"] }, 1, 0 ] } },
        warning:  { $sum: { $cond: [ { $eq: ["$severity","warning"]  }, 1, 0 ] } },
        info:     { $sum: { $cond: [ { $eq: ["$severity","info"]     }, 1, 0 ] } }
      } },
      { $sort: { _id: 1 } }
    ]);

    // (F1.a · DEC-REF-81 iv) — Alertas recientes correlacionadas: un ítem por
    // (ruleId, siteId), con estado resuelto (lastKind==='resolve') y duración.
    // Espeja el shape de activeEpisodesPromise (l.194-205) pero SIN excluir
    // resueltos — los INCLUYE marcados. firedAt/resolvedAt/durationSec se
    // resuelven en app-code por (ruleId, siteId) tras el $group para respetar
    // el estado del episodio ACTUAL (evitando confundir episodios distintos
    // de la misma regla — DEC-REF-81 iv).
    const recentAlarmsPairsPromise = Notification.aggregate([
      { $match: notifFilter },
      { $sort:  { time: -1 } },
      { $group: {
          _id: { ruleId: "$ruleId", siteId: "$siteId" },
          lastTime:              { $first: "$time" },
          lastKind:              { $first: { $ifNull: ["$kind", "fire"] } },
          lastSeverity:          { $first: "$severity" },
          lastValue:             { $first: "$value" },
          lastCorrelationParent: { $first: "$correlationParent" },
          lastEventId:           { $first: "$_id" },
          lastMode:              { $first: "$mode" },
          lastThresholdUsed:     { $first: "$thresholdUsed" },
          lastMessage:           { $first: "$message" },
          lastReason:            { $first: "$reason" },
          lastLabel:             { $first: "$label" },
          lastVariableFullName:  { $first: "$variableFullName" },
          lastVariable:          { $first: "$variable" },
          lastDId:               { $first: "$dId" }
      } },
      { $sort:  { lastTime: -1 } },
      { $limit: RECENT_ALARMS_LIMIT }
    ]);

    // (DEC-REF-82 v) — join de lectura contra rulepacks para exponer type/
    // label/recommendation en cada ítem. UNA sola query, indexada en memoria
    // por ruleId. Regla huérfana ⇒ type=null, label=ruleId crudo,
    // recommendation=null; el ítem NO se descarta.
    const rulepacksPromise = RulePack.find({}, { rules: 1 }).lean();

    // (R4 · G7 · 1a · DEC-REF-101 D-3) — trendVariables: síncrono, deriva de
    // los widgets de los templates ya cargados. Sin Data.distinct (antes
    // escaneaba db.data sin filtro temporal en cada MISS del caché viejo).
    const trendVariables = computeTrendVariablesFromTemplates(templates);

    // ── Fan-in (DEC-REF-101) ─────────────────────────────────────────────
    // Todas las fuentes frescas (vivo + lastByDid + lastValues + diesel)
    // corren en paralelo; el único tramo cacheado es uptimeAgg, armado
    // arriba con su TTL de 1 h (D-5). En fase viva uptimeAggPromise es null
    // o HIT (nunca MISS).
    const vivoPromise = Promise.all([
      activeEpisodesPromise,
      histAggPromise,
      recentAlarmsPairsPromise,
      rulepacksPromise
    ]).then(([activeEpisodes, histAgg, recentAlarmsPairs, rulepacksRaw]) =>
      ({ activeEpisodes, histAgg, recentAlarmsPairs, rulepacksRaw })
    );

    // Composición del tramo VIVO — una sola fuente para la respuesta parcial
    // (phase=vivo) y el fetch full (DEC-REF-100 D-5 · F5). Usa `sites`,
    // `notifFilter` y `now` del closure del handler.
    const composeVivo = async ({ activeEpisodes, histAgg, recentAlarmsPairs, rulepacksRaw }) => {
      // Status por site (H1 — episodio por regla×site) + contadores globales.
      const statusBySite = {};
      let activeCritical = 0, activeWarning = 0;
      activeEpisodes.forEach(ep => {
        const siteId = ep._id.siteId;
        if (ep.lastSeverity === "critical") activeCritical++;
        else if (ep.lastSeverity === "warning") activeWarning++;
        const cur = statusBySite[siteId];
        if (ep.lastSeverity === "critical") statusBySite[siteId] = "critical";
        else if (ep.lastSeverity === "warning" && cur !== "critical") statusBySite[siteId] = "warning";
      });
      const activeAlertsValue = activeCritical + activeWarning;

      const severityHistogram7d = {
        tz: TZ_OPERACION,
        buckets: histAgg.map(b => ({ day: b._id, critical: b.critical, warning: b.warning, info: b.info }))
      };

      // (DEC-REF-82) — índice ruleId → RuleDefinition (una sola pasada). Colisión
      // de ruleId entre packs (no ocurre hoy pero el schema no lo previene):
      // gana el ÚLTIMO visto — determinístico por el orden de find().
      const ruleByRuleId = new Map();
      for (const p of (rulepacksRaw || [])) {
        for (const r of (p.rules || [])) {
          if (r && r.ruleId) ruleByRuleId.set(r.ruleId, r);
        }
      }

      // (F1.a) — Para cada (ruleId, siteId) del top 10 resolver firedAt/
      // resolvedAt del EPISODIO ACTUAL (state-machine acotado por el resolve
      // anterior). 2 findOne × 10 pares = 20 queries, todas en paralelo.
      // Reglas explícitas (DEC-REF-81 iv):
      //   · lastKind='resolve' ⇒ episodio cerrado; buscar fires entre el resolve
      //     inmediatamente ANTERIOR (exclusive) y este resolve (inclusive).
      //   · lastKind='fire'    ⇒ episodio abierto; buscar fires desde el último
      //     resolve (exclusive) hasta lastTime (inclusive).
      //   · Dos fires consecutivos sin resolve intermedio ⇒ firedAt = el más
      //     ANTIGUO (sort asc, primer resultado).
      //   · Resolve sin fire en el rango (pack purgado o resolve inicial)
      //     ⇒ firedAt=null, durationSec=null; el ítem NO se descarta.
      const enrichedPairs = await Promise.all((recentAlarmsPairs || []).map(async p => {
        const { ruleId, siteId } = p._id;
        const isResolve = p.lastKind === 'resolve';

        const prevResolveDoc = await Notification.findOne(
          { ...notifFilter, ruleId, siteId, kind: 'resolve', time: { $lt: p.lastTime } },
          { time: 1 }
        ).sort({ time: -1 }).lean();
        const prevResolveTime = prevResolveDoc ? prevResolveDoc.time : 0;

        // "fire" = kind='fire' OR kind ausente/null (docs históricos pre-DEC-REF-64
        // — schema default 'fire'). $ne:'resolve' cubre las tres formas en una.
        const firstFireDoc = await Notification.findOne(
          { ...notifFilter, ruleId, siteId,
            kind: { $ne: 'resolve' },
            time: { $gt: prevResolveTime, $lte: p.lastTime } },
          { time: 1 }
        ).sort({ time: 1 }).lean();

        const firedAt     = firstFireDoc ? firstFireDoc.time : null;
        const resolvedAt  = isResolve ? p.lastTime : null;
        const durationSec = (firedAt !== null && resolvedAt !== null)
          ? Math.round((resolvedAt - firedAt) / 1000)
          : null;

        return { ...p, firedAt, resolvedAt, durationSec };
      }));

      const siteByCode = new Map(sites.map(s => [s.siteCode, s]));
      const recentAlarms = enrichedPairs.map(p => {
        const { ruleId, siteId } = p._id;
        const rule = ruleByRuleId.get(ruleId) || null;
        return {
          // Contrato preservado (l.412-419 original): _id, siteCode, siteName,
          // severity, message, ruleId, kind, time. _id ahora es el del ÚLTIMO
          // evento del episodio.
          _id:               p.lastEventId,
          siteCode:          siteId,
          siteName:          siteByCode.get(siteId) ? siteByCode.get(siteId).nombre : null,
          severity:          p.lastSeverity,
          message:           p.lastMessage || p.lastReason || p.lastLabel || p.lastVariableFullName || p.lastVariable,
          ruleId,
          kind:              p.lastKind,
          time:              p.lastTime,
          // (F1.a · DEC-REF-81 iv) — episodio correlacionado
          resolved:          p.lastKind === 'resolve',
          firedAt:           p.firedAt,
          resolvedAt:        p.resolvedAt,
          durationSec:       p.durationSec,
          // (F1.b) — correlationParent del último evento (usado por la cascada
          // en NocRecentAlarms.vue)
          correlationParent: p.lastCorrelationParent || null,
          // (DEC-REF-82 v) — join contra RulePack
          type:              rule ? rule.type : null,
          label:             rule ? rule.label : ruleId,
          recommendation:    rule ? rule.recommendation : null
        };
      });

      return { statusBySite, activeCritical, activeWarning, activeAlertsValue, severityHistogram7d, recentAlarms };
    };

    // Fan-in único (DEC-REF-101): tramo vivo + fuentes frescas + uptime.
    // uptimeAgg es null solo en fase viva sin HIT de caché (D-5).
    const [vivo, lastByDidPairs, lastValuesFlat, dieselResults, uptimeAgg] = await Promise.all([
      vivoPromise, lastByDidPromise, lastValuesPromise, dieselResultsPromise, uptimeAggPromise
    ]);
    const vivoC = await composeVivo(vivo);
    const { statusBySite, activeCritical, activeWarning, activeAlertsValue, severityHistogram7d, recentAlarms } = vivoC;

    const lastTimeByDid = new Map(lastByDidPairs);

    // Sitios Online — P3 (#79): contra el LATIDO del template, no contra la
    // cadencia mínima de variables. Con publicación por cambio, un equipo
    // sano puede no publicar una variable quieta por horas; su señal de
    // vida es el latido (publica todo cada heartbeatSec).
    const onlineBySite = new Map();
    for (const s of sites) {
      const devs = devicesBySite.get(s.siteCode) || [];
      let online = devs.length > 0;
      for (const d of devs) {
        const tpl = templateById.get(String(d.templateId));
        const hbSec = tpl ? heartbeatSecOf(tpl) : null;
        const lastMs = lastTimeByDid.get(d.dId);
        if (!hbSec || !lastMs) { online = false; break; }
        if (((now - lastMs) / 1000) > CADENCE_TOLERANCE_FACTOR * hbSec) { online = false; break; }
      }
      onlineBySite.set(s.siteCode, online);
    }
    const sitesOnlineValue = [...onlineBySite.values()].filter(Boolean).length;

    // Reconstrucción de la tabla de sites desde lastValuesFlat (fuel, temp, mains
    // en el orden en que se emitieron: 3 slots por site).
    const sitesTable = sites.map((s, i) => {
      const off = i * 3;
      const fuel  = lastValuesFlat[off + 0];
      const temp  = lastValuesFlat[off + 1];
      const mains = lastValuesFlat[off + 2];
      return {
        siteCode: s.siteCode, nombre: s.nombre, tipo: s.tipo,
        lat: s.lat, lng: s.lng,
        status: statusBySite[s.siteCode] || "ok",
        online: !!onlineBySite.get(s.siteCode),
        lastValues: { fuel, temp, mains }
      };
    });

    // Diésel — (R4 · G7 · 3) semántica del KPI:
    //   value    = NIVEL promedio actual de la red (avg de últimos fuel_level por site) [%]
    //   delta24h = Δ 24h agregado por site (promedio red), coherente con H2.
    // Reconstruye por site desde dieselResults (jobs planos con {siteCode, first, last}).
    const bySiteAgg = new Map(); // siteCode → { sumDelta, nDelta, sumLast, nLast }
    dieselResults.forEach(({ siteCode, first, last }) => {
      if (!bySiteAgg.has(siteCode)) bySiteAgg.set(siteCode, { sumDelta: 0, nDelta: 0, sumLast: 0, nLast: 0 });
      const bin = bySiteAgg.get(siteCode);
      if (last && Number.isFinite(last.value)) { bin.sumLast  += last.value;                bin.nLast  += 1; }
      if (first && last && Number.isFinite(first.value) && Number.isFinite(last.value)) {
        bin.sumDelta += (last.value - first.value); bin.nDelta += 1;
      }
    });
    let deltaSum = 0, deltaSites = 0, levelSum = 0, levelSites = 0;
    for (const bin of bySiteAgg.values()) {
      if (bin.nDelta > 0) { deltaSum += (bin.sumDelta / bin.nDelta); deltaSites++; }
      if (bin.nLast  > 0) { levelSum += (bin.sumLast  / bin.nLast);  levelSites++; }
    }
    const dieselLevelValue = levelSites > 0 ? Math.round((levelSum / levelSites) * 10) / 10 : null;
    const dieselDeltaValue = deltaSites > 0 ? Math.round((deltaSum / deltaSites) * 10) / 10 : null;

    // Uptime 7d — P4 (#79): % de ventanas de latido CON telemetría.
    // expected por device = 7d / heartbeatSec de su template; received =
    // ventanas con ≥1 dato (tope en expected). Un device sin ningún dato
    // en 7d no aparece en uptimeAgg pero SÍ cuenta su expected (0 recibido).
    const bucketsByDid = new Map((uptimeAgg || []).map(r => [r.dId, r]));
    let uptimeReceived = 0, uptimeExpected = 0;
    for (const d of devices) {
      const tpl = templateById.get(String(d.templateId));
      const hb = heartbeatSecOf(tpl);
      const expected = Math.floor((UPTIME_WINDOW_DAYS * 86400) / hb);
      const r = bucketsByDid.get(d.dId);
      uptimeExpected += expected;
      uptimeReceived += Math.min(r ? r.buckets : 0, expected);
    }
    const uptimeValue = (uptimeAgg && uptimeExpected > 0)
      ? Math.round((uptimeReceived / uptimeExpected) * 1000) / 10
      : null;

    const payload = {
      status: "success",
      data: {
        window, generatedAt: now,
        ...(phaseVivo ? { phase: "vivo" } : {}),
        kpis: {
          // R5 · G8 · 6 — ver notas del branch empty arriba (unit: null en
          // sitesOnline/activeAlerts).
          sitesOnline:    { label: "Sitios Online", sublabel: "transmitiendo dentro de cadencia", value: sitesOnlineValue, total: sites.length, unit: null },
          dieselDelta24h: { label: "Diésel 24h", sublabel: "nivel promedio red", value: dieselLevelValue, delta24h: dieselDeltaValue, sitesWithFuel: levelSites, unit: "%" },
          activeAlerts:   { label: "Alertas", sublabel: "activas ahora", value: activeAlertsValue, critical: activeCritical, warning: activeWarning, unit: null },
          uptime:         { label: "Uptime", sublabel: "% ventanas de latido con telemetría · 7d", value: uptimeValue, received: uptimeReceived, expected: uptimeExpected, unit: "%" }
        },
        sites: sitesTable,
        severityHistogram7d,
        recentAlarms,
        trendVariables
      }
    };

    // Header split (DEC-REF-85 v · DEC-REF-101): todo el panel se recomputa
    // fresco por request; el único tramo cacheado es uptimeAgg (TTL 1 h,
    // D-5). pesado = HIT | MISS | SKIP (SKIP solo en fase viva sin HIT).
    res.set("X-Cache", `vivo=COMPUTE pesado=${pesadoStatus}`);
    res.set("X-Compute-Ms", String(Date.now() - t0));
    return res.json(payload);
  } catch (error) {
    console.log("ERROR /dashboard/noc", error);
    return res.status(500).json({ status: "error", error: String(error && error.message || error) });
  }
});

// ── GET /dashboard/noc/trend ────────────────────────────────────────────
router.get("/dashboard/noc/trend", checkAuth, async (req, res) => {
  try {
    const now = Date.now();
    const variable = String(req.query.variable || "");
    const window   = String(req.query.window   || "7d");
    if (!variable) return res.status(400).json({ status: "error", error: "variable is required" });

    const windowMs =
      window === "24h" ? 24  * 3600  * 1000 :
      window === "30d" ? 30  * 86400 * 1000 :
                          7  * 86400 * 1000;
    const since = now - windowMs;

    // Scope NOC: devices bindeados a sites del scope (simetría con /noc).
    const siteFilter = await buildReadFilter(req, "Site");
    const sites = await Site.find(siteFilter, { siteCode: 1, _id: 0 }).lean();
    const siteCodes = sites.map(s => s.siteCode);
    const aggregation = classifyAggregation(variable);

    // (DEC-REF-101 D-6) — caché corto 60 s: el aggregate bucketizado sobre
    // db.data se repite idéntico ante polls del gráfico. Key agnóstica al
    // usuario por el mismo argumento de scopeKeyOf (deriva de siteCodes; la
    // variable fue validada contra el scope al momento del cómputo).
    const trendKey = crypto.createHash("sha1")
      .update(variable + "|" + window + "|" + siteCodes.slice().sort().join("|"))
      .digest("hex");
    const cachedTrend = trendCache.get(trendKey);
    if (cachedTrend && (now - cachedTrend.at) < TREND_TTL_MS) {
      res.set("X-Cache", "trend=HIT");
      return res.json(cachedTrend.payload);
    }
    if (!siteCodes.length) {
      return res.json({ status: "success", data: { variable, window, aggregation, bucketMs: null, series: [], cardStat: null } });
    }
    const scopedDevices = await Device.find(
      { siteId: { $in: siteCodes } },
      { dId: 1, siteId: 1, templateId: 1, _id: 0 }
    ).lean();
    const scopedDIds = scopedDevices.map(d => d.dId);
    if (!scopedDIds.length) {
      return res.json({ status: "success", data: { variable, window, aggregation, bucketMs: null, series: [], cardStat: null } });
    }

    // (H5) — la variable pedida DEBE estar en el selector visible del scope.
    // Corta abusos por knowledge del set global (ej. leer setpoints del scope).
    const scopedTemplateIds = [
      ...new Set(scopedDevices.map(d => d.templateId).filter(Boolean))
    ];
    const validVars = new Set(
      (await computeTrendVariables(scopedTemplateIds)).map(x => x.variable)
    );
    if (!validVars.has(variable)) {
      return res.status(400).json({ status: "error", error: "variable not in scope" });
    }

    // (D) downsampling — TREND_MAX_POINTS por SERIE (por site).
    const bucketMs = Math.max(TREND_MIN_BUCKET_MS, Math.ceil(windowMs / TREND_MAX_POINTS));

    // Mapa dId → siteCode para colapsar devices del mismo site en un solo bucket.
    const dIdToSite = new Map();
    scopedDevices.forEach(d => dIdToSite.set(d.dId, d.siteId));

    // Bucketizado en Mongo por {dId, bucket} — un solo pipeline con avg/min/max
    // juntos (R1). Usa idx_data_reconstruct (dId+variable prefijo).
    const rows = await Data.aggregate([
      { $match: { dId: { $in: scopedDIds }, variable, time: { $gte: since } } },
      { $group: {
        _id: {
          dId:    "$dId",
          bucket: { $subtract: [ "$time", { $mod: [ "$time", bucketMs ] } ] }
        },
        avg: { $avg: "$value" },
        min: { $min: "$value" },
        max: { $max: "$value" }
      } },
      { $sort: { "_id.bucket": 1 } }
    ]).allowDiskUse(true);

    // Colapso por site: bucket → avg entre devices del site (avg de avgs).
    // Coherente con la composición jerárquica de H2/dieselDelta24h (R2).
    const bySite = new Map();          // siteCode → Map<bucket, {sum,n}>
    let overallMin = null, overallMax = null;
    rows.forEach(r => {
      const sc = dIdToSite.get(r._id.dId);
      if (!sc) return;
      if (!bySite.has(sc)) bySite.set(sc, new Map());
      const bmap = bySite.get(sc);
      const cur = bmap.get(r._id.bucket) || { sum: 0, n: 0 };
      cur.sum += r.avg; cur.n += 1;
      bmap.set(r._id.bucket, cur);
      if (overallMin == null || r.min < overallMin) overallMin = r.min;
      if (overallMax == null || r.max > overallMax) overallMax = r.max;
    });

    const series = [...bySite.entries()].map(([siteCode, bmap]) => ({
      name: siteCode,
      points: [...bmap.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([bucket, agg]) => [bucket, Math.round((agg.sum / agg.n) * 100) / 100])
    })).sort((a, b) => a.name.localeCompare(b.name));

    if (aggregation === "avg") {
      // Serie neta = promedio de promedios de SITE por bucket (R2 — coherencia
      // metodológica con H2). NO promedio de rows por device.
      const netByBucket = new Map();  // bucket → {sumSiteAvgs, nSites}
      for (const [siteCode, bmap] of bySite.entries()) {
        for (const [bucket, agg] of bmap.entries()) {
          const siteAvg = agg.sum / agg.n;
          const netCur = netByBucket.get(bucket) || { sum: 0, n: 0 };
          netCur.sum += siteAvg; netCur.n += 1;
          netByBucket.set(bucket, netCur);
        }
      }
      const netPoints = [...netByBucket.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([b, agg]) => agg.sum / agg.n);
      const first = netPoints.length ? Math.round(netPoints[0] * 100) / 100 : null;
      const last  = netPoints.length ? Math.round(netPoints[netPoints.length - 1] * 100) / 100 : null;
      const delta = (first != null && last != null) ? Math.round((last - first) * 100) / 100 : null;
      const payload = {
        status: "success",
        data: {
          variable, window, aggregation, bucketMs,
          series,
          cardStat: { current: last, prevValue: first, delta }
        }
      };
      trendCache.set(trendKey, { at: Date.now(), payload });
      res.set("X-Cache", "trend=MISS");
      return res.json(payload);
    }

    // aggregation === 'range' — cardStat min/max globales crudos (R1).
    const payload = {
      status: "success",
      data: {
        variable, window, aggregation, bucketMs,
        series,
        cardStat: {
          min: overallMin != null ? Math.round(overallMin * 100) / 100 : null,
          max: overallMax != null ? Math.round(overallMax * 100) / 100 : null
        }
      }
    };
    trendCache.set(trendKey, { at: Date.now(), payload });
    res.set("X-Cache", "trend=MISS");
    return res.json(payload);
  } catch (error) {
    console.log("ERROR /dashboard/noc/trend", error);
    return res.status(500).json({ status: "error", error: String(error && error.message || error) });
  }
});

module.exports = router;
