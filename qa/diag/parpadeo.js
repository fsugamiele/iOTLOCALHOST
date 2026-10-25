'use strict';
// spec_supervisor_confiabilidad_v2 (R3) — DIAGNÓSTICO de una condición que "parpadea" (pasa de sí a
// no en el mismo instante). Reproduce UNA regla con el motor real sobre las últimas N horas y lista
// cada cambio de etapa con su receptividad, el equipo del mensaje y el estado de cada condición.
// SOLO LECTURA (no avisa ni escribe).
//   docker exec wanomi-qa node /home/qa/qa/diag/parpadeo.js cat-SG-02 24
require('dotenv').config({ path: require('path').join(__dirname, '../.env.qa') });
const mongoose = require('mongoose');
const RULE = process.argv[2], HOURS = Number(process.argv[3] || 24), MAX = Number(process.argv[4] || 60);
if (!RULE) { console.error('uso: node parpadeo.js <ruleId> [horas] [máx. líneas]'); process.exit(1); }
(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const db = mongoose.connection.db;
  const { engine } = require('../lib/simulate');
  const { neededVars } = require('../lib/backtest');
  const { RE, createRuleFsm } = engine();
  const SITE = process.env.SITE_ID || 'CR00061';
  const packs = await db.collection('rulepacks').find({ 'rules.ruleId': RULE }).toArray();
  await require('../../app/api/services/limitRef').resolvePacksForRead(packs, db);
  const rule = packs.flatMap((p) => p.rules).find((r) => r.ruleId === RULE);
  if (!rule) { console.error('regla no encontrada'); process.exit(1); }
  const site = await db.collection('sites').findOne({ siteCode: SITE });
  const dIds = (site && site.devices) || [];
  const devs = await db.collection('devices').find({ dId: { $in: dIds } }).project({ dId: 1, deviceType: 1, name: 1 }).toArray();
  const name = new Map(devs.map((d) => [d.dId, d.name || d.dId]));
  const siteState = new Map(); for (const d of devs) siteState.set(d.dId, { _deviceType: d.deviceType, _siteCode: SITE, _deviceName: d.name, _lastUpdate: {} });
  await require('../../app/api/services/deviceLimits').loadDeviceContexts(db, dIds, siteState);
  console.log(`${rule.label} [${RULE}] · tipo ${rule.type} · espera ${rule.graceSec || 0} s · cierre ${rule.resolveGraceSec || 0} s`);
  console.log(`condición: ${JSON.stringify(rule.crossExpr || rule.condition)}\n`);
  let msgActual = null, lineas = 0, total = 0, ceros = 0, lastOn = null;
  const fsm = createRuleFsm({ onTransition: (t) => {
    total++;
    if (t.receptivity === 'on') lastOn = t.ts; else if (lastOn === t.ts) ceros++;
    if (lineas++ >= MAX) return;
    const hojas = Array.isArray(t.leaves) ? ' · ' + t.leaves.map((l) => `${l.leafId}=${l.state}${l.value != null ? `(${l.value})` : ''}${l.dId ? '@' + (name.get(l.dId) || l.dId) : ''}`).join(' ') : '';
    console.log(`${new Date(t.ts).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour12: false })} ${t.from}→${t.to} r=${t.receptivity} · instancia ${t.key} (${name.get(t.dId) || t.dId}) · mensaje de ${msgActual ? `${name.get(msgActual.dId) || msgActual.dId}.${msgActual.variable}=${msgActual.value}` : 'tick'}${hojas}`);
  } });
  const st = { siteState, cooldownState: new Map(), windowState: new Map(), activeState: new Map(), mState: new Map(), fsm };
  const pk = [{ rules: [rule] }], byId = new Map([[RULE, rule]]);
  const to = Date.now(), from = to - HOURS * 3600000; let tick = from;
  const adv = (u) => { while (tick + 5000 <= u) { tick += 5000; msgActual = null; RE.processCombinedTick({ packs: pk, siteState, mState: st.mState, fsm, now: tick }); fsm.tick(byId, tick); } };
  const { vars } = neededVars(rule);
  for (let h = from; h < to; h += 3600000) {
    const rows = await db.collection('data').find({ dId: { $in: dIds }, variable: { $in: vars }, time: { $gte: h, $lt: Math.min(h + 3600000, to) } }).sort({ time: 1 }).toArray();
    for (const r of rows) {
      adv(r.time); const d = siteState.get(r.dId); if (!d) continue;
      d[r.variable] = r.value; d._lastUpdate[r.variable] = r.time; d._lastSeen = r.time;
      msgActual = r;
      RE.processMessage({ dId: r.dId, variable: r.variable, value: r.value, ...st, packs: pk, eventTs: r.time });
    }
  }
  adv(to);
  console.log(`\n${total} cambios de etapa en ${HOURS} h · ${ceros} veces la condición dejó de cumplirse en el MISMO instante en que se cumplió${lineas > MAX ? ` · (se muestran las primeras ${MAX})` : ''}`);
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.stack || e.message); process.exit(1); });
