const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const { checkAuth } = require("../middlewares/authentication.js");
const { buildReadFilter, buildWriteFilter, scopeFilterFor } = require("../middlewares/scope.js");

import Site   from "../models/site.js";
import Device from "../models/device.js";
import Template from "../models/template.js";
import Notification from "../models/notifications.js";
import EquipmentSheet from "../models/equipment_sheet.js";
import User   from "../models/user.js";
const RulePack = require("../models/rule_pack.js");

// spec_grafcet_g1b (DEC-REF-146 · Qb1) — la acción humana viaja al edge por el canal de
// recarga con un payload tipado {cmd,…}: el edge lo trata como comando, no recarga.
const EDGE_CTL_TOPIC = 'wanomi/edge/all/reload';
function publishEdgeCommand(payload) {
  if (!global.mqttClient || !global.mqttClient.connected) {
    console.warn(`[sites] Comando ${payload.cmd} NO publicado — global.mqttClient no conectado (el edge lo recupera al arrancar)`);
    return false;
  }
  global.mqttClient.publish(EDGE_CTL_TOPIC, JSON.stringify({ ...payload, ts: Date.now() }), { qos: 1 }, (err) => {
    if (err) console.error(`[sites] Comando ${payload.cmd} publish FALLÓ: ${err.message}`);
  });
  return true;
}

// G2 (DEC-REF-147 · Qg2) — alarma HUÉRFANA: abierta en la consola (último evento ≠ resolve)
// pero el edge ya no la tiene abierta (sin fila rulefsm con alarmOpen). Pasa cuando el
// cierre del edge no se pudo guardar. La acción humana (ack / service) la cierra desde acá
// con un resolve real (Notification.create, mismo schema que la consola · DEC-PROC-5).
// Margen: un disparo de hace < ORPHAN_MIN_AGE_MS puede no estar escrito aún en rulefsm
// (lote de escritura del edge) → no se considera huérfana.
const ORPHAN_MIN_AGE_MS = parseInt(process.env.ORPHAN_MIN_AGE_MS || '15000', 10);
async function closeIfOrphan(notif, siteCode, rule, mode, actorId) {
  if (!notif.ruleId) return null;
  const last = await Notification.findOne({ ruleId: notif.ruleId, dId: notif.dId, siteId: siteCode })
    .sort({ time: -1 }).lean();
  if (!last || (last.kind || 'fire') === 'resolve') return null;              // episodio ya cerrado
  if (Date.now() - (Number(last.time) || 0) < ORPHAN_MIN_AGE_MS) return null; // disparo reciente
  const key = rule && rule.type === 'cross' ? `${notif.ruleId}:${siteCode}` : `${notif.ruleId}:${notif.dId}`;
  const row = await mongoose.connection.db.collection('rulefsm').findOne({ siteId: siteCode, key });
  if (row && row.alarmOpen) return null;                                      // el edge la tiene abierta
  const verb = mode === 'resolve-by-service' ? 'Service registrado' : 'Confirmada';
  const doc = await Notification.create({
    userId: last.userId || 'edge', dId: last.dId, deviceName: last.deviceName || last.dId,
    topic: 'api/orphan-close', value: typeof last.value === 'number' ? last.value : 0,
    variable: last.variable || '', variableFullName: last.variableFullName || '',
    ruleId: last.ruleId, inferenceId: last.inferenceId, label: last.label, severity: last.severity,
    recommendation: `${verb} por ${actorId}: alarma cerrada (el motor ya la había dado por terminada).`,
    siteId: siteCode, reason: 'orphan-closed', source: 'api', mode,
    thresholdUsed: last.thresholdUsed != null ? last.thresholdUsed : undefined, unit: last.unit || '',
    correlationParent: last.correlationParent || null, kind: 'resolve', readed: false, time: Date.now(),
  });
  console.log(`[sites] Huérfana cerrada ${notif.ruleId}:${notif.dId} (${mode}) por ${actorId}`);
  return doc;
}

