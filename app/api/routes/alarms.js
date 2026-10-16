const express = require("express");
const router = express.Router();
const axios = require("axios");
const mongoose = require("mongoose");
const { checkAuth } = require("../middlewares/authentication.js");
const { buildReadFilter } = require("../middlewares/scope.js");
const colors = require("colors");

import AlarmRule from "../models/emqx_alarm_rule.js";
import Notification from "../models/notifications.js";
import Site from "../models/site.js";
import Data from "../models/data.js";
import Device from "../models/device.js";
import Template from "../models/template.js";
import { query as historyQuery } from "../services/historyProvider.js";

// ── FASE 2 rediseño Alarmas (consola de triaje NOC) ──────────────────────────
// Endpoints de LECTURA sobre Notification (episodios fire/resolve del edge-engine)
// + telemetría de Data. Autorización: SIEMPRE buildReadFilter(req,'Notification')
// (DEC-REF-33/37 — fail-closed sin grant). El ACK sigue siendo el de sites.js
// (PUT /api/site/:siteCode/alarms/:notificationId/ack) — no se duplica acá.
//
// Solo entran a la consola las notifs con ruleId (motor edge). Las legacy EMQX
// (sin ruleId) no forman episodios fire/resolve y quedan fuera por diseño.

const HOUR_MS = 3600 * 1000;
const DAY_MS  = 24 * HOUR_MS;

const ALARMS_LIMIT_DEFAULT = 100;
const ALARMS_LIMIT_MAX     = 500;
// Cota de grupos (ruleId×dId) que se materializan por request — defensa contra
// scopes enormes; muy por encima de cualquier operación real.
const ALARMS_GROUP_CAP     = 5000;

// Telemetría del detalle: ventana pre-fire, post-resolve y cota de puntos.
const DETAIL_PRE_FIRE_H    = 2;
const DETAIL_POST_RESOLVE_H = 1;
const TELEMETRY_MAX_POINTS = 1000;

// Forecast (regresión lineal pura en Node — réplica honesta de qa.js/forecast,
// la API NO require al edge-engine). Datos reales muy ruidosos (diffVar >>
// señal en CR00061): se suaviza con EMA antes de la regresión y el R² se
// evalúa contra la serie CRUDA. El forecast devuelve `points` siempre que
// haya ≥FORECAST_MIN_N muestras y pendiente no nula; `etaMinutes` solo si
// R²≥FORECAST_MIN_R2 y converge ≤FORECAST_ETA_CAP_H; `quality` lo explicita.
const FORECAST_MODES      = ['direct', 'calibrated', 'fallback', 'M'];
const FORECAST_WINDOW_H   = 2;     // regresión sobre las últimas ~2h
const FORECAST_MIN_N      = 5;
const FORECAST_MIN_R2     = 0.3;
const FORECAST_ETA_CAP_H  = 48;
const FORECAST_HORIZON_H  = 2;     // proyección a +2h
const FORECAST_STEP_MIN   = 5;
const FORECAST_EMA_ALPHA  = 0.3;   // suavizado pre-regresión

// Recurrencia y siblings del detalle.
const RECURRENCE_DAYS  = 30;
const WEEKLY_BUCKETS   = 5;
const SIBLING_MAX      = 4;
const SIBLING_HOURS    = 6;
const SIBLING_BUCKET_MS = 5 * 60 * 1000;
const SIBLING_DISCOVERY_H = 24;

// Bandas sombreadas del hero: episodios previos (30d, excluye el actual).
const EPISODES_MAX     = 15;

const AUTONOMY_VARS = ['autonomy_hours', 'autonomy_liters', 'autonomy_lph', 'autonomy_source'];
const AUTONOMY_MAX_AGE_H = 6;

const SEV_RANK = { critical: 0, warning: 1, info: 2 };



const auth = {
  auth: {
    username: "admin",
    password: process.env.EMQX_DEFAULT_APPLICATION_SECRET
  }
};



//******************
//**** A P I *******
//****************** 

const VALID_CONDITIONS = [">", "<", ">=", "<=", "=", "!="];

//CREATE ALARM-RULE
router.post("/alarm-rule", checkAuth, async (req, res) => {
  try {
    var newRule = req.body.newRule;

    if (!global.alarmResource) {
      return res.status(503).json({ status: "error", error: "EMQX resources not ready yet, please wait a moment and retry" });
    }

    if (!newRule || !newRule.dId || !newRule.variable || !newRule.condition || newRule.value === undefined || !newRule.triggerTime) {
      return res.status(400).json({ status: "error", error: "dId, variable, condition, value and triggerTime are required" });
    }

    if (!VALID_CONDITIONS.includes(newRule.condition)) {
      return res.status(400).json({ status: "error", error: "Invalid condition. Allowed: > < >= <= = !=" });
    }

    if (isNaN(Number(newRule.value))) {
      return res.status(400).json({ status: "error", error: "value must be a number" });
    }

    if (newRule.triggerTime < 1) {
      return res.status(400).json({ status: "error", error: "triggerTime must be at least 1 second" });
    }

    newRule.userId = req.userData._id;

    var r = await createAlarmRule(newRule);

    if (r) {
      const response = {
        status: "success"
      };

      return res.json(response);
    } else {
      const response = {
        status: "error"
      };

      return res.status(500).json(response);
    }
  } catch (error) {
    console.log(error);
  }
});

