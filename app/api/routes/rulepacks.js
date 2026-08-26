// CRUD HTTP de RulePack — SF-1 de A8 (DEC-REF-42, DEC-REF-57).
// Escribe al mismo Mongo que lee el motor edge (siteState.js:22). El
// hot-reload de packs vive en SF-3 (DEC-REF-58); esta ruta es solo la
// superficie de escritura.
//
// RBAC (DEC-REF-60): superadmin puede todo; cualquier otro rol → DENY
// fail-close. La rama 'RulePack' vive en scope.js. Para GET esto
// resuelve por buildReadFilter (DENY_FILTER = {$expr:false} → 0-match).
// Para PUT/DELETE se chequea el rol explícito ANTES del write: un
// upsert con DENY_FILTER como filter crearía un doc nuevo con los
// campos del update (Mongo upsert no aplica el filter al doc creado),
// abriendo un hueco. RBAC directo por rol lo cierra sin depender de
// coincidencias de shape.
//
// Validación de crossExpr (DEC-REF-47 + DEC-REF-57): para toda regla
// con type:'cross' se corre validateCrossTree ANTES del write. Cierra
// el riesgo de regla-fantasma (siteState.js:29-43 descartaría la regla
// silenciosamente al cargar el pack). El pack se persiste como todo o
// nada — el usuario ve el 400 con la razón exacta.

const express = require("express");
const router = express.Router();
const { checkAuth } = require("../middlewares/authentication.js");
const { buildReadFilter } = require("../middlewares/scope.js");
const { validateRule, collectCrossLeafRefs } = require("../services/ruleValidation.js");

const RulePack = require("../models/rule_pack.js");
import EquipmentSheet from "../models/equipment_sheet.js";

// SF-3 (DEC-REF-58, DEC-REF-61.b, DEC-REF-61-A). Auto-publish al canal
// de reload tras escritura exitosa. Broadcast: writer NO sabe qué sites
// usan cada pack — DEC-REF-61-A. Cliente compartido `global.mqttClient`
// (webhooks.js:349, credencial `superiotix` con publish `#`).
// Fire-and-forget: un publish fallido NO revierte la escritura — el
// pack quedó en Mongo, el siguiente reload eventual (nuevo write, u
// orden manual desde SF-5) lo tomará. El log claro habilita el
// diagnóstico.
const RELOAD_TOPIC_BROADCAST = 'wanomi/edge/all/reload';

function publishReload(context) {
  if (!global.mqttClient || !global.mqttClient.connected) {
    console.warn(`[rulepacks] Reload NO publicado (${context}) — global.mqttClient no conectado`);
    return;
  }
  // QoS 1: broker garantiza al menos una entrega al edge suscrito.
  // Payload arbitrario (edge ignora el contenido, DEC-REF-61.c).
  global.mqttClient.publish(RELOAD_TOPIC_BROADCAST, '{}', { qos: 1 }, err => {
    if (err) {
      console.error(`[rulepacks] Reload publish FALLÓ (${context}): ${err.message}`);
    } else {
      console.log(`[rulepacks] Reload publicado (${context}) → ${RELOAD_TOPIC_BROADCAST}`);
    }
  });
}

function isSuperadmin(req) {
  const grants = req.userData?.grants || [];
  return grants.some(g => g.role === 'superadmin');
}

// SF-7 · DEC-REF-66 — despacho por tipo de regla. Retorna
// { ok:true, warnings:[] } (acumulado de todas las reglas) o
// { ok:false, ruleId, reason } con el primer rechazo.
function validatePackRules(pack) {
  const rules = Array.isArray(pack?.rules) ? pack.rules : [];
  const warnings = [];
  for (const r of rules) {
    const v = validateRule(r);
    if (!v.ok) return { ok: false, ruleId: r.ruleId, reason: v.reason };
    if (v.warnings && v.warnings.length) {
      for (const w of v.warnings) warnings.push(`[${r.ruleId}] ${w}`);
    }
  }
  return { ok: true, warnings };
}

// GET /rulepacks — lista. Superadmin ve todo; resto DENY (0 packs).
router.get("/rulepacks", checkAuth, async (req, res) => {
  try {
    const filter = await buildReadFilter(req, 'RulePack');
    const packs = await RulePack.find(filter).lean();
    return res.json({ status: "success", data: packs });
  } catch (error) {
    console.log("ERROR GETTING RULEPACKS");
    console.log(error);
    return res.status(500).json({ status: "error", error: error.message || error });
  }
});