const TIPO_ENUM             = ['BTS', 'shelter', 'repeater'];
const ALLOWED_UPDATE_FIELDS = ['nombre', 'lat', 'lng', 'direccion', 'provincia',
                               'localidad', 'tipo', 'operatorCode', 'zoneCode', 'notes'];

// Ventana windowed reusada por /sites/status y /site/:siteCode/alarms
// (DEC-REF-27, DEC-REF-43/54). 2× cooldownSec default (300s) + margen.
const SEVERITY_WINDOW_MS = 15 * 60 * 1000;

const ALARM_LIMIT_DEFAULT = 50;
const ALARM_LIMIT_MAX     = 200;


//GET SITES
router.get("/site", checkAuth, async (req, res) => {
  try {
    const filter = await buildReadFilter(req, 'Site');
    let sites = await Site.find(filter);
    sites = JSON.parse(JSON.stringify(sites));
    return res.json({ status: "success", data: sites });
  } catch (error) {
    console.log("ERROR GETTING SITES");
    console.log(error);
    return res.status(500).json({ status: "error", error });
  }
});

//GET SITE FULL
router.get("/site/:siteCode/full", checkAuth, async (req, res) => {
  try {
    const siteCode = req.params.siteCode;

    // 1. El site (gate autorización — DEC-REF-33)
    const siteFilter = await buildReadFilter(req, 'Site');
    const site = await Site.findOne({ ...siteFilter, siteCode });
    if (!site) {
      return res.status(404).json({ status: "error", error: "Site not found" });
    }

    // 2. Devices del site — derivados sueltan userId, confían en el gate (DEC-REF-33)
    const devices = await Device.find(
      { siteId: siteCode },
      { dId: 1, name: 1, siteId: 1, templateId: 1, _id: 0 }
    ).lean();

    // 3. Templates únicos → mapa de widgets por templateId (derivado, sin userId)
    const templateIds = [...new Set(devices.map(d => d.templateId).filter(Boolean))];
    const templates = await Template.find({ _id: { $in: templateIds } }).lean();
    const widgetsByTemplateId = {};
    const nameByTemplateId = {};
    const deviceTypeByTemplateId = {};
    templates.forEach(t => {
      widgetsByTemplateId[t._id.toString()] = t.widgets || [];
      nameByTemplateId[t._id.toString()] = t.name || "";
      deviceTypeByTemplateId[t._id.toString()] = t.deviceType || "";
    });

    // 3b. DEC-REF-108 F2 (#80) — dominio por equipo: template.deviceType →
    // ficha.domain. Una sola query a equipmentsheets, indexada en memoria.
    // Sin ficha o sin dominio ⇒ '' (cae en el tab "General" de la página).
    const deviceTypes = [...new Set(Object.values(deviceTypeByTemplateId).filter(Boolean))];
    const sheets = deviceTypes.length
      ? await EquipmentSheet.find({ deviceType: { $in: deviceTypes } }, { deviceType: 1, domain: 1, _id: 0 }).lean()
      : [];
    const domainByDeviceType = {};
    sheets.forEach(s => { domainByDeviceType[s.deviceType] = s.domain || ""; });

    // 4. Devices enriquecidos (shape que DevicePanel consume)
    const enriched = devices.map(d => {
      const deviceType = d.templateId ? (deviceTypeByTemplateId[d.templateId.toString()] || "") : "";
      return {
        dId: d.dId,
        name: d.name,
        siteId: d.siteId,
        templateName: d.templateId ? (nameByTemplateId[d.templateId.toString()] || "") : "",
        deviceType,
        domain: deviceType ? (domainByDeviceType[deviceType] || "") : "",
        templateWidgets: d.templateId ? (widgetsByTemplateId[d.templateId.toString()] || []) : []
      };
    });

    // 5. Respuesta: site + devices enriquecidos en un solo viaje
    const cleanSite = JSON.parse(JSON.stringify(site));
    return res.json({
      status: "success",
      data: { site: cleanSite, devices: enriched }
    });
  } catch (error) {
    console.log("ERROR GETTING SITE FULL");
    console.log(error);
    return res.status(500).json({ status: "error", error });
  }
});

