const express = require("express");
const router = express.Router();
const { checkAuth } = require("../middlewares/authentication.js");
const PanelLayout = require("../models/panel_layout.js");

// DEC-REF-101 D-8/D-9 (#76) — persistencia del Panel diseñable por usuario.
// El layout es POR USUARIO (req.userData._id), no por scope ni por tenant:
// dos usuarios del mismo scope pueden disponer el Panel distinto.
// El Panel es personalizable: widgets atómicos del catálogo (VALID_WIDGET_IDS)
// + pineadas dinámicas pin-<dId>::<i> con config en settings.pinned[].
// El backend valida forma y límites, no semántica de widgets.

// Catálogo de widgets atómicos del Panel (nocWidgets.js en el front —
// mantener sincronizado). Los ids legacy 'kpis'|'sites'|'alarms' fueron
// reemplazados al desagregar las tarjetas en indicadores individuales.
const VALID_WIDGET_IDS = [
  "kpi-sites", "kpi-diesel", "kpi-alerts", "kpi-uptime",
  "map", "sites-table", "trend", "alarms-feed", "alarms-hist",
];
const VALID_REFRESH_SEC = [10, 30, 60, 300];
const VALID_WINDOWS = ["24h", "7d", "30d"];
const MAX_TITLE = 80;

// Panel personalizable (widgets pineados desde Sitios): el NOC acepta, además
// de sus 4 tarjetas de catálogo, ítems dinámicos `pin-<dId>::<índice>` con su
// config congelada en settings.pinned[]. Mantener VALID_PINNED_TYPES
// sincronizada con app/components/Widgets/widgetRegistry.js.
const PIN_ID_RE = /^pin-[A-Za-z0-9_\-]{1,40}::\d{1,3}$/;
const VALID_PINNED_TYPES = [
  "numeric", "counter", "numberchart", "indicator", "switch", "button",
  "valueStatus", "tankLevel", "multiState", "projectedAutonomy",
  "dataFreshness", "booleanDwell", "equipmentAlarms", "activeRecommendation",
  "powerCascade", "siteMap", "dcPlant",
];
const NOC_MAX_ITEMS = 60;      // 9 NOC + ~50 pineadas
const MAX_PINNED = 50;
const MAX_PINNED_CONFIG_BYTES = 4096;
const isPinId = (id) => PIN_ID_RE.test(id);

// DEC-REF-107 (Paso 4): el panel del SITIO reusa /panellayout con dashboard
// `site-<siteCode>`. A diferencia del NOC (4 widgets fijos), sus ítems son
// dinámicos (`<dId>::<i>`), así que se valida FORMA y GEOMETRÍA, no el catálogo
// de widgets. El NOC (dashboard 'noc' u otro no-site) sigue estricto.
const SITE_MAX_ITEMS = 200;
const MAX_I_LEN = 120;
const isSiteDash = (d) => typeof d === "string" && d.startsWith("site-");

function validateLayout(layout, dashboard) {
  const site = isSiteDash(dashboard);
  const noc = dashboard === "noc";
  const maxItems = site ? SITE_MAX_ITEMS : (noc ? NOC_MAX_ITEMS : VALID_WIDGET_IDS.length);
  if (!Array.isArray(layout) || layout.length > maxItems) return "layout inválido";
  for (const it of layout) {
    if (!it || typeof it.i !== "string" || !it.i || it.i.length > MAX_I_LEN) return "widget desconocido en layout";
    if (!site && !VALID_WIDGET_IDS.includes(it.i) && !(noc && isPinId(it.i))) return "widget desconocido en layout";
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
    // Panel personalizable: settings.pinned[] guarda el snapshot de cada
    // widget pineado desde un Sitio (config completa + identidad de fuente).
    if (id === "pinned" && dashboard === "noc") {
      const err = validatePinned(s);
      if (err) return err;
      continue;
    }
    const pinSettings = dashboard === "noc" && isPinId(id);
    if (!VALID_WIDGET_IDS.includes(id) && !pinSettings) return `settings de widget desconocido: ${id}`;
    if (typeof s !== "object" || s === null || Array.isArray(s)) return "settings de widget inválido";
    if (s.title != null && (typeof s.title !== "string" || s.title.length > MAX_TITLE)) return "title inválido";
    if (pinSettings) {
      if (s.refreshSec != null || s.window != null) return "settings de tarjeta pineada inválido";
      continue;
    }
    if (s.refreshSec != null && !VALID_REFRESH_SEC.includes(s.refreshSec)) return "refreshSec inválido";
    if (s.window != null && !VALID_WINDOWS.includes(s.window)) return "window inválida";
  }
  return null;
}

function validatePinned(pinned) {
  if (!Array.isArray(pinned) || pinned.length > MAX_PINNED) return "pinned inválido";
  const seen = new Set();
  for (const p of pinned) {
    if (!p || typeof p !== "object" || Array.isArray(p)) return "pinned: entrada inválida";
    if (!isPinId(p.i || "")) return "pinned: id inválido";
    if (seen.has(p.i)) return "pinned: id duplicado";
    seen.add(p.i);
    for (const k of ["dId", "userId", "siteCode"]) {
      if (typeof p[k] !== "string" || !p[k] || p[k].length > 60) return `pinned: ${k} inválido`;
    }
    if (!p.widget || typeof p.widget !== "object" || Array.isArray(p.widget)) return "pinned: widget inválido";
    if (!VALID_PINNED_TYPES.includes(p.widget.widget)) return "pinned: tipo de widget desconocido";
    if (JSON.stringify(p.widget).length > MAX_PINNED_CONFIG_BYTES) return "pinned: config demasiado grande";
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