// GET /rulepacks/:packId — uno. Mismo gate. 404 si no existe (o si el
// gate lo oculta — indistinguible por diseño, no filtra información
// sobre existencia).
router.get("/rulepacks/:packId", checkAuth, async (req, res) => {
  try {
    const filter = await buildReadFilter(req, 'RulePack');
    const pack = await RulePack.findOne({ ...filter, packId: req.params.packId }).lean();
    if (!pack) return res.status(404).json({ status: "error", error: "rulepack not found" });
    return res.json({ status: "success", data: pack });
  } catch (error) {
    console.log("ERROR GETTING RULEPACK");
    console.log(error);
    return res.status(500).json({ status: "error", error: error.message || error });
  }
});

// PUT /rulepacks/:packId — upsert canónico (findOneAndUpdate) espejando
// seeds/cummins_pcc_v1.js:154-158. runValidators:true corre las
// validaciones del schema (enums, requireds); validatePackCrossRules
// corre las de forma del árbol antes del write.
router.put("/rulepacks/:packId", checkAuth, async (req, res) => {
  try {
    if (!isSuperadmin(req)) {
      return res.status(403).json({ status: "error", error: "forbidden: superadmin required" });
    }

    const packId = req.params.packId;
    const body = req.body.rulepack || {};

    if (!body.deviceType) {
      return res.status(400).json({ status: "error", error: "deviceType is required" });
    }
    // S5 — el deviceType del pack pasa de "presente" a "referencia válida"
    // (espejo de templates.js:63-70, S3). Estricto a nivel pack: 400.
    if (typeof body.deviceType !== 'string') {
      return res.status(400).json({ status: "error", error: "deviceType must be a string" });
    }
    const packSheet = await EquipmentSheet.findOne({ deviceType: body.deviceType }).lean();
    if (!packSheet) {
      return res.status(400).json({ status: "error", error: "deviceType does not reference an existing equipment sheet" });
    }
    if (body.packId && body.packId !== packId) {
      return res.status(400).json({ status: "error", error: "packId in body must match URL" });
    }

    // Fuerza consistencia: el packId autoritativo es el de la URL.
    const doc = { ...body, packId };

    const v = validatePackRules(doc);
    if (!v.ok) {
      return res.status(400).json({
        status: "error",
        error: `regla ${v.ruleId} inválida: ${v.reason}`,
      });
    }

    // S5 — referencias de hojas cross contra equipmentsheets: WARNING no
    // bloqueante (decisión de sesión #69). Estricto acá brickearía el pack
    // productivo cummins-pcc-v1 (hojas ATS sin ficha — cascada DEC-REF-53
    // D4 transitoria). La variable solo se chequea cuando la ficha declara
    // variables (una ficha con variables:[] no tiene contra qué validar).
    const refs = collectCrossLeafRefs(doc);
    if (refs.length) {
      const sheets = await EquipmentSheet.find({}).lean();
      const byType = new Map(sheets.map(s => [s.deviceType, new Set((s.variables || []).map(vb => vb.name))]));
      for (const ref of refs) {
        const vars = byType.get(ref.deviceType);
        if (!vars) {
          v.warnings.push(`[${ref.ruleId}] hoja ${ref.deviceType}/${ref.variable}: deviceType sin ficha en equipmentsheets`);
        } else if (vars.size > 0 && !vars.has(ref.variable)) {
          v.warnings.push(`[${ref.ruleId}] hoja ${ref.deviceType}/${ref.variable}: variable no declarada en la ficha`);
        }
      }
    }

    const result = await RulePack.findOneAndUpdate(
      { packId },
      doc,
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
    publishReload(`PUT ${packId}`);
    return res.json({
      status: "success",
      packId: result.packId,
      version: result.version,
      rules: result.rules.length,
      // SF-7 · DEC-REF-66 — advertencias no bloqueantes (config semánticamente
      // muerta). El frontend las muestra en amarillo sin frenar el save.
      warnings: v.warnings || [],
    });
  } catch (error) {
    console.log("ERROR PUTTING RULEPACK");
    console.log(error);
    const status = error.name === 'ValidationError' ? 400 : 500;
    return res.status(status).json({ status: "error", error: error.message || error });
  }
});

// DELETE /rulepacks/:packId — remove. Superadmin only.
router.delete("/rulepacks/:packId", checkAuth, async (req, res) => {
  try {
    if (!isSuperadmin(req)) {
      return res.status(403).json({ status: "error", error: "forbidden: superadmin required" });
    }

    const result = await RulePack.deleteOne({ packId: req.params.packId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ status: "error", error: "rulepack not found" });
    }
    publishReload(`DELETE ${req.params.packId}`);
    return res.json({ status: "success" });
  } catch (error) {
    console.log("ERROR DELETING RULEPACK");
    console.log(error);
    return res.status(500).json({ status: "error", error: error.message || error });
  }
});

module.exports = router;
