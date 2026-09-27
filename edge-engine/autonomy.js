// DEC-REF-115 (#85) — AUTONOMÍA CALCULADA POR LA PLATAFORMA.
//
// Las controladoras reales no garantizan `autonomy_hours` (reversa de
// DEC-REF-108 F4 — dato crítico, Franco). El edge la deriva y la publica
// como variable de PRIMERA CLASE:
//
//   autonomy_hours = fuelLevel[%] × tankCapacity / 100 / consumptionLph
//
// Fuentes de config (Mongo, recargadas por el canal SF-3 junto a los packs):
//   EquipmentSheet.autonomy  — por MODELO (fuelVariable, tankCapacity,
//                              consumptionLph). Sin bloque → SIN cálculo:
//                              la plataforma no inventa autonomía sin
//                              parámetros (el widget muestra "sin dato").
//   Device.autonomy          — override PARCIAL por equipo instalado (el
//                              tanque es de la instalación, no del modelo);
//                              cada campo pisa al de la ficha si > 0.
//
// Publicación: {userId}/{dId}/autonomy_hours/sdata con { value, save:1 } —
// mismo shape que los devices (device.js del simulador): el saver-webhook la
// persiste en `data`, el browser la recibe por su suscripción +/sdata y el
// motor la procesa como variable normal (alarmable con reglas D/S).
//
// Anti-loop: el edge está suscrito a '+/+/+/sdata' y recibe su propia
// publicación, pero el cálculo solo dispara cuando variable === fuelVariable
// (≠ 'autonomy_hours') — no hay realimentación.

// Acceso por driver crudo (no models): los models de app/api usan import
// (Babel) y los RO inline de siteState.js no declaran `autonomy`; con el
// driver no hay schema que pise campos.
const mongoose = require('mongoose');

const AUTONOMY_VARIABLE = 'autonomy_hours';

// loadAutonomyConfigs(siteId) → Map<dId, { fuelVariable, tankCapacity,
// consumptionLph, userId }>. Devices sin config quedan FUERA del mapa.
async function loadAutonomyConfigs(siteId) {
  const db = mongoose.connection.db;

  const site = await db.collection('sites').findOne({ siteCode: siteId });
  const dIds = (site && site.devices) || [];
  if (dIds.length === 0) return new Map();

  const devices = await db.collection('devices')
    .find({ dId: { $in: dIds } })
    .project({ dId: 1, deviceType: 1, userId: 1, autonomy: 1 })
    .toArray();

  const types = [...new Set(devices.map(d => d.deviceType).filter(Boolean))];
  const sheets = types.length
    ? await db.collection('equipmentsheets')
        .find({ deviceType: { $in: types } })
        .project({ deviceType: 1, autonomy: 1 })
        .toArray()
    : [];
  const sheetByType = {};
  for (const s of sheets) sheetByType[s.deviceType] = s;

  const configs = new Map();
  for (const d of devices) {
    const sheetCfg = ((sheetByType[d.deviceType] || {}).autonomy) || null;
    if (!sheetCfg || !sheetCfg.fuelVariable) continue;

    // Override parcial del equipo instalado: pisa solo si > 0.
    const ov = d.autonomy || {};
    const tankCapacity   = Number(ov.tankCapacity)   > 0 ? Number(ov.tankCapacity)   : Number(sheetCfg.tankCapacity);
    const consumptionLph = Number(ov.consumptionLph) > 0 ? Number(ov.consumptionLph) : Number(sheetCfg.consumptionLph);
    if (!(tankCapacity > 0) || !(consumptionLph > 0)) continue;  // config a medias = sin cálculo

    configs.set(d.dId, {
      fuelVariable: sheetCfg.fuelVariable,
      tankCapacity,
      consumptionLph,
      userId: d.userId,
    });
  }
  return configs;
}

// maybePublishAutonomy({ client, configs, dId, variable, value }) — si el
// mensaje es la variable de combustible de un device con config, calcula y
// publica autonomy_hours. Fire-and-forget con log en error (espejo del
// patrón publishEdgeReload del backend).
function maybePublishAutonomy({ client, configs, dId, variable, value }) {
  const cfg = configs.get(dId);
  if (!cfg || variable !== cfg.fuelVariable) return false;
  if (!cfg.userId) return false;

  const fuel = Number(value);
  if (!Number.isFinite(fuel)) return false;

  const hours = Math.round((fuel * cfg.tankCapacity / 100 / cfg.consumptionLph) * 10) / 10;
  const topic = `${cfg.userId}/${dId}/${AUTONOMY_VARIABLE}/sdata`;
  client.publish(topic, JSON.stringify({ value: hours, save: 1 }), { qos: 0 }, (err) => {
    if (err) console.error(`[autonomy] Publish FALLÓ (${dId} ${AUTONOMY_VARIABLE}=${hours}h): ${err.message}`);
  });
  return true;
}

module.exports = { loadAutonomyConfigs, maybePublishAutonomy, AUTONOMY_VARIABLE };
