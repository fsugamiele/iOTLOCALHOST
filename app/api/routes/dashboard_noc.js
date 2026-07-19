const express = require("express");
const router = express.Router();
const { checkAuth } = require("../middlewares/authentication.js");
const { buildReadFilter } = require("../middlewares/scope.js");

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

// ── Helpers ─────────────────────────────────────────────────────────────

// (7) — intersección declarada∩presente − sufijo _setpoint.
async function computeTrendVariables(templateIds) {
  if (!templateIds.length) return [];
  const templates = await Template.find({ _id: { $in: templateIds } }, { widgets: 1 }).lean();
  const declared = new Set();
  templates.forEach(t => (t.widgets || []).forEach(w => {
    if (!w || !w.variable) return;
    if (w.variableType !== "float" && w.variableType !== "int") return;
    if (w.variable.endsWith(SETPOINT_SUFFIX)) return;
    declared.add(w.variable);
  }));
  if (!declared.size) return [];
  const present = new Set(await Data.distinct("variable", { variable: { $in: [...declared] } }));
  return [...declared]
    .filter(v => present.has(v))
    .sort()
    .map(v => ({ variable: v, aggregation: classifyAggregation(v) }));
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
    const now = Date.now();
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
            sitesOnline:    { label: "Sitios Online", sublabel: "transmitiendo dentro de cadencia", value: 0, total: 0, unit: "sites" },
            dieselDelta24h: { label: "Diésel 24h", sublabel: "Δ nivel promedio · %", value: null, sitesWithFuel: 0, unit: "%" },
            activeAlerts:   { label: "Alertas", sublabel: "activas ahora", value: 0, critical: 0, warning: 0, unit: "alerts" },
            uptime:         { label: "Uptime", sublabel: "% telemetría esperada recibida · 7d", value: null, received: 0, expected: 0, unit: "%" }
          },
          sites: [],
          severityHistogram7d: { tz: TZ_OPERACION, buckets: [] },
          recentAlarms: [],
          trendVariables: []
        }
      });
    }

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

    // Última publicación por device — $max sobre time (H3). Evita blocking-sort
    // de db.data. IXSCAN sobre idx_data_reconstruct (prefijo dId).
    const lastByDid = await Data.aggregate([
      { $match: { dId: { $in: allowedDIds } } },
      { $group: { _id: "$dId", lastTime: { $max: "$time" } } }
    ]);
    const lastTimeByDid = new Map(lastByDid.map(x => [x._id, x.lastTime]));

    // Sitios Online — cadencia declarada por template
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

    // Alertas activas ahora + status por site (H1 — episodio por regla×site).
    // SF-4 · DEC-REF-64.c: lastKind ≠ resolve, ventana ACTIVE_ALARM_WINDOW_MS.
    const activeEpisodes = await Notification.aggregate([
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

    // Last values por prioridad (C)
    const pickLastValue = async (siteCode, priority) => {
      const devs = devicesBySite.get(siteCode) || [];
      const dIds = devs.map(d => d.dId);
      if (!dIds.length) return null;
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
    };
    const sitesTable = await Promise.all(sites.map(async (s) => {
      const [fuel, temp, mains] = await Promise.all([
        pickLastValue(s.siteCode, FUEL_PRIORITY),
        pickLastValue(s.siteCode, TEMP_PRIORITY),
        pickLastValue(s.siteCode, MAINS_PRIORITY)
      ]);
      return {
        siteCode: s.siteCode, nombre: s.nombre, tipo: s.tipo,
        lat: s.lat, lng: s.lng,
        status: statusBySite[s.siteCode] || "ok",
        online: !!onlineBySite.get(s.siteCode),
        lastValues: { fuel, temp, mains }
      };
    }));

    // Diésel 24h — Δ por SITE (H2), promedio red. sitesWithFuel = count SITES.
    let dieselNetSum = 0, dieselSitesCount = 0;
    for (const s of sites) {
      const devs = devicesBySite.get(s.siteCode) || [];
      let siteSum = 0, siteDevN = 0;
      for (const d of devs) {
        const [first, last] = await Promise.all([
          Data.findOne(
            { dId: d.dId, variable: "fuel_level", time: { $gte: since24h } },
            { value: 1, _id: 0 }
          ).sort({ time: 1  }).lean(),
          Data.findOne(
            { dId: d.dId, variable: "fuel_level" },
            { value: 1, _id: 0 }
          ).sort({ time: -1 }).lean()
        ]);
        if (first && last && Number.isFinite(first.value) && Number.isFinite(last.value)) {
          siteSum += (last.value - first.value);
          siteDevN++;
        }
      }
      if (siteDevN > 0) {
        dieselNetSum += (siteSum / siteDevN);
        dieselSitesCount++;
      }
    }
    const dieselDeltaValue = dieselSitesCount > 0
      ? Math.round((dieselNetSum / dieselSitesCount) * 10) / 10
      : null;

    // Uptime 7d — recibidos / esperados por widget float|int (sin _setpoint)
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
    const uptimeAgg = await Data.aggregate([
      { $match: { dId: { $in: allowedDIds }, time: { $gte: sinceUptime } } },
      { $group: { _id: { dId: "$dId", variable: "$variable" }, count: { $sum: 1 } } }
    ]).allowDiskUse(true);
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

    // (5) severityHistogram7d — TZ_OPERACION + $dateToString(timezone).
    // Dos épocas DEC-REF-59: kind ausente → 'fire'; solo fires (evita doble
    // conteo por resolves).
    const histAgg = await Notification.aggregate([
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
    const severityHistogram7d = {
      tz: TZ_OPERACION,
      buckets: histAgg.map(b => ({ day: b._id, critical: b.critical, warning: b.warning, info: b.info }))
    };

    // (A) recentAlarms — buildReadFilter('Notification'), últimas 10.
    // message fallback (H6): n.message primero (persistencia futura), luego
    // reason/label/variableFullName/variable.
    const recentAlarmsRaw = await Notification.find(notifFilter)
      .sort({ time: -1 }).limit(RECENT_ALARMS_LIMIT).lean();
    const siteByCode = new Map(sites.map(s => [s.siteCode, s]));
    const recentAlarms = recentAlarmsRaw.map(n => ({
      _id: n._id,
      siteCode: n.siteId,
      siteName: siteByCode.get(n.siteId) ? siteByCode.get(n.siteId).nombre : null,
      severity: n.severity,
      message: n.message || n.reason || n.label || n.variableFullName || n.variable,
      ruleId: n.ruleId,
      kind: n.kind || "fire",
      time: n.time
    }));

    // (7) trendVariables
    const trendVariables = await computeTrendVariables(templateIds);

    return res.json({
      status: "success",
      data: {
        window, generatedAt: now,
        kpis: {
          sitesOnline:    { label: "Sitios Online", sublabel: "transmitiendo dentro de cadencia", value: sitesOnlineValue, total: sites.length, unit: "sites" },
          dieselDelta24h: { label: "Diésel 24h", sublabel: "Δ nivel promedio · %", value: dieselDeltaValue, sitesWithFuel: dieselSitesCount, unit: "%" },
          activeAlerts:   { label: "Alertas", sublabel: "activas ahora", value: activeAlertsValue, critical: activeCritical, warning: activeWarning, unit: "alerts" },
          uptime:         { label: "Uptime", sublabel: "% telemetría esperada recibida · 7d", value: uptimeValue, received: uptimeReceived, expected: uptimeExpected, unit: "%" }
        },
        sites: sitesTable,
        severityHistogram7d,
        recentAlarms,
        trendVariables
      }
    });
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