//GET SITES STATUS
router.get("/sites/status", checkAuth, async (req, res) => {
  try {
    const since = Date.now() - SEVERITY_WINDOW_MS;

    const siteFilter  = await buildReadFilter(req, 'Site');
    const notifFilter = await buildReadFilter(req, 'Notification');

    const sites = await Site.find(siteFilter).lean();

    // SF-4 · DEC-REF-64.c — coloreo híbrido: por cada ruleId dentro de la
    // ventana, tomar el EVENTO MÁS RECIENTE ($sort desc + $first). Si su
    // kind es 'resolve' → NO cuenta (la regla cerró). Si es 'fire' o falta
    // (legacy sin el campo, tratada como fire vía $ifNull) → cuenta.
    // La ventana temporal de 15 min queda como red de seguridad para silencios
    // sin resolve. Spread del filtro de tenancy en el $match: combina con
    // time/severity vía AND implícito.
    const agg = await Notification.aggregate([
      { $match: { ...notifFilter,
                  time: { $gte: since },
                  severity: { $in: ["warning", "critical"] } } },
      { $sort: { time: -1 } },
      { $group: { _id: "$ruleId",
                  lastKind:     { $first: "$kind" },
                  lastSeverity: { $first: "$severity" },
                  siteId:       { $first: "$siteId" } } },
      { $match: { $expr: { $ne: [ { $ifNull: [ "$lastKind", "fire" ] }, "resolve" ] } } },
      { $group: { _id: "$siteId",
                  hasCritical: { $max: { $cond: [ { $eq: ["$lastSeverity","critical"] }, 1, 0 ] } },
                  hasWarning:  { $max: { $cond: [ { $eq: ["$lastSeverity","warning"]  }, 1, 0 ] } } } }
    ]);
    const statusBySite = {};
    agg.forEach(a => {
      statusBySite[a._id] = a.hasCritical ? "critical" : (a.hasWarning ? "warning" : "ok");
    });

    const data = sites.map(s => ({
      siteCode: s.siteCode, nombre: s.nombre, lat: s.lat, lng: s.lng, tipo: s.tipo,
      status: statusBySite[s.siteCode] || "ok"
    }));

    return res.json({ status: "success", data });
  } catch (error) {
    console.log("ERROR GETTING SITES STATUS");
    console.log(error);
    return res.status(500).json({ status: "error", error });
  }
});

