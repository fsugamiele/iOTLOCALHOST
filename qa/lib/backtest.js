'use strict';
// DEC-REF-136 — NÚCLEO del backtest (Capa A del supervisor de calidad). Extraído del
// CLI tools/backtest_rule.js (DEC-REF-131) a una función REUTILIZABLE que DEVUELVE datos
// estructurados (no console.log): por regla veredicto + episodios + %en condición +
// distribución (histograma/percentiles) + umbral. Esa forma alimenta el proxy de node
// (bloque 140) y la ficha/chart del editor (bloque 141).
//
// Capa A: REUSA los evaluadores REALES del edge (predice "qué hará ESTE config en
// producción", no audita el motor → eso es Capa C). READ-ONLY sobre la db del motor.
//
// Corre SIN babel (igual que index.js del worker y que el edge): module.exports y
// mongoose del mount. El directorio del edge se resuelve por env (EDGE_DIR) porque el
// CLI lo monta en /home/edge/edge-engine y el worker qa en /home/qa/edge-engine.
const mongoose = require('mongoose');
// Resuelve el directorio del edge por candidatos: el worker qa monta ./edge-engine en
// /home/qa/edge-engine, el CLI corre contra /home/edge/edge-engine, y en el host el
// layout del repo es ../edge-engine. EDGE_DIR (env) tiene prioridad. Sin hardcodear uno.
function loadEvaluators() {
  const candidatos = [];
  if (process.env.EDGE_DIR) candidatos.push(process.env.EDGE_DIR);
  candidatos.push('/home/qa/edge-engine');        // mount de wanomi-qa (ruta de la ficha/141)
  candidatos.push('/home/edge/edge-engine');      // mount de wanomi-edge (CLI)
  candidatos.push(__dirname + '/../../edge-engine'); // layout del repo (host/otros)
  let ultimoError;
  for (const base of candidatos) {
    try {
      return {
        evaluateD: require(base + '/evaluators/typeD').evaluateD,
        evaluateC: require(base + '/evaluators/typeC').evaluateC,
        evaluateS: require(base + '/evaluators/typeS').evaluateS,
        evaluateM: require(base + '/evaluators/typeM').evaluateM,
        evaluateCross: require(base + '/evaluators/typeCross').evaluateCross,
        combined: require(base + '/evaluators/typeCombined'),   // spec_reglas_compuestas
        isCombined: require(base + '/../app/api/services/combinedRule').isCombined,
      };
    } catch (e) { ultimoError = e; }
  }
  throw new Error('no pude resolver los evaluadores del edge (seteá EDGE_DIR). último error: ' + (ultimoError && ultimoError.message));
}
const { evaluateD, evaluateC, evaluateS, evaluateM, evaluateCross, combined, isCombined } = loadEvaluators();

// Tope de días configurable (caso raro #4 de la spec). Sin hardcodeo: default 90.
const MAX_DAYS = parseInt(process.env.QA_BACKTEST_MAX_DAYS || '90', 10);

