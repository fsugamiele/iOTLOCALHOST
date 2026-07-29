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

// "Dentro de cadencia" = last-data ≤ FACTOR × min(variableSendFreq del template).
// FACTOR=2 alinea con la lección BUG-SIM-6 (frescura ≥2-3× cadencia) y con el
// criterio de SF-4 de no marcar offline por jitter puntual.
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

// ── Cache de servidor para /noc (R4 · G7 · 1c) ─────────────────────────
// Cache in-memory a nivel módulo: mismo scope pega los mismos datos por
// TTL_MS. El polling del frontend es 60s; TTL_MS=55s → múltiples viewers
// del mismo scope no re-agregan y las lecturas del intervalo tapan de una.
// Clave = hash(sorted(siteCodes)) — dos usuarios con idéntico set de sites
// comparten cache (agnóstico al userId; el filtro ya redujo al scope).
const NOC_CACHE_TTL_MS = 55 * 1000;
const nocCache = new Map(); // scopeKey → { at, payload }
function scopeKeyOf(siteCodes) {
  if (!siteCodes.length) return "empty";
  return crypto.createHash("sha1").update(siteCodes.slice().sort().join("|")).digest("hex");
}

// ── Helpers ─────────────────────────────────────────────────────────────

// (7 · R4) — intersección declarada∩presente − sufijo _setpoint.
// Enriquecido con label legible: variableFullName del primer widget que
// declara la variable en el scope; fallback a la variable cruda.
// Acepta templates pre-cargados para evitar re-fetch en el handler principal.
async function computeTrendVariablesFromTemplates(templates) {
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
  if (!declared.size) return [];
  const present = new Set(await Data.distinct("variable", { variable: { $in: [...declared] } }));
  return [...declared]
    .filter(v => present.has(v))
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
            uptime:         { label: "Uptime", sublabel: "% telemetría esperada recibida · 7d", value: null, received: 0, expected: 0, unit: "%" }
          },
          sites: [],
          severityHistogram7d: { tz: TZ_OPERACION, buckets: [] },
          recentAlarms: [],
          trendVariables: []
        }
      });
    }

    // Cache de servidor (R4 · G7 · 1c) — clave = hash(scope).
    // NO cachea el caso empty (return arriba); solo respuestas útiles.
    //
    // R7 · pedido Franco — soporte de `?fresh=1` para refresh event-driven
    // (llamado por dashboard.vue al recibir un wanomi:notif MQTT). Bypassa
    // la lectura de cache y recomputa; DE TODAS FORMAS reescribe el cache
    // así los pollers regulares y otros viewers heredan el fresco.
    const bypassCache = req.query.fresh === "1";
    const cacheKey = scopeKeyOf(siteCodes);
    if (!bypassCache) {
      const cached = nocCache.get(cacheKey);
      if (cached && (now - cached.at) < NOC_CACHE_TTL_MS) {
        res.set("X-Cache", "HIT");
        return res.json(cached.payload);
      }
    }

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

    // (R4 · G7 · 1b) — lastByDid: findOne({dId}).sort({time:-1}) × device en
    // paralelo (IXSCAN puro c/u sobre idx_data_reconstruct), en lugar del
    // $group global que escaneaba y agrupaba toda la tabla filtrada.
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

    // (R4 · G7 · 1a) — uptime aggregate.
    const uptimeAggPromise = Data.aggregate([
      { $match: { dId: { $in: allowedDIds }, time: { $gte: sinceUptime } } },
      { $group: { _id: { dId: "$dId", variable: "$variable" }, count: { $sum: 1 } } }
    ]).allowDiskUse(true);

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

    // (R4 · G7 · 1a) — trendVariables reusa templates ya cargados (evita
    // Template.find duplicado). Solo queda el Data.distinct en la promesa.
    const trendVariablesPromise = computeTrendVariablesFromTemplates(templates);

    // ── Fan-in en un único await ──────────────────────────────────────
    const [
      lastByDidPairs,
      activeEpisodes,
      lastValuesFlat,
      dieselResults,
      uptimeAgg,
      histAgg,
      recentAlarmsPairs,
      rulepacksRaw,
      trendVariables
    ] = await Promise.all([
      lastByDidPromise,
      activeEpisodesPromise,
      lastValuesPromise,
      dieselResultsPromise,
      uptimeAggPromise,
      histAggPromise,
      recentAlarmsPairsPromise,
      rulepacksPromise,
      trendVariablesPromise
    ]);

    const lastTimeByDid = new Map(lastByDidPairs);

    // Sitios Online — cadencia declarada por template.
    const onlineBySite = new Map();
    for (const s of sites) {
      const devs = devicesBySite.get(s.siteCode) || [];
      let online = devs.length > 0;
      for (const d of devs) {
        const tpl = templateById.get(String(d.templateId));
        const cadSec = tpl ? minCadenceSec(tpl) : null;
        const lastMs = lastTimeByDid.get(d.dId);
        if (!cadSec || !lastMs) { online = false; break; }
        if (((now - lastMs) / 1000) > CADENCE_TOLERANCE_FACTOR * cadSec) { online = false; break; }
      }
      onlineBySite.set(s.siteCode, online);
    }
    const sitesOnlineValue = [...onlineBySite.values()].filter(Boolean).length;

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

    // Uptime 7d — recibidos / esperados por widget float|int (sin _setpoint).
    const widgetsPerDevice = [];
    for (const d of devices) {
      const tpl = templateById.get(String(d.templateId));
      if (!tpl) continue;
      (tpl.widgets || []).forEach(w => {
        if (!w || !w.variable) return;
        if (w.variableType !== "float" && w.variableType !== "int") return;
        if (w.variable.endsWith(SETPOINT_SUFFIX)) return;
        const freq = Number(w.variableSendFreq);
        if (!Number.isFinite(freq) || freq <= 0) return;
        widgetsPerDevice.push({ dId: d.dId, variable: w.variable, freq });
      });
    }
    const receivedMap = new Map();
    uptimeAgg.forEach(a => receivedMap.set(`${a._id.dId}|${a._id.variable}`, a.count));
    let uptimeReceived = 0, uptimeExpected = 0;
    widgetsPerDevice.forEach(w => {
      const expected = Math.floor((UPTIME_WINDOW_DAYS * 86400) / w.freq);
      const received = Math.min(receivedMap.get(`${w.dId}|${w.variable}`) || 0, expected);
      uptimeExpected += expected;
      uptimeReceived += received;
    });
    const uptimeValue = uptimeExpected > 0
      ? Math.round((uptimeReceived / uptimeExpected) * 1000) / 10
      : null;

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

    const payload = {
      status: "success",
      data: {
        window, generatedAt: now,
        kpis: {
          // R5 · G8 · 6 — ver notas del branch empty arriba (unit: null en
          // sitesOnline/activeAlerts).
          sitesOnline:    { label: "Sitios Online", sublabel: "transmitiendo dentro de cadencia", value: sitesOnlineValue, total: sites.length, unit: null },
          dieselDelta24h: { label: "Diésel 24h", sublabel: "nivel promedio red", value: dieselLevelValue, delta24h: dieselDeltaValue, sitesWithFuel: levelSites, unit: "%" },
          activeAlerts:   { label: "Alertas", sublabel: "activas ahora", value: activeAlertsValue, critical: activeCritical, warning: activeWarning, unit: null },
          uptime:         { label: "Uptime", sublabel: "% telemetría esperada recibida · 7d", value: uptimeValue, received: uptimeReceived, expected: uptimeExpected, unit: "%" }
        },
        sites: sitesTable,
        severityHistogram7d,
        recentAlarms,
        trendVariables
      }
    };

    // Guarda en cache y devuelve.
    // R7 — bypassCache (fresh=1) también reescribe: los pollers posteriores
    // heredan el fresco calculado por este request event-driven.
    nocCache.set(cacheKey, { at: now, payload });
    res.set("X-Cache", bypassCache ? "BYPASS" : "MISS");
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
      return res.json({
        status: "success",
        data: {
          variable, window, aggregation, bucketMs,
          series,
          cardStat: { current: last, prevValue: first, delta }
        }
      });
    }

    // aggregation === 'range' — cardStat min/max globales crudos (R1).
    return res.json({
      status: "success",
      data: {
        variable, window, aggregation, bucketMs,
        series,
        cardStat: {
          min: overallMin != null ? Math.round(overallMin * 100) / 100 : null,
          max: overallMax != null ? Math.round(overallMax * 100) / 100 : null
        }
      }
    });
  } catch (error) {
    console.log("ERROR /dashboard/noc/trend", error);
    return res.status(500).json({ status: "error", error: String(error && error.message || error) });
  }
});

module.exports = router;
