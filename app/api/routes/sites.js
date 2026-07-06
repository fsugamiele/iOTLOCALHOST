const express = require("express");
const router = express.Router();
const { checkAuth } = require("../middlewares/authentication.js");
const { buildReadFilter } = require("../middlewares/scope.js");

import Site   from "../models/site.js";
import Device from "../models/device.js";
import Template from "../models/template.js";
import Notification from "../models/notifications.js";

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
    templates.forEach(t => {
      widgetsByTemplateId[t._id.toString()] = t.widgets || [];
      nameByTemplateId[t._id.toString()] = t.name || "";
    });

    // 4. Devices enriquecidos (shape que DevicePanel consume)
    const enriched = devices.map(d => ({
      dId: d.dId,
      name: d.name,
      siteId: d.siteId,
      templateName: d.templateId ? (nameByTemplateId[d.templateId.toString()] || "") : "",
      templateWidgets: d.templateId ? (widgetsByTemplateId[d.templateId.toString()] || []) : []
    }));

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

    // Spread del filtro de tenancy en el $match: combina con time/severity vía AND
    // implícito. Si notifFilter es {$or:[...]}, queda {$or, time, severity} = AND OK.
    const agg = await Notification.aggregate([
      { $match: { ...notifFilter,
                  time: { $gte: since },
                  severity: { $in: ["warning", "critical"] } } },
      { $group: { _id: "$siteId",
                  hasCritical: { $max: { $cond: [ { $eq: ["$severity","critical"] }, 1, 0 ] } },
                  hasWarning:  { $max: { $cond: [ { $eq: ["$severity","warning"]  }, 1, 0 ] } } } }
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

    // Mapa variable → peor severidad vigente (ventana idéntica a /sites/status).
    const since = Date.now() - SEVERITY_WINDOW_MS;
    const agg = await Notification.aggregate([
      { $match: {
          ...notifFilter,
          siteId: siteCode,
          time: { $gte: since },
          severity: { $in: ["warning", "critical"] }
        } },
      { $group: {
          _id: "$variable",
          hasCritical: { $max: { $cond: [ { $eq: ["$severity","critical"] }, 1, 0 ] } },
          hasWarning:  { $max: { $cond: [ { $eq: ["$severity","warning"]  }, 1, 0 ] } }
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
    const userId              = req.userData._id;
    const { siteCode, force } = req.query;

    const site = await Site.findOne({ userId, siteCode });
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

    await Site.deleteOne({ userId, siteCode });
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
    const userId   = req.userData._id;
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

    const result = await Site.updateOne({ userId, siteCode }, { $set: update });
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
    const userId            = req.userData._id;
    const { siteCode, dId } = req.body;

    if (!siteCode || !dId) {
      return res.status(400).json({ status: "error", error: "siteCode and dId are required" });
    }

    const [site, device] = await Promise.all([
      Site.findOne({ userId, siteCode }),
      Device.findOne({ userId, dId })
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
      Site.updateOne({ userId, siteCode }, { $addToSet: { devices: dId } }),
      Device.updateOne({ userId, dId },   { $set: { siteId: siteCode } })
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
    const userId            = req.userData._id;
    const { siteCode, dId } = req.query;

    if (!siteCode || !dId) {
      return res.status(400).json({ status: "error", error: "siteCode and dId are required" });
    }

    await Promise.all([
      Site.updateOne({ userId, siteCode }, { $pull:  { devices: dId } }),
      Device.updateOne({ userId, dId },   { $unset: { siteId: ""  } })
    ]);

    return res.json({ status: "success" });
  } catch (error) {
    console.log("ERROR UNBINDING DEVICE FROM SITE");
    console.log(error);
    return res.status(500).json({ status: "error", error });
  }
});


module.exports = router;
