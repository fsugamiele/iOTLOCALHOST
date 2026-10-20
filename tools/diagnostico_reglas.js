// Diagnóstico de reglas que "deberían haber alarmado y no lo hicieron" (Franco, 2026-10-19).
// SOLO LECTURA: no escribe nada. Para cada regla que coincide con el texto buscado muestra:
//   1. si está activa (regla y pack) y si el edge la puede evaluar (límite de ficha resuelto),
//   2. qué equipos del sitio la evalúan y la última lectura de cada medición que usa,
//   3. en qué etapa la tiene el edge ahora (rulefsm) y sus últimos cambios de etapa,
//   4. sus últimos avisos,
//   5. qué habría hecho el MISMO motor con los datos reales de las últimas N horas (QA /simulate).
//
//   docker exec -i node node - combustible < tools/diagnostico_reglas.js
//   docker exec -i node node - fuel --horas 12 < tools/diagnostico_reglas.js
const NM = '/home/node/app/node_modules/';
require(NM + 'dotenv').config({ path: '/home/node/app/.env' });
const mongoose = require(NM + 'mongoose');
const http = require('http');
const e = process.env;
const args = process.argv.slice(2);
const hi = args.indexOf('--horas');
const HORAS = hi >= 0 ? Number(args[hi + 1]) : 24;
const TERM = (args.filter((a, i) => !a.startsWith('--') && !(hi >= 0 && i === hi + 1))[0] || 'combustible');
const SITE = e.SITE_ID || 'CR00061';
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const t = (ms) => (ms ? new Date(ms).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : '—');
const hace = (ms) => { if (!ms) return 'nunca'; const s = Math.round((Date.now() - ms) / 1000); return s < 120 ? `${s} s` : s < 7200 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`; };

function leaves(n, out = []) { if (!n) return out; if (Array.isArray(n.children)) n.children.forEach((c) => leaves(c, out)); else if (Array.isArray(n.sum)) n.sum.forEach((c) => leaves(c, out)); else out.push(n); return out; }
function varsOf(r) {
  const out = [];
  const add = (dt, v) => { if (v && !out.some((x) => x.dt === dt && x.v === v)) out.push({ dt, v }); };
  if (r.type === 'cross') leaves(r.crossExpr).forEach((l) => { add(l.deviceType, l.variable); (l.inputs || []).forEach((i) => add(i.deviceType || l.deviceType, i.variable)); if (l.setpointSource && l.setpointSource.variable) add(l.deviceType, l.setpointSource.variable); });
  else { add(r.deviceType, r.variable); (r.inputs || []).forEach((i) => add(i.deviceType || r.deviceType, i.variable)); if (r.setpointSource && r.setpointSource.variable) add(r.deviceType, r.setpointSource.variable); if (r.mParams && r.mParams.weightVariable) add(r.deviceType, r.mParams.weightVariable); }
  return out;
}
function cond(r) {
  const c = r.condition || {};
  const v = c.limitRef ? `límite de ficha «${c.limitRef}»` : c.value;
  if (r.type === 'M') return `${r.metric} ${c.op} ${v}${r.mWindow ? ` · ventana ${r.mWindow.durationSec}s/${r.mWindow.minSamples} muestras` : ''}${r.mParams && r.mParams.target != null ? ` · objetivo ${r.mParams.target}` : ''}`;
  if (r.type === 'S') return `${(r.window && r.window.count) || '?'} veces en ${(r.window && r.window.durationSec) || '?'} s`;
  if (r.type === 'cross') return `combinada ${r.crossExpr && r.crossExpr.op} · ${leaves(r.crossExpr).map((l) => `${l.deviceType}.${l.variable} ${l.measure === 'metric' ? l.metric + ' ' : ''}${(l.condition || {}).op} ${(l.condition || {}).limitRef || (l.condition || {}).value}`).join(' · ')}`;
  return `${r.variable} ${c.op} ${v}${c.deadband != null ? ` (histéresis ${c.deadband})` : ''}`;
}
function simulate(rule) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ rule, hours: HORAS });
    const req = http.request({ host: e.QA_HOST || 'wanomi-qa', port: e.QA_HTTP_PORT || 3010, path: '/simulate', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 90000 }, (res) => {
      let raw = ''; res.on('data', (c) => { raw += c; }); res.on('end', () => { try { resolve(JSON.parse(raw)); } catch (_) { resolve({ error: `respuesta inválida (${res.statusCode})` }); } });
    });
    req.on('error', (err) => resolve({ error: `QA no responde: ${err.message}` }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'QA tardó más de 90 s' }); });
    req.end(body);
  });
}

(async () => {
  const uri = `mongodb://${e.MONGO_USERNAME}:${encodeURIComponent(e.MONGO_PASSWORD)}@${e.MONGO_HOST}:${e.MONGO_PORT}/${e.MONGO_DATABASE}`;
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true, authSource: 'admin' });
  const db = mongoose.connection.db;
  const packs = await db.collection('rulepacks').find({}).toArray();
  const site = await db.collection('sites').findOne({ siteCode: SITE });
  const siteDevs = await db.collection('devices').find({ dId: { $in: (site && site.devices) || [] } }).project({ dId: 1, name: 1, deviceType: 1 }).toArray();
  const sheets = await db.collection('equipmentsheets').find({}).project({ deviceType: 1, variables: 1 }).toArray();
  const q = norm(TERM);
  const hits = [];
  for (const p of packs) for (const r of (p.rules || [])) {
    const txt = norm([r.ruleId, r.label, r.variable, r.variableLabel, r.recommendation, ...varsOf(r).map((x) => x.v)].join(' '));
    if (txt.includes(q)) hits.push({ p, r });
  }
  console.log(`Sitio ${SITE} · ${siteDevs.length} equipos · buscando «${TERM}» → ${hits.length} regla(s) · simulación ${HORAS} h\n`);

  for (const { p, r } of hits) {
    console.log('═'.repeat(90));
    console.log(`${r.label}  [${r.ruleId}] · pack ${p.packId} (${p.deviceType})`);
    console.log(`  tipo ${r.type} · ${cond(r)} · espera ${r.graceSec || 0}s · cierre ${r.resolveGraceSec || 0}s · ${r.reset_behavior || 'auto'} · gravedad ${r.severity}`);
    const probs = [];
    if (p.enabled === false) probs.push('EL PACK ESTÁ FUERA DE CIRCULACIÓN');
    if (r.enabled === false) probs.push('LA REGLA ESTÁ APAGADA');
    if (p.canary) probs.push('pack en prueba (canary)');
    const refs = r.type === 'cross' ? leaves(r.crossExpr).map((l) => ({ dt: l.deviceType, v: l.variable, c: l.condition })) : [{ dt: r.deviceType, v: r.variable, c: r.condition }];
    for (const x of refs) {
      if (!x.c || !x.c.limitRef) continue;
      const sh = sheets.find((s) => s.deviceType === x.dt); const vv = sh && (sh.variables || []).find((z) => z.name === x.v);
      const dir = ['lt', 'lte'].includes(x.c.op) ? ['lt', 'lte'] : ['gt', 'gte'];
      const lim = vv && (vv.limits || []).find((l) => l.kind === x.c.limitRef && dir.includes(l.op));
      if (!lim) probs.push(`límite de ficha «${x.c.limitRef}» SIN VALOR para ${x.dt}.${x.v} → el edge no la evalúa`);
      else console.log(`  límite de ficha ${x.dt}.${x.v} «${x.c.limitRef}» = ${lim.value}`);
    }
    // Equipos y lecturas.
    const vars = varsOf(r);
    const types = [...new Set(vars.map((x) => x.dt))];
    for (const dt of types) {
      const devs = siteDevs.filter((d) => d.deviceType === dt);
      if (!devs.length) { probs.push(`NO HAY EQUIPOS «${dt}» EN EL SITIO ${SITE}`); continue; }
      for (const d of devs) {
        const vs = [];
        for (const x of vars.filter((z) => z.dt === dt)) {
          const last = await db.collection('data').find({ dId: d.dId, variable: x.v }).sort({ time: -1 }).limit(1).next();
          const n = await db.collection('data').countDocuments({ dId: d.dId, variable: x.v, time: { $gte: Date.now() - HORAS * 3600000 } });
          vs.push(`${x.v}=${last ? last.value : '—'} (${last ? 'hace ' + hace(last.time) : 'SIN DATOS'}, ${n} lecturas en ${HORAS} h)`);
          if (!last) probs.push(`${d.name || d.dId} nunca guardó ${x.v}`);
          else if (Date.now() - last.time > 600000) probs.push(`${d.name || d.dId}: ${x.v} sin lecturas hace ${hace(last.time)} (frescura 10 min → "Sin datos")`);
        }
        console.log(`  equipo ${d.name || d.dId} [${d.dId}] · ${vs.join(' · ')}`);
      }
    }
    // Edge: etapa actual y bitácora.
    const rows = await db.collection('rulefsm').find({ ruleId: r.ruleId }).toArray();
    if (rows.length) rows.forEach((x) => console.log(`  edge ahora: ${x.key} → ${x.step} desde ${t(x.since)}${x.alarmOpen ? ' · ALARMA ABIERTA' : ''}`));
    else console.log('  edge ahora: en reposo (Vigilando, sin alarma)');
    const tr = await db.collection('ruletransitions').find({ ruleId: r.ruleId }).sort({ ts: -1 }).limit(6).toArray();
    if (tr.length) tr.reverse().forEach((x) => console.log(`    ${t(new Date(x.ts).getTime())}  ${x.from}→${x.to}  ${x.transition || ''}  valor ${JSON.stringify(x.value)}  umbral ${JSON.stringify(x.thresholdUsed)}`));
    else console.log('    sin cambios de etapa registrados (30 días)');
    const nt = await db.collection('notifications').find({ ruleId: r.ruleId }).sort({ time: -1 }).limit(3).toArray();
    console.log(`  últimos avisos: ${nt.length ? nt.map((x) => `${t(x.time)} ${x.kind || 'fire'}${x.mode ? ' (' + x.mode + ')' : ''}`).join(' · ') : 'ninguno'}`);
    // Simulación con el motor real.
    const sim = await simulate(r);
    if (sim.error) console.log(`  simulación: ${sim.error}`);
    else {
      const avisos = (sim.instances || []).reduce((a, x) => a + (x.avisos || []).length, 0);
      console.log(`  simulación ${sim.hours} h (${sim.rows} lecturas${sim.truncated ? ', TRUNCADO' : ''}): ${avisos} aviso(s)`);
      for (const x of (sim.instances || [])) {
        const cnt = {}; (x.steps || []).forEach((s) => { cnt[s] = (cnt[s] || 0) + 1; });
        const leafSt = (x.leaves || []).map((l) => { const c = {}; (l.states || []).forEach((s) => { if (s) c[s] = (c[s] || 0) + 1; }); const vals = (l.values || []).filter((v) => typeof v === 'number'); return `${l.leafId}: ${JSON.stringify(c)}${vals.length ? ` · valor ${Math.min(...vals).toFixed(3)}…${Math.max(...vals).toFixed(3)}` : ''}`; });
        console.log(`    ${x.deviceName}: etapas ${JSON.stringify(cnt)} · avisos ${(x.avisos || []).map(t).join(', ') || 'ninguno'}`);
        leafSt.forEach((s) => console.log(`      ${s}`));
        if (x.faltante) console.log(`      lo que más faltó: ${x.faltante.leafId} (${x.faltante.veces} muestras)`);
      }
      if (!(sim.instances || []).length) probs.push('la simulación no creó ninguna instancia: el motor nunca la evaluó con estos datos');
    }
    console.log(probs.length ? `  ⚠ ${probs.join('\n  ⚠ ')}` : '  ✓ sin problemas de configuración a la vista');
  }
  process.exit(0);
})().catch((err) => { console.error('ERROR:', err.stack || err.message); process.exit(1); });
