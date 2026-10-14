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

// Auditoría 2026-10-14 (M-01/M-02, decisión Franco) — estimador 'measured' por
// TRAMOS EN MARCHA. Antes: una sola regresión sobre las muestras run===1 de 6 h →
// el tiempo con el grupo apagado entre dos marchas quedaba dentro del eje x
// (autonomía ×4,7 sobreestimada) y 2 muestras bastaban (×20 subestimada, falso
// "autonomía crítica" + falso sifoneo). Ahora: consumo = Σ caída / Σ tiempo, sumando
// SOLO pares de muestras consecutivas de la MISMA marcha (runEpoch), con mínimos de
// tiempo en marcha y de caída. Parámetros editables en la FICHA (autonomy.*):
//   windowHours     — buffer: horas de MARCHA acumulada que se conservan (default 24)
//   minRunMinutes   — marcha válida mínima para confiar en 'measured' (default 45)
//   minDropPct      — caída mínima de nivel en esa marcha, en % (default 2 = 2× deadband 1 %)
//   runningThreshold— valor numérico de la variable de marcha por encima del cual
//                     el grupo "anda" (default 0; rpm → 300, DEC-REF-56)
const DEFAULT_WINDOW_HOURS = 24;
const DEFAULT_MIN_RUN_MINUTES = 45;
const DEFAULT_MIN_DROP_PCT = 2;
const SAMPLES_HARD_CAP = 5000;                    // tope de memoria por equipo
const SAMPLES_MAX_AGE_MS = 7 * 24 * 3600 * 1000;  // tope de antigüedad (wall clock)
// Plausibilidad para usar 'measured' como AUTONOMÍA: el consumo observado debe caer
// en [nominal/4, nominal×3]. Fuera de eso cae a 'estimated' (el dato del tanque es
// sospechoso). consumption_tank se publica IGUAL: un robo es justamente consumo
// implausible y la regla de divergencia lo tiene que ver.
const PLAUSIBLE_MAX_FACTOR = 3;
const PLAUSIBLE_MIN_FACTOR = 0.25;
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
    rt = { samples: [], running: null, runEpoch: 0, lastPublishTs: 0, lastSource: null, lastFlow: null };
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
      runningThreshold: Number.isFinite(Number(sheetCfg.runningThreshold)) ? Number(sheetCfg.runningThreshold) : 0,
      windowHours:   Number(sheetCfg.windowHours)   > 0 ? Number(sheetCfg.windowHours)   : DEFAULT_WINDOW_HOURS,
      minRunMinutes: Number(sheetCfg.minRunMinutes) > 0 ? Number(sheetCfg.minRunMinutes) : DEFAULT_MIN_RUN_MINUTES,
      minDropPct:    Number(sheetCfg.minDropPct)    > 0 ? Number(sheetCfg.minDropPct)    : DEFAULT_MIN_DROP_PCT,
      userId: d.userId,
    });
  }
  return configs;
}

// Pendiente por regresión lineal simple, en %/ms. Misma primitiva que el
// motor M (typeM.slopePerMin) pero sobre %/ms para no re-escalar.
// runningConsumption(samples, cfg) → { ok, pctPerHour, runMs, dropPct }
// Suma SOLO pares consecutivos de la misma marcha (mismo runEpoch, ambos run===1).
// Usa la caída NETA (incluye subidas chicas de ruido) para no sesgar hacia arriba.
function runningConsumption(samples, cfg) {
  let runMs = 0, dropPct = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    if (a.run !== 1 || b.run !== 1 || a.epoch !== b.epoch) continue;
    const dt = b.ts - a.ts;
    if (!(dt > 0)) continue;
    runMs += dt;
    dropPct += a.value - b.value;
  }
  const minRunMs = (cfg.minRunMinutes || DEFAULT_MIN_RUN_MINUTES) * 60 * 1000;
  const minDrop  = cfg.minDropPct || DEFAULT_MIN_DROP_PCT;
  if (runMs < minRunMs || dropPct < minDrop) return { ok: false, runMs, dropPct, pctPerHour: null };
  return { ok: true, runMs, dropPct, pctPerHour: dropPct / (runMs / 3600000) };
}

