// Auditoría 2026-10-14 (M-07 / M-21) — normalización del valor de entrada según
// el `type` declarado en la FICHA del equipo (equipmentsheets.variables[].type).
//
// Problema que cierra: el motor recibía el payload crudo. `null` resolvía una
// alarma crítica activa, `""`/`false` se comparaban como 0 ("combustible
// crítico" falso), strings numéricos se concatenaban en las regresiones M (NaN)
// y `eq` fallaba entre `true` y `1`. La ficha ya declaraba el tipo; el motor no
// lo leía. Ahora la ficha es la fuente del tipo (cascada Ficha → motor).
//
// normalizeValue(raw, type) → { ok: true, value } | { ok: false, reason }
//   float|int    → número finito (acepta "54.5" y "54,5"); resto = calidad mala
//   bool         → 0/1 (true/false, "true"/"false", "on"/"off", 1/0, "1"/"0")
//   categorical  → string no vacío (trim)
//   sin tipo     → null/"" descartados; string numérico → número; resto tal cual
// Un valor con ok:false NO se evalúa NI resuelve nada (calidad mala ≠ condición
// despejada). El equipo sí cuenta como vivo (_lastSeen) — publicó algo.

const mongoose = require('mongoose');

const TRUE_STR  = new Set(['true', 'on', '1', 'yes', 'si', 'sí', 'running', 'open', 'abierta']);
const FALSE_STR = new Set(['false', 'off', '0', 'no', 'stopped', 'closed', 'cerrada']);

function toFiniteNumber(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string') {
    const s = raw.trim().replace(/^(-?\d+),(\d+)$/, '$1.$2');   // coma decimal argentina
    if (s === '' || !/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;   // boolean/objeto/null en una variable numérica = dato malo
}

// Tipos históricos que fichas.vue sigue ofreciendo → su equivalente canónico.
const TYPE_ALIAS = { number: 'float', string: 'categorical', boolean: 'bool' };

function normalizeValue(raw, type) {
  if (raw === null || raw === undefined) return { ok: false, reason: 'null' };
  type = TYPE_ALIAS[type] || type;
  switch (type) {
    case 'float':
    case 'int': {
      const n = toFiniteNumber(raw);
      return n === null ? { ok: false, reason: `no numérico (${JSON.stringify(raw)})` } : { ok: true, value: n };
    }
    case 'bool': {
      if (typeof raw === 'boolean') return { ok: true, value: raw ? 1 : 0 };
      if (typeof raw === 'number' && (raw === 0 || raw === 1)) return { ok: true, value: raw };
      if (typeof raw === 'string') {
        const s = raw.trim().toLowerCase();
        if (TRUE_STR.has(s))  return { ok: true, value: 1 };
        if (FALSE_STR.has(s)) return { ok: true, value: 0 };
      }
      return { ok: false, reason: `no booleano (${JSON.stringify(raw)})` };
    }
    case 'categorical': {
      const s = typeof raw === 'string' ? raw.trim() : (typeof raw === 'number' ? String(raw) : '');
      return s ? { ok: true, value: s } : { ok: false, reason: `categórico vacío (${JSON.stringify(raw)})` };
    }
    default: {
      // Sin ficha / sin type: conservador — solo se descarta lo inequívocamente vacío.
      if (raw === '') return { ok: false, reason: 'string vacío' };
      if (typeof raw === 'number' && !Number.isFinite(raw)) return { ok: false, reason: 'no finito' };
      if (typeof raw === 'string') {
        const n = toFiniteNumber(raw);
        if (n !== null) return { ok: true, value: n };
      }
      return { ok: true, value: raw };
    }
  }
}

// loadVariableTypes(siteId) → Map<deviceType, Map<variable, type>> de las fichas
// de los deviceTypes presentes en el site. Driver crudo (mismo patrón que autonomy.js).
async function loadVariableTypes(siteId) {
  const db = mongoose.connection.db;
  const site = await db.collection('sites').findOne({ siteCode: siteId });
  const dIds = (site && site.devices) || [];
  if (dIds.length === 0) return new Map();
  const devices = await db.collection('devices')
    .find({ dId: { $in: dIds } }).project({ deviceType: 1 }).toArray();
  const types = [...new Set(devices.map(d => d.deviceType).filter(Boolean))];
  if (types.length === 0) return new Map();
  const sheets = await db.collection('equipmentsheets')
    .find({ deviceType: { $in: types } }).project({ deviceType: 1, variables: 1 }).toArray();
  const out = new Map();
  for (const s of sheets) {
    const m = new Map();
    for (const v of (s.variables || [])) if (v && v.name) m.set(v.name, v.type || null);
    out.set(s.deviceType, m);
  }
  return out;
}

module.exports = { normalizeValue, loadVariableTypes, toFiniteNumber };
