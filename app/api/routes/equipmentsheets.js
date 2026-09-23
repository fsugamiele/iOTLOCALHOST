const express = require("express");
const router = express.Router();
const { checkAuth } = require("../middlewares/authentication.js");
import EquipmentSheet from "../models/equipment_sheet.js";
import Template from "../models/template.js";
const RulePack = require("../models/rule_pack.js");
const { extractFromPdf } = require("../services/sheetExtractor.js");

// GET — catálogo global (D-1). SIN buildReadFilter: excepción de tenencia deliberada.
router.get("/equipmentsheet", checkAuth, async (req, res) => {
  try {
    const sheets = await EquipmentSheet.find({}).lean();
    return res.json({ status: "success", data: sheets });
  } catch (error) {
    console.log("ERROR GETTING EQUIPMENT SHEETS"); console.log(error);
    return res.status(500).json({ status: "error", error });
  }
});

// POST — escritura sólo superadmin (D-1). 409 por findOne previo (D-2).
router.post("/equipmentsheet", checkAuth, async (req, res) => {
  try {
    const grants = req.userData.grants || [];                 // grants frescos de DB (authentication.js:22-26)
    if (!grants.some(g => g.role === 'superadmin')) {         // idiom zones.js:36-37, SIN el fallback de grant
      return res.status(403).json({ status: "error", error: "forbidden: superadmin only" });
    }
    const newSheet = req.body.newEquipmentSheet;              // wrapper con clave nombrada (patrón de la casa)
    if (!newSheet || !newSheet.deviceType) {
      return res.status(400).json({ status: "error", error: "deviceType es requerido" });
    }
    const existing = await EquipmentSheet.findOne({ deviceType: newSheet.deviceType });  // D-2
    if (existing) {
      return res.status(409).json({ status: "error", error: `equipmentSheet '${newSheet.deviceType}' ya existe` });
    }
    newSheet.createdTime = Date.now();                        // espejo de zones.js:50
    const sheet = await EquipmentSheet.create(newSheet);
    return res.json({ status: "success", deviceType: sheet.deviceType });
  } catch (error) {
    console.log("ERROR CREATING EQUIPMENT SHEET"); console.log(error);
    return res.status(500).json({ status: "error", error: error.message || error });
  }
});

// POST /equipmentsheet/extract — DEC-REF-98 D-1 (#73). Recibe el PDF del
// fabricante (base64) y devuelve un DRAFT propuesto por el extractor
// heurístico (sheetExtractor.js). NO PERSISTE: la ficha se guarda por el
// POST /equipmentsheet normal tras revisión humana en la UI. Superadmin
// only — misma guarda D-1 que el alta (proponer una ficha es escribir,
// aunque el write real quede para después).
// El body grande se habilita en index.js (parser de 25mb solo para esta
// ruta, registrado ANTES del express.json() global de 100kb).
router.post("/equipmentsheet/extract", checkAuth, async (req, res) => {
  try {
    const grants = req.userData.grants || [];
    if (!grants.some(g => g.role === 'superadmin')) {
      return res.status(403).json({ status: "error", error: "forbidden: superadmin only" });
    }
    const pdfBase64 = req.body && req.body.pdfBase64;
    if (!pdfBase64 || typeof pdfBase64 !== 'string') {
      return res.status(400).json({ status: "error", error: "pdfBase64 es requerido" });
    }
    const buffer = Buffer.from(pdfBase64, 'base64');
    // Un PDF real empieza con %PDF — guarda contra base64 de otra cosa.
    if (buffer.length < 5 || buffer.toString('latin1', 0, 5) !== '%PDF-') {
      return res.status(400).json({ status: "error", error: "el archivo no es un PDF válido" });
    }
    const draft = await extractFromPdf(buffer);
    return res.json({ status: "success", draft });
  } catch (error) {
    console.log("ERROR EXTRACTING EQUIPMENT SHEET FROM PDF");
    console.log(error);
    return res.status(500).json({ status: "error", error: error.message || error });
  }
});


