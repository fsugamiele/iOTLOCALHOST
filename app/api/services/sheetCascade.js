// spec_cascada_ficha.md · C1 (firmada por Franco 2026-10-14) — Ficha → Template.
//
// Fuente ÚNICA de la derivación "variable de ficha → campos del widget". La usan:
//   · routes/equipmentsheets.js — PUT de ficha PROPAGA a los templates (Q1).
//   · routes/templates.js       — POST/PUT calculan `widgets[].overrides` (Q3).
//   · tools/sync_auditoria_p0   — misma lógica que la cascada (no hay dos).
// Puro (sin DB).
//
// Campos heredables (los nombres son los del widget):
//   unit · factoryRange · deadband · thresholds (desde limits) · variableSendFreq (desde cadence)
// Un campo listado en `widget.overrides` NO se pisa (lo fijó el template a propósito).

const INHERITABLE = ['unit', 'factoryRange', 'deadband', 'thresholds', 'variableSendFreq'];

// "60s" | "60" | "5m" | "1h" | 60 → segundos (null si no parsea)
function parseCadence(c) {
  if (typeof c === 'number') return c > 0 ? c : null;
  if (typeof c !== 'string') return null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(s|seg|m|min|h)?\s*$/i.exec(c);
  if (!m) return null;
  const n = Number(m[1]);
  const u = (m[2] || 's').toLowerCase();
  const sec = u.startsWith('h') ? n * 3600 : u.startsWith('m') ? n * 60 : n;
  return sec > 0 ? Math.round(sec) : null;
}

// limits → thresholds del widget. lt/lte: warning→warningLow, trip→criticalLow;
// gt/gte: warning→warningHigh, trip→criticalHigh. Solo límites numéricos.
function thresholdsFrom(limits) {
  const t = {};
  for (const l of limits || []) {
    if (typeof l.value !== 'number' || !Number.isFinite(l.value)) continue;
    if (l.when) continue;   // condicionado (ej. "solo en marcha"): el widget no puede evaluarlo
    if (['lt', 'lte'].includes(l.op)) t[l.kind === 'trip' ? 'criticalLow' : 'warningLow'] = l.value;
    if (['gt', 'gte'].includes(l.op)) t[l.kind === 'trip' ? 'criticalHigh' : 'warningHigh'] = l.value;
  }
  return Object.keys(t).length ? t : undefined;
}

// Valores que la ficha DEFINE para una variable (undefined = la ficha no dice nada
// de ese campo → no se hereda ni se considera override).
function deriveWidgetFields(v) {
  const out = {};
  if (v.unit !== undefined && v.unit !== null) out.unit = v.unit;
  if (v.factoryRange) out.factoryRange = v.factoryRange;
  if (typeof v.deadband === 'number' && Number.isFinite(v.deadband)) out.deadband = v.deadband;
  const th = thresholdsFrom(v.limits);
  if (th) out.thresholds = th;
  const f = parseCadence(v.cadence);
  if (f) out.variableSendFreq = f;
  return out;
}

const plain = (x) => (x && typeof x.toObject === 'function' ? x.toObject() : x);
const sortKeys = (o) => Array.isArray(o) ? o.map(sortKeys)
  : (o && typeof o === 'object') ? Object.keys(o).sort().reduce((a, k) => (o[k] !== undefined && (a[k] = sortKeys(o[k])), a), {}) : o;
const same = (a, b) => JSON.stringify(sortKeys(plain(a) ?? null)) === JSON.stringify(sortKeys(plain(b) ?? null));

// computeOverrides(widget, sheetVar) → campos en los que el widget DIFIERE de lo
// que define la ficha (= el template los pisó). Usado al guardar un template.
function computeOverrides(w, sheetVar) {
  if (!sheetVar) return [];
  const d = deriveWidgetFields(sheetVar);
  return Object.keys(d).filter((k) => w[k] !== undefined && w[k] !== null && !same(w[k], d[k]));
}

// applySheetToWidgets(widgets, sheet) → { widgets, changes: [{variable, fields}] }
// Copia los campos heredables de la ficha a cada widget de esa ficha, respetando
// `overrides`. También alinea `sources[].unit` de widgets multi-fuente.
function applySheetToWidgets(widgets, sheet) {
  const byName = new Map((sheet.variables || []).map((v) => [v.name, plain(v)]));
  const changes = [];
  const out = (widgets || []).map((w0) => {
    const w = { ...plain(w0) };
    const v = byName.get(w.variable);
    const fields = [];
    if (v) {
      const d = deriveWidgetFields(v);
      const ov = new Set(w.overrides || []);
      for (const k of Object.keys(d)) {
        if (ov.has(k)) continue;
        if (!same(w[k], d[k])) { w[k] = d[k]; fields.push(k); }
      }
    }
    if (Array.isArray(w.sources)) {
      w.sources = w.sources.map((s0) => {
        const s = { ...plain(s0) };
        const sv = byName.get(s.variable);
        if (sv && sv.unit !== undefined && s.unit !== sv.unit) { s.unit = sv.unit; fields.push(`sources.${s.variable}.unit`); }
        return s;
      });
    }
    if (fields.length) changes.push({ variable: w.variable || w.widget, fields });
    return w;
  });
  return { widgets: out, changes };
}

module.exports = { INHERITABLE, parseCadence, thresholdsFrom, deriveWidgetFields, computeOverrides, applySheetToWidgets };
