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
// #88 — variables derivadas para el widget enriquecido (Franco): consumo usado
// (nominal u observado) y litros restantes. Que el usuario entienda el número.
const AUTONOMY_LPH_VARIABLE = 'autonomy_lph';
const AUTONOMY_LITERS_VARIABLE = 'autonomy_liters';
// spec_deteccion_sifoneo_eficiencia — consumo que IMPLICA la caída del tanque (L/h),
// publicado SIEMPRE que sea computable (en marcha, ≥2 muestras, pendiente<0), gane la
// fuente que gane. Es el segundo testigo para el cruce de divergencia contra fuel_rate
// (medidor): tanque cae más rápido que el medidor = sifoneo / caudalímetro averiado.
const CONSUMPTION_TANK_VARIABLE = 'consumption_tank';

// Ventana empírica: 6 h de historial de fuel. Corta para reaccionar a
// cambios de régimen, larga para absorber ruido de lectura. Con ≤2 muestras
// en marcha no hay pendiente confiable → fallback nominal.
const EMPIRICAL_WINDOW_MS = 6 * 3600 * 1000;
const EMPIRICAL_MIN_SAMPLES = 2;
// Debounce de publicación por equipo: como mucho 1 publicación cada 60 s
// (salvo cambio de fuente). La pendiente es una integral — recalcularla en
// cada mensaje de fuel no aporta resolución.
const PUBLISH_MIN_INTERVAL_MS = 60 * 1000;
// Alias comunes de la variable de marcha, FALLBACK cuando la ficha no declara
// `runningVariable` (spec_autonomy_extendido). Si la ficha la declara, gana ella
// y estos alias se ignoran.
const RUNNING_ALIASES = ['genset_running', 'gen_running', 'engine_running', 'running', 'motor_running'];
// Frescura del caudal para la fuente 'metered' (spec_autonomy_extendido): una
// lectura de caudalímetro más vieja que esto NO se usa (cae a 'measured'). 2× el
// latido normal (≤5 min) da margen sin arrastrar un dato muerto.
const FLOW_FRESH_MS = 10 * 60 * 1000;

// Estado en memoria por equipo: historial de fuel + flag de marcha + debounce.
// Se limpia entero en cada reload (los configs pueden haber cambiado).
const deviceRuntime = new Map();

