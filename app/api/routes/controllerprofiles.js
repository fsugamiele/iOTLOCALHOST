// spec_perfiles_controladora (Franco 2026-10-20) — API de perfiles de controladora y
// asignación al equipo. Cada cambio publica reload al edge (mismo canal que fichas y packs).
const express = require("express");
const router = express.Router();
const { checkAuth } = require("../middlewares/authentication.js");
const { buildWriteFilter } = require("../middlewares/scope.js");
const ControllerProfile = require("../models/controller_profile.js");
import Device from "../models/device.js";
import EquipmentSheet from "../models/equipment_sheet.js";

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const KINDS = ['warning', 'trip'];
const OPS = ['lt', 'lte', 'gt', 'gte'];

function publishEdgeReload(context) {
  if (!global.mqttClient || !global.mqttClient.connected) return;
  global.mqttClient.publish('wanomi/edge/all/reload', '{}', { qos: 1 }, (err) => {
    if (err) console.error(`[controllerprofiles] Reload publish FALLÓ (${context}): ${err.message}`);
  });
}

// Límites (perfil o equipo): variable de la ficha, kind/op válidos, número, fuente citada.
function validateLimits(limits, sheetVars, where) {
  if (limits == null) return null;
  if (!Array.isArray(limits)) return `${where}: limits debe ser una lista`;
  for (const l of limits) {
    if (!l || !l.variable || !sheetVars.has(l.variable)) return `${where}: la variable '${l && l.variable}' no está en la ficha`;
    if (!KINDS.includes(l.kind)) return `${where}: kind debe ser warning o trip (${l.variable})`;
    if (!OPS.includes(l.op)) return `${where}: op debe ser lt/lte/gt/gte (${l.variable})`;
    if (!Number.isFinite(Number(l.value))) return `${where}: valor no numérico (${l.variable})`;
    if (!l.source || !String(l.source).trim()) return `${where}: falta la fuente del límite (${l.variable}) — no se cargan umbrales sin cita`;
  }
  const dup = new Set();
  for (const l of limits) {
    const k = `${l.variable}|${l.kind}|${l.op.startsWith('l') ? 'lt' : 'gt'}`;
    if (dup.has(k)) return `${where}: límite repetido ${l.variable} ${l.kind} ${l.op}`;
    dup.add(k);
  }
  return null;
}

async function sheetVarsOf(deviceType) {
  const sh = await EquipmentSheet.findOne({ deviceType }).lean();
  return sh ? new Set((sh.variables || []).map((v) => v.name)) : null;
}

// GET /controllerprofiles[?deviceType=] — lista (sin el diccionario de códigos, liviana)
router.get("/controllerprofiles", checkAuth, async (req, res) => {
  try {
    const q = req.query.deviceType ? { deviceType: String(req.query.deviceType) } : {};
    const data = await ControllerProfile.find(q).select('-faultCodes').sort({ deviceType: 1, model: 1 }).lean();
    return res.json({ status: "success", data });
  } catch (e) { return res.status(500).json({ status: "error", error: e.message }); }
});

router.get("/controllerprofiles/:profileId", checkAuth, async (req, res) => {
  try {
    const data = await ControllerProfile.findOne({ profileId: req.params.profileId }).lean();
    if (!data) return res.status(404).json({ status: "error", error: "perfil no encontrado" });
    const devices = await Device.countDocuments({ profileId: data.profileId });
    return res.json({ status: "success", data, devices });
  } catch (e) { return res.status(500).json({ status: "error", error: e.message }); }
});

