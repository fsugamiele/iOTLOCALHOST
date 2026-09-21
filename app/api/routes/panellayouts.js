const express = require("express");
const router = express.Router();
const { checkAuth } = require("../middlewares/authentication.js");
const PanelLayout = require("../models/panel_layout.js");

// DEC-REF-101 D-8/D-9 (#76) — persistencia del Panel diseñable por usuario.
// El layout es POR USUARIO (req.userData._id), no por scope ni por tenant:
// dos usuarios del mismo scope pueden disponer el Panel distinto.
// El widget set es fijo en esta v1 (D-10: los 4 componentes actuales del
// Panel) — el front valida contra su catálogo; el backend valida forma y
// límites, no semántica de widgets.

const VALID_WIDGET_IDS = ["kpis", "sites", "trend", "alarms"];
const VALID_REFRESH_SEC = [10, 30, 60, 300];
const VALID_WINDOWS = ["24h", "7d", "30d"];
const MAX_ITEMS = VALID_WIDGET_IDS.length;
const MAX_TITLE = 80;

// DEC-REF-107 (Paso 4): el panel del SITIO reusa /panellayout con dashboard
// `site-<siteCode>`. A diferencia del NOC (4 widgets fijos), sus ítems son
// dinámicos (`<dId>::<i>`), así que se valida FORMA y GEOMETRÍA, no el catálogo
// de widgets. El NOC (dashboard 'noc' u otro no-site) sigue estricto.
const SITE_MAX_ITEMS = 200;
const MAX_I_LEN = 120;
const isSiteDash = (d) => typeof d === "string" && d.startsWith("site-");

function validateLayout(layout, dashboard) {
  const site = isSiteDash(dashboard);
  const maxItems = site ? SITE_MAX_ITEMS : MAX_ITEMS;
  if (!Array.isArray(layout) || layout.length > maxItems) return "layout inválido";
  for (const it of layout) {
    if (!it || typeof it.i !== "string" || !it.i || it.i.length > MAX_I_LEN) return "widget desconocido en layout";
    if (!site && !VALID_WIDGET_IDS.includes(it.i)) return "widget desconocido en layout";
    for (const k of ["x", "y", "w", "h"]) {
      if (!Number.isFinite(it[k])) return `layout.${k} debe ser número`;
    }
    if (it.x < 0 || it.x > 11 || it.y < 0 || it.w < 1 || it.w > 12 || it.h < 1 || it.h > 60) {
      return "layout fuera de rango";
    }
  }
  return null;
}

function validateSettings(settings, dashboard) {
  if (settings == null) return null;
  if (typeof settings !== "object" || Array.isArray(settings)) return "settings inválido";
  // Site: settings libres (hoy sin uso por-widget). NOC: catálogo estricto.
  if (isSiteDash(dashboard)) return null;
  for (const [id, s] of Object.entries(settings)) {
    if (!VALID_WIDGET_IDS.includes(id)) return `settings de widget desconocido: ${id}`;
    if (typeof s !== "object" || s === null || Array.isArray(s)) return "settings de widget inválido";
    if (s.title != null && (typeof s.title !== "string" || s.title.length > MAX_TITLE)) return "title inválido";
    if (s.refreshSec != null && !VALID_REFRESH_SEC.includes(s.refreshSec)) return "refreshSec inválido";
    if (s.window != null && !VALID_WINDOWS.includes(s.window)) return "window inválida";
  }
  return null;
}

// GET /panellayout?dashboard=noc — data: null si el usuario nunca guardó
// (el front aplica su layout por defecto).
router.get("/panellayout", checkAuth, async (req, res) => {
  try {
    const dashboard = String(req.query.dashboard || "noc");
    const doc = await PanelLayout.findOne(
      { userId: req.userData._id, dashboard },
      { layout: 1, settings: 1, _id: 0 }
    ).lean();
    return res.json({ status: "success", data: doc ? { layout: doc.layout, settings: doc.settings || {} } : null });
  } catch (error) {
    console.log("ERROR GET /panellayout", error);
    return res.status(500).json({ status: "error", error: String(error && error.message || error) });
  }
});

// PUT /panellayout — upsert (crea o reemplaza) del layout del usuario.
router.put("/panellayout", checkAuth, async (req, res) => {
  try {
    const dashboard = String((req.body && req.body.dashboard) || "noc");
    const layout = req.body && req.body.layout;
    const settings = req.body && req.body.settings;
    const errLayout = validateLayout(layout, dashboard);
    if (errLayout) return res.status(400).json({ status: "error", error: errLayout });
    const errSettings = validateSettings(settings, dashboard);
    if (errSettings) return res.status(400).json({ status: "error", error: errSettings });

    const doc = await PanelLayout.findOneAndUpdate(
      { userId: req.userData._id, dashboard },
      { $set: { layout, settings: settings || {} } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    return res.json({ status: "success", data: { layout: doc.layout, settings: doc.settings } });
  } catch (error) {
    console.log("ERROR PUT /panellayout", error);
    return res.status(500).json({ status: "error", error: String(error && error.message || error) });
  }
});

// DELETE /panellayout?dashboard=noc — restablecer al layout por defecto
// (el front vuelve a su DEFAULT_LAYOUT cuando data es null).
router.delete("/panellayout", checkAuth, async (req, res) => {
  try {
    const dashboard = String(req.query.dashboard || "noc");
    await PanelLayout.deleteOne({ userId: req.userData._id, dashboard });
    return res.json({ status: "success", data: null });
  } catch (error) {
    console.log("ERROR DELETE /panellayout", error);
    return res.status(500).json({ status: "error", error: String(error && error.message || error) });
  }
});

module.exports = router;
