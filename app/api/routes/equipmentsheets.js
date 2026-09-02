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
// 400 sin causa visible. NO existe PUT: la ficha no se edita (DEC-REF-97 D-1;
// Fork III de DEC-REF-92 sigue diferido — referencia viva sin fijación de versión).
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
