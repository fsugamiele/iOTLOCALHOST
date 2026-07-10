const mongoose = require('mongoose');
const { Schema } = mongoose;
const RulePack = require('../app/api/models/rule_pack');
const { validateCrossTree } = require('./evaluators/typeCross');

// Schemas inline — los de app/api/models/ usan import (Babel), no son require-ables
const SiteRO   = mongoose.models.SiteRO   || mongoose.model('SiteRO',
  new Schema({ siteCode: String, devices: [String] }, { collection: 'sites' }));
const DeviceRO = mongoose.models.DeviceRO || mongoose.model('DeviceRO',
  new Schema({ dId: String, deviceType: String, userId: String, name: String }, { collection: 'devices' }));
const DataRO   = mongoose.models.DataRO   || mongoose.model('DataRO',
  new Schema({ dId: String, variable: String, value: Schema.Types.Mixed, time: Number },
             { collection: 'data' }));

// loadPacks(siteId) — carga + filtro cross de packs. SIN hidratación (DEC-REF-61.e).
// El motor invoca esta función en boot Y en cada reload (SF-3, DEC-REF-58). El
// reload no toca siteState porque re-hidratar pisaría los valores vivos que se
// acumulan en runtime (deviceState[variable] = value en index.js:67) —
// hallazgo R4/B3.8. El siteId queda como parámetro por si un Hub futuro
// atiende varios sites y carga packs por site; hoy solo se usa para logs.
async function loadPacks(siteId) {
  const packs = await RulePack.find({ canary: false }).lean();
  if (packs.length === 0) {
    console.warn('[siteState] No hay RulePacks en producción — motor sin reglas.');
  }

  for (const pack of packs) {
    const before = pack.rules.length;
    pack.rules = pack.rules.filter(r => {
      if (r.type !== 'cross') return true;
      const v = validateCrossTree(r.crossExpr);
      if (v.ok) return true;
      if (v.reason === 'sum-pending') {
        console.warn(`[siteState] pack ${pack.packId}: regla cross ${r.ruleId} descartada — hoja de suma pendiente de implementación (DEC-REF-47)`);
      } else {
        console.warn(`[siteState] pack ${pack.packId}: regla cross ${r.ruleId} descartada por forma inválida — ${v.reason}`);
      }
      return false;
    });
    if (pack.rules.length !== before) {
      console.warn(`[siteState] pack ${pack.packId}: ${before - pack.rules.length} regla(s) cross descartada(s)`);
    }
  }

  return packs;
}

// hydrateSiteState(siteId, siteState) — hidratación inicial de siteState con
// los últimos 200 datos por device (reconstrucción del estado observable al
// arrancar). SOLO se invoca en boot. Reload NO la llama (DEC-REF-61.e).
async function hydrateSiteState(siteId, siteState) {
  // Índice de reconstrucción idempotente. Vive acá porque solo DataRO.find de
  // esta función lo usa; carrera con boot es imposible (boot es secuencial).
  await DataRO.collection.createIndex(
    { dId: 1, variable: 1, time: -1 },
    { background: true, name: 'idx_data_reconstruct' }
  );

  const site = await SiteRO.findOne({ siteCode: siteId }).lean();
  if (!site) {
    console.warn(`[siteState] Site '${siteId}' no encontrado — siteState vacío.`);
    return;
  }

  const dIds = site.devices || [];
  if (dIds.length === 0) {
    console.warn(`[siteState] Site '${siteId}' sin devices.`);
    return;
  }

  const devices = await DeviceRO.find({ dId: { $in: dIds } }, { dId: 1, deviceType: 1, userId: 1, name: 1 }).lean();
  const deviceInfoMap = {};
  for (const d of devices) deviceInfoMap[d.dId] = { deviceType: d.deviceType, userId: d.userId, name: d.name };

  let hydrated = 0;
  for (const dId of dIds) {
    const records = await DataRO.find({ dId }).sort({ time: -1 }).limit(200).lean();

    const vars = {};
    const seen = new Set();
    for (const rec of records) {
      if (!seen.has(rec.variable)) {
        vars[rec.variable] = rec.value;
        seen.add(rec.variable);
      }
      if (seen.size >= 100) break;
    }

    // SF-6 · DEC-REF-65.a — registrar el device al siteState AUNQUE no tenga
    // data histórica en `db.data`. Antes, el gate `if (Object.keys(vars).length > 0)`
    // dejaba fuera a devices nuevos → mensajes MQTT descartados por index.js:167
    // `if (!siteState.has(dId)) return;` → nunca guardaban data → círculo vicioso.
    // Ahora la metadata (_deviceType, _siteCode, etc.) siempre entra; las variables
    // llegan por mensajes MQTT vivos.
    vars._deviceType = deviceInfoMap[dId]?.deviceType || '';
    vars._userId     = deviceInfoMap[dId]?.userId     || '';
    vars._deviceName = deviceInfoMap[dId]?.name       || '';
    vars._siteCode   = siteId;
    siteState.set(dId, vars);
    if (Object.keys(records).length > 0 && Object.keys(vars).filter(k => !k.startsWith('_')).length > 0) {
      hydrated++;
    }
  }

  console.log(`[siteState] Reconstruct: ${hydrated}/${dIds.length} devices con data histórica (todos los ${dIds.length} registrados en siteState)`);
}

module.exports = { loadPacks, hydrateSiteState };