// GET SITE ALARMS FEED (DEC-REF-43, DEC-REF-54)
// Feed de alarmas del detalle de site: notifs gateadas, cursor por time,
// y mapa {variable → peor severidad vigente} en la misma ventana que
// /sites/status (SEVERITY_WINDOW_MS) pero agrupado por variable en vez
// de por siteId. correlationParent/mode viajan crudos — la agrupación
// visual madre→hija (DEC-REF-50) la resuelve el frontend.
router.get("/site/:siteCode/alarms", checkAuth, async (req, res) => {
  try {
    const siteCode = req.params.siteCode;

    // Gate del site (DEC-REF-33) — si no matchea, 404 igual que /full
    const siteFilter = await buildReadFilter(req, 'Site');
    const site = await Site.findOne({ ...siteFilter, siteCode }).lean();
    if (!site) {
      return res.status(404).json({ status: "error", error: "Site not found" });
    }

    // Parseo de cursor y limit
    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = ALARM_LIMIT_DEFAULT;
    if (limit > ALARM_LIMIT_MAX) limit = ALARM_LIMIT_MAX;

    const beforeRaw = req.query.before;
    const before = beforeRaw !== undefined ? parseInt(beforeRaw, 10) : null;
    const cursorClause = Number.isFinite(before) ? { time: { $lt: before } } : {};

    // Feed: notifs del site + cursor. Sin projection para preservar
    // correlationParent y mode (DEC-REF-50, DEC-REF-53-A).
    const notifFilter = await buildReadFilter(req, 'Notification');
    const alarms = await Notification.find({
      ...notifFilter,
      siteId: siteCode,
      ...cursorClause
    }).sort({ time: -1 }).limit(limit).lean();

    // Mapa variable → peor severidad vigente (SF-4 · DEC-REF-64.c coloreo
    // híbrido idéntico al de /sites/status pero agrupado por variable en
    // vez de por siteId). Sort desc + first por ruleId → excluir si el
    // último evento de esa regla es resolve → group por variable.
    const since = Date.now() - SEVERITY_WINDOW_MS;
    const agg = await Notification.aggregate([
      { $match: {
          ...notifFilter,
          siteId: siteCode,
          time: { $gte: since },
          severity: { $in: ["warning", "critical"] }
        } },
      { $sort: { time: -1 } },
      { $group: {
          _id: "$ruleId",
          lastKind:     { $first: "$kind" },
          lastSeverity: { $first: "$severity" },
          variable:     { $first: "$variable" }
        } },
      { $match: { $expr: { $ne: [ { $ifNull: [ "$lastKind", "fire" ] }, "resolve" ] } } },
      { $group: {
          _id: "$variable",
          hasCritical: { $max: { $cond: [ { $eq: ["$lastSeverity","critical"] }, 1, 0 ] } },
          hasWarning:  { $max: { $cond: [ { $eq: ["$lastSeverity","warning"]  }, 1, 0 ] } }
        } }
    ]);
    const variableSeverity = {};
    agg.forEach(a => {
      if (a._id == null) return;
      variableSeverity[a._id] = a.hasCritical ? "critical" : "warning";
    });

    const cursor = alarms.length ? alarms[alarms.length - 1].time : null;

    return res.json({
      status: "success",
      data: {
        siteCode,
        alarms,
        variableSeverity,
        cursor
      }
    });
  } catch (error) {
    console.log("ERROR GETTING SITE ALARMS FEED");
    console.log(error);
    return res.status(500).json({ status: "error", error });
  }
});

