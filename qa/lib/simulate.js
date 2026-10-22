'use strict';
// spec_editor_reglas_v2 — SIMULACIÓN de una regla (guardada o en edición) con los datos reales
// de las últimas N horas del sitio, usando el MISMO motor del edge (ruleEngine + GRAFCET).
// Es lo que muestra el editor en "Probar con las últimas 24 h" y en el gráfico de cada condición.
// READ-ONLY: no avisa a nadie, no escribe en Mongo, no publica por MQTT.
const mongoose = require('mongoose');

function edgeDir() {
  const cands = [process.env.EDGE_DIR, '/home/qa/edge-engine', '/home/edge/edge-engine', __dirname + '/../../edge-engine'].filter(Boolean);
  for (const d of cands) { try { require.resolve(d + '/ruleEngine'); return d; } catch (_) { /* siguiente */ } }
  throw new Error('no encuentro el motor del edge (seteá EDGE_DIR)');
}
let E = null;
function engine() {
  if (E) return E;
  const dir = edgeDir();
  // El motor importa `notify` al cargar: se reemplaza ANTES por uno mudo (la simulación nunca avisa).
  const nr = require(dir + '/notificationRouter');
  nr.notify = () => {};
  E = {
    RE: require(dir + '/ruleEngine'),
    createRuleFsm: require(dir + '/ruleFsm').createRuleFsm,
  };
  return E;
}

const { neededVars } = require('./backtest');
const MAX_HOURS = Number(process.env.QA_SIM_MAX_HOURS || 72);
const MAX_ROWS = Number(process.env.QA_SIM_MAX_ROWS || 300000);
const SAMPLES = Number(process.env.QA_SIM_SAMPLES || 300);
const TICK_MS = 5000;
const R_TO_STATE = { on: 'si', band: 'si', off: 'no' };