// trimSamples — conserva hasta `windowHours` de MARCHA acumulada (pares válidos),
// más los topes duros de antigüedad y cantidad.
function trimSamples(samples, cfg, now) {
  let out = samples.filter(p => p.ts >= now - SAMPLES_MAX_AGE_MS);
  if (out.length > SAMPLES_HARD_CAP) out = out.slice(out.length - SAMPLES_HARD_CAP);
  const budget = (cfg.windowHours || DEFAULT_WINDOW_HOURS) * 3600000;
  let acc = 0, cut = 0;
  for (let i = out.length - 1; i > 0; i--) {
    const a = out[i - 1], b = out[i];
    if (a.run === 1 && b.run === 1 && a.epoch === b.epoch) acc += b.ts - a.ts;
    if (acc > budget) { cut = i; break; }
  }
  return cut > 0 ? out.slice(cut) : out;
}

// isRunningValue — criterio ÚNICO de marcha (M-18): bool, número > umbral, o string
// de estado (mismo listado que typeM.isActive: STOPPED/OFF/IDLE/… = parado).
function isRunningValue(value, threshold) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return Number.isFinite(value) ? (value > (threshold || 0) ? 1 : 0) : null;
  if (typeof value === 'string') {
    const s = value.trim().toUpperCase();
    if (s === '') return null;
    const n = Number(s);
    if (Number.isFinite(n)) return n > (threshold || 0) ? 1 : 0;
    return ['STOPPED', 'OFF', 'IDLE', 'STOP', 'FALSE', 'NO', 'AUTO'].includes(s) ? 0 : 1;
  }
  return null;
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
      const est = runningConsumption(rt.samples, cfg);
      if (est && est.ok) {
        // consumoObservado [unidad_tanque/h] = caída[%] / tiempo[h] × tank / 100
        tankCons = est.pctPerHour * cfg.tankCapacity / 100;
      }
    }
  }
  const tankPlausible = tankCons !== null &&
    tankCons <= cfg.consumptionLph * PLAUSIBLE_MAX_FACTOR &&
    tankCons >= cfg.consumptionLph * PLAUSIBLE_MIN_FACTOR;

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
  if (hours === null && tankPlausible) {
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
    const v = isRunningValue(value, cfg.runningThreshold);
    if (v !== null) {
      if (v === 1 && rt.running !== 1) rt.runEpoch++;   // nueva marcha → nuevo tramo
      rt.running = v;
    }
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
  const sample = { ts: now, value: fuel, run: rt.running, epoch: rt.runEpoch };
  rt.samples.push(sample);
  rt.samples = trimSamples(rt.samples, cfg, now);
  if (refueled) rt.samples = [sample];  // reiniciar historial post-repostaje

  return computeAndPublish(client, cfg, rt, dId, fuel, now);
}

// resetAutonomyRuntime(dIds?) — reload SF-3. Auditoría 2026-10-14 (M-24): con un
// buffer de hasta 24 h de marcha, borrar TODO en cada reload (cualquier PUT de pack)
// tiraba horas de aprendizaje. Ahora: sin argumento borra todo (compat); con lista,
// solo esos equipos (los que cambiaron de config).
function resetAutonomyRuntime(dIds) {
  if (!dIds) { deviceRuntime.clear(); return; }
  for (const d of dIds) deviceRuntime.delete(d);
}

// changedAutonomyDIds(prev, next) → dIds cuya config de autonomía cambió o desapareció.
function changedAutonomyDIds(prev, next) {
  const out = [];
  const keys = new Set([...prev.keys(), ...next.keys()]);
  for (const k of keys) {
    if (JSON.stringify(prev.get(k) || null) !== JSON.stringify(next.get(k) || null)) out.push(k);
  }
  return out;
}

module.exports = {
  loadAutonomyConfigs,
  maybeComputeAutonomy,
  resetAutonomyRuntime,
  changedAutonomyDIds,
  runningConsumption,
  isRunningValue,
  AUTONOMY_VARIABLE,
  AUTONOMY_SOURCE_VARIABLE,
  AUTONOMY_LPH_VARIABLE,
  AUTONOMY_LITERS_VARIABLE,
  CONSUMPTION_TANK_VARIABLE,
};