// Variables/deviceTypes que una regla necesita para replay (idéntico al CLI DEC-REF-131).
function neededVars(rule) {
  const vars = new Set(), dts = new Set();
  if (rule.variable) { vars.add(rule.variable); if (rule.deviceType) dts.add(rule.deviceType); }
  if (rule.type === 'C' && rule.setpointSource && rule.setpointSource.variable) vars.add(rule.setpointSource.variable);
  if (rule.type === 'M' && Array.isArray(rule.inputs)) for (const i of rule.inputs) { if (i.variable) vars.add(i.variable); if (i.deviceType) dts.add(i.deviceType); }
  if (rule.mParams && rule.mParams.weightVariable) vars.add(rule.mParams.weightVariable);
  if (rule.type === 'cross') {
    const walk = n => { if (!n || typeof n !== 'object') return;
      if (n.op === 'AND' || n.op === 'OR') { (n.children || []).forEach(walk); return; }
      if (Array.isArray(n.sum)) { for (const t of n.sum) { if (t.variable) vars.add(t.variable); if (t.deviceType) dts.add(t.deviceType); } return; }
      if (n.variable) { vars.add(n.variable); if (n.deviceType) dts.add(n.deviceType); }
      // spec_reglas_compuestas — entradas y setpoint de una condición de regla combinada.
      if (Array.isArray(n.inputs)) for (const i of n.inputs) { if (i.variable) vars.add(i.variable); if (i.deviceType) dts.add(i.deviceType); }
      if (n.setpointSource && n.setpointSource.variable) vars.add(n.setpointSource.variable);
      if (n.mParams && n.mParams.weightVariable) vars.add(n.mParams.weightVariable); };
    walk(rule.crossExpr);
  }
  return { vars: [...vars], dts: [...dts] };
}
const pct = (a, b) => b ? (100 * a / b) : 0;
function stats(arr) {
  if (!arr.length) return null;
  const s = arr.slice().sort((a, b) => a - b), n = s.length;
  const q = p => s[Math.min(n - 1, Math.floor(p * n))];
  return { n, min: s[0], max: s[n - 1], avg: arr.reduce((x, y) => x + y, 0) / n, p50: q(0.5), p99: q(0.99) };
}
// Histograma para el chart de la ficha (141). 20 bins lineales entre min y max. Dato
// NUEVO de la Capa A (el CLI nunca lo imprimió) → no afecta el output por consola.
function histogram(arr, st, bins = 20) {
  if (!arr.length || !st) return [];
  const { min, max } = st;
  if (!(max > min)) return [{ from: min, to: max, count: arr.length }];  // todos iguales
  const w = (max - min) / bins;
  const out = [];
  for (let i = 0; i < bins; i++) out.push({ from: min + i * w, to: min + (i + 1) * w, count: 0 });
  for (const v of arr) {
    let idx = Math.floor((v - min) / w);
    if (idx >= bins) idx = bins - 1; if (idx < 0) idx = 0;
    out[idx].count++;
  }
  return out;
}
// Umbral para la línea del chart (141): el value de la condición según el tipo.
function thresholdOf(rule) {
  if (rule == null) return null;
  // El umbral vive en condition.value (schema RuleDefinition). Para S el matchCondition
  // puede traerlo en window.matchCondition.value. Debe ser numérico para graficarlo.
  const c = rule.condition;
  if (c && typeof c.value === 'number') return c.value;
  const mc = rule.window && rule.window.matchCondition;
  if (mc && typeof mc.value === 'number') return mc.value;
  return null;
}
// Operador de la condición (gt/gte/lt/lte/eq/neq) → el chart pinta la zona de alarma
// del lado correcto. cross/M (sin condition simple) → null.
function opOf(rule) {
  if (rule && rule.condition && rule.condition.op) return rule.condition.op;
  const mc = rule && rule.window && rule.window.matchCondition;
  if (mc && mc.op) return mc.op;
  return null;
}