//UPDATE ALARM-RULE STATUS
router.put("/alarm-rule", checkAuth, async (req, res) => {
  try {
    var rule = req.body.rule;

    var r = await updateAlarmRuleStatus(rule.emqxRuleId, rule.status);

    if (r == true) {
      const response = {
        status: "success"
      };

      return res.json(response);
    } else {
      const response = {
        status: "error"
      };

      return res.json(response);
    }
  } catch (error) {
    console.log(error);
  }
});

//DELETE ALARM-RULE
router.delete("/alarm-rule", checkAuth, async (req, res) => {
  try {
    var emqxRuleId = req.query.emqxRuleId;

    var r = await deleteAlarmRule(emqxRuleId);

    if (r) {
      const response = {
        status: "success"
      };

      return res.json(response);
    } else {
      const response = {
        status: "error"
      };

      return res.json(response);
    }
  } catch (error) {
    console.log(error);
  }
});





// ─────────────────────────────────────────────────────────────────────────────
// GET /api/alarms — consola de triaje multi-sitio (FASE 2).
// Episodios por (ruleId, dId): último evento manda — kind!=resolve → activa
// (ack si ackAt), resolve → resuelta. Query: status (active|resolved|all,
// default active), severity, siteId, limit (default 100, máx 500), before
// (cursor ms epoch sobre el tiempo del último evento del episodio).
// ─────────────────────────────────────────────────────────────────────────────
router.get("/alarms", checkAuth, async (req, res) => {
  try {
    const now = Date.now();

    const status = ['active', 'resolved', 'all'].includes(req.query.status)
      ? req.query.status : 'active';
    const severity = ['info', 'warning', 'critical'].includes(req.query.severity)
      ? req.query.severity : null;
    const siteId = req.query.siteId || null;

    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = ALARMS_LIMIT_DEFAULT;
    if (limit > ALARMS_LIMIT_MAX) limit = ALARMS_LIMIT_MAX;

    const beforeRaw = req.query.before;
    const before = beforeRaw !== undefined ? parseInt(beforeRaw, 10) : null;

    const notifFilter = await buildReadFilter(req, 'Notification');
    const extraMatch = {};
    if (severity) extraMatch.severity = severity;
    if (siteId)   extraMatch.siteId = siteId;

    const groups   = await Notification.aggregate(pipelineEpisodios(notifFilter, extraMatch, now));
    const childAgg = await Notification.aggregate(pipelineChildCount(notifFilter));
    const childMap = new Map(childAgg.map(c => [`${c._id.parent}|${c._id.siteId}`, c.count]));

    // siteName: join de lectura contra Site gateado (mismo criterio que dashboard_noc).
    const siteIds = [...new Set(groups.map(g => g.siteId).filter(Boolean))];
    const siteFilter = await buildReadFilter(req, 'Site');
    const sites = siteIds.length
      ? await Site.find({ ...siteFilter, siteCode: { $in: siteIds } }, { siteCode: 1, nombre: 1, _id: 0 }).lean()
      : [];
    const siteNameByCode = new Map(sites.map(s => [s.siteCode, s.nombre]));

    let items = groups.map(g => episodioAItem(g, now, childMap, siteNameByCode));

    if (status === 'active')   items = items.filter(it => it.state !== 'resolved');
    if (status === 'resolved') items = items.filter(it => it.state === 'resolved');
    if (Number.isFinite(before)) items = items.filter(it => it.lastEventTime < before);

    // Orden de triaje: severidad desc (critical>warning>info), luego edad desc.
    items.sort((a, b) =>
      (SEV_RANK[a.severity] ?? 3) - (SEV_RANK[b.severity] ?? 3) || b.ageMs - a.ageMs);

    const page = items.slice(0, limit);
    const nextCursor = page.length === limit ? page[page.length - 1].lastEventTime : null;
    page.forEach(it => delete it.lastEventTime);

    return res.json({
      status: "success",
      data: { now, count: page.length, items: page, nextCursor }
    });
  } catch (error) {
    console.log("ERROR GETTING ALARMS CONSOLE");
    console.log(error);
    return res.status(500).json({ status: "error", error });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/alarms/summary — KPIs de la banda superior + badge de la campana.
// mttrSec24h: promedio de duración de episodios resueltos en 24h (cada resolve
// se aparea con su fire previo por ruleId+dId; resolve huérfano no promedia).
// Registrada ANTES de /alarms/:id/detail para que "summary" no caiga en :id.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/alarms/summary", checkAuth, async (req, res) => {
  try {
    const now = Date.now();
    const notifFilter = await buildReadFilter(req, 'Notification');

    const groups = await Notification.aggregate(pipelineEpisodios(notifFilter, {}, now));

    const active = { critical: 0, warning: 0, info: 0, total: 0 };
    let unacked = 0;
    let oldestUnackedFiredAt = null;
    for (const g of groups) {
      if (g.lastKind === 'resolve') continue;
      const sev = ['critical', 'warning', 'info'].includes(g.lastSeverity) ? g.lastSeverity : 'info';
      active[sev]++;
      active.total++;
      if (g.ackAt == null) {
        unacked++;
        // Episodio activo ⇒ último evento ES el fire ⇒ lastTime = firedAt.
        if (oldestUnackedFiredAt === null || g.lastTime < oldestUnackedFiredAt) {
          oldestUnackedFiredAt = g.lastTime;
        }
      }
    }

    // MTTR 24h — pares fire→resolve por ruleId+dId con resolve dentro de la ventana.
    const resolves = await Notification.find({
      ...notifFilter, ruleId: { $ne: null }, kind: 'resolve', time: { $gte: now - DAY_MS }
    }).select({ ruleId: 1, dId: 1, time: 1, _id: 0 }).lean();

    let durSumSec = 0, durCount = 0;
    await Promise.all(resolves.map(async r => {
      // $ne:'resolve' cubre 'fire' y docs viejos sin kind (default del schema).
      const fire = await Notification.findOne({
        ...notifFilter, ruleId: r.ruleId, dId: r.dId,
        kind: { $ne: 'resolve' }, time: { $lt: r.time }
      }).sort({ time: -1 }).select({ time: 1, _id: 0 }).lean();
      if (fire) { durSumSec += (r.time - fire.time) / 1000; durCount++; }
    }));
    const mttrSec24h = durCount ? Math.round(durSumSec / durCount) : null;

    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const resolvedToday = await Notification.countDocuments({
      ...notifFilter, ruleId: { $ne: null }, kind: 'resolve', time: { $gte: startOfDay.getTime() }
    });

    return res.json({
      status: "success",
      data: {
        now,
        active,
        unacked,
        oldestUnackedAgeMs: oldestUnackedFiredAt !== null ? now - oldestUnackedFiredAt : null,
        mttrSec24h,
        resolvedToday
      }
    });
  } catch (error) {
    console.log("ERROR GETTING ALARMS SUMMARY");
    console.log(error);
    return res.status(500).json({ status: "error", error });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/alarms/:id/detail — ficha completa de UNA alarma (id = _id de la
// notificación, fire o resolve indistintamente: se resuelve el episodio por
// ruleId+dId). 404 si no existe o está fuera de scope (no revela existencia).
// ─────────────────────────────────────────────────────────────────────────────
router.get("/alarms/:id/detail", checkAuth, async (req, res) => {
  try {
    const now = Date.now();
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ status: "error", error: "Alarm not found" });
    }

    const notifFilter = await buildReadFilter(req, 'Notification');
    const notif = await Notification.findOne({ ...notifFilter, _id: id }).lean();
    if (!notif || !notif.ruleId) {
      return res.status(404).json({ status: "error", error: "Alarm not found" });
    }

    const ruleId = notif.ruleId;
    const dId = notif.dId;
    const kindOf = e => e.kind || 'fire';

    // Historia completa del episodio (pareja ruleId+dId, ascendente).
    const events = await Notification.find({ ...notifFilter, ruleId, dId })
      .sort({ time: 1 }).lean();

    const last = events.length ? events[events.length - 1] : notif;
    const state = kindOf(last) === 'resolve'
      ? 'resolved'
      : (last.ackAt != null ? 'ack' : 'active');

    let firedAt = null, resolvedAt = null;
    if (state === 'resolved') {
      resolvedAt = last.time;
      for (let i = events.length - 1; i >= 0; i--) {
        if (kindOf(events[i]) !== 'resolve' && events[i].time <= resolvedAt) {
          firedAt = events[i].time;
          break;
        }
      }
    } else {
      firedAt = last.time;
    }

    const alarm = {
      ...notif,
      kind: kindOf(notif),
      state,
      firedAt,
      resolvedAt,
      durationSec: (state === 'resolved' && firedAt != null)
        ? Math.round((resolvedAt - firedAt) / 1000)
        : null
    };

    // ── Telemetría de la variable: fireTime−2h → now (activa) o resolvedAt+1h.
    let telemetry = [];
    let telemetryDownsampled = false;
    const variable = notif.variable || null;
    if (variable) {
      const sinceMs = (firedAt != null ? firedAt : notif.time) - DETAIL_PRE_FIRE_H * HOUR_MS;
      const untilMs = (state === 'resolved' && resolvedAt != null)
        ? resolvedAt + DETAIL_POST_RESOLVE_H * HOUR_MS
        : now;
      const docs = await historyQuery({ dId, variable, sinceMs });
      let serie = docs
        .map(d => ({ time: d.time, value: d.value }))
        .filter(p => p.time <= untilMs && typeof p.value === 'number' && Number.isFinite(p.value));
      if (serie.length > TELEMETRY_MAX_POINTS) {
        serie = submuestrear(serie, TELEMETRY_MAX_POINTS);
        telemetryDownsampled = true;
      }
      telemetry = serie;
    }

    // ── threshold de la regla: el del evento consultado; si no, el del evento
    //    más reciente del MISMO episodio/regla que lo declare (los resolve
    //    suelen traer thresholdUsed null y el fire del par sí lo tiene).
    let ruleThreshold = typeof notif.thresholdUsed === 'number' ? notif.thresholdUsed : null;
    if (ruleThreshold == null) {
      for (let i = events.length - 1; i >= 0; i--) {
        if (typeof events[i].thresholdUsed === 'number') { ruleThreshold = events[i].thresholdUsed; break; }
      }
    }

    // ── Forecast: regresión lineal sobre las últimas ~2h, honesta. Solo modos
    //    con serie simple vs umbral. `points` se devuelven con cualquier R²
    //    (quality lo explicita); etaMinutes solo con ajuste ok y convergencia.
    //    El gate de modo usa el FIRE del episodio: si el detalle se abrió por
    //    el evento resolve, su mode ('resolve-by-*') suprimiría el forecast
    //    de una regla que sí proyecta.
    const fireEvent = (firedAt != null)
      ? (events.find(e => kindOf(e) !== 'resolve' && e.time === firedAt) || notif)
      : notif;
    const forecast = await buildForecast(fireEvent, dId, variable, now, ruleThreshold);

    // ── currentValue: última lectura de telemetría (alarm.value es el valor
    //    del EVENTO y en resueltas/cross suele ser null).
    const currentValue = telemetry.length ? telemetry[telemetry.length - 1].value : null;

    // ── threshold efectivo expuesto al front: el de la regla; si no, el del
    //    forecast. null real (cross sin umbral) → el front muestra "—".
    const threshold = ruleThreshold != null
      ? ruleThreshold
      : (forecast && typeof forecast.threshold === 'number' ? forecast.threshold : null);

    // ── Recurrencia 30d sobre la misma pareja ruleId+dId.
    const recurrence = buildRecurrence(events, now, kindOf);

    // ── Episodios previos (30d, excluye el actual) para las bandas del hero.
    const episodes = buildEpisodes(events, now, kindOf, firedAt);

    // ── Siblings: hasta 4 variables más del mismo dId (6h, 1 punto/5min).
    const siblings = await buildSiblings(notifFilter, dId, variable, now);

    // ── Autonomía: últimos valores si hay muestras recientes (<6h).
    const autonomy = await buildAutonomy(dId, now);

    // ── Children: alarmas activas con correlationParent === ruleId, mismo site.
    const children = await buildChildren(notifFilter, ruleId, notif.siteId);

    return res.json({
      status: "success",
      data: {
        now,
        alarm,
        telemetry,
        telemetryDownsampled,
        currentValue,
        threshold,
        forecast,
        recurrence,
        episodes,
        siblings,
        autonomy,
        children
      }
    });
  } catch (error) {
    console.log("ERROR GETTING ALARM DETAIL");
    console.log(error);
    return res.status(500).json({ status: "error", error });
  }
});

//**********************
//**** FUNCTIONS *******
//********************** 

//CREATE ALARM
async function createAlarmRule(newAlarm) {
  try {
    const url = "http://" + process.env.EMQX_API_HOST + ":8085/api/v4/rules";

    // topicExample = userid/did/temp  //msgExample = {value: 20}
    const topic =
      newAlarm.userId + "/" + newAlarm.dId + "/" + newAlarm.variable + "/sdata";

    const rawsql =
      'SELECT username, topic, payload FROM "' +
      topic +
      '" WHERE payload.value ' +
      newAlarm.condition +
      " " +
      newAlarm.value +
      " AND is_not_null(payload.value)";

    var newRule = {
      rawsql: rawsql,
      actions: [
        {
          name: "data_to_webserver",
          params: {
            $resource: global.alarmResource.id,
            payload_tmpl:
              '{"userId":"' +
              newAlarm.userId +
              '","payload":${payload},"topic":"${topic}"}'
          }
        }
      ],
      description: "ALARM-RULE",
      enabled: newAlarm.status
    };

    //save rule in emqx - grabamos la regla en emqx
    const res = await axios.post(url, newRule, auth);
    var emqxRuleId = res.data.data.id;



    if (res.data.data && res.status === 200) {
      //save rule in mongo -- grabamos regla en mongo
      const mongoRule = await AlarmRule.create({
        userId: newAlarm.userId,
        dId: newAlarm.dId,
        emqxRuleId: emqxRuleId,
        status: newAlarm.status,
        variable: newAlarm.variable,
        variableFullName: newAlarm.variableFullName,
        value: newAlarm.value,
        condition: newAlarm.condition,
        triggerTime: newAlarm.triggerTime,
        createTime: Date.now()
      });

      const url = "http://"+process.env.EMQX_API_HOST+":8085/api/v4/rules/" + mongoRule.emqxRuleId;

      const payload_templ =
        '{"userId":"' +
        newAlarm.userId +
        '","dId":"' +
        newAlarm.dId +
        '","deviceName":"' +
        newAlarm.deviceName +
        '","payload":${payload},"topic":"${topic}","emqxRuleId":"' +
        mongoRule.emqxRuleId +
        '","value":' +
        newAlarm.value +
        ',"condition":"' +
        newAlarm.condition +
        '","variable":"' +
        newAlarm.variable +
        '","variableFullName":"' +
        newAlarm.variableFullName +
        '","triggerTime":' +
        newAlarm.triggerTime +
        "}";

      newRule.actions[0].params.payload_tmpl = payload_templ;

      const res = await axios.put(url, newRule, auth);

      console.log("New Alarm Rule Created...".green);

      return true;
    }
  } catch (error) {
    console.log(error);
    return false;
  }
}

//UPDATE ALARM STATUS
async function updateAlarmRuleStatus(emqxRuleId, status) {
  try {
    const url = "http://"+process.env.EMQX_API_HOST+":8085/api/v4/rules/" + emqxRuleId;

    const newRule = {
      enabled: status
    };

    const res = await axios.put(url, newRule, auth);

    if (res.status === 200) {
      await AlarmRule.updateOne({ emqxRuleId: emqxRuleId }, { status: status });

      console.log("Saver Rule Status Updated...".green);

      return true;
    }
  } catch (error) {
    console.log(error);
    return false;
  }
}

//DELETE ONLY ONE RULE
async function deleteAlarmRule(emqxRuleId) {
  try {
    const url = "http://"+process.env.EMQX_API_HOST+":8085/api/v4/rules/" + emqxRuleId;

    const emqxRule = await axios.delete(url, auth);

    const deleted = await AlarmRule.deleteOne({ emqxRuleId: emqxRuleId });

    return true;
  } catch (error) {
    console.log(error);
    return false;
  }
}

// ── Helpers FASE 2 (consola de alarmas) ─────────────────────────────────────

// Pipeline de episodios: agrupa Notification por (ruleId, dId) quedándose con
// el ÚLTIMO evento (sort time desc + $first). Mismo criterio que sites.js:195
// y dashboard_noc.js:367. kind ausente → 'fire' (default del schema, docs viejos).
// `since24` acota repeatCount (fires de la pareja en últimas 24h).
function pipelineEpisodios(notifFilter, extraMatch, now) {
  return [
    { $match: { ...notifFilter, ruleId: { $ne: null }, ...extraMatch } },
    { $sort: { time: -1 } },
    { $group: {
        _id: { ruleId: "$ruleId", dId: "$dId" },
        lastTime:          { $first: "$time" },
        lastKind:          { $first: { $ifNull: ["$kind", "fire"] } },
        lastSeverity:      { $first: "$severity" },
        lastValue:         { $first: "$value" },
        lastEventId:       { $first: "$_id" },
        label:             { $first: "$label" },
        reason:            { $first: "$reason" },
        recommendation:    { $first: "$recommendation" },
        mode:              { $first: "$mode" },
        variable:          { $first: "$variable" },
        unit:              { $first: "$unit" },
        thresholdUsed:     { $first: "$thresholdUsed" },
        siteId:            { $first: "$siteId" },
        deviceName:        { $first: "$deviceName" },
        correlationParent: { $first: "$correlationParent" },
        acknowledgedBy:    { $first: "$acknowledgedBy" },
        ackAt:             { $first: "$ackAt" },
        // Fire que abrió el episodio cuando el último evento es resolve:
        // es el fire más reciente de la pareja (precede al resolve por orden).
        lastFireTime: { $max: { $cond: [
          { $eq: [ { $ifNull: ["$kind", "fire"] }, "fire" ] }, "$time", null ] } },
        fires24h: { $sum: { $cond: [
          { $and: [
            { $eq: [ { $ifNull: ["$kind", "fire"] }, "fire" ] },
            { $gte: [ "$time", now - DAY_MS ] }
          ] }, 1, 0 ] } }
    } },
    { $sort: { lastTime: -1 } },
    { $limit: ALARMS_GROUP_CAP }
  ];
}

// Conteo de hijas activas por (correlationParent, siteId): episodios de la
// cascada (DEC-REF-50) cuyo último evento no es resolve.
function pipelineChildCount(notifFilter) {
  return [
    { $match: { ...notifFilter, ruleId: { $ne: null }, correlationParent: { $ne: null } } },
    { $sort: { time: -1 } },
    { $group: {
        _id: { ruleId: "$ruleId", dId: "$dId" },
        lastKind: { $first: { $ifNull: ["$kind", "fire"] } },
        parent:   { $first: "$correlationParent" },
        siteId:   { $first: "$siteId" }
    } },
    { $match: { lastKind: { $ne: "resolve" } } },
    { $group: { _id: { parent: "$parent", siteId: "$siteId" }, count: { $sum: 1 } } }
  ];
}

// Grupo de agregación → ítem de la consola. state ∈ {active, ack, resolved}.
function episodioAItem(g, now, childMap, siteNameByCode) {
  const state = g.lastKind === 'resolve'
    ? 'resolved'
    : (g.ackAt != null ? 'ack' : 'active');
  const firedAt    = state === 'resolved' ? (g.lastFireTime != null ? g.lastFireTime : null) : g.lastTime;
  const resolvedAt = state === 'resolved' ? g.lastTime : null;
  const anchor     = firedAt != null ? firedAt : g.lastTime;

  return {
    notificationId: g.lastEventId,
    ruleId: g._id.ruleId,
    dId: g._id.dId,
    deviceName: g.deviceName || null,
    siteId: g.siteId || null,
    siteName: siteNameByCode.get(g.siteId) || null,
    severity: g.lastSeverity || 'info',
    label: g.label || null,
    reason: g.reason || null,
    recommendation: g.recommendation || null,
    mode: g.mode || null,
    variable: g.variable || null,
    unit: g.unit || null,
    value: g.lastValue != null ? g.lastValue : null,
    thresholdUsed: g.thresholdUsed != null ? g.thresholdUsed : null,
    correlationParent: g.correlationParent || null,
    state,
    firedAt,
    resolvedAt,
    durationSec: (state === 'resolved' && firedAt != null)
      ? Math.round((resolvedAt - firedAt) / 1000)
      : null,
    ageMs: now - anchor,
    acknowledgedBy: g.acknowledgedBy || null,
    ackAt: g.ackAt != null ? g.ackAt : null,
    repeatCount: g.fires24h,
    childCount: childMap.get(`${g._id.ruleId}|${g.siteId}`) || 0,
    lastEventTime: g.lastTime   // interno: cursor/sort; se borra antes de responder
  };
}

// Submuestrea una serie a <= max puntos conservando extremos (paso uniforme).
// Réplica del helper de qa.js.
function submuestrear(arr, max) {
  if (arr.length <= max) return arr;
  const paso = (arr.length - 1) / (max - 1);
  const out = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.round(i * paso)]);
  return out;
}

