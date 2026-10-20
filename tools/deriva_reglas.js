// Auditoría de umbrales 2026-10-20 — SOLO LECTURA. Compara cada regla de la base con su foto
// original (rule_snapshots, DEC-REF-137) y muestra qué cambió en lo que decide el disparo:
// variable, cálculo, operador, valor, límite de ficha, espera y hojas de las combinadas.
//   docker exec -i node node - < tools/deriva_reglas.js
const NM = '/home/node/app/node_modules/';
require(NM + 'dotenv').config({ path: '/home/node/app/.env' });
const mongoose = require(NM + 'mongoose');
const e = process.env;
const leaves = (n, out = []) => { if (!n) return out; if (Array.isArray(n.children)) n.children.forEach((c) => leaves(c, out)); else out.push(n); return out; };
const firma = (r) => {
  const ls = r.type === 'cross' ? leaves(r.crossExpr) : [r];
  const f = { tipo: r.type, calculo: r.metric || null, espera: r.graceSec != null ? r.graceSec : null, op_combinada: r.crossExpr ? r.crossExpr.op : null };
  ls.forEach((l, i) => { const c = l.condition || {}; f[`h${i}`] = `${l.deviceType || r.deviceType}.${l.variable}${l.metric ? ' ' + l.metric : ''} ${c.op} ${c.limitRef ? '[ficha:' + c.limitRef + ']' : JSON.stringify(c.value)}`; });
  return f;
};

(async () => {
  const uri = `mongodb://${e.MONGO_USERNAME}:${encodeURIComponent(e.MONGO_PASSWORD)}@${e.MONGO_HOST}:${e.MONGO_PORT}/${e.MONGO_DATABASE}`;
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true, authSource: 'admin' });
  const db = mongoose.connection.db;
  const snaps = new Map((await db.collection('rule_snapshots').find({}).toArray()).map((s) => [s.ruleId, s]));
  let cambiadas = 0, sinFoto = 0;
  for (const p of await db.collection('rulepacks').find({}).toArray()) for (const r of (p.rules || [])) {
    const s = snaps.get(r.ruleId);
    if (!s || !s.definition) { sinFoto++; console.log(`· ${r.ruleId} (${p.packId}) — sin foto original`); continue; }
    const a = firma(s.definition), b = firma(r);
    const dif = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    if (!dif.length) continue;
    cambiadas++;
    console.log(`\n✱ ${r.ruleId} «${r.label}» (${p.packId}) · foto ${s.capturedFrom} ${new Date(s.capturedAt).toISOString().slice(0, 10)}`);
    dif.forEach((k) => console.log(`    ${k.padEnd(13)} antes ${JSON.stringify(a[k])}\n    ${' '.repeat(13)} hoy   ${JSON.stringify(b[k])}`));
  }
  console.log(`\n${cambiadas} regla(s) cambiaron respecto de su foto original · ${sinFoto} sin foto.`);
  process.exit(0);
})().catch((err) => { console.error('ERROR:', err.stack || err.message); process.exit(1); });
