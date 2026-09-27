// DEC-REF-115 (#85) — AUTONOMÍA CALCULADA POR LA PLATAFORMA, v2 HÍBRIDA.
//
// Las controladoras reales no garantizan `autonomy_hours` (reversa de
// DEC-REF-108 F4 — dato crítico, Franco). El edge la deriva y la publica
// como variable de PRIMERA CLASE, con dos fuentes jerárquicas:
//
//   1. MEDIDA (empírica): pendiente de `fuel_level` por regresión lineal
//      sobre una ventana deslizante, calculada SOLO sobre tramos con el
//      grupo EN MARCHA (genset_running=1 — un grupo apagado no consume y
//      haría la pendiente ~0, "autonomía infinita" inútil). Se autopersonaliza
//      por equipo: cada uno aprende su consumo real de su propio historial.
//      autonomy_hours = fuelLevel% × tankCapacity / 100 / consumoObservado.
//      (consumoObservado = −pendiente × tanque / 100, en L/h o unidad tanque/h)
//
//   2. ESTIMADA (nominal, fallback): fuelLevel% × tankCapacity / 100 /
//      consumptionLph declarado. Se usa cuando no hay historial suficiente,
//      el grupo nunca anda, o repostaron (salto positivo de fuel).
//
// La variable hermana `autonomy_source` ('measured'|'estimated') se publica
// en cada cálculo para que la UI pueda mostrar el origen del número.
//
// Config (Mongo, recargada por el canal SF-3 junto a los packs):
//   EquipmentSheet.autonomy  — por MODELO (fuelVariable, tankCapacity,
//                              consumptionLph). Sin bloque → SIN cálculo:
//                              la plataforma no inventa autonomía sin
//                              parámetros (el widget muestra "sin dato").
//   Device.autonomy          — override PARCIAL por equipo instalado (el
//                              tanque es de la instalación, no del modelo);
//                              cada campo pisa al de la ficha si > 0.
//
// Publicación: {userId}/{dId}/{variable}/sdata con { value, save:1 } —
// mismo shape que los devices (device.js del simulador): el saver-webhook la
// persiste en `data`, el browser la recibe por su suscripción +/sdata y el
// motor la procesa como variable normal (alarmable con reglas D/S/M).
//
// Anti-loop: el edge está suscrito a '+/+/+/sdata' y recibe su propia
// publicación, pero el cálculo solo dispara con fuelVariable o con la
// variable de marcha (≠ 'autonomy_hours'/'autonomy_source').

const mongoose = require('mongoose');

const AUTONOMY_VARIABLE = 'autonomy_hours';
const AUTONOMY_SOURCE_VARIABLE = 'autonomy_source';

// Ventana empírica: 6 h de historial de fuel. Corta para reaccionar a
// cambios de régimen, larga para absorber ruido de lectura. Con ≤2 muestras
// en marcha no hay pendiente confiable → fallback nominal.
const EMPIRICAL_WINDOW_MS = 6 * 3600 * 1000;
const EMPIRICAL_MIN_SAMPLES = 2;
// Debounce de publicación por equipo: como mucho 1 publicación cada 60 s
// (salvo cambio de fuente). La pendiente es una integral — recalcularla en
// cada mensaje de fuel no aporta resolución.
const PUBLISH_MIN_INTERVAL_MS = 60 * 1000;
// Alias comunes de la variable de marcha (la ficha no la declara en el
// bloque autonomy; cubre los packs del seed).
const RUNNING_ALIASES = ['genset_running', 'gen_running', 'engine_running', 'running', 'motor_running'];

// Estado en memoria por equipo: historial de fuel + flag de marcha + debounce.
// Se limpia entero en cada reload (los configs pueden haber cambiado).
const deviceRuntime = new Map();

function runtimeFor(dId) {
  let rt = deviceRuntime.get(dId);
  if (!rt) {
    rt = { samples: [], running: null, lastPublishTs: 0, lastSource: null };
    deviceRuntime.set(dId, rt);
  }
  return rt;
}

// loadAutonomyConfigs(siteId) → Map<dId, { fuelVariable, tankCapacity,
// consumptionLph, userId }>. Devices sin config quedan FUERA del mapa.
// Acceso por driver crudo (no models): los models de app/api usan import
// (Babel) y los RO inline de siteState.js no declaran `autonomy`.
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