// Bucketiza una serie asc por time a 1 punto por bucket (último del bucket).
function bucketizar(serie, bucketMs) {
  const out = [];
  let curBucket = null;
  for (const p of serie) {
    const b = Math.floor(p.time / bucketMs);
    if (b !== curBucket) { out.push(p); curBucket = b; }
    else out[out.length - 1] = p;
  }
  return out;
}

// Regresión lineal por mínimos cuadrados (x=minutos relativos, y=valor).
// Réplica de qa.js:90. Devuelve slope/min, intercept, r2 y n.
function regresionLineal(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  if (sxx === 0) return { slope: 0, intercept: my, r2: 0, n };
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = syy === 0 ? 1 : Math.max(0, Math.min(1, (sxy * sxy) / (sxx * syy)));
  return { slope, intercept, r2, n };
}

// Forecast del detalle. null (suprimido) si: modo sin serie simple, sin
// variable, <FORECAST_MIN_N muestras en 2h, o pendiente plana (slope=0 → no
// converge). Con datos suficientes devuelve SIEMPRE la proyección `points`;
// la honestidad va en `quality` (r2 de la recta contra la serie CRUDA) y en
// `etaMinutes`, que solo se publica si quality==='ok' y la pendiente converge
// al umbral dentro de FORECAST_ETA_CAP_H. La serie se suaviza con EMA antes
// de la regresión (datos reales muy ruidosos) pero el R² se mide contra los
// valores crudos — suavizar no infla la confianza reportada.
async function buildForecast(notif, dId, variable, now, thresholdOverride = null) {
  if (!FORECAST_MODES.includes(notif.mode)) return null;
  if (!variable) return null;

  const docs = await historyQuery({ dId, variable, sinceMs: now - FORECAST_WINDOW_H * HOUR_MS });
  const serie = docs
    .map(d => ({ time: d.time, value: d.value }))
    .filter(p => typeof p.value === 'number' && Number.isFinite(p.value));
  if (serie.length < FORECAST_MIN_N) return null;

  const t0 = serie[0].time;
  const xs = serie.map(p => (p.time - t0) / 60000);
  const ysRaw = serie.map(p => p.value);

  // EMA sobre la secuencia (muestreo ~regular en la flota).
  const ys = [];
  let acc = ysRaw[0];
  for (const y of ysRaw) {
    acc = FORECAST_EMA_ALPHA * y + (1 - FORECAST_EMA_ALPHA) * acc;
    ys.push(acc);
  }

  const { slope, intercept, n } = regresionLineal(xs, ys);
  if (slope === 0) return null;

  // R² de la recta ajustada contra la serie CRUDA.
  const my = ysRaw.reduce((a, b) => a + b, 0) / ysRaw.length;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < ysRaw.length; i++) {
    const yhat = intercept + slope * xs[i];
    ssRes += (ysRaw[i] - yhat) * (ysRaw[i] - yhat);
    ssTot += (ysRaw[i] - my) * (ysRaw[i] - my);
  }
  const r2 = ssTot === 0 ? 1 : Math.max(0, Math.min(1, 1 - ssRes / ssTot));
  const quality = r2 >= FORECAST_MIN_R2 ? 'ok' : 'low';

  const tLast = serie[serie.length - 1].time;
  const xLast = (tLast - t0) / 60000;
  const yNow = intercept + slope * xLast;
  const threshold = thresholdOverride != null
    ? thresholdOverride
    : (typeof notif.thresholdUsed === 'number' ? notif.thresholdUsed : null);

  let etaMinutes = null;
  if (threshold != null && quality === 'ok') {
    const apunta = (threshold > yNow && slope > 0) || (threshold < yNow && slope < 0);
    if (apunta) {
      const eta = (threshold - yNow) / slope;   // minutos desde tLast
      if (eta >= 0 && eta <= FORECAST_ETA_CAP_H * 60) {
        etaMinutes = Math.round(eta * 10) / 10;
      }
    }
  }

  // Proyección a +FORECAST_HORIZON_H cada FORECAST_STEP_MIN desde tLast.
  const points = [];
  const steps = Math.round(FORECAST_HORIZON_H * 60 / FORECAST_STEP_MIN);
  for (let i = 1; i <= steps; i++) {
    const dm = i * FORECAST_STEP_MIN;
    points.push({ time: tLast + dm * 60000, value: intercept + slope * (xLast + dm) });
  }

  return {
    slopePerMin: +slope.toFixed(6),
    r2: +r2.toFixed(3),
    n,
    threshold,
    etaMinutes,
    quality,
    points
  };
}

