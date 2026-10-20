const mongoose = require('mongoose');
const { Schema } = mongoose;
const RulePack = require('../app/api/models/rule_pack');
const { validateCrossTree } = require('./evaluators/typeCross');
// spec_cascada_ficha C2 — umbrales por referencia a la ficha (fuente única con la API).
const { resolveRule } = require('../app/api/services/limitRef');

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
  const packs = await RulePack.find({ canary: false, enabled: { $ne: false } }).lean();
  if (packs.length === 0) {
    console.warn('[siteState] No hay RulePacks en producción — motor sin reglas.');
  }

  // spec_cascada_ficha C2 — fichas para resolver condition.limitRef (solo si hay refs).
  let sheetsByType = null;
  if (packs.some(p => JSON.stringify(p.rules || []).includes('"limitRef"'))) {
    const sheets = await mongoose.connection.db.collection('equipmentsheets')
      .find({}).project({ deviceType: 1, variables: 1 }).toArray();
    sheetsByType = new Map(sheets.map(s => [s.deviceType, s]));
  }

  for (const pack of packs) {
    // DEC-REF-121 (spec_interruptor_enabled) — reglas fuera de circulación: excluidas
    // antes del filtro cross. El reload (reloadState.js) las ve como `removed` → cierre
    // limpio de la alarma activa. Un pack enabled:false ya no entró (query de arriba).
    pack.rules = pack.rules.filter(r => r.enabled !== false);
    // spec_cascada_ficha C2 — resolver umbrales de ficha. Sin límite ⇒ regla NEUTRA
    // (descartada con aviso): nunca evaluar contra un umbral inventado.
    if (sheetsByType) {
      pack.rules = pack.rules.map(r => {
        const { rule, unresolved } = resolveRule(r, sheetsByType);
        if (unresolved.length) {
          console.warn(`[siteState] pack ${pack.packId}: regla ${r.ruleId} descartada — umbral de ficha inexistente: ${unresolved.join(', ')}`);
          return null;
        }
        return rule;
      }).filter(Boolean);
    }
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

// spec_perfiles_controladora — límites propios del equipo, en cascada:
//   equipo (device.limitOverrides) > perfil de su controladora (profile.limits) > ficha.
// Se guardan en deviceState._limits[`variable|kind|dir`] = { op, value, from } y los usa
// effectiveCondition (typeD.js). _unavailable = mediciones que la controladora no tiene.
// Perfil asignado pero inexistente → se loguea y se sigue con la ficha (nunca rompe).
function applyDeviceProfile(st, device, profile) {
  const lims = {};
  const put = (l, from) => {
    if (!l || !l.variable || !l.kind || !Number.isFinite(Number(l.value))) return;
    const dir = l.op === 'lt' || l.op === 'lte' ? 'lt' : 'gt';
    lims[`${l.variable}|${l.kind}|${dir}`] = { op: l.op, value: Number(l.value), from };
  };
  if (device.profileId && !profile) console.warn(`[siteState] ${device.dId}: perfil «${device.profileId}» no existe — se usan los límites de la ficha`);
  if (profile) for (const l of (profile.limits || [])) put(l, `perfil ${profile.profileId}`);
  for (const l of (device.limitOverrides || [])) put(l, 'equipo');   // el equipo pisa al perfil
  if (Object.keys(lims).length) st._limits = lims; else delete st._limits;
  const un = (profile && profile.unavailable) || [];
  if (un.length) st._unavailable = [...un]; else delete st._unavailable;
  st._profileId = device.profileId || null;
}

// refreshRefParams(siteId, siteState) — spec_umbral_por_referencia / cascada C3.
// Vuelca device.refParams como pseudo-variables del device (deviceState[param]).
// Boot y CADA reload (PUT /device/refparams publica reload). Las claves que se
// sacaron del device se borran del estado (deviceState._refKeys).
async function refreshRefParams(siteId, siteState) {
  const db = mongoose.connection.db;
  const site = await db.collection('sites').findOne({ siteCode: siteId });
  const dIds = (site && site.devices) || [];
  if (!dIds.length) return 0;
  const devs = await db.collection('devices').find({ dId: { $in: dIds } }).project({ dId: 1, refParams: 1, profileId: 1, limitOverrides: 1 }).toArray();
  // spec_perfiles_controladora — perfiles de las controladoras asignadas a estos equipos.
  const pids = [...new Set(devs.map((d) => d.profileId).filter(Boolean))];
  const profiles = new Map(pids.length
    ? (await db.collection('controllerprofiles').find({ profileId: { $in: pids } }).project({ profileId: 1, limits: 1, unavailable: 1 }).toArray()).map((p) => [p.profileId, p])
    : []);
  let n = 0;
  for (const d of devs) {
    const st = siteState.get(d.dId);
    if (!st) continue;
    applyDeviceProfile(st, d, profiles.get(d.profileId));
    for (const k of (st._refKeys || [])) delete st[k];
    const keys = [];
    for (const [k, v] of Object.entries(d.refParams || {})) {
      const num = Number(v);
      if (Number.isFinite(num) && num > 0) { st[k] = num; keys.push(k); n++; }
    }
    st._refKeys = keys;
  }
  return n;
}

module.exports = {
  applyDeviceProfile, refreshRefParams, loadPacks, hydrateSiteState };