// Pendiente por regresión lineal simple, en %/ms. Misma primitiva que el
// motor M (typeM.slopePerMin) pero sobre %/ms para no re-escalar.
function slopePerMs(samples) {
  const n = samples.length;
  if (n < 2) return 0;
  const t0 = samples[0].ts;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of samples) {
    const x = p.ts - t0;
    const y = p.value;
    sx += x; sy += y; sxx += x * x; sxy += x * y;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return 0;
  return (n * sxy - sx * sy) / denom;
}

function publishVar(client, userId, dId, variable, value) {
  client.publish(
    `${userId}/${dId}/${variable}/sdata`,
    JSON.stringify({ value, save: 1 }),
    { qos: 0 },
    (err) => { if (err) console.error(`[autonomy] Publish FALLÓ (${dId} ${variable}=${value}): ${err.message}`); }
  );
}

// maybeComputeAutonomy({ client, configs, dId, variable, value, eventTs })
// Punto de entrada desde el handler de mensajes. Devuelve true si publicó.
function maybeComputeAutonomy({ client, configs, dId, variable, value, eventTs }) {
  const cfg = configs.get(dId);
  if (!cfg || !cfg.userId) return false;

  const now = eventTs != null ? eventTs : Date.now();
  const rt = runtimeFor(dId);

  // 1. Trackear marcha del grupo (alias comunes) — no publica nada.
  if (RUNNING_ALIASES.includes(variable)) {
    const v = value === true || value === 'RUNNING' ? 1 : Number(value);
    if (Number.isFinite(v)) rt.running = v ? 1 : 0;
    return false;
  }

  if (variable !== cfg.fuelVariable) return false;
  const fuel = Number(value);
  if (!Number.isFinite(fuel)) return false;

  // 2. Acumular historial de fuel (ventana deslizante de 6 h). Cada muestra
  //    se etiqueta con el estado de marcha AL LLEGAR: la regresión solo usa
  //    muestras con run===1 (un grupo apagado no consume; mezclar tramos en
  //    reposo aplana la pendiente y la autonomía sale infinita).
  rt.samples.push({ ts: now, value: fuel, run: rt.running });
  rt.samples = rt.samples.filter(p => p.ts >= now - EMPIRICAL_WINDOW_MS);

  // 3. Pendiente sobre tramos EN MARCHA. Salto positivo (repostaje) →
  //    descartar el historial previo: la pendiente pre-repostaje no sirve.
  let hours = null;
  let source = 'estimated';
  const prev = rt.samples.length > 1 ? rt.samples[rt.samples.length - 2].value : null;
  const refueled = prev !== null && fuel - prev > 1;

  if (!refueled && rt.running === 1) {
    const inMarcha = rt.samples.filter(s => s.run === 1);
    if (inMarcha.length >= EMPIRICAL_MIN_SAMPLES) {
      const slope = slopePerMs(inMarcha);   // %/ms, negativo al consumir
      if (slope < 0) {
        // consumoObservado [unidad_tanque/h] = −slope[%/h] × tank / 100
        const slopePerHour = slope * 3600 * 1000;
        const observedCons = (-slopePerHour) * cfg.tankCapacity / 100;
        if (observedCons > 0) {
          hours = Math.round((fuel * cfg.tankCapacity / 100 / observedCons) * 10) / 10;
          source = 'measured';
        }
      }
    }
  } else if (refueled) {
    rt.samples = [{ ts: now, value: fuel, run: rt.running }];  // reiniciar historial post-repostaje
  }

  // 4. Fallback nominal (declarado en ficha/dispositivo).
  if (hours === null) {
    hours = Math.round((fuel * cfg.tankCapacity / 100 / cfg.consumptionLph) * 10) / 10;
    source = 'estimated';
  }

  // 5. Debounce: 1 publicación/min por equipo; el cambio de fuente
  //    (estimated↔measured) siempre publica.
  const sourceChanged = rt.lastSource !== null && rt.lastSource !== source;
  if (!sourceChanged && now - rt.lastPublishTs < PUBLISH_MIN_INTERVAL_MS) return false;
  rt.lastPublishTs = now;
  rt.lastSource = source;

  publishVar(client, cfg.userId, dId, AUTONOMY_VARIABLE, hours);
  publishVar(client, cfg.userId, dId, AUTONOMY_SOURCE_VARIABLE, source);
  return true;
}

// resetAutonomyRuntime() — se invoca en el reload SF-3: las configs pueden
// haber cambiado y los historiales/debounce quedan obsoletos.
function resetAutonomyRuntime() {
  deviceRuntime.clear();
}

module.exports = {
  loadAutonomyConfigs,
  maybeComputeAutonomy,
  resetAutonomyRuntime,
  AUTONOMY_VARIABLE,
  AUTONOMY_SOURCE_VARIABLE,
};