// backtest({packId, days=7, ruleId=null}) → datos estructurados (contrato §3 de la spec).
// NO imprime. Caso raro #1: pack inexistente → {error:'pack no encontrado'} (no throw).
async function backtest({ packId, days = 7, ruleId = null } = {}) {
  const SITE = process.env.SITE_ID || 'CR00061';
  // Cota de días (caso raro #4): entero positivo, tope MAX_DAYS, default 7 si inválido.
  let DAYS = Number(days);
  if (!Number.isFinite(DAYS) || DAYS <= 0) DAYS = 7;
  if (DAYS > MAX_DAYS) DAYS = MAX_DAYS;
  const ONLY = ruleId || null;

  const db = mongoose.connection.db;
  const pack = await db.collection('rulepacks').findOne({ packId });
  if (!pack) return { error: 'pack no encontrado', packId };
  // spec_cascada_ficha C2 — umbrales de ficha (limitRef) resueltos igual que el motor.
  await require('../../app/api/services/limitRef').resolvePacksForRead([pack], db);

  const cutoff = Date.now() - DAYS * 86400000;
  const devs = await db.collection('devices').find({}).project({ dId: 1, deviceType: 1 }).toArray();
  const typeOf = {}; for (const d of devs) typeOf[d.dId] = d.deviceType;

  const rulesOut = [];
  for (const rule of (pack.rules || [])) {
    if (ONLY && rule.ruleId !== ONLY) continue;
    const base = { ruleId: rule.ruleId, type: rule.type, threshold: thresholdOf(rule), op: opOf(rule) };
    const { vars, dts } = neededVars(rule);
    // Caso raro #2: regla sin variable / sin datos → entrada con 'sin evaluaciones'.
    if (!vars.length) {
      rulesOut.push({ ...base, verdict: '⚪ sin evaluaciones', episodes: 0, perDay: 0, pctInCondition: 0, evals: 0, distribution: null });
      continue;
    }
    // device representativo por deviceType (el de más docs en la ventana).
    const chosen = {};
    for (const dt of (dts.length ? dts : [rule.deviceType])) {
      const agg = await db.collection('data').aggregate([
        { $match: { variable: { $in: vars }, time: { $gte: cutoff } } },
        { $group: { _id: '$dId', c: { $sum: 1 } } }, { $sort: { c: -1 } },
      ]).toArray();
      const pick = agg.find(a => typeOf[a._id] === dt);
      if (pick) chosen[pick._id] = dt;
    }
    const dIds = Object.keys(chosen);
    if (!dIds.length) {
      rulesOut.push({ ...base, verdict: '⚪ sin evaluaciones', episodes: 0, perDay: 0, pctInCondition: 0, evals: 0, distribution: null });
      continue;
    }
    const rows = await db.collection('data').find({ dId: { $in: dIds }, variable: { $in: vars }, time: { $gte: cutoff } })
      .project({ dId: 1, variable: 1, value: 1, time: 1 }).sort({ time: 1 }).toArray();
    if (!rows.length) {
      rulesOut.push({ ...base, verdict: '⚪ sin evaluaciones', episodes: 0, perDay: 0, pctInCondition: 0, evals: 0, distribution: null });
      continue;
    }

    const siteState = new Map();
    for (const d of dIds) siteState.set(d, { _deviceType: chosen[d], _siteCode: SITE, _lastUpdate: {} });
    // spec_perfiles_controladora — umbral del equipo / su controladora, como el motor en vivo.
    await require('../../app/api/services/deviceLimits').loadDeviceContexts(db, dIds, siteState);
    const mState = new Map(), windowState = new Map(), crossState = new Map();
    let evaluated = 0, fired = 0, episodes = 0, prev = false;
    const prim = [];
    for (const r of rows) {
      const dev = siteState.get(r.dId); if (!dev) continue;
      dev[r.variable] = r.value; dev._lastUpdate[r.variable] = r.time; dev._lastSeen = r.time;
      if (r.variable === rule.variable && typeof r.value === 'number') prim.push(r.value);
      let met = false, did = false;
      if (rule.type === 'cross' && isCombined(rule)) {
        // Combinada: alimenta y evalúa cada instancia (ancla) sin espera; "se cumple" = alguna en "sí".
        const ctx = { siteState, siteCode: SITE, msg: { dId: r.dId, variable: r.variable, value: r.value }, eventTs: r.time, mState };
        combined.feed(rule, ctx);
        const at = combined.anchorType(rule);
        const anchors = at ? combined.devicesOfType(siteState, at, SITE) : [null];
        const states = anchors.map((a) => combined.evaluate(rule, ctx, a).state);
        if (!states.every((x) => x === 'jun' || x === 'sin')) { met = states.includes('si'); did = true; }
      } else if (rule.type === 'cross') {
        const res = evaluateCross(rule, siteState, crossState, r.time, SITE);
        if (res.fired) { episodes++; fired++; } evaluated++;
        continue;
      } else if (rule.type === 'D' && r.variable === rule.variable) { met = evaluateD(rule, r.value); did = true; }
      else if (rule.type === 'C' && r.variable === rule.variable) { met = evaluateC(rule, r.value, dev).fired; did = true; }
      else if (rule.type === 'S' && r.variable === rule.variable) { met = evaluateS(rule, r.value, windowState, r.dId).fired; did = true; }
      else if (rule.type === 'M') {
        const trig = (rule.inputs && rule.inputs.length) ? rule.inputs.some(i => i.variable === r.variable) : (r.variable === rule.variable);
        if (trig) { const res = evaluateM(rule, r.value, { mState, dId: r.dId, eventTs: r.time, siteState, siteCode: SITE }); if (!res.detail) { met = res.fired; did = true; } }
      }
      if (did) { evaluated++; if (met) fired++; if (met && !prev) episodes++; prev = met; }
    }
    const spanD = Math.max(1 / 24, (rows[rows.length - 1].time - rows[0].time) / 86400000);
    const epd = episodes / spanD;
    const st = stats(prim);
    // veredicto (idéntica semántica al CLI DEC-REF-131).
    let verd;
    if (evaluated === 0) verd = '⚪ sin evaluaciones';
    else if (episodes === 0) verd = '🔴 muerta (nunca dispara)';
    else if (rule.type !== 'cross' && pct(fired, evaluated) > 80) verd = '🟣 permanente (' + pct(fired, evaluated).toFixed(0) + '% del tiempo)';
    else if (epd > 10) verd = '🟡 ruidosa (' + epd.toFixed(0) + ' episodios/día)';
    else verd = '🟢 sana';

    // Caso raro #3: variable no numérica/ausente → distribution:null, veredicto igual.
    // `var` = etiqueta de la variable primaria (rotula el eje del chart en 141 y el
    // texto del CLI). El resto son stats + histograma.
    const distribution = st ? { var: rule.variable, ...st, histogram: histogram(prim, st) } : null;
    rulesOut.push({
      ...base,
      verdict: verd,
      episodes,
      perDay: epd,
      pctInCondition: rule.type === 'cross' ? null : pct(fired, evaluated),
      evals: evaluated,
      distribution,
    });
  }

  return { packId, days: DAYS, site: SITE, rules: rulesOut };
}

module.exports = { backtest, neededVars, stats, histogram, thresholdOf, pct, MAX_DAYS };
