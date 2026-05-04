const express = require("express");
const router = express.Router();
const { checkAuth } = require("../middlewares/authentication.js");

import Site   from "../models/site.js";
import Device from "../models/device.js";

const TIPO_ENUM             = ['BTS', 'shelter', 'repeater'];
const ALLOWED_UPDATE_FIELDS = ['nombre', 'lat', 'lng', 'direccion', 'provincia',
                               'localidad', 'tipo', 'cellOwner', 'notes'];


//GET SITES
router.get("/site", checkAuth, async (req, res) => {
  try {
    const userId = req.userData._id;
    let sites = await Site.find({ userId });
    sites = JSON.parse(JSON.stringify(sites));
    return res.json({ status: "success", data: sites });
  } catch (error) {
    console.log("ERROR GETTING SITES");
    console.log(error);
    return res.status(500).json({ status: "error", error });
  }
});

//NEW SITE
router.post("/site", checkAuth, async (req, res) => {
  try {
    const userId  = req.userData._id;
    const newSite = req.body.newSite;

    if (!newSite || !newSite.siteCode || !newSite.nombre || !newSite.tipo || !newSite.cellOwner) {
      return res.status(400).json({ status: "error", error: "siteCode, nombre, tipo and cellOwner are required" });
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
