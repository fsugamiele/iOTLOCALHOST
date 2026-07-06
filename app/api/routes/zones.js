const express = require("express");
const router = express.Router();
const { checkAuth } = require("../middlewares/authentication.js");
const { buildReadFilter, buildWriteFilter } = require("../middlewares/scope.js");

import Zone from "../models/zone.js";
import Site from "../models/site.js";

// GET ZONES — gate por buildReadFilter('Zone'). Sin grants (Zone es DENY-fallback,
// DEC-REF-54) → 0-match filter.
router.get("/zone", checkAuth, async (req, res) => {
  try {
    const filter = await buildReadFilter(req, 'Zone');
    const zones = await Zone.find(filter).lean();
    return res.json({ status: "success", data: zones });
  } catch (error) {
    console.log("ERROR GETTING ZONES");
    console.log(error);
    return res.status(500).json({ status: "error", error });
  }
});

// NEW ZONE (DEC-REF-54)
// Auth: espejo de POST /site. Superadmin todo; grants con scope deben cubrir
// operatorCode (y zoneCode si el grant lo especifica); sin grants → 403.
router.post("/zone", checkAuth, async (req, res) => {
  try {
    const newZone = req.body.newZone;
    if (!newZone || !newZone.zoneCode || !newZone.displayName || !newZone.operatorCode) {
      return res.status(400).json({ status: "error", error: "zoneCode, displayName y operatorCode son requeridos" });
    }

    // Auth check — espejo del criterio de POST /site. Superadmin siempre;
    // otros deben tener un grant cuyo scope cubra operatorCode (+ zoneCode si
    // el grant lo especifica).
    const grants = req.userData.grants || [];
    const isSuperadmin = grants.some(g => g.role === 'superadmin');
    if (!isSuperadmin) {
      const okGrant = grants.some(g => {
        if (!g.scope || !g.scope.operatorCode) return false;
        if (g.scope.operatorCode !== newZone.operatorCode) return false;
        if (g.scope.zoneCode && g.scope.zoneCode !== newZone.zoneCode) return false;
        return true;
      });
      if (!okGrant) {
        return res.status(403).json({ status: "error", error: "forbidden: grant does not cover this operator/zone" });
      }
    }

    newZone.createdTime = Date.now();
    const zone = await Zone.create(newZone);
    return res.json({ status: "success", zoneCode: zone.zoneCode, operatorCode: zone.operatorCode });
  } catch (error) {
    console.log("ERROR CREATING ZONE");
    console.log(error);
    return res.status(500).json({ status: "error", error: error.message || error });
  }
});

// UPDATE ZONE (displayName editable; zoneCode/operatorCode inmutables — identidad)
router.put("/zone", checkAuth, async (req, res) => {
  try {
    const body = req.body.zone || {};
    const { zoneCode, operatorCode, displayName } = body;
    if (!zoneCode || !operatorCode) {
      return res.status(400).json({ status: "error", error: "zoneCode y operatorCode son requeridos" });
    }
    if (!displayName) {
      return res.status(400).json({ status: "error", error: "no updatable fields provided" });
    }

    const writeFilter = await buildWriteFilter(req, 'Zone');
    const result = await Zone.updateOne(
      { ...writeFilter, zoneCode, operatorCode },
      { $set: { displayName } }
    );
    const matched = (result.matchedCount != null) ? result.matchedCount : result.n;
    if (matched === 0) {
      return res.status(403).json({ status: "error", error: "forbidden: grant does not cover this zone" });
    }
    return res.json({ status: "success" });
  } catch (error) {
    console.log("ERROR UPDATING ZONE");
    console.log(error);
    return res.status(500).json({ status: "error", error });
  }
});

// DELETE ZONE — rechaza si hay sites colgados de la zone (integridad referencial).
router.delete("/zone", checkAuth, async (req, res) => {
  try {
    const { zoneCode, operatorCode } = req.query;
    if (!zoneCode || !operatorCode) {
      return res.status(400).json({ status: "error", error: "zoneCode y operatorCode son requeridos" });
    }

    const writeFilter = await buildWriteFilter(req, 'Zone');
    const zone = await Zone.findOne({ ...writeFilter, zoneCode, operatorCode });
    if (!zone) {
      return res.status(404).json({ status: "error", error: "zone not found" });
    }

    // Integridad: no borrar zone con sites vivos.
    const siteCount = await Site.countDocuments({ operatorCode, zoneCode });
    if (siteCount > 0) {
      return res.status(409).json({
        status: "error",
        error: `zone has ${siteCount} sites, migre o borre esos sites primero`
      });
    }

    await Zone.deleteOne({ ...writeFilter, zoneCode, operatorCode });
    return res.json({ status: "success" });
  } catch (error) {
    console.log("ERROR DELETING ZONE");
    console.log(error);
    return res.status(500).json({ status: "error", error });
  }
});

module.exports = router;
