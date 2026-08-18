const express = require("express");
const router = express.Router();
const { checkAuth } = require("../middlewares/authentication.js");
import EquipmentSheet from "../models/equipment_sheet.js";

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

module.exports = router;