// PUT /equipmentsheet/:deviceType — DEC-REF-111 (#82). Edición de ficha,
// superadmin only. Cierra el hueco declarado en #81 (fichas inmutables por
// falta de PUT + DELETE bloqueado por referencias). **El `deviceType` es el
// IDENTIFICADOR y es INMUTABLE** — renombrarlo orfanaría templates/packs/devices
// que lo referencian por string. Editar el resto es seguro: la ficha es
// catálogo; los templates COPIAN sus variables al crearse (getDeviceCredentials
// lee del template, NO de la ficha en runtime), así que editar una ficha solo
// afecta la creación FUTURA de templates/packs, no lo ya creado. `.save()` corre
// la validación Mongoose (enum origin, limits kind/op, name requerido).
router.put("/equipmentsheet/:deviceType", checkAuth, async (req, res) => {
  try {
    const grants = req.userData.grants || [];
    if (!grants.some(g => g.role === 'superadmin')) {
      return res.status(403).json({ status: "error", error: "forbidden: superadmin only" });
    }
    const { deviceType } = req.params;
    const upd = req.body.newEquipmentSheet;
    if (!upd) return res.status(400).json({ status: "error", error: "newEquipmentSheet es requerido" });
    if (upd.deviceType && upd.deviceType !== deviceType) {
      return res.status(400).json({ status: "error", error: "el deviceType es el identificador y no se puede renombrar (creá otra ficha)" });
    }
    const sheet = await EquipmentSheet.findOne({ deviceType });
    if (!sheet) return res.status(404).json({ status: "error", error: "equipmentSheet not found" });

    // deviceType y createdTime NO se tocan. version se bumpea (auditoría simple).
    if ('manufacturer' in upd) sheet.manufacturer = upd.manufacturer;
    if ('model' in upd) sheet.model = upd.model;
    if ('origin' in upd) sheet.origin = upd.origin;
    if ('domain' in upd) sheet.domain = upd.domain || '';   // DEC-REF-108 F2 (#80): dominio → tabs del sitio
    if (Array.isArray(upd.variables)) sheet.variables = upd.variables;
    sheet.version = (Number(sheet.version) || 1) + 1;
    await sheet.save();
    return res.json({ status: "success", deviceType: sheet.deviceType, version: sheet.version });
  } catch (error) {
    console.log("ERROR UPDATING EQUIPMENT SHEET"); console.log(error);
    return res.status(500).json({ status: "error", error: error.message || error });
  }
});

router.get("/equipmentsheet/:deviceType", checkAuth, async (req, res) => {
  try {
    const sheet = await EquipmentSheet.findOne({ deviceType: req.params.deviceType }).lean();
    if (!sheet) return res.status(404).json({ status: "error", error: "equipmentSheet not found" });
    return res.json({ status: "success", data: sheet });
  } catch (error) {
    console.log("ERROR GETTING EQUIPMENT SHEET"); console.log(error);
    return res.status(500).json({ status: "error", error });
  }
});

// DELETE — superadmin only. Guarda de referencia (espejo de templates.js:107-118):
// una ficha referenciada por templates o rulepacks NO se borra (409 con conteos) —
// borrarla dejaría packs apuntando a un deviceType fantasma y la consola S5 dando
// 400 sin causa visible. El PUT de edición existe desde DEC-REF-111 (campos
// whitelisteados arriba, línea ~102); la fijación de versión sigue diferida
// (Fork III de DEC-REF-92 — referencia viva).
router.delete("/equipmentsheet/:deviceType", checkAuth, async (req, res) => {
  try {
    const grants = req.userData.grants || [];
    if (!grants.some(g => g.role === 'superadmin')) {
      return res.status(403).json({ status: "error", error: "forbidden: superadmin only" });
    }
    const { deviceType } = req.params;
    const sheet = await EquipmentSheet.findOne({ deviceType });
    if (!sheet) return res.status(404).json({ status: "error", error: "equipmentSheet not found" });

    const templateCount = await Template.countDocuments({ deviceType });
    const packCount = await RulePack.countDocuments({ deviceType });
    if (templateCount > 0 || packCount > 0) {
      return res.status(409).json({
        status: "error",
        error: `equipmentSheet '${deviceType}' está referenciada por ${templateCount} template(s) y ${packCount} pack(s) — elimine esas referencias primero`
      });
    }
    await EquipmentSheet.deleteOne({ deviceType });
    return res.json({ status: "success" });
  } catch (error) {
    console.log("ERROR DELETING EQUIPMENT SHEET"); console.log(error);
    return res.status(500).json({ status: "error", error: error.message || error });
  }
});

module.exports = router;
