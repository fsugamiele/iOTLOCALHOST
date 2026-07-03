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

async function loadPacks(siteId, siteState) {

  await DataRO.collection.createIndex(
    { dId: 1, variable: 1, time: -1 },
    { background: true, name: 'idx_data_reconstruct' }
  );

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

  const site = await SiteRO.findOne({ siteCode: siteId }).lean();
  if (!site) {
    console.warn(`[siteState] Site '${siteId}' no encontrado — siteState vacío.`);
    return { packs };
  }

  const dIds = site.devices || [];
  if (dIds.length === 0) {
    console.warn(`[siteState] Site '${siteId}' sin devices.`);
    return { packs };
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

    if (Object.keys(vars).length > 0) {
      vars._deviceType = deviceInfoMap[dId]?.deviceType || '';
      vars._userId     = deviceInfoMap[dId]?.userId     || '';
      vars._deviceName = deviceInfoMap[dId]?.name       || '';
      vars._siteCode   = siteId;
      siteState.set(dId, vars);
      hydrated++;
    }
  }

  console.log(`[siteState] Reconstruct: ${hydrated}/${dIds.length} devices hidratados (siteId: ${siteId})`);
  return { packs };
}

module.exports = { loadPacks };
