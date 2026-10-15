const express = require("express");
const router = express.Router();
const { checkAuth } = require("../middlewares/authentication.js");
import EquipmentSheet from "../models/equipment_sheet.js";
import Template from "../models/template.js";
const RulePack = require("../models/rule_pack.js");
const { extractFromPdf } = require("../services/sheetExtractor.js");
const { validateSheetContent } = require("../services/sheetValidation.js");  // auditoría 2026-10-14 (F-05)
const { applySheetToWidgets } = require("../services/sheetCascade.js");     // spec_cascada_ficha C1
const { collectRuleRefs } = require("../services/ruleValidation.js");
const { refsToLimit } = require("../services/limitRef.js");   // spec_cascada_ficha C2

// spec_cascada_ficha C1 — quién usa cada variable de un deviceType (templates y
// reglas). Base de las guardas de borrado de variable (§6 #3) y cambio de unidad (Q4).
async function dependentsOf(deviceType, varNames) {
  const want = new Set(varNames);
  const out = new Map([...want].map(v => [v, { templates: [], rules: [] }]));
  const templates = await Template.find({ deviceType }).lean();
  for (const t of templates) {
    for (const w of t.widgets || []) {
      if (want.has(w.variable)) out.get(w.variable).templates.push(t.name);
      for (const src of w.sources || []) if (want.has(src.variable)) out.get(src.variable).templates.push(t.name);
    }
  }
  const packs = await RulePack.find({}).lean();
  for (const p of packs) {
    for (const ref of collectRuleRefs(p)) {
      if (ref.deviceType === deviceType && want.has(ref.variable)) out.get(ref.variable).rules.push(`${ref.ruleId} (${p.packId})`);
    }
  }
  for (const v of out.values()) { v.templates = [...new Set(v.templates)]; v.rules = [...new Set(v.rules)]; }
  return out;
}

// DEC-REF-115 (#85) — el edge recarga su config de autonomía por el mismo
// canal de control SF-3 que los packs (payload ignorado, DEC-REF-61.c).
// Fire-and-forget: si el publish falla, el próximo reload eventual la toma.
const RELOAD_TOPIC_BROADCAST = 'wanomi/edge/all/reload';
function publishEdgeReload(context) {
  if (!global.mqttClient || !global.mqttClient.connected) {
    console.warn(`[equipmentsheets] Reload NO publicado (${context}) — global.mqttClient no conectado`);
    return;
  }
  global.mqttClient.publish(RELOAD_TOPIC_BROADCAST, '{}', { qos: 1 }, (err) => {
    if (err) console.error(`[equipmentsheets] Reload publish FALLÓ (${context}): ${err.message}`);
  });
}

