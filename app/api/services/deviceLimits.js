// spec_perfiles_controladora — contexto de umbrales POR EQUIPO, compartido por el motor (edge
// siteState) y la simulación del QA (qa/lib/simulate.js, qa/lib/backtest.js): así la prueba de una
// regla con datos reales usa el mismo umbral que el motor en vivo. Puro salvo loadDeviceContexts.
//
// Cascada de límites: equipo (device.limitOverrides) > perfil de su controladora (profile.limits) > ficha.
// Se guardan en deviceState._limits[`variable|kind|dir`] = { op, value, from } y los usa
// effectiveCondition (edge-engine/evaluators/typeD.js). _unavailable = mediciones que la
// controladora no tiene. Perfil asignado pero inexistente → aviso y se sigue con la ficha.
// spec L1 — por debajo del perfil: el valor de la ficha para la tecnología de batería del equipo
// (device.batteryTech, ej. LiFePO4) cuando el límite lo trae (limits[].byBatteryTech).
// Cascada completa: equipo > perfil > ficha según tecnología de batería > ficha.
function applyDeviceProfile(st, device, profile, sheet) {
  const lims = {};
  const put = (l, from) => {
    if (!l || !l.variable || !l.kind || !Number.isFinite(Number(l.value))) return;
    const dir = l.op === 'lt' || l.op === 'lte' ? 'lt' : 'gt';
    lims[`${l.variable}|${l.kind}|${dir}`] = { op: l.op, value: Number(l.value), from };
  };
  if (device.batteryTech && sheet) {
    for (const v of (sheet.variables || [])) for (const l of (v.limits || [])) {
      const t = l.byBatteryTech && l.byBatteryTech[device.batteryTech];
      if (t && Number.isFinite(Number(t.value))) put({ variable: v.name, kind: l.kind, op: l.op, value: t.value }, `batería ${device.batteryTech}`);
    }
  }
  if (device.profileId && !profile) console.warn(`[deviceLimits] ${device.dId}: perfil «${device.profileId}» no existe — se usan los límites de la ficha`);
  if (profile) for (const l of (profile.limits || [])) put(l, `perfil ${profile.profileId}`);
  for (const l of (device.limitOverrides || [])) put(l, 'equipo');   // el equipo pisa al perfil
  if (Object.keys(lims).length) st._limits = lims; else delete st._limits;
  const un = (profile && profile.unavailable) || [];
  if (un.length) st._unavailable = [...un]; else delete st._unavailable;
  st._profileId = device.profileId || null;
}

// spec_cascada_ficha C3 — parámetros de la instalación (battery_nominal_v, rated_kw…) como
// pseudo-variables del equipo. Devuelve cuántos se cargaron.
function applyRefParams(st, device) {
  for (const k of (st._refKeys || [])) delete st[k];
  const keys = [];
  for (const [k, v] of Object.entries(device.refParams || {})) {
    const num = Number(v);
    if (Number.isFinite(num) && num > 0) { st[k] = num; keys.push(k); }
  }
  st._refKeys = keys;
  return keys.length;
}

// Carga de Mongo los equipos (refParams, perfil, límites propios) y aplica todo a siteState.
async function loadDeviceContexts(db, dIds, siteState) {
  if (!dIds.length) return 0;
  const devs = await db.collection('devices').find({ dId: { $in: dIds } }).project({ dId: 1, deviceType: 1, refParams: 1, profileId: 1, limitOverrides: 1, batteryTech: 1 }).toArray();
  const techTypes = [...new Set(devs.filter((d) => d.batteryTech).map((d) => d.deviceType).filter(Boolean))];
  const sheets = new Map(techTypes.length
    ? (await db.collection('equipmentsheets').find({ deviceType: { $in: techTypes } }).project({ deviceType: 1, variables: 1 }).toArray()).map((s) => [s.deviceType, s])
    : []);
  const pids = [...new Set(devs.map((d) => d.profileId).filter(Boolean))];
  const profiles = new Map(pids.length
    ? (await db.collection('controllerprofiles').find({ profileId: { $in: pids } }).project({ profileId: 1, limits: 1, unavailable: 1 }).toArray()).map((p) => [p.profileId, p])
    : []);
  let n = 0;
  for (const d of devs) {
    const st = siteState.get(d.dId);
    if (!st) continue;
    applyDeviceProfile(st, d, profiles.get(d.profileId), sheets.get(d.deviceType));
    n += applyRefParams(st, d);
  }
  return n;
}

module.exports = { applyDeviceProfile, applyRefParams, loadDeviceContexts };