// PUT /controllerprofiles/:profileId — crea o reemplaza. Body: { profile: {...} }
router.put("/controllerprofiles/:profileId", checkAuth, async (req, res) => {
  try {
    const profileId = req.params.profileId;
    const p = (req.body && req.body.profile) || null;
    if (!ID_RE.test(profileId)) return res.status(400).json({ status: "error", error: "profileId inválido (minúsculas, números y guiones)" });
    if (!p || !p.deviceType || !p.model) return res.status(400).json({ status: "error", error: "profile.deviceType y profile.model son requeridos" });
    const vars = await sheetVarsOf(p.deviceType);
    if (!vars) return res.status(400).json({ status: "error", error: `no existe la ficha ${p.deviceType}` });
    const errL = validateLimits(p.limits || [], vars, 'perfil');
    if (errL) return res.status(400).json({ status: "error", error: errL });
    const badU = (p.unavailable || []).filter((v) => !vars.has(v));
    if (badU.length) return res.status(400).json({ status: "error", error: `unavailable: variables que no están en la ficha: ${badU.join(', ')}` });
    const doc = { ...p, profileId };
    delete doc._id; delete doc.createdAt; delete doc.updatedAt; delete doc.__v;
    const saved = await ControllerProfile.findOneAndReplace({ profileId }, doc, { upsert: true, new: true, runValidators: true });
    publishEdgeReload(`PUT perfil ${profileId}`);
    return res.json({ status: "success", data: saved });
  } catch (e) { return res.status(400).json({ status: "error", error: e.message }); }
});

router.delete("/controllerprofiles/:profileId", checkAuth, async (req, res) => {
  try {
    const n = await Device.countDocuments({ profileId: req.params.profileId });
    if (n) return res.status(409).json({ status: "error", error: `el perfil está asignado a ${n} equipo(s): quitalo de los equipos primero` });
    await ControllerProfile.deleteOne({ profileId: req.params.profileId });
    publishEdgeReload(`DELETE perfil ${req.params.profileId}`);
    return res.json({ status: "success" });
  } catch (e) { return res.status(500).json({ status: "error", error: e.message }); }
});

// PUT /device/profile — asigna el perfil (null lo quita) y/o los umbrales propios del equipo.
// Body: { dId, profileId?: string|null, limitOverrides?: [...]|null }
router.put("/device/profile", checkAuth, async (req, res) => {
  try {
    const { dId } = req.body || {};
    if (!dId) return res.status(400).json({ status: "error", error: "dId es requerido" });
    const writeFilter = await buildWriteFilter(req, 'Device');
    const dev = await Device.findOne({ ...writeFilter, dId }).lean();
    if (!dev) return res.status(404).json({ status: "error", error: "device not found" });
    const $set = {}, $unset = {};
    if ('profileId' in req.body) {
      const pid = req.body.profileId;
      if (pid === null || pid === '') $unset.profileId = 1;
      else {
        const prof = await ControllerProfile.findOne({ profileId: pid }).lean();
        if (!prof) return res.status(400).json({ status: "error", error: `no existe el perfil ${pid}` });
        if (prof.deviceType !== dev.deviceType) return res.status(400).json({ status: "error", error: `el perfil ${pid} es de ${prof.deviceType} y el equipo es ${dev.deviceType}` });
        $set.profileId = pid;
      }
    }
    if ('limitOverrides' in req.body) {
      const lo = req.body.limitOverrides;
      if (lo === null || (Array.isArray(lo) && !lo.length)) $unset.limitOverrides = 1;
      else {
        const vars = await sheetVarsOf(dev.deviceType);
        const err = validateLimits(lo, vars || new Set(), 'equipo');
        if (err) return res.status(400).json({ status: "error", error: err });
        $set.limitOverrides = lo.map((l) => ({ variable: l.variable, kind: l.kind, op: l.op, value: Number(l.value), source: String(l.source) }));
      }
    }
    const upd = {}; if (Object.keys($set).length) upd.$set = $set; if (Object.keys($unset).length) upd.$unset = $unset;
    if (!Object.keys(upd).length) return res.status(400).json({ status: "error", error: "nada para cambiar (profileId y/o limitOverrides)" });
    await Device.updateOne({ ...writeFilter, dId }, upd);
    publishEdgeReload(`PUT device/profile ${dId}`);
    const out = await Device.findOne({ dId }).select('dId profileId limitOverrides').lean();
    return res.json({ status: "success", data: out });
  } catch (e) { return res.status(500).json({ status: "error", error: e.message }); }
});

module.exports = router;