// ACK ALARM — DEC-REF-46 / DEC-REF-54
// Registra atención humana con autoría auditable. Idempotente: si ya está
// ACKeada, responde 200 con la autoría original SIN sobrescribir. No toca
// `readed` (que sigue siendo vista pasiva del listado — DEC-REF-45).
// Gate: buildWriteFilter('Notification') — el grant del actor debe alcanzar
// el siteId de la notif (fail-closed sobre derivados, DEC-REF-37).
router.put("/site/:siteCode/alarms/:notificationId/ack", checkAuth, async (req, res) => {
  try {
    const { siteCode, notificationId } = req.params;
    // Nombre legible para auditoría de ACK (la UI muestra acknowledgedBy).
    const actor = await User.findById(req.userData._id).select('name email').lean();
    const actorId = (actor && (actor.name || actor.email)) || String(req.userData._id);

    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      return res.status(400).json({ status: "error", error: "notificationId inválido" });
    }

    // Gate del site (DEC-REF-33 — evita ACK cross-site tosco).
    const siteFilter = await buildReadFilter(req, 'Site');
    const site = await Site.findOne({ ...siteFilter, siteCode }).lean();
    if (!site) {
      return res.status(404).json({ status: "error", error: "Site not found" });
    }

    // Gate de escritura sobre Notification.
    const writeFilter = await buildWriteFilter(req, 'Notification');
    const notif = await Notification.findOne({
      ...writeFilter,
      _id: notificationId,
      siteId: siteCode
    });
    if (!notif) {
      return res.status(403).json({ status: "error", error: "forbidden: grant does not cover this notification" });
    }

    // G2 · Qg2 — huérfana: se cierra acá (también si ya estaba reconocida: es la única vía).
    let orphanClosed = null;
    if (notif.ruleId) {
      const pk = await RulePack.findOne({ 'rules.ruleId': notif.ruleId }, { 'rules.$': 1 }).lean();
      orphanClosed = await closeIfOrphan(notif, siteCode, pk && pk.rules && pk.rules[0], 'resolve-by-ack', actorId);
    }

    // Idempotencia: primera ACK es la que vale.
    if (notif.ackAt != null) {
      return res.json({
        status: "success",
        data: {
          _id: notif._id,
          acknowledgedBy: notif.acknowledgedBy,
          ackAt: notif.ackAt,
          idempotent: true,
          orphanClosed: !!orphanClosed
        }
      });
    }

    const ackAt = Date.now();
    await Notification.updateOne(
      { _id: notif._id, ackAt: null },
      { $set: { acknowledgedBy: actorId, ackAt } }
    );
    // G1b — avisar al edge: cierra las reglas manuales normalizadas (E6) o las deja
    // confirmadas (Qb2). Notificaciones legacy sin ruleId: nada que avisar (caso raro #1).
    if (notif.ruleId) publishEdgeCommand({ cmd: 'ack', ruleId: notif.ruleId, dId: notif.dId, siteId: siteCode, by: actorId });

    return res.json({
      status: "success",
      data: {
        _id: notif._id,
        acknowledgedBy: actorId,
        ackAt,
        idempotent: false,
        orphanClosed: !!orphanClosed
      }
    });
  } catch (error) {
    console.log("ERROR ACKING NOTIFICATION");
    console.log(error);
    return res.status(500).json({ status: "error", error });
  }
});

// spec_grafcet_g1b (Q6 · Qb4) — POST /site/:siteCode/alarms/:notificationId/service
// "Registrar service" desde el detalle de la alarma: solo reglas acumuladoras (vida de
// aceite). Pone el acumulado en 0 en el edge y cierra la alarma (resolve-by-service).
router.post("/site/:siteCode/alarms/:notificationId/service", checkAuth, async (req, res) => {
  try {
    const { siteCode, notificationId } = req.params;
    const actor = await User.findById(req.userData._id).select('name email').lean();
    const actorId = (actor && (actor.name || actor.email)) || String(req.userData._id);
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      return res.status(400).json({ status: "error", error: "notificationId inválido" });
    }
    const siteFilter = await buildReadFilter(req, 'Site');
    const site = await Site.findOne({ ...siteFilter, siteCode }).lean();
    if (!site) return res.status(404).json({ status: "error", error: "Site not found" });
    const writeFilter = await buildWriteFilter(req, 'Notification');
    const notif = await Notification.findOne({ ...writeFilter, _id: notificationId, siteId: siteCode });
    if (!notif) return res.status(403).json({ status: "error", error: "forbidden: grant does not cover this notification" });
    if (!notif.ruleId) return res.status(400).json({ status: "error", error: "Esta alarma no viene de una regla del motor" });
    // Caso raro #6 — solo acumuladores.
    const pack = await RulePack.findOne({ 'rules.ruleId': notif.ruleId }, { 'rules.$': 1 }).lean();
    const rule = pack && pack.rules && pack.rules[0];
    if (!rule || rule.type !== 'M' || rule.metric !== 'accumulator') {
      return res.status(400).json({ status: "error", error: "Registrar service solo aplica a reglas de vida útil (acumuladores)" });
    }
    // Queda registrado quién hizo el service (y cuenta como confirmación).
    const now = Date.now();
    if (notif.ackAt == null) {
      await Notification.updateOne({ _id: notif._id, ackAt: null }, { $set: { acknowledgedBy: actorId, ackAt: now } });
    }
    // G2 · Qg2 — huérfana: el resolve se guarda acá; el comando igual viaja (acumulado a 0).
    const orphanClosed = await closeIfOrphan(notif, siteCode, rule, 'resolve-by-service', actorId);
    const sent = publishEdgeCommand({ cmd: 'service', ruleId: notif.ruleId, dId: notif.dId, siteId: siteCode, by: actorId });
    return res.json({ status: "success", data: { _id: notif._id, serviceBy: actorId, serviceAt: now, sentToEdge: sent, orphanClosed: !!orphanClosed } });
  } catch (error) {
    console.log("ERROR REGISTERING SERVICE");
    console.log(error);
    return res.status(500).json({ status: "error", error });
  }
});

