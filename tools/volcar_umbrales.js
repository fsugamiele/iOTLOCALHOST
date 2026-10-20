// Auditoría de umbrales vs fabricante (Franco 2026-10-20) — SOLO LECTURA.
// Vuelca TODAS las reglas de la base con el umbral que el motor usa de verdad (límite de ficha
// resuelto), espera, histéresis, ventana y origen; y al final los límites de cada ficha.
// Sirve para contrastar contra los manuales (auditoria_umbrales_fabricante_2026-10-20.md).
//
//   docker exec -i node node - < tools/volcar_umbrales.js > umbrales.txt
const NM = '/home/node/app/node_modules/';
require(NM + 'dotenv').config({ path: '/home/node/app/.env' });
const mongoose = require(NM + 'mongoose');
const { resolvePacksForRead } = require('/home/node/app/api/services/limitRef.js');
const e = process.env;
const leaves = (n, out = []) => { if (!n) return out; if (Array.isArray(n.children)) n.children.forEach((c) => leaves(c, out)); else if (Array.isArray(n.sum)) n.sum.forEach((c) => leaves(c, out)); else out.push(n); return out; };
const c2s = (c, ref0) => { c = c || {}; const ref = ref0 || c.limitRef; const v = c.value != null ? c.value : '?'; return `${c.op || '?'} ${JSON.stringify(v)}${ref ? ` [ficha:${ref}]` : ''}${c.deadband != null ? ` hist ${c.deadband}` : ''}`; };
const leaf = (l) => `${l.deviceType || ''}.${l.variable || ''}${l.measure === 'metric' || l.metric ? ' ' + (l.metric || '') : ''} ${c2s(l.condition, l._limitRef)}`;

(async () => {
  const uri = `mongodb://${e.MONGO_USERNAME}:${encodeURIComponent(e.MONGO_PASSWORD)}@${e.MONGO_HOST}:${e.MONGO_PORT}/${e.MONGO_DATABASE}`;
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true, authSource: 'admin' });
  const db = mongoose.connection.db;
  const raw = await db.collection('rulepacks').find({}).toArray();
  const refs = new Map(); // ruleId → limitRef original (antes de resolver)
  for (const p of raw) for (const r of (p.rules || [])) { const ls = r.type === 'cross' ? leaves(r.crossExpr) : [r]; refs.set(r.ruleId, ls.map((l) => (l.condition || {}).limitRef || null)); }
  const packs = JSON.parse(JSON.stringify(raw));
  await resolvePacksForRead(packs, db);
  let n = 0;
  console.log('pack\truleId\tlabel\ton\tsev\ttipo\tcondición (umbral resuelto)\tespera_s\tventana\tsitios');
  for (const p of packs) for (const r of (p.rules || [])) {
    n++;
    const rr = refs.get(r.ruleId) || [];
    const ls = r.type === 'cross' ? leaves(r.crossExpr) : [r];
    const conds = ls.map((l, i) => leaf({ ...l, deviceType: l.deviceType || r.deviceType, _limitRef: rr[i] })).join(` ${r.crossExpr ? r.crossExpr.op : ''} `);
    const vent = r.mWindow ? `${r.mWindow.durationSec}s/${r.mWindow.minSamples}` : r.window ? `${r.window.count}x/${r.window.durationSec}s` : '';
    console.log([p.packId, r.ruleId, r.label, (r.enabled === false || p.enabled === false) ? 'NO' : 'si', r.severity || '', r.type + (r.metric ? ':' + r.metric : ''), conds + (r._limitRefUnresolved ? ' ⚠SIN RESOLVER' : ''), [r.graceSec != null ? 'g' + r.graceSec : '', r.resolveGraceSec ? 'r' + r.resolveGraceSec : ''].filter(Boolean).join(' '), vent, (r.sites || []).join(',') || 'todos'].join('\t'));
  }
  console.log(`\n${n} reglas.\n\nLÍMITES DE FICHA`);
  for (const s of await db.collection('equipmentsheets').find({}).toArray())
    for (const v of (s.variables || [])) for (const l of (v.limits || [])) console.log(`${s.deviceType}\t${v.name}\t${l.kind}\t${l.op} ${l.value} ${v.unit || ''}${l.when ? '\tcuando ' + JSON.stringify(l.when) : ''}\t${l.source || '(sin fuente)'}`);
  process.exit(0);
})().catch((err) => { console.error('ERROR:', err.stack || err.message); process.exit(1); });