// DEC-REF-115 (#85) — guarda del bloque autonomy: o completo y válido o null
// (la plataforma no calcula con parámetros a medias).
function validateAutonomy(a) {
  if (a === null || a === undefined) return null;  // limpiar = válido
  if (!a.fuelVariable || !(Number(a.tankCapacity) > 0) || !(Number(a.consumptionLph) > 0)) {
    return 'autonomy incompleta: fuelVariable, tankCapacity>0 y consumptionLph>0 son requeridos (o enviá autonomy:null para limpiar)';
  }
  // spec_autonomy_extendido — campos opcionales de la fuente 'metered' y de marcha por config.
  if ('flowVariable' in a && a.flowVariable != null) {
    if (typeof a.flowVariable !== 'string' || !a.flowVariable.trim()) return 'autonomy: flowVariable, si se envía, debe ser un nombre de variable no vacío';
    if (a.flowVariable === a.fuelVariable) return 'autonomy: flowVariable no puede ser igual a fuelVariable (son sensores distintos)';
  }
  if ('flowScale' in a && a.flowScale != null && !(Number(a.flowScale) > 0)) {
    return 'autonomy: flowScale, si se envía, debe ser > 0';
  }
  if ('runningVariable' in a && a.runningVariable != null) {
    if (typeof a.runningVariable !== 'string' || !a.runningVariable.trim()) return 'autonomy: runningVariable, si se envía, debe ser un nombre de variable no vacío';
  }
  // Auditoría 2026-10-14 (M-01/M-02/F-13) — parámetros del estimador 'measured'.
  for (const k of ['windowHours', 'minRunMinutes', 'minDropPct']) {
    if (k in a && a[k] != null && !(Number(a[k]) > 0)) return `autonomy: ${k}, si se envía, debe ser > 0`;
  }
  if ('runningThreshold' in a && a.runningThreshold != null && !Number.isFinite(Number(a.runningThreshold))) {
    return 'autonomy: runningThreshold, si se envía, debe ser numérico';
  }
  return null;
}

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
    // DEC-REF-115 (#85): misma guarda que el PUT — autonomy completa o null.
    if ('autonomy' in newSheet) {
      const err = validateAutonomy(newSheet.autonomy);
      if (err) return res.status(400).json({ status: "error", error: err });
      if (!newSheet.autonomy) delete newSheet.autonomy;
    }
    const contentErr = validateSheetContent(newSheet);   // auditoría 2026-10-14 (F-05)
    if (contentErr) return res.status(400).json({ status: "error", error: contentErr });
    const sheet = await EquipmentSheet.create(newSheet);
    // Auditoría 2026-10-14 (F-21) — una ficha nueva con autonomía también recarga el edge.
    if (sheet.autonomy && sheet.autonomy.fuelVariable) publishEdgeReload(`POST ${sheet.deviceType}`);
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
    if (Array.isArray(upd.variables)) {
      const oldVars = new Map(sheet.variables.map(v => [v.name, v]));
      const newVars = new Map(upd.variables.map(v => [v.name, v]));
      // spec_cascada_ficha §6 #3 — no se borra una variable que usa un template o una regla.
      const removed = [...oldVars.keys()].filter(n => !newVars.has(n));
      if (removed.length) {
        const deps = await dependentsOf(deviceType, removed);
        const used = [...deps.entries()].filter(([, d]) => d.templates.length || d.rules.length);
        if (used.length) {
          return res.status(409).json({ status: "error", error:
            `No se pueden quitar variables en uso: ` + used.map(([n, d]) =>
              `${n} (templates: ${d.templates.join(', ') || '—'}; reglas: ${d.rules.join(', ') || '—'})`).join(' · ') });
        }
      }
      // spec_cascada_ficha Q4 — cambio de UNIDAD: bloqueado salvo confirmUnitChange.
      // El equipo/driver tiene que publicar en la unidad nueva: la plataforma no
      // puede convertir lo que manda el device.
      const unitChanged = [...newVars.values()].filter(v => {
        const o = oldVars.get(v.name);
        return o && o.unit && (v.unit || '') !== o.unit;
      });
      if (unitChanged.length) {
        const deps = await dependentsOf(deviceType, unitChanged.map(v => v.name));
        const detail = unitChanged.map(v => {
          const d = deps.get(v.name);
          return `${v.name}: ${oldVars.get(v.name).unit} → ${v.unit || '(sin unidad)'} (templates: ${d.templates.join(', ') || '—'}; reglas: ${d.rules.join(', ') || '—'})`;
        });
        if (!upd.confirmUnitChange) {
          return res.status(409).json({ status: "error", code: "UNIT_CHANGE", error:
            `Cambio de unidad: ${detail.join(' · ')}. El equipo debe publicar en la unidad nueva. ` +
            `Los templates se actualizan solos; las reglas con valor fijo hay que revisarlas. Reenviar con confirmUnitChange:true para confirmar.` });
        }
        res.locals.unitWarnings = detail;
        res.locals.unitChangedVars = new Set(unitChanged.map(v => v.name));
      }
      // spec_cascada_ficha C2 (§6 #2) — no se borra un límite que una regla referencia
      // (limitRef). Cambiar su VALOR sí se puede: es justamente la cascada.
      const packsAll = await RulePack.find({}).lean();
      const lost = [];
      for (const [name, o] of oldVars) {
        const nv = newVars.get(name);
        for (const l of (o.limits || [])) {
          const still = nv && (nv.limits || []).some(x => x.kind === l.kind && x.op === l.op);
          if (still) continue;
          const users = refsToLimit(packsAll, deviceType, name, l.kind, l.op);
          if (users.length) lost.push(`${name} ${l.kind} ${l.op} (reglas: ${users.join(', ')})`);
        }
      }
      if (lost.length) {
        return res.status(409).json({ status: "error", error: `No se pueden quitar límites que usan reglas: ${lost.join(' · ')}. Cambiá el valor en vez de borrarlo, o pasá esas reglas a valor fijo.` });
      }
      sheet.variables = upd.variables;
    }
    // DEC-REF-115 (#85): parámetros del cálculo de autonomía de la plataforma.
    // Auditoría 2026-10-14 (F-04): MERGE campo a campo — antes el bloque se
    // reemplazaba entero y un form que solo conocía 3 campos borraba
    // flowVariable/flowScale/runningVariable en silencio. `autonomy:null` sigue
    // siendo la única forma de limpiar el bloque.
    if ('autonomy' in upd) {
      const prev = sheet.autonomy ? (sheet.autonomy.toObject ? sheet.autonomy.toObject() : sheet.autonomy) : {};
      const merged = upd.autonomy === null ? null : { ...prev, ...upd.autonomy };
      const err = validateAutonomy(merged);
      if (err) return res.status(400).json({ status: "error", error: err });
      sheet.autonomy = merged || undefined;
    }
    const contentErr = validateSheetContent({
      deviceType,
      variables: sheet.variables.map(v => (v.toObject ? v.toObject() : v)),
      autonomy: sheet.autonomy ? (sheet.autonomy.toObject ? sheet.autonomy.toObject() : sheet.autonomy) : null,
    });
    if (contentErr) return res.status(400).json({ status: "error", error: contentErr });
    sheet.version = (Number(sheet.version) || 1) + 1;
    await sheet.save();
    // DEC-REF-115 (#85): si cambió la config de autonomía, el edge recarga.
    // Auditoría 2026-10-14: el edge ahora también lee variables[].type de la ficha
    // (normalización de entrada) → recargar también si cambiaron las variables.
    if ('autonomy' in upd || Array.isArray(upd.variables)) publishEdgeReload(`PUT ${deviceType}`);

    // spec_cascada_ficha C1 (Q1) — PROPAGAR al escribir: cada template de este
    // deviceType toma unit/factoryRange/deadband/thresholds/variableSendFreq de la
    // ficha, salvo los campos que el widget pisó (`overrides`). Un template que no
    // valida no frena la ficha: se informa en `propagationErrors`.
    const propagated = [], propagationErrors = [];
    if (Array.isArray(upd.variables)) {
      const templates = await Template.find({ deviceType });
      const ucv = res.locals.unitChangedVars || new Set();
      for (const t of templates) {
        // Q4 — un widget que PISÓ umbrales de una variable cuya unidad cambió queda
        // con números en la unidad vieja: se avisa (no se convierte a ciegas).
        for (const w of t.widgets || []) {
          if (ucv.has(w.variable) && (w.overrides || []).length) {
            res.locals.unitWarnings.push(`template ${t.name}: widget ${w.variable} tiene valores propios (${w.overrides.join(', ')}) en la unidad anterior — revisarlos`);
          }
        }
        const { widgets, changes } = applySheetToWidgets(t.widgets, sheet);
        if (!changes.length) continue;
        try {
          t.widgets = widgets;
          await t.save();
          propagated.push({ template: t.name, changes });
        } catch (e) {
          propagationErrors.push({ template: t.name, error: e.message });
        }
      }
    }
    return res.json({ status: "success", deviceType: sheet.deviceType, version: sheet.version,
      propagated, propagationErrors, unitWarnings: res.locals.unitWarnings || [] });
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