//NEW SITE
router.post("/site", checkAuth, async (req, res) => {
  try {
    const userId  = req.userData._id;
    const newSite = req.body.newSite;

    if (!newSite || !newSite.siteCode || !newSite.nombre || !newSite.tipo || !newSite.operatorCode || !newSite.zoneCode) {
      return res.status(400).json({ status: "error", error: "siteCode, nombre, tipo, operatorCode and zoneCode are required" });
    }
    if (!TIPO_ENUM.includes(newSite.tipo)) {
      return res.status(400).json({ status: "error", error: "tipo must be one of: BTS, shelter, repeater" });
    }

    // Write-authorization (DEC-REF-46/54, cierra BACKLOG-TENANT-3). Espejo
    // del gate de lectura: superadmin permite todo; grants con scope deben
    // cubrir `operatorCode` (y `zoneCode` si el grant lo especifica);
    // sin grants → 403 (no ownership fallback en CREATE de sites, coherente
    // con la ausencia semántica de "site propio" fuera de un operador).
    const grants = req.userData.grants || [];
    const scope  = await scopeFilterFor(grants, 'Site');
    if (scope === null) {
      return res.status(403).json({ status: "error", error: "forbidden: no grants covering this operator/zone" });
    }
    if (Object.keys(scope).length > 0) {
      const okOperator = grants.some(g => {
        if (g.role === 'superadmin') return true;
        if (!g.scope || !g.scope.operatorCode) return false;
        if (g.scope.operatorCode !== newSite.operatorCode) return false;
        if (g.scope.zoneCode && g.scope.zoneCode !== newSite.zoneCode) return false;
        if (g.scope.siteCode && g.scope.siteCode !== newSite.siteCode) return false;
        return true;
      });
      if (!okOperator) {
        return res.status(403).json({ status: "error", error: "forbidden: grant does not cover this operator/zone" });
      }
    }

    newSite.userId      = userId;
    newSite.createdTime = Date.now();
    newSite.devices     = [];

    const site = await Site.create(newSite);
    return res.json({ status: "success", siteCode: site.siteCode });
  } catch (error) {
    console.log("ERROR CREATING SITE");
    console.log(error);
    return res.status(500).json({ status: "error", error });
  }
});

//DELETE SITE
router.delete("/site", checkAuth, async (req, res) => {
  try {
    const { siteCode, force } = req.query;

    // Write-gate (DEC-REF-46/54) — espejo de buildReadFilter.
    const writeFilter = await buildWriteFilter(req, 'Site');
    const site = await Site.findOne({ ...writeFilter, siteCode });
    if (!site) {
      return res.status(404).json({ status: "error", error: "site not found" });
    }

    if (site.devices.length > 0) {
      if (force !== "true") {
        return res.status(409).json({
          status: "error",
          error: `site has ${site.devices.length} devices, unbind them first or pass ?force=true`
        });
      }
      // cascade: clear siteId from all devices that belonged to this site
      await Device.updateMany({ dId: { $in: site.devices } }, { $unset: { siteId: "" } });
    }

    await Site.deleteOne({ ...writeFilter, siteCode });
    return res.json({ status: "success" });
  } catch (error) {
    console.log("ERROR DELETING SITE");
    console.log(error);
    return res.status(500).json({ status: "error", error });
  }
});