// Episodios previos del mismo ruleId+dId en 30d, para las bandas sombreadas
// del hero. Un episodio = fire + el resolve que le sigue (si existe; abierto
// → resolvedAt null). Se excluye el episodio actual (mismo firedAt) y se
// devuelven como mucho EPISODES_MAX, los más recientes.
function buildEpisodes(events, now, kindOf, currentFiredAt) {
  const since = now - RECURRENCE_DAYS * DAY_MS;
  const out = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (kindOf(e) === 'resolve' || e.time < since) continue;
    const next = events[i + 1];
    out.push({
      firedAt: e.time,
      resolvedAt: (next && kindOf(next) === 'resolve') ? next.time : null
    });
  }
  return out
    .filter(ep => ep.firedAt !== currentFiredAt)
    .slice(-EPISODES_MAX);
}

// Recurrencia 30d de la pareja ruleId+dId. weekly: 5 buckets de 7d, del más
// viejo al más reciente. Con fires30d<3 igual devuelve los números — el
// frontend decide si muestra "basado en N episodios".
function buildRecurrence(events, now, kindOf) {
  const since30 = now - RECURRENCE_DAYS * DAY_MS;
  const ev30 = events.filter(e => e.time >= since30);
  const fires = ev30.filter(e => kindOf(e) !== 'resolve');

  let mtbfHours = null;
  if (fires.length >= 2) {
    let gaps = 0;
    for (let i = 1; i < fires.length; i++) gaps += fires[i].time - fires[i - 1].time;
    mtbfHours = +((gaps / (fires.length - 1)) / HOUR_MS).toFixed(2);
  }

  // Duración media de episodios: cada fire se aparea con el evento siguiente
  // si es resolve (otro fire antes → episodio solapado, se omite del promedio).
  let durSum = 0, durN = 0;
  for (let i = 0; i < ev30.length; i++) {
    if (kindOf(ev30[i]) === 'resolve') continue;
    const next = ev30[i + 1];
    if (next && kindOf(next) === 'resolve') { durSum += next.time - ev30[i].time; durN++; }
  }
  const avgDurationMin = durN ? +(durSum / durN / 60000).toFixed(1) : null;

  const weekly = new Array(WEEKLY_BUCKETS).fill(0);
  const weekStart = now - WEEKLY_BUCKETS * 7 * DAY_MS;
  fires.forEach(f => {
    const idx = Math.floor((f.time - weekStart) / (7 * DAY_MS));
    if (idx >= 0 && idx < WEEKLY_BUCKETS) weekly[idx]++;
  });

  return { fires30d: fires.length, mtbfHours, avgDurationMin, weekly };
}

