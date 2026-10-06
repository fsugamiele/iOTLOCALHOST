'use strict';
// DEC-REF-131 — BACKTEST / "probar regla contra historial" (Capa A del supervisor
// de calidad). Replaya una regla (o un pack) contra N días de db.data REUSANDO los
// evaluadores REALES del edge, y reporta episodios / % en condición / distribución /
// veredicto (muerta/permanente/ruidosa/sana). READ-ONLY. Correr en wanomi-edge:
//   docker exec -i wanomi-edge node < tools/backtest_rule.js <packId> [days] [ruleId]
const EDGE = process.env.EDGE_DIR || '/home/edge/edge-engine';
const mongoose = require('mongoose');   // resuelto vía NODE_PATH del contenedor edge
const { evaluateD } = require(EDGE + '/evaluators/typeD');
const { evaluateC } = require(EDGE + '/evaluators/typeC');
const { evaluateS } = require(EDGE + '/evaluators/typeS');
const { evaluateM } = require(EDGE + '/evaluators/typeM');
const { evaluateCross } = require(EDGE + '/evaluators/typeCross');

// Args por env (robusto con stdin) o argv: PACK/DAYS/RULEID.
//   docker exec -i -e PACK=eltek-smartpack-v1 -e DAYS=7 wanomi-edge node < tools/backtest_rule.js
const PACK = process.env.PACK || process.argv[2];
const DAYS = Number(process.env.DAYS || process.argv[3]) || 7;
const ONLY = process.env.RULEID || process.argv[4] || null;
const SITE = process.env.SITE_ID || 'CR00061';
if (!PACK) { console.error('uso: node backtest_rule.js <packId> [days] [ruleId]'); process.exit(1); }

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
      if (n.variable) { vars.add(n.variable); if (n.deviceType) dts.add(n.deviceType); } };
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

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const db = mongoose.connection.db;
  const pack = await db.collection('rulepacks').findOne({ packId: PACK });
  if (!pack) { console.error('pack no encontrado:', PACK); process.exit(1); }
  const cutoff = Date.now() - DAYS * 86400000;
  // mapa dId -> deviceType; elegir el device con más data por deviceType
  const devs = await db.collection('devices').find({}).project({ dId: 1, deviceType: 1 }).toArray();
  const typeOf = {}; for (const d of devs) typeOf[d.dId] = d.deviceType;

  console.log(`\nBACKTEST ${PACK} · ${DAYS} días · site ${SITE}\n${'─'.repeat(78)}`);
  for (const rule of (pack.rules || [])) {
    if (ONLY && rule.ruleId !== ONLY) continue;
    const { vars, dts } = neededVars(rule);
    if (!vars.length) { console.log(`• ${rule.ruleId}: (sin variable) — skip`); continue; }
    // device representativo por deviceType (el de más docs en la ventana)
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
    if (!dIds.length) { console.log(`• ${rule.ruleId}: sin datos (ningún device de ${dts.join('/')})`); continue; }
    const rows = await db.collection('data').find({ dId: { $in: dIds }, variable: { $in: vars }, time: { $gte: cutoff } })
      .project({ dId: 1, variable: 1, value: 1, time: 1 }).sort({ time: 1 }).toArray();
    if (!rows.length) { console.log(`• ${rule.ruleId}: sin lecturas`); continue; }

    const siteState = new Map();
    for (const d of dIds) siteState.set(d, { _deviceType: chosen[d], _siteCode: SITE, _lastUpdate: {} });
    const mState = new Map(), windowState = new Map(), crossState = new Map();
    let evaluated = 0, fired = 0, episodes = 0, prev = false;
    const prim = [];
    for (const r of rows) {
      const dev = siteState.get(r.dId); if (!dev) continue;
      dev[r.variable] = r.value; dev._lastUpdate[r.variable] = r.time; dev._lastSeen = r.time;
      if (r.variable === rule.variable && typeof r.value === 'number') prim.push(r.value);
      let met = false, did = false;
      if (rule.type === 'cross') {
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
    // veredicto
    let verd;
    if (evaluated === 0) verd = '⚪ sin evaluaciones';
    else if (episodes === 0) verd = '🔴 muerta (nunca dispara)';
    else if (rule.type !== 'cross' && pct(fired, evaluated) > 80) verd = '🟣 permanente (' + pct(fired, evaluated).toFixed(0) + '% del tiempo)';
    else if (epd > 10) verd = '🟡 ruidosa (' + epd.toFixed(0) + ' episodios/día)';
    else verd = '🟢 sana';
    const distTxt = st ? `${rule.variable}∈[${st.min.toFixed(1)},${st.max.toFixed(1)}] avg ${st.avg.toFixed(1)}` : '(variable no numérica/ausente)';
    const pctTxt = rule.type === 'cross' ? '' : ` · ${pct(fired, evaluated).toFixed(0)}% en condición`;
    console.log(`• ${rule.ruleId.padEnd(32)} ${verd}`);
    console.log(`    ${episodes} episodios (${epd.toFixed(1)}/día)${pctTxt} · ${evaluated} evals · ${distTxt}`);
  }
  await mongoose.disconnect();
}
main().catch(e => { console.error(e.message); process.exit(2); });
