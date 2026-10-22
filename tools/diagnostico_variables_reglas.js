// Franco 2026-10-22 — "la regla no tomó la lectura de la variable": SOLO LECTURA.
// Para CADA regla activa y CADA medición que usa (hojas, entradas), por cada equipo de ese tipo
// en el sitio del motor, muestra:
//   · si la ficha y la plantilla del equipo declaran la variable,
//   · la última lectura guardada (valor y antigüedad) y si hoy cumple la condición de la hoja,
//   · la etapa del motor (rulefsm) para la regla.
// Al final, las observaciones (variables sin lecturas, viejas, o que la plantilla no publica).
//
//   docker exec -i node node - < tools/diagnostico_variables_reglas.js            → todas
//   docker exec -i node node - frio < tools/diagnostico_variables_reglas.js       → reglas que contienen "frio"
//   docker exec -i node node - frio --lecturas < tools/diagnostico_variables_reglas.js  → + últimas 10 lecturas
const NM = '/home/node/app/node_modules/';
require(NM + 'dotenv').config({ path: '/home/node/app/.env' });
const mongoose = require(NM + 'mongoose');
const { resolvePacksForRead } = require('/home/node/app/api/services/limitRef.js');
const e = process.env;
const SITE = e.SITE_ID || 'CR00061';
const args = process.argv.slice(2);
const LECTURAS = args.includes('--lecturas');
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const TERM = norm(args.find((a) => !a.startsWith('--')) || '');
const hace = (ms) => { if (!ms) return 'nunca'; const s = Math.round((Date.now() - ms) / 1000); return s < 120 ? `${s} s` : s < 7200 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`; };
const OPS = { lt: (a, b) => a < b, lte: (a, b) => a <= b, gt: (a, b) => a > b, gte: (a, b) => a >= b, eq: (a, b) => a == b, neq: (a, b) => a != b };   // eslint-disable-line eqeqeq
const leaves = (n, out = []) => { if (!n) return out; if (Array.isArray(n.children)) n.children.forEach((c) => leaves(c, out)); else out.push(n); return out; };

(async () => {
  const uri = `mongodb://${e.MONGO_USERNAME}:${encodeURIComponent(e.MONGO_PASSWORD)}@${e.MONGO_HOST}:${e.MONGO_PORT}/${e.MONGO_DATABASE}`;
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true, authSource: 'admin' });
  const db = mongoose.connection.db;
  const site = await db.collection('sites').findOne({ siteCode: SITE });
  const dIds = (site && site.devices) || [];
  const devs = await db.collection('devices').find({ dId: { $in: dIds } }).toArray();
  const sheets = new Map((await db.collection('equipmentsheets').find({}).toArray()).map((s) => [s.deviceType, s]));
  const tplVars = new Map();
  for (const d of devs) {
    const tid = d.templateId && mongoose.Types.ObjectId.isValid(String(d.templateId)) ? new mongoose.Types.ObjectId(String(d.templateId)) : d.templateId;
    const tpl = tid ? await db.collection('templates').findOne({ _id: tid }) : null;
    const vs = new Map();
    for (const w of ((tpl && tpl.widgets) || [])) { if (w.variable) vs.set(w.variable, Number(w.variableSendFreq) || null); for (const s of (w.sources || [])) if (s.variable) vs.set(s.variable, null); }
    tplVars.set(d.dId, vs);
  }
  const packs = JSON.parse(JSON.stringify(await db.collection('rulepacks').find({ enabled: { $ne: false } }).toArray()));
  await resolvePacksForRead(packs, db);
  const DERIVADAS = ['autonomy_hours', 'autonomy_source', 'autonomy_lph', 'autonomy_liters', 'fuel_efficiency', 'consumption_tank'];
  const obs = [];
  console.log(`Sitio ${SITE} · ${devs.length} equipos${TERM ? ` · reglas que contienen «${TERM}»` : ''}\n`);

  for (const p of packs) for (const r of (p.rules || [])) {
    if (r.enabled === false) continue;
    if (TERM && !norm(`${r.label} ${r.ruleId}`).includes(TERM)) continue;
    const ls = r.type === 'cross' ? leaves(r.crossExpr) : [{ deviceType: r.deviceType, variable: r.variable, condition: r.condition, metric: r.metric, inputs: r.inputs }];
    const fsmRows = await db.collection('rulefsm').find({ ruleId: r.ruleId }).toArray();
    console.log('═'.repeat(90));
    console.log(`${r.label} [${r.ruleId}] (${p.packId}) · ${r.type}${r.metric ? ':' + r.metric : ''} · etapa ${fsmRows.length ? fsmRows.map((x) => x.step).join(', ') : 'E1 (sin instancia)'}`);
    for (const l of ls) {
      const dt = l.deviceType || r.deviceType;
      const vars = [...new Set([l.variable, ...((l.inputs || []).map((i) => i.variable))].filter(Boolean))];
      const equipos = devs.filter((d) => d.deviceType === dt);
      const c = l.condition || {};
      const condTxt = `${l.metric ? l.metric + ' ' : ''}${c.op || ''} ${c.value !== undefined ? JSON.stringify(c.value) : '?'}`;
      if (!equipos.length) { const x = `${r.ruleId}: no hay equipos «${dt}» en el sitio`; console.log(`  ⚠ ${dt}.${l.variable} ${condTxt} — ${x}`); obs.push(x); continue; }
      for (const v of vars) {
        const enFicha = !!((sheets.get(dt) || {}).variables || []).find((x) => x.name === v);
        for (const d of equipos) {
          const tv = tplVars.get(d.dId) || new Map();
          const last = await db.collection('data').find({ dId: d.dId, variable: v }).sort({ time: -1 }).limit(LECTURAS ? 10 : 1).toArray();
          const ult = last[0];
          const cadSeg = tv.get(v) || 60;
          let cumple = '';
          if (ult && !l.metric && typeof c.value !== 'undefined' && OPS[c.op] && v === l.variable) cumple = OPS[c.op](ult.value, c.value) ? ' · CUMPLE' : ' · no cumple';
          console.log(`  · ${d.name || d.dId} ${dt}.${v} ${v === l.variable ? condTxt : '(entrada)'} — última ${ult ? `${JSON.stringify(ult.value)} hace ${hace(ult.time)}` : 'NUNCA'}${cumple}${enFicha ? '' : ' · NO está en la ficha'}${tv.has(v) || DERIVADAS.includes(v) ? '' : ' · la plantilla NO la publica'}`);
          if (LECTURAS && last.length > 1) console.log(`      ${last.map((x) => `${typeof x.value === 'number' ? x.value.toFixed(1) : x.value}@${new Date(x.time).toLocaleTimeString('es-AR', { hour12: false, timeZone: 'America/Argentina/Buenos_Aires' })}`).reverse().join('  ')}`);
          if (DERIVADAS.includes(v)) continue;
          if (!tv.has(v)) obs.push(`${r.ruleId}: ${d.name || d.dId} no publica ${v} (plantilla)`);
          else if (!ult) obs.push(`${r.ruleId}: ${d.name || d.dId}.${v} sin lecturas guardadas`);
          else if (Date.now() - ult.time > Math.max(3 * cadSeg * 1000, 10 * 60000)) obs.push(`${r.ruleId}: ${d.name || d.dId}.${v} última lectura hace ${hace(ult.time)} (cadencia ${cadSeg} s)`);
          if (!enFicha) obs.push(`${r.ruleId}: ${dt}.${v} no está en la ficha (el motor no la normaliza)`);
        }
      }
    }
  }
  console.log('═'.repeat(90));
  const u = [...new Set(obs)];
  console.log(u.length ? `\n${u.length} observación(es):\n  ⚠ ${u.join('\n  ⚠ ')}` : '\n✓ todas las mediciones que usan las reglas tienen lecturas recientes');
  process.exit(0);
})().catch((err) => { console.error('ERROR:', err.stack || err.message); process.exit(1); });