// Siblings: hasta SIBLING_MAX variables del mismo dId (distinct en 24h,
// excluye la de la alarma y las de autonomía), serie 6h bucketizada a 5min.
// threshold: umbral de la notificación MÁS RECIENTE (cualquier estado, 30d)
// de ese dId+variable — el episodio activo no alcanza: tras un resolve el
// último evento suele traer thresholdUsed null.
// variableFullName/unit: Data no los guarda; se resuelven Device → Template
// (widgets y sources), mismo criterio que dashboard_noc (primer widget que
// declara la variable gana).
async function buildSiblings(notifFilter, dId, alarmVariable, now) {
  const vars = await Data.distinct('variable', { dId, time: { $gte: now - SIBLING_DISCOVERY_H * HOUR_MS } });
  const others = vars
    .filter(v => v && v !== alarmVariable && !AUTONOMY_VARS.includes(v))
    .slice(0, SIBLING_MAX);
  if (!others.length) return [];

  const thAgg = await Notification.aggregate([
    { $match: {
        ...notifFilter,
        dId,
        ruleId: { $ne: null },
        variable: { $in: others },
        thresholdUsed: { $type: 'number' },
        time: { $gte: now - RECURRENCE_DAYS * DAY_MS }
    } },
    { $sort: { time: -1 } },
    { $group: { _id: '$variable', thresholdUsed: { $first: '$thresholdUsed' } } }
  ]);
  const thByVar = {};
  thAgg.forEach(t => { thByVar[t._id] = t.thresholdUsed; });

  const metaByVar = await variableMetaPorDId(dId);

  const siblings = [];
  for (const v of others) {
    const docs = await Data.find(
      { dId, variable: v, time: { $gte: now - SIBLING_HOURS * HOUR_MS } },
      { time: 1, value: 1, _id: 0 }
    ).sort({ time: 1 }).lean();
    const serie = docs
      .filter(d => typeof d.value === 'number' && Number.isFinite(d.value))
      .map(d => ({ time: d.time, value: d.value }));
    const meta = metaByVar[v] || {};
    siblings.push({
      variable: v,
      variableFullName: meta.fullName || null,
      unit: meta.unit || null,
      threshold: thByVar[v] != null ? thByVar[v] : null,
      points: bucketizar(serie, SIBLING_BUCKET_MS)
    });
  }
  return siblings;
}