//UPDATE SITE FIELDS
router.put("/site", checkAuth, async (req, res) => {
  try {
    const body     = req.body.site || {};
    const siteCode = body.siteCode;

    if (!siteCode) {
      return res.status(400).json({ status: "error", error: "siteCode is required" });
    }
    if (body.tipo && !TIPO_ENUM.includes(body.tipo)) {
      return res.status(400).json({ status: "error", error: "tipo must be one of: BTS, shelter, repeater" });
    }

    const update = {};
    ALLOWED_UPDATE_FIELDS.forEach(f => { if (body[f] !== undefined) update[f] = body[f]; });

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ status: "error", error: "no updatable fields provided" });
    }

    // Write-gate (DEC-REF-46/54) — espejo de buildReadFilter.
    const writeFilter = await buildWriteFilter(req, 'Site');
    const result = await Site.updateOne({ ...writeFilter, siteCode }, { $set: update });
    return res.json({ status: "success", data: result });
  } catch (error) {
    console.log("ERROR UPDATING SITE");
    console.log(error);
    return res.status(500).json({ status: "error", error });
  }
});

// TODO: el bind no es atómico. Hay race condition si dos requests
//       intentan bindear el mismo device simultáneamente. Para el
//       piloto Claro (pocos sites, operación humana) el riesgo es
//       aceptable. Si el sistema escala a despliegues masivos,
//       reescribir con findOneAndUpdate atómico (ver discusión Fase 4C.1).
//BIND DEVICE TO SITE
router.post("/site/devices", checkAuth, async (req, res) => {
  try {
    const { siteCode, dId } = req.body;

    if (!siteCode || !dId) {
      return res.status(400).json({ status: "error", error: "siteCode and dId are required" });
    }

    // Write-gate (DEC-REF-46/54) — mismo filtro sobre Site y Device.
    const siteWrite   = await buildWriteFilter(req, 'Site');
    const deviceWrite = await buildWriteFilter(req, 'Device');

    const [site, device] = await Promise.all([
      Site.findOne({ ...siteWrite, siteCode }),
      Device.findOne({ ...deviceWrite, dId })
    ]);

    if (!site)   return res.status(404).json({ status: "error", error: "site not found" });
    if (!device) return res.status(404).json({ status: "error", error: "device not found" });

    if (device.siteId && device.siteId !== siteCode) {
      return res.status(409).json({
        status: "error",
        error: `device already belongs to site ${device.siteId}`
      });
    }

    // idempotente: si el device ya está bindeado al mismo siteCode,
    // $addToSet en site.devices y $set en device.siteId son no-ops.
    await Promise.all([
      Site.updateOne({ ...siteWrite, siteCode }, { $addToSet: { devices: dId } }),
      Device.updateOne({ ...deviceWrite, dId },   { $set: { siteId: siteCode } })
    ]);

    return res.json({ status: "success" });
  } catch (error) {
    console.log("ERROR BINDING DEVICE TO SITE");
    console.log(error);
    return res.status(500).json({ status: "error", error });
  }
});

//UNBIND DEVICE FROM SITE
router.delete("/site/devices", checkAuth, async (req, res) => {
  try {
    const { siteCode, dId } = req.query;

    if (!siteCode || !dId) {
      return res.status(400).json({ status: "error", error: "siteCode and dId are required" });
    }

    // Write-gate (DEC-REF-46/54).
    const siteWrite   = await buildWriteFilter(req, 'Site');
    const deviceWrite = await buildWriteFilter(req, 'Device');

    await Promise.all([
      Site.updateOne({ ...siteWrite, siteCode }, { $pull:  { devices: dId } }),
      Device.updateOne({ ...deviceWrite, dId },   { $unset: { siteId: ""  } })
    ]);

    return res.json({ status: "success" });
  } catch (error) {
    console.log("ERROR UNBINDING DEVICE FROM SITE");
    console.log(error);
    return res.status(500).json({ status: "error", error });
  }
});


module.exports = router;
