// Diagnóstico del banco: bitácora + avisos + estado de una regla de banco en la última hora.
//   docker exec -i node node - --rule banco-C < tools/banco/diag.js
const NM = '/home/node/app/node_modules/';
require(NM + 'dotenv').config({ path: '/home/node/app/.env' });
const mongoose = require(NM + 'mongoose');
const e = process.env;
const i = process.argv.indexOf('--rule'); const R = i > 0 ? process.argv[i + 1] : 'banco-C';
(async () => {
  await mongoose.connect(`mongodb://${e.MONGO_USERNAME}:${encodeURIComponent(e.MONGO_PASSWORD)}@${e.MONGO_HOST}:${e.MONGO_PORT}/${e.MONGO_DATABASE}`, { useNewUrlParser: true, useUnifiedTopology: true, authSource: 'admin' });
  const db = mongoose.connection.db, since = Date.now() - 3600e3, f = (d) => new Date(d).toISOString().slice(11, 19);
  console.log(`── bitácora ${R}`);
  for (const t of await db.collection('ruletransitions').find({ ruleId: R, ts: { $gte: new Date(since) } }).sort({ ts: 1 }).toArray())
    console.log(`  ${f(t.ts)} ${t.from}→${t.to} ${t.transition} r=${JSON.stringify(t.receptivity)} v=${t.value} umbral=${t.thresholdUsed} ${t.action || ''}`);
  console.log(`── avisos ${R}`);
  for (const n of await db.collection('notifications').find({ ruleId: R, time: { $gte: since } }).sort({ time: 1 }).toArray())
    console.log(`  ${f(n.time)} ${n.kind || 'fire'} ${n.severity} modo=${n.mode} v=${n.value} umbral=${n.thresholdUsed}`);
  console.log('── rulefsm', JSON.stringify(await db.collection('rulefsm').find({ ruleId: R }).project({ _id: 0, key: 1, step: 1, alarmOpen: 1, lastR: 1 }).toArray()));
  const p = await db.collection('rulepacks').findOne({ packId: 'banco-conformidad' });
  console.log('── pack banco-conformidad:', JSON.stringify((p && p.rules || []).map((r) => r.ruleId)));
  process.exit(0);
})().catch((x) => { console.error(x.message); process.exit(1); });