// Mapa variable → {fullName, unit} del template del equipo (widgets + sources
// multi-fuente). {} si el device no existe o no tiene template.
async function variableMetaPorDId(dId) {
  const out = {};
  const device = await Device.findOne({ dId }, { templateId: 1, _id: 0 }).lean();
  if (!device || !device.templateId) return out;
  const tpl = await Template.findById(device.templateId, { widgets: 1 }).lean();
  if (!tpl) return out;
  const take = (variable, fullName, unit) => {
    if (variable && !out[variable]) {
      out[variable] = { fullName: fullName || null, unit: unit || null };
    }
  };
  for (const w of (tpl.widgets || [])) {
    take(w.variable, w.variableFullName, w.unit);
    for (const s of (w.sources || [])) take(s.variable, s.variableFullName, s.unit);
  }
  return out;
}

// Autonomía (DEC-REF-115): últimos valores de las variables autonomy_* del dId
// si la muestra de autonomy_hours es reciente (<AUTONOMY_MAX_AGE_H). Si no, null
// (el frontend no muestra la tarjeta). autonomy_source viaja como string.
async function buildAutonomy(dId, now) {
  const docs = await Data.find(
    { dId, variable: { $in: AUTONOMY_VARS }, time: { $gte: now - AUTONOMY_MAX_AGE_H * HOUR_MS } },
    { variable: 1, value: 1, time: 1, _id: 0 }
  ).sort({ time: -1 }).lean();

  const lastByVar = {};
  for (const d of docs) {
    if (lastByVar[d.variable] === undefined) lastByVar[d.variable] = d;
  }
  if (!lastByVar.autonomy_hours) return null;

  return {
    hours:  lastByVar.autonomy_hours.value,
    liters: lastByVar.autonomy_liters ? lastByVar.autonomy_liters.value : null,
    lph:    lastByVar.autonomy_lph    ? lastByVar.autonomy_lph.value    : null,
    source: lastByVar.autonomy_source ? lastByVar.autonomy_source.value : null,
    time:   lastByVar.autonomy_hours.time
  };
}