async function simulate({ rule, hours = 24 } = {}) {
  if (!rule || !rule.ruleId || !rule.type) return { error: 'falta la regla' };
  const { RE, createRuleFsm } = engine();
  const SITE = process.env.SITE_ID || 'CR00061';
  let H = Number(hours); if (!(H > 0)) H = 24; if (H > MAX_HOURS) H = MAX_HOURS;
  const db = mongoose.connection.db;
  // Umbrales de ficha (limitRef) resueltos igual que el motor. resolvePacksForRead REEMPLAZA los
  // objetos de pack.rules: hay que tomar la regla resuelta del pack, no la copia original (si no,
  // la condición queda sin número y la simulación nunca avisa).
  const holder = { rules: [JSON.parse(JSON.stringify(rule))] };
  await require('../../app/api/services/limitRef').resolvePacksForRead([holder], db);
  const r = holder.rules[0];
  if (r._limitRefUnresolved) return { error: 'la regla usa un límite de la ficha que no tiene valor cargado' };

  const site = await db.collection('sites').findOne({ siteCode: SITE });
  const dIds = (site && site.devices) || [];
  const devs = await db.collection('devices').find({ dId: { $in: dIds } }).project({ dId: 1, deviceType: 1, name: 1 }).toArray();
  const siteState = new Map();
  for (const d of devs) siteState.set(d.dId, { _deviceType: d.deviceType, _siteCode: SITE, _deviceName: d.name || d.dId, _lastUpdate: {} });
  // spec_perfiles_controladora — mismo umbral que el motor en vivo: valor del equipo > perfil de su
  // controladora > ficha, y los parámetros de instalación (batería 12/24 V).
  await require('../../app/api/services/deviceLimits').loadDeviceContexts(db, dIds, siteState);

  const { vars } = neededVars(r);
  const to = Date.now(), from = to - H * 3600000;
  const rows = vars.length ? await db.collection('data')
    .find({ dId: { $in: dIds }, variable: { $in: vars }, time: { $gte: from } })
    .project({ dId: 1, variable: 1, value: 1, time: 1 }).sort({ time: 1 }).limit(MAX_ROWS).toArray() : [];

  const avisos = [], cierres = [];
  const fsm = createRuleFsm({
    onNotify: (inst, ctx, now) => avisos.push({ key: inst.key, ts: now }),
    onResolve: (inst, ctx, now) => cierres.push({ key: inst.key, ts: now }),
  });
  const packs = [{ rules: [r] }];
  const ruleById = new Map([[r.ruleId, r]]);
  const st = { siteState, cooldownState: new Map(), windowState: new Map(), activeState: new Map(), mState: new Map(), fsm };

  // Muestreo: SAMPLES instantes repartidos en la ventana.
  const step = (to - from) / SAMPLES;
  const sampleTs = Array.from({ length: SAMPLES }, (_, i) => Math.round(from + (i + 1) * step));
  const series = new Map();   // key → { steps:[], leaves: Map(leafId → {values,states,threshold,...}) }
  const snap = (ts) => {
    for (const inst of fsm.instances.values()) {
      if (!series.has(inst.key)) series.set(inst.key, { dId: inst.dId, steps: [], leaves: new Map(), first: series.size === 0 ? 0 : null });
      const s = series.get(inst.key);
      const idx = sampleTs.indexOf(ts);
      while (s.steps.length < idx) s.steps.push('E1');
      s.steps.push(inst.step);
      const c = inst.lastCtx || {};
      const leaves = Array.isArray(c.leaves) ? c.leaves
        : [{ leafId: 'L1', state: inst.lastR == null ? 'sin' : (R_TO_STATE[inst.lastR] || 'no'), value: c.value != null ? c.value : null, threshold: c.thresholdUsed != null ? c.thresholdUsed : null }];
      for (const l of leaves) {
        if (!s.leaves.has(l.leafId)) s.leaves.set(l.leafId, { values: [], states: [], thresholds: [] });
        const L = s.leaves.get(l.leafId);
        while (L.values.length < idx) { L.values.push(null); L.states.push(null); L.thresholds.push(null); }
        L.values.push(typeof l.value === 'number' ? l.value : (l.value == null ? null : l.value));
        L.states.push(l.state || null); L.thresholds.push(l.threshold != null ? l.threshold : null);
      }
    }
  };

  let tick = from, si = 0;
  const advance = (until) => {
    while (tick + TICK_MS <= until) {
      tick += TICK_MS;
      RE.processCombinedTick({ packs, siteState, mState: st.mState, fsm, now: tick });
      fsm.tick(ruleById, tick);
      RE.processSilenceTick({ ruleById, siteState, fsm, silenceMs: 600000, startedAt: from, now: tick });
      RE.processWindowTick({ ruleById, windowState: st.windowState, fsm, now: tick });
      while (si < sampleTs.length && sampleTs[si] <= tick) { snap(sampleTs[si]); si++; }
    }
  };
  for (const row of rows) {
    advance(row.time);
    const d = siteState.get(row.dId); if (!d) continue;
    d[row.variable] = row.value; d._lastUpdate[row.variable] = row.time; d._lastSeen = row.time;
    RE.processMessage({ dId: row.dId, variable: row.variable, value: row.value, ...st, packs, eventTs: row.time });
  }
  advance(to);

  const instances = [...series.entries()].map(([key, s]) => {
    const st2 = s.steps;
    while (st2.length < SAMPLES) st2.push(st2[st2.length - 1] || 'E1');
    const dur = (code) => st2.filter((x) => x === code).length * step;
    // Qué condición faltó cuando estuvo cerca: muestras en Vigilando con todas en "sí" menos una.
    const faltas = {};
    const ls = [...s.leaves.entries()];
    for (let i = 0; i < SAMPLES; i++) {
      if (st2[i] !== 'E1' || ls.length < 2) continue;
      const nos = ls.filter(([, L]) => L.states[i] === 'no');
      if (nos.length === 1 && ls.filter(([, L]) => L.states[i] === 'si').length === ls.length - 1) faltas[nos[0][0]] = (faltas[nos[0][0]] || 0) + 1;
    }
    const faltante = Object.entries(faltas).sort((a, b) => b[1] - a[1])[0];
    return {
      key, dId: s.dId, deviceName: (siteState.get(s.dId) || {})._deviceName || s.dId,
      steps: st2, leaves: ls.map(([leafId, L]) => ({ leafId, values: L.values, states: L.states, thresholds: L.thresholds })),
      avisos: avisos.filter((a) => a.key === key).map((a) => a.ts), cierres: cierres.filter((c) => c.key === key).map((c) => c.ts),
      alarmaMs: dur('E3') + dur('E4') + dur('E6'), sinDatosMs: dur('E5'),
      faltante: faltante ? { leafId: faltante[0], veces: faltante[1] } : null,
    };
  });
  return { ok: true, hours: H, from, to, samples: sampleTs, rows: rows.length, truncated: rows.length >= MAX_ROWS, instances };
}

module.exports = { simulate };
