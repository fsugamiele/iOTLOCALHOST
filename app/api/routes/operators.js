// CRUD de Operator — DEC-REF-97 D-3 (#72). Hasta acá el alta era escritura
// directa en Mongo (BACKLOG-TENANT-11); esta ruta cierra esa pata.
// operatorCode es identidad técnica inmutable (segmento de topic MQTT y ACL,
// DEC-REF-30) — no hay PUT: solo displayName sería mutable y se difiere hasta
// tener el caso (mismo criterio que la ficha sin edición, DEC-REF-97 D-1).
const express = require("express");
const router = express.Router();
const { checkAuth } = require("../middlewares/authentication.js");

import Operator from "../models/operator.js";
import Zone from "../models/zone.js";
import Site from "../models/site.js";

function isSuperadmin(req) {
  const grants = req.userData?.grants || [];
  return grants.some(g => g.role === 'superadmin');
}

// GET — lista completa para selectores de UI (alta de site, zona, grants).
// Dato de referencia, espejo del criterio D-1 de equipmentsheets: cualquier
// autenticado lee, solo superadmin escribe.
router.get("/operator", checkAuth, async (req, res) => {
  try {
    const operators = await Operator.find({}).lean();
    return res.json({ status: "success", data: operators });
  } catch (error) {
    console.log("ERROR GETTING OPERATORS");
    console.log(error);
    return res.status(500).json({ status: "error", error });
  }
});

// POST — superadmin only (idiom equipmentsheets.js:20-23, SIN fallback de grant).
// 409 por findOne previo (patrón D-2 — NO confiar en uniqueValidator, BACKLOG-API-2).
router.post("/operator", checkAuth, async (req, res) => {
  try {
    if (!isSuperadmin(req)) {
      return res.status(403).json({ status: "error", error: "forbidden: superadmin only" });
    }
    const newOperator = req.body.newOperator;                   // wrapper con clave nombrada (patrón de la casa)
    if (!newOperator || !newOperator.operatorCode || !newOperator.displayName) {
      return res.status(400).json({ status: "error", error: "operatorCode y displayName son requeridos" });
    }
    const existing = await Operator.findOne({ operatorCode: newOperator.operatorCode });
    if (existing) {
      return res.status(409).json({ status: "error", error: `operator '${newOperator.operatorCode}' ya existe` });
    }
    newOperator.createdTime = Date.now();                       // espejo de zones.js:50
    const operator = await Operator.create(newOperator);
    return res.json({ status: "success", operatorCode: operator.operatorCode });
  } catch (error) {
    console.log("ERROR CREATING OPERATOR");
    console.log(error);
    return res.status(500).json({ status: "error", error: error.message || error });
  }
});

// DELETE — superadmin only. Integridad referencial (espejo de zones.js:104-110):
// no borrar operator con zones o sites vivos.
router.delete("/operator", checkAuth, async (req, res) => {
  try {
    if (!isSuperadmin(req)) {
      return res.status(403).json({ status: "error", error: "forbidden: superadmin only" });
    }
    const { operatorCode } = req.query;
    if (!operatorCode) {
      return res.status(400).json({ status: "error", error: "operatorCode es requerido" });
    }
    const operator = await Operator.findOne({ operatorCode });
    if (!operator) {
      return res.status(404).json({ status: "error", error: "operator not found" });
    }
    const zoneCount = await Zone.countDocuments({ operatorCode });
    const siteCount = await Site.countDocuments({ operatorCode });
    if (zoneCount > 0 || siteCount > 0) {
      return res.status(409).json({
        status: "error",
        error: `operator tiene ${zoneCount} zones y ${siteCount} sites, migre o borre esos recursos primero`
      });
    }
    await Operator.deleteOne({ operatorCode });
    return res.json({ status: "success" });
  } catch (error) {
    console.log("ERROR DELETING OPERATOR");
    console.log(error);
    return res.status(500).json({ status: "error", error });
  }
});

module.exports = router;