// Children: episodios ACTIVOS con correlationParent === ruleId en el mismo site.
async function buildChildren(notifFilter, ruleId, siteId) {
  if (!siteId) return [];
  const groups = await Notification.aggregate([
    { $match: { ...notifFilter, correlationParent: ruleId, siteId, ruleId: { $ne: null } } },
    { $sort: { time: -1 } },
    { $group: {
        _id: { ruleId: "$ruleId", dId: "$dId" },
        lastKind:     { $first: { $ifNull: ["$kind", "fire"] } },
        lastTime:     { $first: "$time" },
        lastEventId:  { $first: "$_id" },
        severity:     { $first: "$severity" },
        label:        { $first: "$label" },
        variable:     { $first: "$variable" },
        value:        { $first: "$value" },
        unit:         { $first: "$unit" },
        thresholdUsed:{ $first: "$thresholdUsed" }
    } },
    { $match: { lastKind: { $ne: "resolve" } } },
    { $sort: { lastTime: -1 } }
  ]);
  return groups.map(g => ({
    notificationId: g.lastEventId,
    ruleId: g._id.ruleId,
    dId: g._id.dId,
    severity: g.severity || 'info',
    label: g.label || null,
    variable: g.variable || null,
    value: g.value != null ? g.value : null,
    unit: g.unit || null,
    thresholdUsed: g.thresholdUsed != null ? g.thresholdUsed : null,
    firedAt: g.lastTime
  }));
}

module.exports = router;