function runtimeFor(dId) {
  let rt = deviceRuntime.get(dId);
  if (!rt) {
    rt = { samples: [], running: null, lastPublishTs: 0, lastSource: null, lastFlow: null };
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
      // spec_autonomy_extendido — fuente 'metered' + marcha por config (nombres
      // de variable = del modelo, sin override por equipo). flowScale default 1.
      flowVariable: sheetCfg.flowVariable || null,
      flowScale: Number(sheetCfg.flowScale) > 0 ? Number(sheetCfg.flowScale) : 1,
      runningVariable: sheetCfg.runningVariable || null,
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

// computeAndPublish — decide la FUENTE (jerarquía de 3, spec_autonomy_extendido)
// con el nivel de fuel actual, aplica debounce y publica. NO muta rt.samples (el
// historial se maneja en el path de fuel). Devuelve true si publicó.
//   1. metered   — caudalímetro directo: cfg.flowVariable con lectura fresca,
//                  grupo en marcha y caudal > 0. observedCons = flow × flowScale.
//   2. measured  — pendiente del tanque en marcha, sin repostaje (DEC-REF-115).
//   3. estimated — nominal de la ficha (fallback).
function computeAndPublish(client, cfg, rt, dId, fuel, now) {
  // Consumo por pendiente del tanque (L/h). Se calcula SIEMPRE que sea computable
  // (spec_deteccion_sifoneo_eficiencia): lo usa (a) la fuente `measured` y (b) la
  // publicación de `consumption_tank` para el cruce de divergencia, gane quien gane.
  let tankCons = null;
  {
    const prev = rt.samples.length > 1 ? rt.samples[rt.samples.length - 2].value : null;
    const refueled = prev !== null && fuel - prev > 1;
    if (!refueled && rt.running === 1) {
      const inMarcha = rt.samples.filter(s => s.run === 1);
      if (inMarcha.length >= EMPIRICAL_MIN_SAMPLES) {
        const slope = slopePerMs(inMarcha);   // %/ms, negativo al consumir
        if (slope < 0) {
          // consumoObservado [unidad_tanque/h] = −slope[%/h] × tank / 100
          const observedCons = (-(slope * 3600 * 1000)) * cfg.tankCapacity / 100;
          if (observedCons > 0) tankCons = observedCons;
        }
      }
    }
  }

  let hours = null;
  let source = 'estimated';
  let lph = cfg.consumptionLph;                        // consumo usado (default nominal)

  // 1. metered — el dato exacto del sensor manda si está fresco y el grupo anda.
  if (cfg.flowVariable && rt.lastFlow && rt.running === 1 &&
      (now - rt.lastFlow.ts) <= FLOW_FRESH_MS) {
    const observed = rt.lastFlow.value * (cfg.flowScale > 0 ? cfg.flowScale : 1);
    if (observed > 0) {
      hours = Math.round((fuel * cfg.tankCapacity / 100 / observed) * 10) / 10;
      source = 'metered';
      lph = observed;
    }
  }

  // 2. measured — inferencia por pendiente sobre tramos EN MARCHA (si no hubo metered).
  if (hours === null && tankCons !== null) {
    hours = Math.round((fuel * cfg.tankCapacity / 100 / tankCons) * 10) / 10;
    source = 'measured';
    lph = tankCons;                                      // consumo OBSERVADO
  }

  // 3. Fallback nominal (declarado en ficha/dispositivo).
  if (hours === null) {
    hours = Math.round((fuel * cfg.tankCapacity / 100 / cfg.consumptionLph) * 10) / 10;
    source = 'estimated';
  }

  // Debounce: 1 publicación/min por equipo; el cambio de fuente siempre publica.
  const sourceChanged = rt.lastSource !== null && rt.lastSource !== source;
  if (!sourceChanged && now - rt.lastPublishTs < PUBLISH_MIN_INTERVAL_MS) return false;
  rt.lastPublishTs = now;
  rt.lastSource = source;

  const liters = Math.round(fuel * cfg.tankCapacity / 100 * 10) / 10;   // litros restantes
  publishVar(client, cfg.userId, dId, AUTONOMY_VARIABLE, hours);
  publishVar(client, cfg.userId, dId, AUTONOMY_SOURCE_VARIABLE, source);
  publishVar(client, cfg.userId, dId, AUTONOMY_LPH_VARIABLE, Math.round(lph * 100) / 100);
  publishVar(client, cfg.userId, dId, AUTONOMY_LITERS_VARIABLE, liters);
  // consumption_tank — segundo testigo para divergencia. Solo si es computable.
  if (tankCons !== null) {
    publishVar(client, cfg.userId, dId, CONSUMPTION_TANK_VARIABLE, Math.round(tankCons * 100) / 100);
  }
  return true;
}

// maybeComputeAutonomy({ client, configs, dId, variable, value, eventTs })
// Punto de entrada desde el handler de mensajes. Devuelve true si publicó.
function maybeComputeAutonomy({ client, configs, dId, variable, value, eventTs }) {
  const cfg = configs.get(dId);
  if (!cfg || !cfg.userId) return false;

  const now = eventTs != null ? eventTs : Date.now();
  const rt = runtimeFor(dId);

  // 1. Marcha del grupo: por config (runningVariable) o, si la ficha no la declara,
  //    por la lista de alias. Si runningVariable está seteada, los alias se ignoran
  //    (spec §6 caso #7). No publica nada.
  const isRunningSignal = cfg.runningVariable
    ? variable === cfg.runningVariable
    : RUNNING_ALIASES.includes(variable);
  if (isRunningSignal) {
    const v = value === true || value === 'RUNNING' ? 1 : Number(value);
    if (Number.isFinite(v)) rt.running = v ? 1 : 0;
    return false;
  }

  // 2. Caudalímetro (fuente 'metered'): guardar la última lectura y RE-DISPARAR el
  //    cálculo con el último fuel conocido (spec §6 caso #11). Sin fuel previo,
  //    solo guarda y espera el primer fuel (caso #12).
  if (cfg.flowVariable && variable === cfg.flowVariable) {
    const f = Number(value);
    if (Number.isFinite(f)) rt.lastFlow = { value: f, ts: now };
    if (rt.samples.length === 0) return false;
    const lastFuel = rt.samples[rt.samples.length - 1].value;
    return computeAndPublish(client, cfg, rt, dId, lastFuel, now);
  }

  if (variable !== cfg.fuelVariable) return false;
  const fuel = Number(value);
  if (!Number.isFinite(fuel)) return false;

  // 3. Acumular historial de fuel (ventana deslizante de 6 h). Cada muestra se
  //    etiqueta con el estado de marcha AL LLEGAR: la regresión solo usa muestras
  //    con run===1 (un grupo apagado no consume; mezclar reposo aplana la pendiente).
  //    Salto positivo (repostaje) → descartar el historial previo.
  const prevFuel = rt.samples.length ? rt.samples[rt.samples.length - 1].value : null;
  const refueled = prevFuel !== null && fuel - prevFuel > 1;
  rt.samples.push({ ts: now, value: fuel, run: rt.running });
  rt.samples = rt.samples.filter(p => p.ts >= now - EMPIRICAL_WINDOW_MS);
  if (refueled) rt.samples = [{ ts: now, value: fuel, run: rt.running }];  // reiniciar historial post-repostaje

  return computeAndPublish(client, cfg, rt, dId, fuel, now);
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
  AUTONOMY_LPH_VARIABLE,
  AUTONOMY_LITERS_VARIABLE,
  CONSUMPTION_TANK_VARIABLE,
};
